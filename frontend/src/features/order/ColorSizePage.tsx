import { Alert, Button, Group, Modal, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertCircle, IconWand } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { DataGrid, Masked, withFilterLabels, type Column } from '../../components/DataGrid';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetNumber, sheetReadonly, sheetSelect, type SheetColumn, type SheetOption } from '../../components/SheetGrid';
import { WorkPage } from '../../components/WorkPage';
import { useAfterClose } from '../../lib/afterClose';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { fmtDate, fmtNum, sumOf } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk, toastWarn } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { useSession } from '../../store/session';
import type { Allocation, AllocationDetail, AllocationLine } from './api';
import { analyze, cellKey, freshRow, initialRows, lastOfCell, lineLabels, lostCells, mergeClass, mergeRuns, payload, propose, settleNew, signature, splitRow, type EditRow } from './colorSizeRules';
import { ALLOC_STATUS, EmptyState, ExportButton, IssueList, loadError, OrderFilters, PICK_ROW, readable, StatusBadge, useCanWrite, useCustomers, useLines, usePagedList } from './common';

const RESOURCE = 'order.colorsize';

/** Tên các chuyền của dòng, theo thứ tự dàn chuyền (không có tên khi mã chuyền bị Ẩn, Che) */
const lineText = (r: Pick<Allocation, 'lineName' | 'lineCode'>) => (r.lineName ?? (Array.isArray(r.lineCode) ? r.lineCode : [])).join(', ');

const COLUMNS: Column<Allocation>[] = [
  { key: 'customerName', title: 'Khách hàng', filterKey: 'customerName', minWidth: 160, maxWidth: 240 },
  { key: 'styleCode', title: 'Mã hàng', filterKey: 'styleCode', format: 'code' },
  { key: 'poBuyDate', title: 'PO/Buy date', filterKey: 'poBuyDate' },
  { key: 'branchCode', title: 'ĐVCS', filterKey: 'branchCode', field: null },
  {
    key: 'lineCode',
    title: 'Chuyền may',
    filterKey: 'lineCode',
    sortKey: 'lineCode',
    minWidth: 140,
    maxWidth: 280,
    render: (r) => <span title={Array.isArray(r.lineCode) ? r.lineCode.join(', ') : undefined}>{lineText(r) || '–'}</span>,
  },
  { key: 'startDate', title: 'Ngày bắt đầu chuyền', filterKey: 'startDate', format: 'date', sortKey: 'startDate' },
  // NSBQ liệt kê theo từng chuyền, cùng thứ tự cột Chuyền may (phase 5.13 Q3): không lọc, không sắp xếp
  { key: 'avgOutput', title: 'NSBQ chuyền', align: 'right', render: (r) => (Array.isArray(r.avgOutput) ? r.avgOutput.map((v) => fmtNum(v)).join(', ') : '–') },
  { key: 'endDate', title: 'Ngày kết thúc chuyền', filterKey: 'endDate', format: 'date', sortKey: 'endDate' },
  { key: 'shipDate', title: 'Ngày xuất hàng', filterKey: 'shipDate', format: 'date', sortKey: 'shipDate' },
  { key: 'qty', title: 'Số lượng kế hoạch', filterKey: 'qty', format: 'number', sortKey: 'qty' },
  { key: 'assignedQty', title: 'Số lượng giao', filterKey: 'assignedQty', format: 'number', sortKey: 'assignedQty' },
  {
    key: 'statusCode',
    title: 'Trạng thái',
    filterKey: 'statusCode',
    filterLabel: (v) => ALLOC_STATUS[v]?.label ?? String(v),
    sortKey: 'statusCode',
    render: (r) => <StatusBadge map={ALLOC_STATUS} code={String(r.statusCode)} />,
  },
  { key: 'createdAt', title: 'Ngày tạo', format: 'datetime', sortKey: 'createdAt', filterKey: 'createdAt' },
];
const NAMES = Object.fromEntries(COLUMNS.map((c) => [c.key, c.title]));
const NO_LINES: AllocationLine[] = [];

