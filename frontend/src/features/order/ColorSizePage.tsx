import { Alert, Button, Group, Modal, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconWand } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { DataGrid, Masked, withFilterLabels, type Column } from '../../components/DataGrid';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetNumber, sheetReadonly, type SheetColumn } from '../../components/SheetGrid';
import { WorkPage } from '../../components/WorkPage';
import { useAfterClose } from '../../lib/afterClose';
import { api } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy } from '../../lib/fieldPolicy';
import { fmtDate, fmtNum, sumOf } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { useSession } from '../../store/session';
import type { Allocation, AllocationDetail, AllocationRow } from './api';
import { EmptyState, ExportButton, IssueList, LINE_STATUS, loadError, OrderFilters, PICK_ROW, StatusBadge, useCanWrite, useCustomers, useLines, usePagedList } from './common';

const RESOURCE = 'order.colorsize';

const COLUMNS: Column<Allocation>[] = [
  { key: 'customerName', title: 'Khách hàng', filterKey: 'customerName', minWidth: 160, maxWidth: 240 },
  { key: 'styleCode', title: 'Mã hàng', filterKey: 'styleCode', format: 'code' },
  { key: 'poBuyDate', title: 'PO/Buy date', filterKey: 'poBuyDate' },
  { key: 'branchCode', title: 'Chi nhánh', filterKey: 'branchCode', field: null },
  { key: 'lineCode', title: 'Chuyền may', filterKey: 'lineCode', sortKey: 'lineCode', render: (r) => <span title={r.lineCode}>{r.lineName}</span> },
  { key: 'startDate', title: 'Ngày bắt đầu chuyền', filterKey: 'startDate', format: 'date', sortKey: 'startDate' },
  { key: 'avgOutput', title: 'NSBQ chuyền', filterKey: 'avgOutput', format: 'number', sortKey: 'avgOutput' },
  { key: 'endDate', title: 'Ngày kết thúc chuyền', filterKey: 'endDate', format: 'date', sortKey: 'endDate' },
  { key: 'shipDate', title: 'Ngày xuất hàng', filterKey: 'shipDate', format: 'date' },
  { key: 'qty', title: 'Số lượng kế hoạch', filterKey: 'qty', format: 'number', sortKey: 'qty' },
  { key: 'assignedQty', title: 'Số lượng giao', filterKey: 'assignedQty', format: 'number' },
  { key: 'statusCode', title: 'Trạng thái', filterKey: 'statusCode', filterLabel: (v) => LINE_STATUS[v]?.label ?? String(v), sortKey: 'statusCode', render: (r) => <StatusBadge map={LINE_STATUS} code={r.statusCode} /> },
  { key: 'createdAt', title: 'Ngày tạo', format: 'datetime', sortKey: 'createdAt', filterKey: 'createdAt' },
];
const NAMES = Object.fromEntries(COLUMNS.map((c) => [c.key, c.title]));
/** Tên chuyền; máy chủ không trả tên khi mã chuyền bị Ẩn hoặc Che. */
const lineLabel = (l: Pick<Allocation, 'lineName' | 'lineCode'> | undefined) => l?.lineName ?? l?.lineCode ?? '';

