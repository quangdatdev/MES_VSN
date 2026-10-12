import { Alert, Button, Grid, Group, Modal, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconListSearch, IconPencil, IconPlus, IconTrash, IconWand } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { DataGrid, type Column } from '../../components/DataGrid';
import { DateField } from '../../components/DateField';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetNumber, sheetReadonly, type SheetColumn } from '../../components/SheetGrid';
import { WorkPage } from '../../components/WorkPage';
import { useAfterClose } from '../../lib/afterClose';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy } from '../../lib/fieldPolicy';
import { addDays, fmtDate, fmtNum, qs, sumOf, today } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { useSession } from '../../store/session';
import { emptyFilter, type Candidate, type CandidatePo, type OrderFilter, type PlanLine, type ShipmentPlan, type ShipmentPlanDetail } from './api';
import { EmptyState, ExportButton, filterParams, IssueList, loadError, OrderFilters, PICK_ROW, PLAN_STATUS, PO_STATUS, StatusBadge, useCanWrite, useCustomers, usePagedList } from './common';

const RESOURCE = 'order.shipment';

const COLUMNS: Column<ShipmentPlan>[] = [
  { key: 'planNo', title: 'Số kế hoạch', filterKey: 'planNo', format: 'code', sortKey: 'planNo' },
  { key: 'customerName', title: 'Khách hàng', filterKey: 'customerName', sortKey: 'customerName', minWidth: 160, maxWidth: 240 },
  { key: 'styleCode', title: 'Mã hàng', filterKey: 'styleCode', format: 'code', sortKey: 'styleCode' },
  { key: 'productName', title: 'Tên sản phẩm', filterKey: 'productName', minWidth: 170, maxWidth: 260 },
  { key: 'poBuyDate', title: 'PO/Buy date', filterKey: 'poBuyDate', sortKey: 'poBuyDate' },
  { key: 'branchCode', title: 'ĐVCS', filterKey: 'branchCode', field: null },
  { key: 'syncedAt', title: 'Ngày đồng bộ', filterKey: 'syncedAt', format: 'date', sortKey: 'syncedAt' },
  { key: 'shipDate', title: 'Ngày xuất hàng', filterKey: 'shipDate', format: 'date', sortKey: 'shipDate' },
  { key: 'plannerName', title: 'Nhân viên lập', filterKey: 'plannerName' },
  { key: 'planQty', title: 'Số lượng KH', filterKey: 'planQty', format: 'number', sortKey: 'planQty' },
  { key: 'cutQty', title: 'LK cắt', filterKey: 'cutQty', format: 'number' },
  { key: 'sewnQty', title: 'LK May ra', filterKey: 'sewnQty', format: 'number' },
  { key: 'endlineQty', title: 'LK Endline', filterKey: 'endlineQty', format: 'number' },
  { key: 'finishedQty', title: 'LK Hoàn thiện', filterKey: 'finishedQty', format: 'number' },
  { key: 'statusCode', title: 'Trạng thái', filterKey: 'statusCode', filterLabel: (v) => PLAN_STATUS[v]?.label ?? String(v), sortKey: 'statusCode', render: (r) => <StatusBadge map={PLAN_STATUS} code={r.statusCode} /> },
  { key: 'createdAt', title: 'Ngày tạo', format: 'datetime', sortKey: 'createdAt', filterKey: 'createdAt' },
];
const NAMES = Object.fromEntries(COLUMNS.map((c) => [c.key, c.title]));

