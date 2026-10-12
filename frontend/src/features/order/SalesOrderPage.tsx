import { Alert, Autocomplete, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactElement } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { DataGrid, type Column } from '../../components/DataGrid';
import { DateField } from '../../components/DateField';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { WorkPage } from '../../components/WorkPage';
import { useAfterClose } from '../../lib/afterClose';
import { ORDER_OPTIONS_KEY } from '../../lib/queryKeys';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { fmtNum, sumOf } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { useSession } from '../../store/session';
import type { FactoryOption, SalesOrder } from './api';
import { factoryLabel } from './factoryLabel';
import { EmptyState, ExportButton, OrderFilters, PICK_ROW, SALES_STATUS, StatusBadge, statusOptions, useCanWrite, useCustomers, useOriginLock, usePagedList } from './common';

const RESOURCE = 'order.allocation';

const COLUMNS: Column<SalesOrder>[] = [
  { key: 'orderNo', title: 'Số đơn', filterKey: 'orderNo', format: 'code', sortKey: 'orderNo' },
  { key: 'customerName', title: 'Khách hàng', filterKey: 'customerName', sortKey: 'customerName', minWidth: 160, maxWidth: 240 },
  { key: 'styleCode', title: 'Mã hàng', filterKey: 'styleCode', format: 'code', sortKey: 'styleCode' },
  { key: 'season', title: 'Season', filterKey: 'season', sortKey: 'season' },
  { key: 'orderType', title: 'Loại', filterKey: 'orderType' },
  { key: 'productName', title: 'Tên sản phẩm', filterKey: 'productName', minWidth: 180, maxWidth: 260 },
  { key: 'branchCode', title: 'Chi nhánh FOB', filterKey: 'branchCode', field: null },
  // Không sắp xếp: lưới hiện tên nhà máy (danh mục ở MES_Core) còn dữ liệu chỉ có mã
  { key: 'productionFactoryCode', title: 'Nhà máy SX', filterKey: 'productionFactoryCode', minWidth: 120 },
  { key: 'staffName', title: 'Nhân viên lập', filterKey: 'staffName' },
  { key: 'qty', title: 'Số lượng', filterKey: 'qty', format: 'number', sortKey: 'qty' },
  { key: 'unitName', title: 'Đơn vị tính', filterKey: 'unitName' },
  { key: 'unitPrice', title: 'Đơn giá (USD)', format: 'money', sortKey: 'unitPrice' },
  { key: 'amount', title: 'Thành tiền (USD)', format: 'money', sortKey: 'amount' },
  { key: 'cmPrice', title: 'Giá CM (USD)', format: 'money' },
  { key: 'syncedAt', title: 'Ngày đồng bộ', filterKey: 'syncedAt', format: 'date', sortKey: 'syncedAt' },
  { key: 'shipDate', title: 'Ngày xuất hàng', filterKey: 'shipDate', format: 'date', sortKey: 'shipDate' },
  { key: 'statusCode', title: 'Trạng thái', filterKey: 'statusCode', filterLabel: (v) => SALES_STATUS[v]?.label ?? String(v), sortKey: 'statusCode', render: (r) => <StatusBadge map={SALES_STATUS} code={r.statusCode} /> },
  { key: 'createdAt', title: 'Ngày tạo', format: 'datetime', sortKey: 'createdAt', filterKey: 'createdAt' },
];
const NAMES = Object.fromEntries(COLUMNS.map((c) => [c.key, c.title]));

/** Cột Nhà máy SX hiện tên theo danh mục Nhà máy sản xuất (kể cả nhà máy đã ngừng), không có trong danh mục thì hiện mã */
function withFactoryNames(factories: FactoryOption[]): Column<SalesOrder>[] {
  const name = new Map(factories.map((f) => [f.code, f.name]));
  return COLUMNS.map((c) =>
    c.key === 'productionFactoryCode'
      ? { ...c, filterLabel: (v) => factoryLabel(String(v), name), render: (r) => (r.productionFactoryCode ? <span title={r.productionFactoryCode}>{factoryLabel(r.productionFactoryCode, name)}</span> : <span className="cell-empty">–</span>) }
      : c,
  );
}