/** Màn "Phân bổ màu cỡ": mỗi dòng là một chuyền của một kế hoạch; đúp chuột để chia màu cỡ cho chuyền. */
export default function ColorSizePage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const { customers } = useCustomers();
  const lines = useLines();
  const list = usePagedList<Allocation>('color-size', '/order/color-size');
  // Popup lọc cột Chuyền hiện tên chuyền (giá trị lọc vẫn là mã)
  const columns = useMemo(() => {
    const lineName = new Map(lines.map((l) => [l.code, l.name]));
    return withFilterLabels(withBranchNames(COLUMNS, branchName), { lineCode: (v) => lineName.get(String(v)) ?? String(v) });
  }, [lines, branchName]);
  const refreshAfterClose = useAfterClose(() => qc.invalidateQueries({ queryKey: ['order'] }));
  const canEdit = useCanWrite(`${RESOURCE}:update`) && policy.editable('assignedQty');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const items = list.query.data?.items ?? [];
  // Đổi lọc hay trang mà dòng đã chọn không còn trong lưới thì coi như chưa chọn
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const lineScope = new Set(items.map((i) => i.lineCode));
  // Chỉ suy ra "theo phạm vi" khi không lọc gì và đã thấy toàn bộ dữ liệu: lọc còn một chuyền không phải là phạm vi
  const wholeList = !list.filtered && (list.query.data?.total ?? 0) === items.length;
  // Cột bị Che hoặc Ẩn thì không có tổng (null)
  const planSum = sumOf(items.map((r) => r.qty));
  const assignedSum = sumOf(items.map((r) => r.assignedQty));

  return (
    <WorkPage
      title="Phân bổ màu cỡ"
      subtitle={
        branch?.isAggregate
          ? 'Dàn chuyền của mọi nhà máy bạn được xem'
          : `Chia số lượng theo màu cỡ cho từng chuyền của ${branchName(branch?.code)}. Đúp chuột một dòng để ${canEdit ? 'phân' : 'xem'} màu cỡ.`
      }
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="phan-bo-mau-co.csv" />
          <ActionButton variant={canEdit ? undefined : 'default'} blockedReason={selected ? null : PICK_ROW} onClick={() => selected && setOpen(selected.id)}>
            {canEdit ? 'Phân màu cỡ' : 'Xem màu cỡ'}
          </ActionButton>
        </>
      }
      filters={<OrderFilters policy={policy} value={list.filter} onChange={list.setFilter} customers={customers} statuses={LINE_STATUS} lines={lines} columns={list.columnsOf(NAMES, policy)} />}
    >
      {!list.query.isLoading && wholeList && lineScope.size === 1 && lines.length > 1 && (
        <Text size="sm" c="dimmed" mt={-4}>
          Bạn đang thấy dữ liệu của {lineLabel(items[0])} theo phạm vi được giao.
        </Text>
      )}
      <DataGrid
        label="Danh sách phân bổ màu cỡ theo chuyền"
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
          setOpen(r.id);
        }}
        empty={<EmptyState filtered={list.filtered} what="chuyền" onClear={list.clearFilter} hint="Chưa có chuyền nào được xếp cho kế hoạch. Xếp chuyền ở màn Xếp chuyền trước." />}
        footer={
          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={list.query.data?.total ?? 0}
            onPage={list.setPage}
            extra={
              planSum !== null && (
                <Text size="sm">
                  Trang này: SL kế hoạch <b>{fmtNum(planSum)}</b>
                  {assignedSum !== null && (
                    <>
                      , đã giao <b>{fmtNum(assignedSum)}</b>
                    </>
                  )}
                </Text>
              )
            }
          />
        }
      />
      {open !== null && <AllocationModal id={open} canEdit={canEdit} onClose={() => setOpen(null)} onSaved={refreshAfterClose} />}
    </WorkPage>
  );
}

interface EditRow extends Omit<AllocationRow, 'assignedQty'> {
  key: number;
  /** null: ô đang trống khi nhập; khi chỉ xem có thể là "***" (cột bị Che) */
  assignedQty: number | null;
}
let nextKey = 1;
/** Số giao của từng dòng để biết đã đổi gì chưa (ô trống lưu thành 0) */
const signature = (rows: EditRow[]) => rows.map((r) => r.assignedQty ?? 0).join(',');

