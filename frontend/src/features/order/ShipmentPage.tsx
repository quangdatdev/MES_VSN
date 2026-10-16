import { Alert, Badge, Button, Grid, Group, Modal, SegmentedControl, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
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
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { factoryLabel } from './factoryLabel';
import { emptyFilter, type Candidate, type CandidatePo, type OrderFilter, type PlanDetailLine, type PlanLine, type PlanPo, type PlanPoList, type ShipmentPlan, type ShipmentPlanDetail } from './api';
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
      <div className="split-rows">
        <div className="pane">
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
        </div>
        <PlanDetailPane plan={selected} />
      </div>
      {dialog && <PlanDialog planId={dialog.planId} onClose={() => setDialog(null)} onDone={refreshAfterClose} />}
    </WorkPage>
  );
}

const NO_PLAN_LINES: PlanDetailLine[] = [];
// Ký tự NUL không có trong tên màu, cỡ (như csKey của máy chủ): nối bằng "|" thì màu "A|B" cỡ "C" trùng màu "A" cỡ "B|C"
const lineKey = (l: Pick<PlanLine, 'colorName' | 'sizeName'>) => `${l.colorName}\u0000${l.sizeName}`;

type DetailView = 'lines' | 'pos';

/**
 * Khung dưới danh sách, theo kế hoạch đang chọn: màu cỡ (mặc định, task 5.9.15) hoặc PO (task 5.9.14). Khung và tiêu đề giữ
 * nguyên khi đổi, chỉ lưới đổi: nút chuyển không bị gỡ nên không mất focus khi chọn bằng phím mũi tên. Chỉ tải phần đang xem.
 */
function PlanDetailPane({ plan }: { plan: ShipmentPlan | null }) {
  const [view, setView] = useState<DetailView>('lines');
  const pos = usePlanPos(plan, view === 'pos');
  return (
    <div className="pane">
      <div className="pane-title" style={{ flexWrap: 'wrap' }}>
        <Group gap={8} wrap="nowrap">
          <SegmentedControl
            size="xs"
            aria-label="Chi tiết của kế hoạch"
            value={view}
            onChange={(v) => setView(v as DetailView)}
            data={[
              { value: 'lines', label: 'Màu cỡ' },
              { value: 'pos', label: 'PO' },
            ]}
          />
          {plan && typeof plan.planNo === 'string' && (
            <Text span size="xs" c="dimmed" fw={400} style={{ whiteSpace: 'nowrap' }}>
              {plan.planNo}
            </Text>
          )}
        </Group>
        {view === 'pos' && <PlanPoSummary pos={pos} />}
      </div>
      {view === 'lines' ? <PlanLineGrid plan={plan} /> : <PlanPoGrid plan={plan} pos={pos} />}
    </div>
  );
}

/** Cột màu cỡ dùng chung cho khung Màu cỡ và lưới xem trong popup; cột SL KHXH mỗi nơi tự thêm */
const LINE_COLUMNS: Column<PlanDetailLine>[] = [
  { key: 'colorName', title: 'Tên màu SP', field: null, minWidth: 150 },
  { key: 'sizeName', title: 'Tên cỡ SP', field: null },
  { key: 'originalQty', title: 'Số lượng gốc', format: 'number', field: null },
  { key: 'plannedQty', title: 'SL đã tạo KHXH', format: 'number', field: null },
  { key: 'remainingQty', title: 'SL còn lại', format: 'number', field: null },
];
// SL KHXH theo chính sách cột "Số lượng KH" của kế hoạch (máy chủ đã Ẩn hoặc Che trong dữ liệu trả về)
const PLAN_LINE_COLUMNS: Column<PlanDetailLine>[] = [
  ...LINE_COLUMNS,
  { key: 'planQty', title: 'SL KHXH', format: 'number', render: (l) => (typeof l.planQty === 'number' ? <b>{fmtNum(l.planQty)}</b> : <span className="cell-empty">–</span>) },
];