/** Màn "Kế hoạch xuất hàng" (B1 trong mô tả giao diện): danh sách, Thêm, Sửa. */
export default function ShipmentPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const { customers } = useCustomers();
  const list = usePagedList<ShipmentPlan>('shipment', '/order/shipment-plans');
  const columns = useMemo(() => withBranchNames(COLUMNS, branchName), [branchName]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // null: thêm mới; số: sửa kế hoạch đó (popup tự tải lại chi tiết khi mở)
  const [dialog, setDialog] = useState<{ planId: number | null } | null>(null);
  const canCreate = useCanWrite(`${RESOURCE}:create`);
  const canUpdate = useCanWrite(`${RESOURCE}:update`);
  const canDelete = useCanWrite(`${RESOURCE}:delete`);
  const refresh = () => qc.invalidateQueries({ queryKey: ['order'] });
  const refreshAfterClose = useAfterClose(refresh);

  const items = list.query.data?.items ?? [];
  // Đổi lọc hay trang mà dòng đã chọn không còn trong lưới thì coi như chưa chọn
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const planSum = sumOf(items.map((r) => r.planQty));

  const remove = useMutation({
    mutationFn: (p: ShipmentPlan) => api(`/order/shipment-plans/${p.id}`, { method: 'DELETE' }),
    onSuccess: (_r, p) => {
      toastOk(`Đã xóa kế hoạch xuất hàng ${p.planNo}.`, 'Đã xóa');
      setSelectedId(null);
      void refresh();
    },
    onError: (e) => toastError(e, 'Chưa xóa được'),
  });

  return (
    <WorkPage
      title="Kế hoạch xuất hàng"
      subtitle={branch?.isAggregate ? 'Kế hoạch của mọi đơn vị cơ sở bạn được xem' : `Kế hoạch xuất hàng của ${branchName(branch?.code)}, kèm lũy kế cắt, may, kiểm, hoàn thiện`}
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="ke-hoach-xuat-hang.csv" />
          {canDelete && (
            <ActionButton
              variant="default"
              color="red"
              leftSection={<IconTrash size={15} />}
              blockedReason={selected ? null : PICK_ROW}
              loading={remove.isPending}
              onClick={() =>
                selected &&
                confirmAction({
                  title: `Xóa kế hoạch ${selected.planNo}?`,
                  consequence: 'Chỉ xóa được kế hoạch chưa xếp chuyền. Không hoàn tác được.',
                  confirmLabel: 'Xóa kế hoạch',
                  onConfirm: () => remove.mutate(selected),
                })
              }
            >
              Xóa
            </ActionButton>
          )}
          {canUpdate && (
            <ActionButton variant="default" leftSection={<IconPencil size={15} />} blockedReason={selected ? null : PICK_ROW} onClick={() => selected && setDialog({ planId: selected.id })}>
              Sửa
            </ActionButton>
          )}
          {canCreate && (
            <Button leftSection={<IconPlus size={15} />} onClick={() => setDialog({ planId: null })}>
              Thêm kế hoạch
            </Button>
          )}
        </>
      }
      filters={<OrderFilters policy={policy} value={list.filter} onChange={list.setFilter} customers={customers} statuses={PLAN_STATUS} search={{ label: 'PO/Buy date', placeholder: 'Số PO hoặc Buy date' }} columns={list.columnsOf(NAMES, policy)} />}
    >
      <DataGrid
        label="Danh sách kế hoạch xuất hàng"
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
          if (canUpdate) setDialog({ planId: r.id });
        }}
        empty={
          <EmptyState
            filtered={list.filtered}
            what="kế hoạch"
            onClear={list.clearFilter}
            hint={canCreate ? 'Chưa có kế hoạch xuất hàng. Bấm "Thêm kế hoạch" để lập kế hoạch từ một mã hàng.' : 'Chưa có kế hoạch xuất hàng.'}
          />
        }
        footer={
          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={list.query.data?.total ?? 0}
            onPage={list.setPage}
            extra={planSum !== null && <Text size="sm">Tổng SL kế hoạch trang này: <b>{fmtNum(planSum)}</b></Text>}
          />
        }
      />
      {dialog && <PlanDialog planId={dialog.planId} onClose={() => setDialog(null)} onDone={refreshAfterClose} />}
    </WorkPage>
  );
}

interface Picked {
  candidate: Candidate;
  poIds: number[];
  poBuyDate: string;
}