/**
 * Màn "Phân bổ màu cỡ" (phase 5.13): mỗi dòng là một kế hoạch đã xếp chuyền (lưu dàn chuyền ở Xếp chuyền thì kế hoạch hiện ở đây);
 * đúp chuột để chia màu cỡ của kế hoạch cho các chuyền đã xếp.
 */
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
  const canWrite = useCanWrite(`${RESOURCE}:update`);
  const canEdit = canWrite && policy.editable('assignedQty');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const items = list.query.data?.items ?? [];
  // Đổi lọc hay trang mà dòng đã chọn không còn trong lưới thì coi như chưa chọn
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const lineScope = new Set(items.flatMap((i) => (Array.isArray(i.lineCode) ? i.lineCode : [])));
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
          ? 'Kế hoạch đã xếp chuyền của mọi đơn vị cơ sở bạn được xem'
          : `Mỗi dòng là một kế hoạch đã xếp chuyền của ${branchName(branch?.code)}. Đúp chuột một dòng để ${canEdit ? 'chia' : 'xem'} màu cỡ cho từng chuyền.`
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
      filters={<OrderFilters policy={policy} value={list.filter} onChange={list.setFilter} customers={customers} statuses={ALLOC_STATUS} lines={lines} columns={list.columnsOf(NAMES, policy)} />}
    >
      {!list.query.isLoading && wholeList && lineScope.size === 1 && lines.length > 1 && (
        <Text size="sm" c="dimmed" mt={-4}>
          Bạn đang thấy dữ liệu của {items[0]?.lineName?.[0] ?? [...lineScope][0]} theo phạm vi được giao.
        </Text>
      )}
      <DataGrid
        label="Danh sách kế hoạch phân bổ màu cỡ"
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
        empty={<EmptyState filtered={list.filtered} what="kế hoạch" onClear={list.clearFilter} hint="Chưa có kế hoạch nào được xếp chuyền. Lưu dàn chuyền ở màn Xếp chuyền, kế hoạch sẽ hiện ở đây." />}
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
      {open !== null && <AllocationModal planId={open} canWrite={canWrite} onClose={() => setOpen(null)} onSaved={refreshAfterClose} />}
    </WorkPage>
  );
}

/** Vì sao người có quyền sửa vẫn chỉ được xem popup (null: sửa được) */
function viewOnlyReason(policy: FieldPolicy, lines: AllocationLine[]): string | null {
  if (!policy.editable('assignedQty')) return 'Cột Số lượng giao chỉ đọc với bạn.';
  if (!readable(policy, 'lineCode')) return 'Bạn không xem được cột Chuyền may nên không phân màu cỡ được.';
  if (!lines.some((l) => l.editable)) return 'Bạn không được phân màu cỡ cho chuyền nào của kế hoạch này.';
  return null;
}

/** Số đẹp của ô số lượng; ô bị Che hiện "***", không có thì "–" */
const qtyText = (v: unknown) => (v === MASK ? MASK : typeof v === 'number' ? fmtNum(v) : '–');

/**
 * Popup "Phân màu cỡ cho chuyền" của một kế hoạch (phase 5.13). Màu, cỡ, SL kế hoạch lấy từ kế hoạch xuất hàng; người dùng chọn
 * chuyền trong các chuyền đã xếp và nhập số lượng giao; một màu cỡ tách được cho nhiều chuyền (chọn ô rồi Thêm dòng, chọn chuyền khác).
 */