/**
 * Lưới "Màu cỡ": số đã lưu của kế hoạch, cùng nguồn với popup Sửa (GET /:id). SL đã tạo KHXH là của các kế hoạch khác
 * cùng đơn; Số lượng gốc là số lúc lưu SL kế hoạch lần cuối (popup Sửa lấy theo màu cỡ hiện tại của PO). Cột suy ra theo
 * cột nguồn như máy chủ: Số lượng gốc theo SL của PO ở Cập nhật tỷ lệ cắt, SL đã tạo KHXH theo SL KHXH, SL còn lại theo cả hai.
 */
function PlanLineGrid({ plan }: { plan: ShipmentPlan | null }) {
  const policy = useFieldPolicy(RESOURCE);
  const poPolicy = useFieldPolicy('order.po');
  const canViewPo = useCan('order.po:view');
  const detail = useQuery({
    queryKey: ['order', 'shipment-detail', plan?.id],
    queryFn: () => api<ShipmentPlanDetail>(`/order/shipment-plans/${plan!.id}`),
    enabled: !!plan,
  });
  const columns = useMemo(() => {
    const poHidden = !canViewPo || poPolicy.level('qty') === 'HIDDEN';
    const planHidden = policy.level('planQty') === 'HIDDEN';
    return PLAN_LINE_COLUMNS.filter((c) => (c.key === 'originalQty' ? !poHidden : c.key === 'plannedQty' ? !planHidden : c.key === 'remainingQty' ? !poHidden && !planHidden : true));
  }, [policy, poPolicy, canViewPo]);
  const rows = plan ? (detail.data?.lines ?? NO_PLAN_LINES) : NO_PLAN_LINES;
  // Cột bị Che hoặc Ẩn thì không có tổng (sumOf trả null)
  const originalSum = sumOf(rows.map((l) => l.originalQty));
  const planSum = sumOf(rows.map((l) => l.planQty));

  return (
    <DataGrid
      label="Màu cỡ của kế hoạch"
      fill
      dense
      columns={columns}
      rows={rows}
      rowKey={lineKey}
      policy={policy}
      loading={detail.isFetching && !!plan}
      error={plan ? loadError(detail.error, 'Không tải được màu cỡ của kế hoạch.') : null}
      onRetry={() => void detail.refetch()}
      empty={plan ? 'Kế hoạch này chưa có màu cỡ.' : 'Bấm một kế hoạch ở lưới trên để xem màu cỡ.'}
      footer={
        rows.length > 0 && (
          <Text size="sm" px={8} py={4}>
            Tổng {rows.length} màu cỡ
            {originalSum !== null && (
              <>
                : số lượng gốc <b>{fmtNum(originalSum)}</b>
              </>
            )}
            {planSum !== null && (
              <>
                {originalSum !== null ? ', ' : ': '}SL KHXH <b>{fmtNum(planSum)}</b>
              </>
            )}
            .{originalSum !== null && ' Số lượng gốc là số lúc lưu kế hoạch.'}
          </Text>
        )
      }
    />
  );
}

const PLAN_PO_COLUMNS: Column<PlanPo>[] = [
  { key: 'poNumber', title: 'PO#', format: 'code' },
  { key: 'poCode', title: 'Mã PO', format: 'code' },
  { key: 'destination', title: 'Đích đến' },
  { key: 'shipDate', title: 'Ngày xuất hàng', format: 'date' },
  { key: 'qty', title: 'Số lượng', format: 'number' },
  { key: 'statusCode', title: 'Trạng thái', render: (p) => <StatusBadge map={PO_STATUS} code={String(p.statusCode)} /> },
  { key: 'confirmedAt', title: 'Ngày xác nhận', format: 'datetime', field: null },
  { key: 'confirmedQty', title: 'SL đã xác nhận', format: 'number', field: null },
  { key: 'unconfirmedQty', title: 'SL chưa xác nhận', format: 'number', field: null },
];