type PlanSheetRow = Omit<PlanLine, 'planQty'> & { key: string; planQty: number | null };
const NO_PLAN_LINES: PlanLine[] = [];
const lineKey = (l: Pick<PlanLine, 'colorName' | 'sizeName'>) => `${l.colorName}|${l.sizeName}`;
/** Lưới SL KHXH: chỉ cột SL KHXH nhập được (dán cả cột từ Excel); vượt SL còn lại tô đỏ */
const PLAN_SHEET: SheetColumn<PlanSheetRow>[] = [
  sheetReadonly<PlanSheetRow>('Tên màu SP', (r) => r.colorName, (r) => r.colorName, { minWidth: 150, grow: 2 }),
  sheetReadonly<PlanSheetRow>('Tên cỡ SP', (r) => r.sizeName, (r) => r.sizeName, { minWidth: 90 }),
  sheetReadonly<PlanSheetRow>('Số lượng gốc', (r) => fmtNum(r.originalQty), (r) => r.originalQty, { minWidth: 110, align: 'right' }),
  sheetReadonly<PlanSheetRow>('SL đã tạo KHXH', (r) => fmtNum(r.plannedQty), (r) => r.plannedQty, { minWidth: 120, align: 'right' }),
  sheetReadonly<PlanSheetRow>('SL còn lại', (r) => fmtNum(r.remainingQty), (r) => r.remainingQty, { minWidth: 100, align: 'right' }),
  sheetNumber<PlanSheetRow>('planQty', 'SL KHXH', { required: true, minWidth: 120, error: (r) => (r.planQty ?? 0) > r.remainingQty }),
];