/** Màn "Thông tin đơn hàng": danh sách đơn hàng theo mã hàng, nạp từ BRAVO (load:bravo) hoặc thêm, sửa tay. */
export default function SalesOrderPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branchName = useBranchName();
  const { customers, seasons, factories } = useCustomers();
  const columns = useMemo(() => withBranchNames(withFactoryNames(factories), branchName), [factories, branchName]);
  const list = usePagedList<SalesOrder>('sales-orders', '/order/sales-orders');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Popup sửa nhận bản ghi lấy từ danh sách lúc bấm (không phải bản đã chọn từ trước): lưu xong mở lại thấy số mới
  const [dialog, setDialog] = useState<{ order: SalesOrder | null } | null>(null);
  const canCreate = useCanWrite(`${RESOURCE}:create`);
  const canUpdate = useCanWrite(`${RESOURCE}:update`);
  const canDelete = useCanWrite(`${RESOURCE}:delete`);
  const originLock = useOriginLock('Đơn hàng');
  // Ghi đơn hàng làm đổi cả gợi ý của ô lọc (khách hàng, season)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['order'] }), qc.invalidateQueries({ queryKey: ORDER_OPTIONS_KEY })]);
  const refreshAfterClose = useAfterClose(refresh);

  const items = list.query.data?.items ?? [];
  // Đổi lọc hay trang mà dòng đã chọn không còn trong lưới thì coi như chưa chọn
  const selected = items.find((r) => r.id === selectedId) ?? null;
  // Đơn của ĐVCS khác: xem được, không sửa, xóa được
  const writeBlocked = selected ? originLock(selected.branchCode) : PICK_ROW;
  // Cột số lượng bị Che hoặc Ẩn thì không có tổng (null)
  const sumQty = sumOf(items.map((r) => r.qty));

  const remove = useMutation({
    mutationFn: (o: SalesOrder) => api(`/order/sales-orders/${o.id}`, { method: 'DELETE' }),
    onSuccess: (_r, o) => {
      toastOk(`Đã xóa đơn hàng ${o.orderNo}.`, 'Đã xóa');
      setSelectedId(null);
      void refresh();
    },
    onError: (e) => toastError(e, 'Chưa xóa được'),
  });

  return (
    <WorkPage
      title="Thông tin đơn hàng"
      subtitle="Đơn hàng của toàn công ty lấy từ BRAVO, không lọc theo đơn vị cơ sở. Chọn Nhà máy SX cho từng đơn: đơn vị cơ sở có nhà máy đó mới lập kế hoạch xuất hàng cho đơn."
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="thong-tin-don-hang.csv" />
          {canDelete && (
            <ActionButton
              variant="default"
              color="red"
              leftSection={<IconTrash size={15} />}
              blockedReason={writeBlocked}
              loading={remove.isPending}
              onClick={() =>
                selected &&
                confirmAction({
                  title: `Xóa đơn hàng ${selected.orderNo}?`,
                  consequence: 'Chỉ xóa được đơn chưa có PO và kế hoạch xuất hàng. Không hoàn tác được.',
                  confirmLabel: 'Xóa đơn hàng',
                  onConfirm: () => remove.mutate(selected),
                })
              }
            >
              Xóa
            </ActionButton>
          )}
          {canUpdate && (
            <ActionButton variant="default" leftSection={<IconPencil size={15} />} blockedReason={writeBlocked} onClick={() => selected && setDialog({ order: selected })}>
              Sửa
            </ActionButton>
          )}
          {canCreate && (
            <Button leftSection={<IconPlus size={15} />} onClick={() => setDialog({ order: null })}>
              Thêm đơn hàng
            </Button>
          )}
        </>
      }
      filters={<OrderFilters policy={policy} value={list.filter} onChange={list.setFilter} customers={customers} seasons={seasons} statuses={SALES_STATUS} columns={list.columnsOf(NAMES, policy)} />}
    >
      <DataGrid
        label="Danh sách đơn hàng"
        fill
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        policy={policy}
        loading={list.query.isFetching}
        error={list.error}
        onRetry={() => void list.query.refetch()}
        indexOffset={(list.page - 1) * list.pageSize}
        sort={list.sort}
        onSort={list.setSort}
        {...list.grid}
        selectedKey={selected?.id}
        onRowClick={(r) => setSelectedId(r.id)}
        onRowDoubleClick={(r) => {
          setSelectedId(r.id);
          if (canUpdate && !originLock(r.branchCode)) setDialog({ order: r });
        }}
        empty={
          <EmptyState
            filtered={list.filtered}
            what="đơn hàng"
            onClear={list.clearFilter}
            hint={canCreate ? 'Chưa có đơn hàng. Bấm "Thêm đơn hàng" để nhập.' : 'Chưa có đơn hàng.'}
          />
        }
        footer={
          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={list.query.data?.total ?? 0}
            onPage={list.setPage}
            extra={sumQty !== null && <Text size="sm">Tổng số lượng trang này: <b>{fmtNum(sumQty)}</b></Text>}
          />
        }
      />
      {dialog && <SalesOrderDialog order={dialog.order} policy={policy} onClose={() => setDialog(null)} onDone={refreshAfterClose} />}
    </WorkPage>
  );
}