/**
 * Dữ liệu "PO của kế hoạch" (task 5.9.14): PO đã chọn khi lập kế hoạch đang chọn, PO nào đã xác nhận ở Cập nhật tỷ lệ cắt,
 * số lượng đã xác nhận, chưa xác nhận. Số là của cả PO (một PO có thể nằm trong nhiều kế hoạch). Cột theo chính sách cột của
 * Cập nhật tỷ lệ cắt; cột suy ra bỏ khi cột nguồn bị Ẩn, như máy chủ. `enabled`: chỉ tải khi đang xem khung PO.
 */
function usePlanPos(plan: ShipmentPlan | null, enabled: boolean) {
  const policy = useFieldPolicy('order.po');
  const canView = useCan('order.po:view');
  const query = useQuery({
    queryKey: ['order', 'shipment-pos', plan?.id],
    queryFn: () => api<PlanPoList>(`/order/shipment-plans/${plan!.id}/pos`),
    enabled: enabled && !!plan && canView,
  });
  const columns = useMemo(() => {
    const statusHidden = policy.level('statusCode') === 'HIDDEN';
    const qtyHidden = policy.level('qty') === 'HIDDEN';
    return PLAN_PO_COLUMNS.filter((c) => (c.key === 'confirmedAt' ? !statusHidden : c.key === 'confirmedQty' || c.key === 'unconfirmedQty' ? !statusHidden && !qtyHidden : true));
  }, [policy]);

  const rows = plan && canView ? (query.data?.items ?? []) : [];
  const hidden = plan && canView ? (query.data?.hiddenCount ?? 0) : 0;
  // Trạng thái bị Che hoặc Ẩn thì không đếm được PO đã xác nhận; số lượng bị Che hoặc Ẩn thì không có tổng (sumOf trả null)
  const statusKnown = rows.every((p) => p.statusCode === 'CONFIRMED' || p.statusCode === 'DRAFT');
  const confirmedCount = rows.filter((p) => p.statusCode === 'CONFIRMED').length;
  return {
    policy,
    canView,
    query,
    columns,
    rows,
    hidden,
    statusKnown,
    confirmedCount,
    confirmedSum: sumOf(rows.map((p) => p.confirmedQty)),
    unconfirmedSum: sumOf(rows.map((p) => p.unconfirmedQty)),
    total: sumOf(rows.map((p) => p.qty)),
  };
}
type PlanPos = ReturnType<typeof usePlanPos>;

/** Tóm tắt trên tiêu đề khung PO: đã xác nhận / chưa xác nhận */
function PlanPoSummary({ pos }: { pos: PlanPos }) {
  const { rows, statusKnown, confirmedCount, confirmedSum, unconfirmedSum } = pos;
  if (rows.length === 0 || !statusKnown) return null;
  const amount = (sum: number | null, count: number) => (sum === null ? `${count} PO` : count === 0 ? fmtNum(sum) : `${fmtNum(sum)} (${count} PO)`);
  return (
    <Group gap={6} wrap="wrap" justify="flex-end">
      <Badge variant="light" color={PO_STATUS.CONFIRMED.color}>Đã xác nhận: {amount(confirmedSum, confirmedCount)}</Badge>
      <Badge variant="light" color={PO_STATUS.DRAFT.color}>Chưa xác nhận: {amount(unconfirmedSum, rows.length - confirmedCount)}</Badge>
    </Group>
  );
}