/** Popup B2: thêm hoặc sửa kế hoạch. SL KHXH theo màu cỡ không vượt SL còn lại. */
function PlanDialog({ planId, onClose, onDone }: { planId: number | null; onClose: () => void; onDone: () => void }) {
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const mobile = useMobile();
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [qty, setQty] = useState<Record<string, number | ''>>({});
  const form = useForm({ initialValues: { poBuyDate: '', shipDate: '' } });
  const policy = useFieldPolicy(RESOURCE);
  const canPoBuy = policy.editable('poBuyDate');
  const canShip = policy.editable('shipDate');
  const canQty = policy.editable('planQty');
  // Thêm mới bắt buộc nhập PO/Buy date và số lượng theo màu cỡ
  const blocked = planId === null && (!canPoBuy || !canQty);

  // Luôn tải lại khi mở và chỉ điền form từ dữ liệu vừa tải: điền từ bộ nhớ đệm cũ rồi lưu sẽ ghi đè thay đổi
  // người khác vừa làm (review 5.1 lượt 2 F4). Điền một lần, không đè lên chỗ người dùng đang sửa.
  const existing = useQuery({
    queryKey: ['order', 'shipment-detail', planId],
    queryFn: () => api<ShipmentPlanDetail>(`/order/shipment-plans/${planId}`),
    enabled: planId !== null,
    refetchOnMount: 'always',
  });
  const plan = existing.data;
  const [filled, setFilled] = useState(planId === null);
  const { initialize } = form;
  useEffect(() => {
    // isFetchedAfterMount cũng đúng khi tải lỗi: chỉ điền khi lần tải vừa rồi thành công (review lượt 3 P8)
    if (filled || !plan || !existing.isSuccess || !existing.isFetchedAfterMount) return;
    // initialize: giá trị vừa tải là mốc so sánh "đã đổi gì chưa"
    initialize({ poBuyDate: plan.poBuyDate, shipDate: plan.shipDate });
    setQty(Object.fromEntries(plan.lines.map((l) => [lineKey(l), typeof l.planQty === 'number' ? l.planQty : ''])));
    setFilled(true);
  }, [filled, plan, existing.isSuccess, existing.isFetchedAfterMount, initialize]);

  const salesOrderId = plan?.salesOrderId ?? picked?.candidate.salesOrderId;
  const poIds = plan?.poIds ?? picked?.poIds ?? [];
  const draft = useQuery({
    queryKey: ['order', 'shipment-draft', salesOrderId, poIds.join(','), planId],
    queryFn: () => api<PlanLine[]>(`/order/shipment-plans/draft${qs({ salesOrderId, poIds: poIds.join(','), excludePlanId: planId ?? undefined })}`),
    enabled: !!salesOrderId && poIds.length > 0,
  });
  const lines = draft.data ?? NO_PLAN_LINES;
  const qtyOf = (l: PlanLine) => Number(qty[lineKey(l)]) || 0;
  const total = lines.reduce((s, l) => s + qtyOf(l), 0);
  const over = lines.filter((l) => qtyOf(l) > l.remainingQty);
  const savedQty = new Map((plan?.lines ?? []).map((l) => [lineKey(l), typeof l.planQty === 'number' ? l.planQty : 0]));
  const qtyChanged = lines.some((l) => qtyOf(l) !== (savedQty.get(lineKey(l)) ?? 0));
  const hasQty = Object.values(qty).some((v) => v !== '');
  const dirty = planId ? filled && (form.isDirty() || qtyChanged) : !!picked || form.isDirty() || hasQty;
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);

  const save = useMutation({
    mutationFn: () => {
      // Chỉ gửi trường được sửa: gửi cột chỉ đọc lên thì máy chủ từ chối cả lần lưu (review 5.1 lượt 2 F5).
      // Khi sửa, số lượng không đổi thì không gửi: đổi mỗi ngày tháng không phải kiểm lại SL còn lại (review lượt 3 P6)
      const body = {
        poBuyDate: canPoBuy ? form.values.poBuyDate.trim() : undefined,
        shipDate: canShip ? form.values.shipDate || undefined : undefined,
        lines: canQty && (!planId || qtyChanged) ? lines.map((l) => ({ colorName: l.colorName, sizeName: l.sizeName, planQty: qtyOf(l) })) : undefined,
      };
      return planId ? api<ShipmentPlan>(`/order/shipment-plans/${planId}`, { method: 'PUT', body }) : api<ShipmentPlan>('/order/shipment-plans', { method: 'POST', body: { ...body, salesOrderId, poIds } });
    },
    onSuccess: (r) => {
      toastOk(planId ? `Đã lưu kế hoạch ${r.planNo}.` : `Đã thêm kế hoạch ${r.planNo}.`, planId ? 'Đã lưu' : 'Đã thêm');
      onClose();
      onDone();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });

  const head = plan ?? (picked ? { customerName: picked.candidate.customerName, styleCode: picked.candidate.styleCode, syncedAt: picked.candidate.syncedAt, branchCode: picked.candidate.branchCode } : null);
  const saveBlocked = blocked
    ? `Bạn không được nhập ${[!canPoBuy && 'PO/Buy date', !canQty && 'số lượng kế hoạch'].filter(Boolean).join(' và ')} nên chưa thêm được kế hoạch`
    : planId && !filled
      ? existing.error
        ? 'Chưa tải được kế hoạch'
        : 'Đang tải kế hoạch…'
      : !salesOrderId
        ? 'Chọn mã hàng trước'
        : canPoBuy && !form.values.poBuyDate.trim()
          ? 'Nhập PO/Buy date'
          : canQty && draft.isLoading
            ? 'Đang tải màu cỡ…'
            : canQty && over.length > 0
              ? 'Có màu cỡ có SL KHXH lớn hơn SL còn lại'
              : canQty && total <= 0
                ? 'Nhập SL KHXH cho ít nhất một màu cỡ'
                : planId && !dirty
                  ? 'Chưa có thay đổi nào'
                  : null;
  /** Ô theo chính sách cột: Ẩn thì không có, Che thì hiện "***", Chỉ đọc thì khóa. */
  const lock = (field: string) => (policy.editable(field) ? {} : { readOnly: true, className: 'field-readonly', description: 'Bạn chỉ được xem trường này' });

  // Lưới xem (không được nhập số lượng, đang tải, lỗi, chưa chọn mã hàng)
  const columns = useMemo<Column<PlanLine>[]>(
    () => [
      { key: 'colorName', title: 'Tên màu SP', field: null },
      { key: 'sizeName', title: 'Tên cỡ SP', field: null },
      { key: 'originalQty', title: 'Số lượng gốc', format: 'number', field: null },
      { key: 'plannedQty', title: 'SL đã tạo KHXH', format: 'number', field: null },
      { key: 'remainingQty', title: 'SL còn lại', format: 'number', field: null },
      { key: 'planQty', title: 'SL KHXH', field: null, width: 130, render: (l) => fmtNum(qty[lineKey(l)]) },
    ],
    [qty],
  );
  // Dòng của lưới nhập chỉ dựng lại khi màu cỡ hoặc số đã nhập đổi (gõ PO/Buy date không vẽ lại các ô của lưới)
  const sheetRows = useMemo<PlanSheetRow[]>(
    () =>
      lines.map((l) => {
        const v = qty[lineKey(l)];
        return { ...l, key: lineKey(l), planQty: typeof v === 'number' ? v : null };
      }),
    [lines, qty],
  );
  const emptyLines = planId
    ? existing.error
      ? 'Chưa tải được kế hoạch.'
      : 'Kế hoạch này chưa có màu cỡ.'
    : salesOrderId
      ? 'Các PO đã chọn chưa có màu cỡ.'
      : 'Bấm "Chọn mã hàng" để chọn đơn hàng và PO cần lập kế hoạch.';

  const applyPick = (p: Picked) => {
    setPicked(p);
    setQty({});
    form.setValues({ poBuyDate: p.poBuyDate, shipDate: p.candidate.shipDate });
    setPicker(false);
  };

  return (
    // Esc trong lưới là thoát sửa ô, bỏ vùng chọn: không để nó đóng popup
    <Modal
      opened
      onClose={close}
      // Đang mở popup Chọn mã hàng: Esc chỉ đóng popup trên cùng (Mantine nghe Esc trên cả cửa sổ, hai popup cùng nhận)
      closeOnEscape={!canQty && !picker}
      size="min(1100px, 96vw)"
      fullScreen={mobile}
      title={planId ? (plan ? `Sửa kế hoạch ${plan.planNo}` : existing.error ? 'Sửa kế hoạch xuất hàng' : 'Đang tải kế hoạch…') : 'Thêm kế hoạch xuất hàng'}
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} spacing="xs">
          <TextInput label="Đơn vị cơ sở" value={branchName(head?.branchCode ?? branch?.code)} readOnly className="field-readonly" />
          <TextInput label="Khách hàng" value={head?.customerName ?? ''} readOnly className="field-readonly" placeholder="Chọn mã hàng" />
          <TextInput label="Mã hàng" value={head?.styleCode ?? ''} readOnly className="field-readonly" />
          {policy.visible('poBuyDate') && <TextInput label="PO/Buy date" withAsterisk={canPoBuy} className="field-required" {...form.getInputProps('poBuyDate')} {...lock('poBuyDate')} />}
          {policy.visible('planQty') && <TextInput label="SL sản phẩm" value={canQty ? fmtNum(total) : fmtNum(plan?.planQty)} readOnly className="field-readonly" />}
          <TextInput label="Ngày đồng bộ" value={fmtDate(head?.syncedAt ?? null)} readOnly className="field-readonly" />
          {policy.level('shipDate') === 'MASKED' ? (
            <TextInput label="Ngày xuất hàng" value={MASK} readOnly className="field-readonly" />
          ) : (
            policy.visible('shipDate') && <DateField label="Ngày xuất hàng" {...form.getInputProps('shipDate')} {...lock('shipDate')} />
          )}
        </SimpleGrid>
        {existing.error && (
          <Alert color="red" variant="light" py={6}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <span>{loadError(existing.error, 'Không tải được kế hoạch.')} Nếu kế hoạch vừa bị xóa, nó sẽ không còn trong danh sách.</span>
              <Button size="xs" variant="default" loading={existing.isFetching} onClick={() => void existing.refetch()}>
                Thử lại
              </Button>
            </Group>
          </Alert>
        )}
        {blocked && (
          <Alert color="orange" variant="light" py={6}>
            Bạn không được nhập {[!canPoBuy && 'PO/Buy date', !canQty && 'số lượng kế hoạch'].filter(Boolean).join(' và ')} nên chưa thêm được kế hoạch. Nhờ quản trị viên mở ở Chính sách cột nếu cần.
          </Alert>
        )}
        <Group justify="space-between">
          <Group gap="xs">
            {!planId && (
              <Button variant="default" leftSection={<IconListSearch size={15} />} onClick={() => setPicker(true)} data-autofocus>
                {picked ? 'Chọn lại mã hàng' : 'Chọn mã hàng'}
              </Button>
            )}
            {canQty && (
              <ActionButton
                variant="subtle"
                leftSection={<IconWand size={15} />}
                blockedReason={lines.length === 0 ? (salesOrderId ? 'Chưa có màu cỡ để điền' : 'Chọn mã hàng trước') : null}
                onClick={() => confirmDiscard(hasQty, () => setQty(Object.fromEntries(lines.map((l) => [lineKey(l), l.remainingQty]))), 'Số đã nhập được thay bằng SL còn lại của từng màu cỡ.')}
              >
                Điền theo SL còn lại
              </ActionButton>
            )}
          </Group>
          {picked && <Text size="sm" c="dimmed">{picked.poIds.length} PO đã chọn</Text>}
        </Group>
        {over.length > 0 && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py={6}>
            {over.length} màu cỡ có SL KHXH lớn hơn SL còn lại. Giảm số lượng trước khi lưu.
            <IssueList items={over.map((l) => `${l.colorName} / ${l.sizeName}: còn lại ${fmtNum(l.remainingQty)}, đang nhập ${fmtNum(qtyOf(l))}`)} />
          </Alert>
        )}
        <div style={{ height: 'min(50vh, 460px)', display: 'flex', flexDirection: 'column' }}>
          {/* Chưa điền xong số đã lưu thì chưa cho nhập: số vừa gõ sẽ bị số tải về đè mất */}
          {canQty && filled && sheetRows.length > 0 ? (
            <SheetGrid
              label="Số lượng theo màu cỡ"
              value={sheetRows}
              onChange={(rows) => setQty(Object.fromEntries(rows.map((r) => [r.key, r.planQty ?? ''])))}
              columns={PLAN_SHEET}
              rowKey={(r) => r.key}
            />
          ) : (
            <DataGrid
              label="Số lượng theo màu cỡ"
              fill
              dense
              columns={columns}
              rows={lines}
              rowKey={lineKey}
              loading={(!filled && !existing.error) || (draft.isFetching && !!salesOrderId)}
              error={loadError(draft.error, 'Không tải được màu cỡ.')}
              onRetry={() => void draft.refetch()}
              empty={emptyLines}
            />
          )}
        </div>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>Hủy</Button>
          <ActionButton onClick={() => save.mutate()} loading={save.isPending} blockedReason={saveBlocked}>
            {planId ? 'Lưu thay đổi' : 'Thêm kế hoạch'}
          </ActionButton>
        </Group>
      </Stack>
      {picker && (
        <StylePicker
          onClose={() => setPicker(false)}
          // Chọn lại mã hàng thì bỏ số lượng đã nhập theo màu cỡ của mã cũ: đã nhập thì hỏi trước
          onConfirm={(p) => confirmDiscard(hasQty, () => applyPick(p), 'Số lượng đã nhập theo màu cỡ của mã hàng đang chọn sẽ mất.')}
        />
      )}
    </Modal>
  );
}