interface Lock {
  readOnly?: boolean;
  className?: string;
  description?: string;
}

/**
 * Ô nhập theo chính sách cột: Ẩn thì không có ô, Che thì chỉ hiện "***", Chỉ đọc thì khóa (tô xám). `render` nhận
 * thuộc tính khóa để trải sau cùng (đè className của ô bắt buộc).
 */
function Guarded({ policy, field, label, render }: { policy: FieldPolicy; field: string; label: string; render: (lock: Lock) => ReactElement }) {
  const level = policy.level(field);
  if (level === 'HIDDEN') return null;
  if (level === 'MASKED') return <TextInput label={label} value={MASK} readOnly className="field-readonly" description="Bị che theo phân quyền" />;
  return render(level === 'READONLY' ? { readOnly: true, className: 'field-readonly', description: 'Bạn chỉ được xem trường này' } : {});
}

/**
 * Ô chọn Nhà máy SX gom theo đơn vị cơ sở: nhà máy đang dùng, cộng nhà máy hiện tại của đơn (kể cả đã ngừng hoặc không còn
 * trong danh mục) để không mất giá trị
 */
function factorySelectData(factories: FactoryOption[], current: string | null, branchName: (code: string | null | undefined) => string) {
  const shown = factories.filter((f) => f.isActive || f.code === current);
  const groups = [...new Set(shown.map((f) => f.branchCode))].map((code) => ({
    group: code ? branchName(code) : 'Chưa gắn đơn vị cơ sở',
    items: shown.filter((f) => f.branchCode === code).map((f) => ({ value: f.code, label: f.isActive ? f.name : `${f.name} (đã ngừng)` })),
  }));
  if (current && current !== MASK && !factories.some((f) => f.code === current)) {
    // Danh sách nhiều nhà máy theo OSM (đơn nay không còn trong OSM): giữ giá trị, hiện bằng tên
    const list = current.includes(',');
    const label = factoryLabel(current, new Map(factories.map((f) => [f.code, f.name])));
    groups.push({ group: list ? 'Theo OSM trước đây' : 'Không còn trong danh mục', items: [{ value: current, label }] });
  }
  return groups;
}

/** Trường bắt buộc khi thêm đơn hàng: không được sửa trường nào trong số này thì không thêm được. */
const REQUIRED: Record<string, string> = { customerName: 'Khách hàng', styleCode: 'Mã hàng', productName: 'Tên sản phẩm', qty: 'Số lượng', shipDate: 'Ngày xuất hàng' };

function useOrderForm(order: SalesOrder | null, policy: FieldPolicy) {
  const num = (v: unknown) => (typeof v === 'number' ? v : '');
  // Ô không sửa được thì không kiểm (cũng không gửi lên)
  const check = (field: string, ok: boolean, msg: string) => (!policy.editable(field) || ok ? null : msg);
  return useForm({
    initialValues: {
      customerName: order?.customerName ?? '',
      styleCode: order?.styleCode ?? '',
      season: order?.season ?? '',
      orderType: order?.orderType ?? '',
      productName: order?.productName ?? '',
      staffName: order?.staffName ?? '',
      qty: num(order?.qty) as number | '',
      unitName: order?.unitName ?? 'Chiếc',
      unitPrice: num(order?.unitPrice) as number | '',
      cmPrice: num(order?.cmPrice) as number | '',
      shipDate: order?.shipDate ?? '',
      statusCode: order?.statusCode ?? 'NEW',
      productionFactoryCode: (order?.productionFactoryCode ?? null) as string | null,
    },
    validate: {
      customerName: (v) => check('customerName', !!v.trim(), 'Nhập khách hàng'),
      // Mã hàng của BRAVO có chữ tiếng Việt, dấu cách: chỉ chặn rỗng, quá dài (đo sau khi đổi chữ hoa như máy chủ), xuống dòng, ký tự ẩn
      styleCode: (v) => {
        const s = v.trim().toUpperCase();
        return check('styleCode', s.length > 0 && s.length <= 120 && /^[^\p{C}\p{Zl}\p{Zp}]+$/u.test(s), 'Nhập mã hàng, tối đa 120 ký tự, không xuống dòng');
      },
      productName: (v) => check('productName', !!v.trim(), 'Nhập tên sản phẩm'),
      qty: (v) => check('qty', typeof v === 'number' && Number.isInteger(v) && v >= 0, 'Số lượng là số nguyên từ 0'),
      shipDate: (v) => check('shipDate', /^\d{4}-\d{2}-\d{2}$/.test(v), 'Chọn ngày xuất hàng'),
    },
  });
}