function PlanPoGrid({ plan, pos }: { plan: ShipmentPlan | null; pos: PlanPos }) {
  const { policy, canView, query, columns, rows, hidden, total } = pos;
  const empty = !plan
    ? 'Bấm một kế hoạch ở lưới trên để xem PO.'
    : !canView
      ? 'Bạn không được xem PO ở màn Cập nhật tỷ lệ cắt nên không thấy trạng thái xác nhận.'
      : hidden > 0
        ? `Bạn không được xem ${hidden} PO của kế hoạch này.`
        : 'Kế hoạch này chưa gắn PO.';

  return (
    <DataGrid
      label="PO của kế hoạch"
      fill
      dense
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      policy={policy}
      loading={query.isFetching && !!plan && canView}
      error={plan && canView ? loadError(query.error, 'Không tải được PO của kế hoạch.') : null}
      onRetry={() => void query.refetch()}
      empty={empty}
      footer={
        rows.length > 0 && (
          <Text size="sm" px={8} py={4}>
            {total === null ? `${rows.length} PO.` : <>Tổng {rows.length} PO: <b>{fmtNum(total)}</b>.</>}
            {/* Số trong lưới là của cả PO (một PO có thể nằm trong nhiều kế hoạch): luôn nói rõ, kể cả khi không xem được SL kế hoạch */}
            {policy.visible('qty') && <> Số lượng là của cả PO{typeof plan?.planQty === 'number' ? <>; kế hoạch này lấy <b>{fmtNum(plan.planQty)}</b>.</> : '.'}</>}
            {hidden > 0 && <> Còn {hidden} PO bạn không được xem.</>}
          </Text>
        )
      }
    />
  );
}

interface Picked {
  candidate: Candidate;
  poIds: number[];
  poBuyDate: string;
}

type PlanSheetRow = Omit<PlanLine, 'planQty'> & { key: string; planQty: number | null };
const NO_DRAFT_LINES: PlanLine[] = [];
/** Lưới SL KHXH: chỉ cột SL KHXH nhập được (dán cả cột từ Excel); vượt SL còn lại tô đỏ */
const PLAN_SHEET: SheetColumn<PlanSheetRow>[] = [
  sheetReadonly<PlanSheetRow>('Tên màu SP', (r) => r.colorName, (r) => r.colorName, { minWidth: 150, grow: 2 }),
  sheetReadonly<PlanSheetRow>('Tên cỡ SP', (r) => r.sizeName, (r) => r.sizeName, { minWidth: 90 }),
  sheetReadonly<PlanSheetRow>('Số lượng gốc', (r) => fmtNum(r.originalQty), (r) => r.originalQty, { minWidth: 110, align: 'right' }),
  sheetReadonly<PlanSheetRow>('SL đã tạo KHXH', (r) => fmtNum(r.plannedQty), (r) => r.plannedQty, { minWidth: 120, align: 'right' }),
  sheetReadonly<PlanSheetRow>('SL còn lại', (r) => fmtNum(r.remainingQty), (r) => r.remainingQty, { minWidth: 100, align: 'right' }),
  sheetNumber<PlanSheetRow>('planQty', 'SL KHXH', { required: true, minWidth: 120, error: (r) => (r.planQty ?? 0) > r.remainingQty }),
];

/**
 * Popup B2: thêm hoặc sửa kế hoạch. SL KHXH theo màu cỡ không vượt SL còn lại. Khi sửa, "Chọn mã hàng" thêm PO chưa lập kế hoạch của
 * cùng mã hàng (phase 5.17): Số lượng gốc cộng dồn, SL KHXH giữ số đang nhập, màu cỡ mới để trống.
 */