const CANDIDATE_COLS: Column<Candidate>[] = [
  { key: 'customerName', title: 'Khách hàng', field: null, minWidth: 150, maxWidth: 240 },
  { key: 'styleCode', title: 'Mã hàng', format: 'code', field: null },
  { key: 'branchCode', title: 'Chi nhánh FOB', field: null },
  { key: 'productionFactoryCode', title: 'Nhà máy SX', field: null },
  { key: 'orderQty', title: 'SL đơn hàng', format: 'number', field: null },
  { key: 'plannedQty', title: 'SL đã tạo KH', format: 'number', field: null },
  { key: 'remainingQty', title: 'SL còn lại', format: 'number', field: null },
  { key: 'syncedAt', title: 'Ngày đồng bộ', format: 'date', field: null },
  { key: 'shipDate', title: 'Ngày xuất hàng', format: 'date', field: null },
];
const CANDIDATE_PO_COLS: Column<CandidatePo>[] = [
  { key: 'poNumber', title: 'PO', format: 'code', field: null },
  { key: 'qty', title: 'Số lượng', format: 'number', field: null },
  { key: 'destination', title: 'Đích đến', field: null },
  { key: 'syncedAt', title: 'Ngày đồng bộ', format: 'date', field: null },
  { key: 'shipDate', title: 'Ngày xuất hàng', format: 'date', field: null },
  { key: 'statusCode', title: 'Tỷ lệ cắt', field: null, render: (p) => <StatusBadge map={PO_STATUS} code={p.statusCode} /> },
];