function SalesOrderDialog({ order, policy, onClose, onDone }: { order: SalesOrder | null; policy: FieldPolicy; onClose: () => void; onDone: () => void }) {
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const mobile = useMobile();
  const form = useOrderForm(order, policy);
  const { orderTypes, orderTypeNames, units, factories } = useCustomers();
  const factoryData = factorySelectData(factories, form.getInitialValues().productionFactoryCode, branchName);
  const factoryNames = useMemo(() => new Map(factories.map((f) => [f.code, f.name])), [factories]);
  const blocked = order ? [] : Object.keys(REQUIRED).filter((f) => !policy.editable(f));
  const dirty = form.isDirty();
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);
  const m = useMutation({
    mutationFn: (v: typeof form.values) => {
      const body: Record<string, unknown> = { ...v, qty: v.qty === '' ? undefined : v.qty, unitPrice: v.unitPrice === '' ? null : v.unitPrice, cmPrice: v.cmPrice === '' ? null : v.cmPrice };
      // Chỉ gửi trường được sửa (cột chỉ đọc gửi lên sẽ bị server từ chối) và, khi sửa, chỉ gửi trường đã đổi
      for (const k of Object.keys(body)) {
        if (!policy.editable(k) || (order && form.values[k as keyof typeof form.values] === form.getInitialValues()[k as keyof typeof form.values])) delete body[k];
      }
      return order ? api<SalesOrder>(`/order/sales-orders/${order.id}`, { method: 'PUT', body }) : api<SalesOrder>('/order/sales-orders', { method: 'POST', body });
    },
    onSuccess: (r) => {
      toastOk(order ? `Đã lưu đơn hàng ${r.orderNo}.` : `Đã thêm đơn hàng ${r.orderNo} vào ${branchName(branch?.code)}.`, order ? 'Đã lưu' : 'Đã thêm');
      onClose();
      onDone();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  const req = 'field-required';
  const submitBlocked = blocked.length > 0 ? `Bạn không được nhập ${blocked.map((f) => REQUIRED[f]).join(', ')} nên chưa thêm được đơn hàng` : order && !dirty ? 'Chưa có thay đổi nào' : null;

  return (
    <Modal opened onClose={close} size="lg" fullScreen={mobile} title={order ? `Sửa đơn hàng ${order.orderNo}` : 'Thêm đơn hàng'}>
      <form onSubmit={form.onSubmit((v) => m.mutate(v))}>
        <Stack gap="sm">
          <Text size="xs" c="dimmed">Ô vàng bắt buộc nhập. Ô xám chỉ xem.</Text>
          {blocked.length > 0 && (
            <Alert color="orange" variant="light" py={6}>
              Bạn không được nhập {blocked.map((f) => REQUIRED[f]).join(', ')} nên chưa thêm được đơn hàng. Nhờ quản trị viên mở ở Chính sách cột nếu cần.
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Số đơn" value={order?.orderNo ?? 'Tự sinh khi lưu'} readOnly className="field-readonly" />
            <Group grow gap="sm" align="flex-start">
              <TextInput label="Chi nhánh FOB" value={branchName(order?.branchCode ?? branch?.code)} readOnly className="field-readonly" />
              <Guarded
                policy={policy}
                field="productionFactoryCode"
                label="Nhà máy SX"
                render={(lock) =>
                  // Theo OSM (ADR 0013 mục 9): chỉ xem, giá trị gửi lại nguyên như cũ khi lưu
                  order?.factoryFromOsm && order.productionFactoryCode && order.productionFactoryCode !== MASK ? (
                    <TextInput
                      label="Nhà máy SX"
                      value={factoryLabel(order.productionFactoryCode, factoryNames)}
                      description="Lấy theo OSM, không chọn tay được. Sửa ở OSM rồi đồng bộ lại."
                      readOnly
                      className="field-readonly"
                    />
                  ) : (
                  <Select
                    label="Nhà máy SX"
                    placeholder="Chọn nhà máy SX"
                    data={factoryData}
                    searchable
                    clearable
                    nothingFoundMessage="Không có nhà máy nào khớp"
                    renderOption={({ option }) => (
                      <Group justify="space-between" wrap="nowrap" w="100%" gap="xs">
                        <span>{option.label}</span>
                        <Text span size="xs" c="dimmed">{option.value}</Text>
                      </Group>
                    )}
                    {...form.getInputProps('productionFactoryCode')}
                    {...lock}
                  />
                  )
                }
              />
            </Group>
            <Guarded policy={policy} field="customerName" label="Khách hàng" render={(lock) => <TextInput label="Khách hàng" withAsterisk={!lock.readOnly} className={req} data-autofocus {...form.getInputProps('customerName')} {...lock} />} />
            <Guarded policy={policy} field="styleCode" label="Mã hàng" render={(lock) => <TextInput label="Mã hàng" withAsterisk={!lock.readOnly} className={req} {...form.getInputProps('styleCode')} {...lock} />} />
            <Guarded policy={policy} field="productName" label="Tên sản phẩm" render={(lock) => <TextInput label="Tên sản phẩm" withAsterisk={!lock.readOnly} className={req} {...form.getInputProps('productName')} {...lock} />} />
            <Group grow gap="sm" align="flex-start">
              <Guarded policy={policy} field="season" label="Season" render={(lock) => <TextInput label="Season" placeholder="FW26" {...form.getInputProps('season')} {...lock} />} />
              <Guarded policy={policy} field="orderType" label="Loại" render={(lock) => (
                  <Autocomplete
                    label="Loại"
                    placeholder="SXXK, GCND…"
                    data={orderTypes}
                    renderOption={({ option }) => (orderTypeNames[option.value] ? <span><b>{option.value}</b> – {orderTypeNames[option.value]}</span> : option.value)}
                    {...form.getInputProps('orderType')}
                    {...lock}
                  />
                )} />
            </Group>
            <Group grow gap="sm" align="flex-start">
              <Guarded
                policy={policy}
                field="qty"
                label="Số lượng"
                render={(lock) => <NumberInput label="Số lượng" withAsterisk={!lock.readOnly} className={req} min={0} allowDecimal={false} thousandSeparator="." decimalSeparator="," {...form.getInputProps('qty')} {...lock} />}
              />
              <Guarded policy={policy} field="unitName" label="Đơn vị tính" render={(lock) => <Autocomplete label="Đơn vị tính" data={units} {...form.getInputProps('unitName')} {...lock} />} />
            </Group>
            <Guarded policy={policy} field="shipDate" label="Ngày xuất hàng" render={(lock) => <DateField label="Ngày xuất hàng" withAsterisk={!lock.readOnly} className={req} {...form.getInputProps('shipDate')} {...lock} />} />
            {(['unitPrice', 'cmPrice'] as const).map((f) => (
              <Guarded
                key={f}
                policy={policy}
                field={f}
                label={f === 'unitPrice' ? 'Đơn giá (USD)' : 'Giá CM (USD)'}
                // Lưới hiện 2 số lẻ: nhập nhiều hơn thì người dùng thấy số khác số đã gõ
                render={(lock) => <NumberInput label={f === 'unitPrice' ? 'Đơn giá (USD)' : 'Giá CM (USD)'} min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," {...form.getInputProps(f)} {...lock} />}
              />
            ))}
            <Guarded policy={policy} field="staffName" label="Nhân viên lập" render={(lock) => <TextInput label="Nhân viên lập" placeholder="Người lập đơn bên BRAVO" {...form.getInputProps('staffName')} {...lock} />} />
            <Guarded policy={policy} field="statusCode" label="Trạng thái" render={(lock) => <Select label="Trạng thái" data={statusOptions(SALES_STATUS)} allowDeselect={false} {...form.getInputProps('statusCode')} {...lock} />} />
          </SimpleGrid>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <ActionButton type="submit" loading={m.isPending} blockedReason={submitBlocked}>{order ? 'Lưu thay đổi' : 'Thêm đơn hàng'}</ActionButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