function AllocationModal({ planId, canWrite, onClose, onSaved }: { planId: number; canWrite: boolean; onClose: () => void; onSaved: () => void }) {
  const mobile = useMobile();
  const policy = useFieldPolicy(RESOURCE);
  // Luôn tải lại khi mở và chỉ điền một lần từ lần tải đó: tải lại nền không đè lên phần đang nhập
  const detail = useQuery({ queryKey: ['order', 'allocation', planId], queryFn: () => api<AllocationDetail>(`/order/color-size/${planId}`), refetchOnMount: 'always' });
  const plan = detail.data;
  const lines = plan?.lines ?? NO_LINES;
  const [rows, setRows] = useState<EditRow[]>([]);
  const [base, setBase] = useState('');
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (filled || !plan || !detail.isSuccess || !detail.isFetchedAfterMount) return;
    const next = initialRows(plan);
    setRows(next);
    setBase(signature(next));
    setFilled(true);
  }, [filled, plan, detail.isSuccess, detail.isFetchedAfterMount]);
  const readOnly = plan ? viewOnlyReason(policy, lines) : null;
  const canEdit = canWrite && !!plan && readOnly === null;
  const labels = useMemo(() => lineLabels(lines), [lines]);
  const check = useMemo(() => (plan ? analyze(rows, plan, labels) : null), [rows, plan, labels]);
  const dirty = canEdit && filled && signature(rows) !== base;
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);
  // Mã hàng bị Ẩn, Che thì tiêu đề, thông báo chỉ nêu số kế hoạch
  const styleText = typeof plan?.styleCode === 'string' && plan.styleCode !== MASK ? plan.styleCode : null;
  const title = plan ? (styleText ? `${styleText} (${plan.planNo})` : plan.planNo) : '';
  const assignedOk = readable(policy, 'assignedQty');

  const save = useMutation({
    mutationFn: () => api<AllocationDetail>(`/order/color-size/${planId}`, { method: 'PUT', body: { rows: payload(rows) } }),
    onSuccess: () => {
      toastOk(`Đã lưu phân màu cỡ của ${title}.`, 'Đã lưu');
      onClose();
      onSaved();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  // Mọi lần đổi của lưới: chặn lần làm mất hết dòng sửa được của một màu cỡ, điền màu cỡ cho dòng vừa tạo
  const change = (next: EditRow[]) => {
    const lost = plan ? lostCells(rows, next, plan) : [];
    if (lost.length) return toastWarn(`Mỗi màu cỡ giữ ít nhất một dòng để nhập: ${lost.join(', ')}. Không giao thì để trống Số lượng giao.`, 'Chưa xóa được');
    const settled = settleNew(next, lines);
    if (settled.dropped) toastWarn(`Không thêm ${settled.dropped} dòng dán quá cuối lưới: màu cỡ lấy từ kế hoạch. Thêm dòng cho màu cỡ cần tách (chọn ô rồi bấm Thêm) rồi dán lại.`, 'Bỏ dòng thừa');
    setRows(settled.rows);
  };
  const saveBlocked = !filled ? 'Đang tải màu cỡ của kế hoạch…' : (check?.issues[0]?.reason ?? (!dirty ? 'Chưa có thay đổi nào' : null));
  const proposal = plan && filled ? propose(rows, plan) : null;
  const split = () => {
    if (!proposal) return;
    const typed = rows.some((r) => !r.locked && (r.assignedQty ?? 0) > 0);
    if (!typed) return setRows(proposal);
    confirmAction({
      title: 'Chia lại theo số lượng chuyền?',
      consequence: 'Số lượng giao đang có của các chuyền bạn sửa được sẽ được thay bằng phần chia theo số lượng đã xếp của từng chuyền.',
      confirmLabel: 'Chia lại',
      cancelLabel: 'Giữ số cũ',
      danger: false,
      onConfirm: () => setRows(proposal),
    });
  };

  // Lưới nhập của thư viện (react-datasheet-grid 4.x xuất bản "tĩnh") chỉ đọc cột ở lần vẽ đầu: cột dựng một lần theo kế hoạch,
  // tổng và lỗi mới nhất đọc qua ref. Mỗi lần đổi số lưới vẽ lại theo dữ liệu mới nên ô đỏ, cột Còn lại của mọi dòng cập nhật
  const checkRef = useRef(check);
  checkRef.current = check;
  // Một màu cỡ tách cho nhiều chuyền: các dòng liền nhau gộp ô Màu, Cỡ, SL KH, Còn lại (chỉ hiển thị, đọc qua ref như tổng)
  const merge = useMemo(() => mergeRuns(rows), [rows]);
  const mergeRef = useRef(merge);
  mergeRef.current = merge;
  const sheetCols = useMemo<SheetColumn<EditRow>[]>(() => {
    if (!plan) return [];
    const cellOf = (r: EditRow) => checkRef.current?.cells.get(cellKey(r.colorName, r.sizeName));
    const errorOf = (r: EditRow) => checkRef.current?.errors.get(r.key);
    // Bốn cột theo màu cỡ căn giữa (ô gộp nằm giữa khối), cả dòng không gộp cho thẳng cột
    const keyCol = (r: EditRow, error?: boolean) => ['merge-col', error ? 'sheet-error' : undefined, mergeClass(mergeRef.current.get(r.key))].filter(Boolean).join(' ');
    const editable: SheetOption[] = lines.filter((l) => l.editable).map((l) => ({ value: String(l.id), label: labels.get(l.id) ?? '' }));
    const lineOf = (r: EditRow): SheetOption[] => (r.locked && r.lineId !== null ? [{ value: String(r.lineId), label: labels.get(r.lineId) ?? '' }] : editable);
    const locked = (r: EditRow) => r.locked;
    // Màu, cỡ lấy từ kế hoạch xuất hàng, không sửa ở đây: dòng mới chép màu cỡ của dòng ngay trên (settleNew)
    return [
      sheetReadonly<EditRow>('Màu SP', (r) => r.colorName, (r) => r.colorName, { minWidth: 150, grow: 2, className: (r) => keyCol(r, !!errorOf(r)?.cell) }),
      sheetReadonly<EditRow>('Cỡ SP', (r) => r.sizeName, (r) => r.sizeName, { minWidth: 90, className: (r) => keyCol(r, !!errorOf(r)?.cell) }),
      sheetReadonly<EditRow>('Số lượng KH', (r) => qtyText(cellOf(r)?.cell.qty), (r) => cellOf(r)?.plan ?? null, { minWidth: 100, className: (r) => keyCol(r) }),
      sheetReadonly<EditRow>(
        'Còn lại',
        (r) => {
          const left = cellOf(r)?.left;
          return left === null || left === undefined ? '–' : fmtNum(left);
        },
        (r) => cellOf(r)?.left ?? null,
        { minWidth: 90, className: (r) => keyCol(r, (cellOf(r)?.left ?? 0) < 0) },
      ),
      sheetSelect<EditRow>(
        'Chuyền',
        {
          options: lineOf,
          get: (r) => (r.lineId === null ? null : String(r.lineId)),
          set: (r, v) => ({ ...r, lineId: v ? Number(v) : null }),
          unit: 'chuyền',
          nothingFoundMessage: 'Kế hoạch không xếp chuyền này. Xếp thêm chuyền ở màn Xếp chuyền.',
        },
        { required: true, minWidth: 150, grow: 1, disabled: locked, error: (r) => !!errorOf(r)?.line },
      ),
      sheetNumber<EditRow>('assignedQty', 'Số lượng giao', { required: true, minWidth: 120, disabled: locked, error: (r) => !!errorOf(r)?.qty }),
    ];
  }, [plan, lines, labels]);

  // Lưới chỉ xem: dòng như lưới nhập, số theo chính sách cột; ô theo màu cỡ gộp bằng rowspan của bảng
  const viewCols = useMemo<Column<EditRow>[]>(() => {
    const cellOf = (r: EditRow) => check?.cells.get(cellKey(r.colorName, r.sizeName));
    const span = (r: EditRow) => {
      const m = merge.get(r.key);
      return !m ? 1 : m.pos === 0 ? m.size : 0;
    };
    return [
      { key: 'colorName', title: 'Màu SP', field: null, align: 'center', rowSpan: span },
      { key: 'sizeName', title: 'Cỡ SP', field: null, width: 100, align: 'center', rowSpan: span },
      {
        key: 'planQty',
        title: 'Số lượng KH',
        field: null,
        align: 'center',
        rowSpan: span,
        render: (r) => (cellOf(r)?.cell.qty === MASK ? <Masked /> : qtyText(cellOf(r)?.cell.qty)),
      },
      { key: 'lineId', title: 'Chuyền', field: null, render: (r) => (r.lineId === null ? '–' : labels.get(r.lineId)) },
      { key: 'assignedQty', title: 'Số lượng giao', align: 'right', render: (r) => (r.masked ? <Masked /> : qtyText(r.assignedQty)) },
    ];
  }, [check, labels, merge]);

  const planQty = typeof plan?.qty === 'number' ? plan.qty : null;
  const info = (label: string, value: unknown) => <TextInput label={label} value={value === undefined || value === null ? '' : String(value)} readOnly className="field-readonly" />;
  const issueAlert = check && check.issues.length > 0 && canEdit && (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py={6}>
      <Stack gap={2} maw={760}>
        {check.issues.map((i) => (
          <div key={i.reason}>
            {i.text}
            {i.items && <IssueList items={i.items} />}
          </div>
        ))}
      </Stack>
    </Alert>
  );

  return (
    // Esc trong lưới là thoát sửa ô, bỏ vùng chọn: không để nó đóng popup
    <Modal opened onClose={close} closeOnEscape={!canEdit} size="min(1100px, 96vw)" fullScreen={mobile} title={`${canEdit ? 'Phân màu cỡ cho chuyền' : 'Màu cỡ của các chuyền'}${title ? `: ${title}` : ''}`}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="xs">
          {info('Khách hàng', plan?.customerName)}
          {info('Mã hàng', plan?.styleCode)}
          {info('PO/Buy date', plan?.poBuyDate)}
          {info('Ngày xuất hàng', typeof plan?.shipDate === 'string' && plan.shipDate !== MASK ? fmtDate(plan.shipDate) : plan?.shipDate)}
          {info('SL kế hoạch', plan ? qtyText(plan.qty) : '')}
          {info('Đã giao', check && assignedOk ? fmtNum(check.total) : plan ? qtyText(plan.assignedQty) : '')}
        </SimpleGrid>
        {check && assignedOk && check.hidden > 0 && (
          <Text size="sm" c="dimmed">
            Chuyền khác của kế hoạch (ngoài phạm vi của bạn) đã nhận {fmtNum(check.hidden)} sản phẩm; phần này đã trừ vào cột Còn lại.
          </Text>
        )}
        {canEdit ? (
          <Group gap="xs">
            <ActionButton
              variant="subtle"
              leftSection={<IconWand size={15} />}
              blockedReason={proposal ? null : 'Bạn không xem được số lượng kế hoạch hoặc số lượng của chuyền nên không chia tự động được.'}
              onClick={split}
            >
              Chia theo SL chuyền
            </ActionButton>
            <Text size="xs" c="dimmed">
              Chia phần chưa giao của từng màu cỡ cho các chuyền theo số lượng đã xếp của mỗi chuyền.
            </Text>
          </Group>
        ) : (
          plan &&
          canWrite &&
          readOnly && (
            <Text size="sm" c="dimmed">
              {readOnly}
            </Text>
          )
        )}
        {issueAlert}
        <div style={{ height: mobile ? 'min(62vh, 520px)' : 'min(50vh, 480px)', minHeight: 260, display: 'flex', flexDirection: 'column' }}>
          {canEdit && filled ? (
            <SheetGrid
              label="Phân màu cỡ cho chuyền"
              value={rows}
              onChange={change}
              columns={sheetCols}
              rowKey={(r) => r.key}
              createRow={freshRow}
              duplicateRow={splitRow}
              addAtActive
              canDeleteRow={(r) => !r.locked && !lastOfCell(rows, r, plan)}
              deleteReason={(r) => (r.locked ? 'Dòng của chuyền bạn không sửa được nên không xóa được.' : 'Mỗi màu cỡ giữ ít nhất một dòng để nhập. Không giao thì để trống Số lượng giao.')}
              hint="Tách một màu cỡ cho chuyền khác: chọn một ô của màu cỡ đó rồi bấm Thêm, dòng mới chép màu, cỡ và nằm ngay dưới; chọn chuyền, nhập số lượng giao. Dán từ Excel: chọn ô đầu rồi Ctrl+V."
            />
          ) : (
            <DataGrid
              label="Màu cỡ của các chuyền"
              fill
              dense
              columns={viewCols}
              rows={rows}
              rowKey={(r) => r.key}
              policy={policy}
              loading={!filled && !detail.error}
              error={filled ? null : loadError(detail.error, 'Không tải được màu cỡ của kế hoạch.')}
              onRetry={() => void detail.refetch()}
              empty="Kế hoạch này chưa có màu cỡ. Kiểm tra lại kế hoạch xuất hàng."
            />
          )}
        </div>
        <Group justify="space-between" gap="xs">
          <Text size="sm">
            {check && planQty !== null && assignedOk && (
              <>
                Đã giao <b>{fmtNum(check.total)}</b> / {fmtNum(planQty)} sản phẩm của kế hoạch
              </>
            )}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={close}>
              {canEdit ? 'Hủy' : 'Đóng'}
            </Button>
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