/**
 * Popup B3 "Chọn mã hàng": chọn đơn hàng còn số lượng, chọn PO, nhập PO/Buy date. Chỉ có đơn hàng của các nhà máy SX được
 * tích cho người dùng, ở mọi đơn vị cơ sở (máy chủ lọc, ADR 0013); kế hoạch lập ra thuộc đơn vị cơ sở đang làm việc.
 */
function StylePicker({ onClose, onConfirm }: { onClose: () => void; onConfirm: (p: Picked) => void }) {
  const branch = useSession((s) => s.branch);
  const factories = useSession((s) => s.productionFactories);
  const mobile = useMobile();
  const { customers } = useCustomers();
  // Mã hàng đọc từ Thông tin đơn hàng nên bộ lọc theo chính sách cột của màn đó (máy chủ cũng vậy)
  const orderPolicy = useFieldPolicy('order.allocation');
  // Mặc định bỏ đơn có ngày xuất đã qua lâu (dữ liệu BRAVO còn nhiều đơn cũ chưa đóng lệnh); xóa bộ lọc để xem hết
  const [filter, setFilter] = useState<OrderFilter>(() => ({ ...emptyFilter, shipFrom: addDays(today(), -30) }));
  const branchName = useBranchName();
  const cols = useMemo(() => {
    const name = new Map(factories.map((f) => [f.code, f.name]));
    const withFactory = CANDIDATE_COLS.map((c) =>
      c.key === 'productionFactoryCode' ? { ...c, render: (r: Candidate) => (r.productionFactoryCode ? <span title={r.productionFactoryCode}>{name.get(r.productionFactoryCode) ?? r.productionFactoryCode}</span> : '') } : c,
    );
    return withBranchNames(withFactory, branchName);
  }, [branchName, factories]);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [poIds, setPoIds] = useState<(string | number)[]>([]);
  const [poBuyDate, setPoBuyDate] = useState('');
  const params = filterParams(filter);
  const dirty = chosenId !== null || !!poBuyDate.trim();
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);

  const candidates = useQuery({
    queryKey: ['order', 'candidates', branch?.code, params],
    queryFn: () => api<Candidate[]>(`/order/shipment-plans/candidates${qs({ shipFrom: params.shipFrom, shipTo: params.shipTo, customer: params.customer, style: params.style })}`),
    placeholderData: keepPreviousData,
  });
  // Đổi lọc mà mã hàng đã chọn không còn trong bảng thì coi như chưa chọn
  const chosen = candidates.data?.find((c) => c.salesOrderId === chosenId) ?? null;
  const pos = useQuery({
    queryKey: ['order', 'candidate-pos', chosen?.salesOrderId],
    queryFn: () => api<CandidatePo[]>(`/order/shipment-plans/candidates/${chosen!.salesOrderId}/pos`),
    enabled: !!chosen,
  });
  // Số lượng PO bị Che hoặc Ẩn thì không có tổng
  const selectedQty = useMemo(() => sumOf((pos.data ?? []).filter((p) => poIds.includes(p.id)).map((p) => p.qty)), [pos.data, poIds]);
  const togglePo = (p: CandidatePo) => setPoIds((ids) => (ids.includes(p.id) ? ids.filter((x) => x !== p.id) : [...ids, p.id]));
  const confirmBlocked = !chosen ? 'Chọn một mã hàng ở bảng trên' : poIds.length === 0 ? 'Chọn ít nhất một PO' : !poBuyDate.trim() ? 'Nhập PO/Buy date' : null;


  return (
    <Modal opened onClose={close} size="min(1180px, 97vw)" fullScreen={mobile} title="Chọn mã hàng">
      <Stack gap="sm">
        <OrderFilters policy={orderPolicy} value={filter} onChange={setFilter} customers={customers} />
        {factories.length === 0 ? (
          <Alert color="orange" variant="light" py={8}>
            Bạn chưa được tích nhà máy SX nào nên chưa có mã hàng để lập kế hoạch. Nhờ quản trị viên tích nhà máy SX cho bạn ở Quản trị › Người dùng.
          </Alert>
        ) : (
          <Text size="xs" c="dimmed">Chỉ hiện đơn hàng có Nhà máy SX bạn được giao: {factories.map((f) => f.name).join(', ')}. Kế hoạch lập ra thuộc {branchName(branch?.code)}.</Text>
        )}
        <div style={{ height: 'min(34vh, 300px)', display: 'flex', flexDirection: 'column' }}>
          <DataGrid
            label="Mã hàng có thể lập kế hoạch"
            fill
            dense
            columns={cols}
            rows={candidates.data ?? []}
            rowKey={(c) => c.salesOrderId}
            loading={candidates.isFetching}
            error={loadError(candidates.error, 'Không tải được danh sách mã hàng.')}
            onRetry={() => void candidates.refetch()}
            selectedKey={chosen?.salesOrderId}
            onRowClick={(c) => {
              if (c.salesOrderId === chosenId) return;
              setChosenId(c.salesOrderId);
              setPoIds([]);
            }}
            empty={<EmptyState filtered={Object.values(filter).some(Boolean)} what="mã hàng" onClear={() => setFilter(emptyFilter)} hint="Không có mã hàng nào của nhà máy SX bạn được giao còn số lượng để lập kế hoạch. Đơn chưa chọn Nhà máy SX ở Thông tin đơn hàng cũng không hiện ở đây." />}
          />
        </div>
        {/* Máy chủ trả tối đa 200 đơn theo ngày xuất */}
        {(candidates.data?.length ?? 0) >= 200 && <Text size="xs" c="dimmed">Đang hiện 200 mã hàng có ngày xuất sớm nhất. Lọc theo ngày, khách hàng hoặc mã hàng để thấy mã khác.</Text>}
        <Grid gap={12}>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <div className="pane-title">PO chi tiết {chosen && <Text span size="xs" c="dimmed" fw={400}>của {chosen.styleCode}</Text>}</div>
            <div style={{ height: 200, display: 'flex', flexDirection: 'column' }}>
              <DataGrid
                label="PO chi tiết"
                fill
                dense
                columns={CANDIDATE_PO_COLS}
                rows={chosen ? (pos.data ?? []) : []}
                rowKey={(p) => p.id}
                loading={pos.isLoading && !!chosen}
                error={chosen ? loadError(pos.error, 'Không tải được danh sách PO.') : null}
                onRetry={() => void pos.refetch()}
                checked={poIds}
                onCheck={setPoIds}
                onRowClick={togglePo}
                empty={chosen ? 'Mã hàng này chưa có PO.' : 'Chọn một mã hàng ở bảng trên.'}
              />
            </div>
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 4 }}>
            <Stack gap="xs" h="100%">
              <TextInput label="PO/Buy date" withAsterisk className="field-required" placeholder="Ví dụ: 4500123 / 15-11" value={poBuyDate} onChange={(e) => setPoBuyDate(e.currentTarget.value)} />
              <TextInput label="Số lượng sản phẩm" value={selectedQty === null ? 'Bạn không được xem số lượng PO' : fmtNum(selectedQty)} readOnly className="field-readonly" />
              <Group justify="flex-end" mt="auto">
                <Button variant="default" onClick={close}>Hủy</Button>
                <ActionButton blockedReason={confirmBlocked} onClick={() => chosen && onConfirm({ candidate: chosen, poIds: poIds.map(Number), poBuyDate: poBuyDate.trim() })}>
                  Xác nhận
                </ActionButton>
              </Group>
            </Stack>
          </Grid.Col>
        </Grid>
      </Stack>
    </Modal>
  );
}