function AllocationModal({ id, canEdit, onClose, onSaved }: { id: number; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const mobile = useMobile();
  const policy = useFieldPolicy(RESOURCE);
  // Luôn tải lại khi mở và chỉ điền một lần từ lần tải đó: tải lại nền không đè lên phần đang nhập
  const detail = useQuery({ queryKey: ['order', 'allocation', id], queryFn: () => api<AllocationDetail>(`/order/color-size/${id}`), refetchOnMount: 'always' });
  const line = detail.data;
  const [rows, setRows] = useState<EditRow[]>([]);
  const [base, setBase] = useState('');
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (filled || !line || !detail.isSuccess || !detail.isFetchedAfterMount) return;
    const next = line.rows.map((r) => ({ ...r, key: nextKey++ }));
    setRows(next);
    setBase(signature(next));
    setFilled(true);
  }, [filled, line, detail.isSuccess, detail.isFetchedAfterMount]);
  const dirty = canEdit && filled && signature(rows) !== base;
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);

  // Cột số lượng giao bị Che thì không có tổng (không hiện "đã giao 0"); khi nhập, ô trống tính là 0
  const assigned = canEdit ? rows.reduce((s, r) => s + (r.assignedQty ?? 0), 0) : sumOf(rows.map((r) => r.assignedQty));
  const overRows = rows.filter((r) => typeof r.assignedQty === 'number' && r.assignedQty > r.planQty);
  const save = useMutation({
    mutationFn: () => api(`/order/color-size/${id}`, { method: 'PUT', body: { rows: rows.map((r) => ({ colorName: r.colorName, sizeName: r.sizeName, assignedQty: r.assignedQty || 0 })) } }),
    onSuccess: () => {
      toastOk(`Đã lưu phân màu cỡ cho ${lineLabel(line)}.`, 'Đã lưu');
      onClose();
      onSaved();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  const saveBlocked = overRows.length > 0 ? 'Có màu cỡ giao nhiều hơn số lượng kế hoạch' : !dirty ? 'Chưa có thay đổi nào' : null;

  // Màu cỡ và SL kế hoạch do màn Xếp chuyền đề xuất theo tỷ lệ; ở đây chỉ nhập số lượng giao (lưới kiểu bảng tính khi được sửa)
  const sheetCols = useMemo<SheetColumn<EditRow>[]>(
    () => [
      sheetReadonly<EditRow>('Màu SP', (r) => r.colorName, (r) => r.colorName, { minWidth: 150, grow: 2 }),
      sheetReadonly<EditRow>('Cỡ sản phẩm', (r) => r.sizeName, (r) => r.sizeName, { minWidth: 100 }),
      sheetReadonly<EditRow>('Số lượng KH', (r) => fmtNum(r.planQty), (r) => r.planQty, { minWidth: 110, align: 'right' }),
      sheetReadonly<EditRow>('Chuyền', () => lineLabel(line), () => lineLabel(line), { minWidth: 120 }),
      sheetNumber<EditRow>('assignedQty', 'Số lượng giao', { required: true, minWidth: 130, error: (r) => (r.assignedQty ?? 0) > r.planQty }),
    ],
    [line],
  );
  const cols = useMemo<Column<EditRow>[]>(
    () => [
      { key: 'colorName', title: 'Màu SP', field: null },
      { key: 'sizeName', title: 'Cỡ sản phẩm', field: null, width: 110 },
      { key: 'planQty', title: 'Số lượng KH', format: 'number', field: null },
      { key: 'line', title: 'Chuyền', field: null, render: () => lineLabel(line) },
      {
        key: 'assignedQty',
        title: 'Số lượng giao',
        width: 140,
        render: (r) =>
          (r.assignedQty as unknown) === MASK ? (
            <Masked />
          ) : (
            fmtNum(r.assignedQty)
          ),
      },
    ],
    [line],
  );
  const loadErr = filled ? null : loadError(detail.error, 'Không tải được màu cỡ của chuyền.');

  return (
    // Esc trong lưới là thoát sửa ô, bỏ vùng chọn: không để nó đóng popup
    <Modal
      opened
      onClose={close}
      closeOnEscape={!canEdit}
      size="min(980px, 96vw)"
      fullScreen={mobile}
      title={`${canEdit ? 'Phân màu cỡ cho chuyền' : 'Màu cỡ của chuyền'}${line ? `: ${lineLabel(line)}` : ''}`}
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="xs">
          <TextInput label="Khách hàng" value={line?.customerName ?? ''} readOnly className="field-readonly" />
          <TextInput label="Mã hàng" value={line?.styleCode ?? ''} readOnly className="field-readonly" />
          <TextInput label="PO/Buy date" value={line?.poBuyDate ?? ''} readOnly className="field-readonly" />
          <TextInput label="Vào chuyền" value={fmtDate(line?.startDate ?? null)} readOnly className="field-readonly" />
          <TextInput label="Kết thúc" value={fmtDate(line?.endDate ?? null)} readOnly className="field-readonly" />
          <TextInput label="SL của chuyền" value={fmtNum(line?.qty)} readOnly className="field-readonly" />
        </SimpleGrid>
        {canEdit && (
          <Group gap="xs">
            <ActionButton
              variant="subtle"
              leftSection={<IconWand size={15} />}
              blockedReason={rows.length === 0 ? 'Chưa có màu cỡ để điền' : null}
              onClick={() => confirmDiscard(rows.some((r) => r.assignedQty != null && r.assignedQty !== r.planQty), () => setRows((rs) => rs.map((r) => ({ ...r, assignedQty: r.planQty }))), 'Số đã nhập được thay bằng SL kế hoạch của từng màu cỡ.')}
            >
              Điền theo SL kế hoạch
            </ActionButton>
          </Group>
        )}
        {overRows.length > 0 && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py={6}>
            {overRows.length} màu cỡ có số lượng giao lớn hơn số lượng kế hoạch. Giảm lại trước khi lưu.
            <IssueList items={overRows.map((r) => `${r.colorName} / ${r.sizeName}: kế hoạch ${fmtNum(r.planQty)}, đang nhập ${fmtNum(r.assignedQty)}`)} />
          </Alert>
        )}
        <div style={{ height: 'min(48vh, 420px)', display: 'flex', flexDirection: 'column' }}>
          {canEdit && rows.length > 0 ? (
            <SheetGrid label="Phân màu cỡ cho chuyền" value={rows} onChange={setRows} columns={sheetCols} rowKey={(r) => r.key} />
          ) : (
            <DataGrid
              label="Phân màu cỡ cho chuyền"
              fill
              dense
              columns={cols}
              rows={rows}
              rowKey={(r) => r.key}
              policy={policy}
              loading={!filled && !detail.error}
              error={loadErr}
              onRetry={() => void detail.refetch()}
              empty="Dòng dàn chuyền này chưa có màu cỡ. Kiểm tra lại kế hoạch xuất hàng."
            />
          )}
        </div>
        <Group justify="space-between">
          <Text size="sm">
            {assigned !== null && filled && (
              <>
                Đã giao <b>{fmtNum(assigned)}</b> / {fmtNum(line?.qty)} sản phẩm
              </>
            )}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={close}>{canEdit ? 'Hủy' : 'Đóng'}</Button>
            {canEdit && (
              <ActionButton loading={save.isPending} blockedReason={saveBlocked} onClick={() => save.mutate()}>
                Lưu thay đổi
              </ActionButton>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