function PlanDialog({ planId, onClose, onDone }: { planId: number | null; onClose: () => void; onDone: () => void }) {
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const mobile = useMobile();
  const canViewPo = useCan('order.po:view');
  const [picker, setPicker] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  // Sửa: PO thêm vào kế hoạch, chưa lưu
  const [added, setAdded] = useState<number[]>([]);
  const [poPicker, setPoPicker] = useState(false);
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
  // Sửa: máy chủ tự lấy PO của kế hoạch, client chỉ gửi PO thêm
  const draft = useQuery({
    // Khóa có tập PO của kế hoạch: người khác vừa thêm PO thì không dùng lưới cũ trong bộ nhớ đệm (review 5.17 M1)
    queryKey: ['order', 'shipment-draft', salesOrderId, planId, poIds.join(','), added.join(',')],
    queryFn: () =>
      api<PlanLine[]>(
        `/order/shipment-plans/draft${qs(planId ? { salesOrderId, excludePlanId: planId, addPoIds: added.join(',') || undefined } : { salesOrderId, poIds: poIds.join(',') })}`,
      ),
    enabled: !!salesOrderId && (planId ? !!plan : poIds.length > 0),
    // Thêm PO khi sửa: giữ lưới đang có tới khi lưới mới về (Lưu khóa trong lúc đó); lập mới đổi mã hàng thì không giữ lưới mã cũ
    placeholderData: planId ? keepPreviousData : undefined,
  });
  const lines = draft.data ?? NO_DRAFT_LINES;
  const qtyOf = (l: PlanLine) => Number(qty[lineKey(l)]) || 0;
  const total = lines.reduce((s, l) => s + qtyOf(l), 0);
  const over = lines.filter((l) => qtyOf(l) > l.remainingQty);
  const savedQty = new Map((plan?.lines ?? []).map((l) => [lineKey(l), typeof l.planQty === 'number' ? l.planQty : 0]));
  const qtyChanged = lines.some((l) => qtyOf(l) !== (savedQty.get(lineKey(l)) ?? 0));
  const hasQty = Object.values(qty).some((v) => v !== '');
  const dirty = planId ? filled && (form.isDirty() || qtyChanged || added.length > 0) : !!picked || form.isDirty() || hasQty;
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);

  const save = useMutation({
    mutationFn: () => {
      // Chỉ gửi trường được sửa: gửi cột chỉ đọc lên thì máy chủ từ chối cả lần lưu (review 5.1 lượt 2 F5).
      // Khi sửa, số lượng không đổi thì không gửi: đổi mỗi ngày tháng không phải kiểm lại SL còn lại (review lượt 3 P6)
      const body = {
        poBuyDate: canPoBuy ? form.values.poBuyDate.trim() : undefined,
        shipDate: canShip ? form.values.shipDate || undefined : undefined,
        lines: canQty && (!planId || qtyChanged || added.length > 0) ? lines.map((l) => ({ colorName: l.colorName, sizeName: l.sizeName, planQty: qtyOf(l) })) : undefined,
        // Thêm PO đổi Số lượng gốc nên luôn gửi kèm lưới màu cỡ (máy chủ đòi)
        addPoIds: planId && added.length > 0 ? added : undefined,
        // Tập PO lưới đang dựng theo: máy chủ báo 409 nếu kế hoạch vừa được thêm PO ở nơi khác (lưu là mất màu cỡ của PO đó)
        basePoIds: planId && canQty && (qtyChanged || added.length > 0) ? plan?.poIds : undefined,
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
          : canQty && (draft.isLoading || (draft.isPlaceholderData && draft.isFetching))
            ? 'Đang tải màu cỡ…'
            : canQty && draft.error
              ? 'Chưa tải được màu cỡ'
            : canQty && over.length > 0
              ? 'Có màu cỡ có SL KHXH lớn hơn SL còn lại'
              : canQty && total <= 0
                ? 'Nhập SL KHXH cho ít nhất một màu cỡ'
                : planId && !dirty
                  ? 'Chưa có thay đổi nào'
                  : null;
  const addPoBlocked = !canQty
    ? 'Bạn không được sửa số lượng kế hoạch'
    : !canViewPo
      ? 'Bạn không được xem PO ở Cập nhật tỷ lệ cắt'
      : !filled
        ? 'Đang tải kế hoạch…'
        : null;
  /** Ô theo chính sách cột: Ẩn thì không có, Che thì hiện "***", Chỉ đọc thì khóa. */
  const lock = (field: string) => (policy.editable(field) ? {} : { readOnly: true, className: 'field-readonly', description: 'Bạn chỉ được xem trường này' });

  // Lưới xem (không được nhập số lượng, đang tải, lỗi, chưa chọn mã hàng)
  const columns = useMemo<Column<PlanLine>[]>(
    () => [...LINE_COLUMNS, { key: 'planQty', title: 'SL KHXH', field: null, width: 130, render: (l) => fmtNum(qty[lineKey(l)]) }],
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
      closeOnEscape={!canQty && !picker && !poPicker}
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
            {planId && (
              <ActionButton
                variant="default"
                leftSection={<IconListSearch size={15} />}
                onClick={() => setPoPicker(true)}
                blockedReason={addPoBlocked}
              >
                Chọn mã hàng
              </ActionButton>
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
          {plan && (
            <Group gap={6}>
              <Text size="sm" c="dimmed">
                {plan.poIds.length} PO của kế hoạch{added.length > 0 && ` + ${added.length} PO thêm`}
              </Text>
              {added.length > 0 && (
                <Button size="compact-sm" variant="subtle" color="gray" onClick={() => setAdded([])}>
                  Bỏ PO vừa thêm
                </Button>
              )}
            </Group>
          )}
        </Group>
        {added.length > 0 && (
          <Alert color="blue" variant="light" py={6}>
            Số lượng gốc đã cộng thêm màu cỡ của {added.length} PO. SL KHXH giữ như cũ: nhập thêm cho màu cỡ cần lập rồi bấm Lưu thay đổi.
          </Alert>
        )}
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
      {poPicker && plan && (
        <PlanPoPicker
          plan={plan}
          selected={added}
          onClose={() => setPoPicker(false)}
          onConfirm={(ids) => {
            setAdded(ids);
            setPoPicker(false);
          }}
        />
      )}
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
 * Popup B3 "Chọn mã hàng": chọn đơn hàng còn số lượng, chọn PO, nhập PO/Buy date. Chỉ có đơn hàng của các nhà máy SX thuộc
 * đơn vị cơ sở đang làm việc theo danh mục Nhà máy SX (máy chủ lọc, ADR 0013 mục 11); kế hoạch lập ra thuộc đơn vị đó.
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
      c.key === 'productionFactoryCode' ? { ...c, render: (r: Candidate) => (r.productionFactoryCode ? <span title={r.productionFactoryCode}>{factoryLabel(r.productionFactoryCode, name)}</span> : '') } : c,
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
            {branchName(branch?.code)} chưa có nhà máy SX nào nên chưa có mã hàng để lập kế hoạch. Nhờ quản trị viên gắn nhà máy cho đơn vị này ở Quản trị › Danh mục hệ thống › Nhà máy SX.
          </Alert>
        ) : (
          <Text size="xs" c="dimmed">
            Chỉ hiện đơn hàng có Nhà máy SX thuộc {branchName(branch?.code)}: {factories.map((f) => f.name).join(', ')}. Kế hoạch lập ra thuộc đơn vị này. Đơn đã có kế hoạch ở đơn vị này không hiện: mở kế hoạch đó, bấm "Chọn mã hàng" để thêm PO.
          </Text>
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
            empty={<EmptyState filtered={Object.values(filter).some(Boolean)} what="mã hàng" onClear={() => setFilter(emptyFilter)} hint="Không có mã hàng nào của nhà máy SX thuộc đơn vị này còn số lượng để lập kế hoạch. Đơn chưa chọn Nhà máy SX ở Thông tin đơn hàng cũng không hiện ở đây." />}
          />
        </div>
        {/* Máy chủ trả tối đa 200 đơn theo ngày xuất */}
        {(candidates.data?.length ?? 0) >= 200 && <Text size="xs" c="dimmed">Đang hiện 200 mã hàng có ngày xuất sớm nhất. Lọc theo ngày, khách hàng hoặc mã hàng để thấy mã khác.</Text>}
        <Grid gap={12}>
          <Grid.Col span={{ base: 12, sm: 8 }}>
            <div className="pane-title">
              PO chi tiết {chosen && <Text span size="xs" c="dimmed" fw={400}>của {chosen.styleCode}, chưa lập kế hoạch</Text>}
            </div>
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
                empty={chosen ? 'Mã hàng này không còn PO chưa lập kế hoạch.' : 'Chọn một mã hàng ở bảng trên.'}
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

/**
 * Nút "Chọn mã hàng" của popup Sửa (phase 5.17): PO chưa nằm trong kế hoạch nào của đúng mã hàng của kế hoạch. PO đã thêm (chưa lưu)
 * giữ dấu tích khi mở lại; bỏ hết dấu tích rồi Xác nhận là bỏ các PO vừa thêm.
 */
function PlanPoPicker({ plan, selected, onClose, onConfirm }: { plan: ShipmentPlanDetail; selected: number[]; onClose: () => void; onConfirm: (ids: number[]) => void }) {
  const mobile = useMobile();
  const [ids, setIds] = useState<(string | number)[]>(selected);
  const pos = useQuery({
    queryKey: ['order', 'plan-candidate-pos', plan.id],
    queryFn: () => api<CandidatePo[]>(`/order/shipment-plans/${plan.id}/candidate-pos`),
    refetchOnMount: 'always',
  });
  // PO đã thêm (chưa lưu) mà vừa vào kế hoạch khác thì không còn trong danh sách: bỏ dấu tích, Xác nhận là bỏ nó (review 5.17 L2)
  const valid = useMemo(() => (pos.data ? ids.filter((x) => pos.data.some((p) => p.id === x)) : ids), [pos.data, ids]);
  const changed = valid.length !== selected.length || valid.some((x) => !selected.includes(Number(x)));
  const dirty = changed && valid.length > 0;
  const close = () => confirmDiscard(dirty, onClose);
  const pickedQty = useMemo(() => sumOf((pos.data ?? []).filter((p) => valid.includes(p.id)).map((p) => p.qty)), [pos.data, valid]);
  const toggle = (p: CandidatePo) => setIds((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]));
  const blocked = pos.isLoading ? 'Đang tải danh sách PO…' : !changed ? (valid.length === 0 ? 'Chọn ít nhất một PO' : 'Chưa đổi PO nào') : null;

  return (
    <Modal opened onClose={close} size="min(860px, 96vw)" fullScreen={mobile} title={`Thêm PO vào kế hoạch ${plan.planNo}`}>
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
          <TextInput label="Khách hàng" value={plan.customerName} readOnly className="field-readonly" />
          <TextInput label="Mã hàng" value={plan.styleCode} readOnly className="field-readonly" />
          <TextInput label="Số lượng các PO đang chọn" value={pickedQty === null ? 'Bạn không được xem số lượng PO' : fmtNum(pickedQty)} readOnly className="field-readonly" />
        </SimpleGrid>
        <Text size="xs" c="dimmed">Chỉ có PO của mã hàng này chưa nằm trong kế hoạch xuất hàng nào. PO đã chọn ở kế hoạch không hiện lại.</Text>
        <div style={{ height: 'min(46vh, 340px)', display: 'flex', flexDirection: 'column' }}>
          <DataGrid
            label="PO chưa lập kế hoạch"
            fill
            dense
            columns={CANDIDATE_PO_COLS}
            rows={pos.data ?? []}
            rowKey={(p) => p.id}
            loading={pos.isLoading}
            error={loadError(pos.error, 'Không tải được danh sách PO.')}
            onRetry={() => void pos.refetch()}
            checked={valid}
            onCheck={setIds}
            onRowClick={toggle}
            empty="Mọi PO của mã hàng này đã nằm trong kế hoạch xuất hàng."
          />
        </div>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>Hủy</Button>
          <ActionButton blockedReason={blocked} onClick={() => onConfirm(valid.map(Number))}>
            Xác nhận
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  );
}
