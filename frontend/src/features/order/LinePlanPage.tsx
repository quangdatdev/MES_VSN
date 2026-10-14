import { Alert, Button, Center, Checkbox, Group, List, Loader, Modal, Popover, SegmentedControl, Text } from '@mantine/core';
import { IconAlertCircle, IconCalendarStats, IconFilterOff, IconInfoCircle, IconList, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { DataGrid, Masked, type Column } from '../../components/DataGrid';
import { DateField } from '../../components/DateField';
import { DebouncedAutocomplete, DebouncedTextInput } from '../../components/DebouncedInput';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetDate, sheetNumber, sheetReadonly, sheetSelect, type SheetColumn } from '../../components/SheetGrid';
import { WorkPage } from '../../components/WorkPage';
import { useAfterClose } from '../../lib/afterClose';
import { api } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy } from '../../lib/fieldPolicy';
import { addDays, fmtDate, fmtMoney, fmtNum, qs, sumOf, today } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { LINE_EMPTY, LINE_NOT_FOUND, lineNameLabel, lineOptions, ORPHAN_LINE_SUFFIX } from '../../lib/lines';
import { toastError, toastOk } from '../../lib/notify';
import { useStableByKey } from '../../lib/useStable';
import { toCalendar, WEEKDAYS, type WorkCalendar, type WorkCalendarJson } from '../../lib/workCalendar';
import { useSession } from '../../store/session';
import type { Board, BoardBar, LinePlan, LinePlanDetail, ScheduleLine } from './api';
import { EmptyState, ExportButton, LINE_STATUS, loadError, OrderFilters, PICK_ROW, PLAN_STATUS, readable, StatusBadge, useCanWrite, useCustomers, useLinesState, usePagedList } from './common';
import { LineBoard } from './LineBoard';
import { computeLine, DATE_KEYS, isOutdated, storedOf, type Computed } from './scheduleDates';

const RESOURCE = 'order.lineplan';

const COLUMNS: Column<LinePlan>[] = [
  { key: 'customerName', title: 'Khách hàng', filterKey: 'customerName', sortKey: 'customerName', minWidth: 160, maxWidth: 240 },
  { key: 'styleCode', title: 'Mã hàng', filterKey: 'styleCode', format: 'code', sortKey: 'styleCode' },
  { key: 'orderType', title: 'Loại đơn hàng', filterKey: 'orderType' },
  { key: 'branchCode', title: 'ĐVCS', filterKey: 'branchCode', field: null },
  { key: 'planQty', title: 'SL kế hoạch', filterKey: 'planQty', format: 'number', sortKey: 'planQty' },
  { key: 'scheduledQty', title: 'SL đã xếp chuyền', filterKey: 'scheduledQty', format: 'number' },
  { key: 'remainingQty', title: 'SL còn lại', format: 'number' },
  { key: 'revenue', title: 'Doanh số (USD)', format: 'money', sortKey: 'revenue' },
  { key: 'syncedAt', title: 'Ngày đồng bộ', filterKey: 'syncedAt', format: 'date', sortKey: 'syncedAt' },
  { key: 'startDate', title: 'Ngày bắt đầu SX', filterKey: 'startDate', format: 'date' },
  { key: 'endDate', title: 'Ngày kết thúc SX', filterKey: 'endDate', format: 'date' },
  { key: 'shipDate', title: 'Ngày xuất hàng', filterKey: 'shipDate', format: 'date', sortKey: 'shipDate' },
  { key: 'statusCode', title: 'Trạng thái', filterKey: 'statusCode', filterLabel: (v) => PLAN_STATUS[v]?.label ?? String(v), sortKey: 'statusCode', render: (r) => <StatusBadge map={PLAN_STATUS} code={r.statusCode} /> },
  { key: 'createdAt', title: 'Ngày tạo', format: 'datetime', sortKey: 'createdAt', filterKey: 'createdAt' },
];
const NAMES = { ...Object.fromEntries(COLUMNS.map((c) => [c.key, c.title])), cmPrice: 'Giá CM' };

/** Bộ lọc của bảng dàn chuyền */
interface BoardFilter {
  from: string;
  to: string;
  customer: string;
  style: string;
  /** Hiện thông tin chi tiết khi bấm vào thanh */
  details: boolean;
}
const defaultBoardFilter = (): BoardFilter => ({ from: addDays(today(), -7), to: addDays(today(), 60), customer: '', style: '', details: true });

/** Màn "Xếp chuyền": danh sách kế hoạch cần dàn chuyền; đúp chuột một dòng để mở chi tiết dàn chuyền. */
export default function LinePlanPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const { customers } = useCustomers();
  const list = usePagedList<LinePlan>('line-plans', '/order/line-plans');
  const columns = useMemo(() => withBranchNames(COLUMNS, branchName), [branchName]);
  const refreshAfterClose = useAfterClose(() => qc.invalidateQueries({ queryKey: ['order'] }));
  // Tab nằm trên URL (?view=board): tải lại trang vẫn ở đúng tab
  const view = list.url.get('view') === 'board' ? 'board' : 'list';
  // Bộ lọc bảng giữ ở trang: đổi qua lại hai tab không mất
  const [boardFilter, setBoardFilter] = useState<BoardFilter>(defaultBoardFilter);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const items = list.query.data?.items ?? [];
  // Đổi lọc hay trang mà dòng đã chọn không còn trong lưới thì coi như chưa chọn
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const scheduledSum = sumOf(items.map((r) => r.scheduledQty));
  const planSum = sumOf(items.map((r) => r.planQty));

  return (
    <WorkPage
      title="Xếp chuyền"
      subtitle={branch?.isAggregate ? 'Kế hoạch của mọi đơn vị cơ sở bạn được xem' : `Dàn chuyền cho kế hoạch xuất hàng của ${branchName(branch?.code)}. Đúp chuột một dòng để xếp chuyền.`}
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <SegmentedControl
            value={view}
            onChange={(v) => list.patch({ view: v === 'board' ? 'board' : null })}
            data={[
              { value: 'list', label: <Group gap={6} wrap="nowrap"><IconList size={15} />Danh sách</Group> },
              { value: 'board', label: <Group gap={6} wrap="nowrap"><IconCalendarStats size={15} />Bảng dàn chuyền</Group> },
            ]}
          />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="xep-chuyen.csv" />
          {view === 'list' && (
            <ActionButton blockedReason={selected ? null : PICK_ROW} onClick={() => selected && setOpen(selected.id)}>
              Chi tiết dàn chuyền
            </ActionButton>
          )}
        </>
      }
      filters={
        view === 'list' ? (
          <OrderFilters policy={policy} value={list.filter} onChange={list.setFilter} customers={customers} statuses={PLAN_STATUS} columns={list.columnsOf(NAMES, policy)} />
        ) : (
          <BoardFilters value={boardFilter} onChange={setBoardFilter} />
        )
      }
    >
      {view === 'list' ? (
        <DataGrid
          label="Danh sách kế hoạch xếp chuyền"
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
          empty={<EmptyState filtered={list.filtered} what="kế hoạch" onClear={list.clearFilter} hint="Chưa có kế hoạch xuất hàng nào cần xếp chuyền. Lập kế hoạch ở màn Kế hoạch xuất hàng trước." />}
          footer={
            <Pager
              page={list.page}
              pageSize={list.pageSize}
              total={list.query.data?.total ?? 0}
              onPage={list.setPage}
              extra={scheduledSum !== null && planSum !== null && <Text size="sm">Đã xếp chuyền trang này: <b>{fmtNum(scheduledSum)}</b> / {fmtNum(planSum)}</Text>}
            />
          }
        />
      ) : (
        <BoardPanel filter={boardFilter} onOpenPlan={setOpen} />
      )}
      {open !== null && <ScheduleModal planId={open} onClose={() => setOpen(null)} onSaved={refreshAfterClose} />}
    </WorkPage>
  );
}

function useBoard(f: BoardFilter) {
  const branch = useSession((s) => s.branch?.code);
  // Ô Mã hàng, Khách hàng tự chờ ngừng gõ (DebouncedTextInput) rồi mới đổi bộ lọc
  const style = f.style.trim();
  const customer = f.customer.trim();
  return useQuery({
    queryKey: ['order', 'board', branch, f.from, f.to, style, customer],
    queryFn: () => api<Board>(`/order/line-plans/board${qs({ from: f.from, to: f.to, style, customer })}`),
    enabled: !!f.from && !!f.to && f.from <= f.to,
    placeholderData: keepPreviousData,
  });
}

/** Lọc bảng dàn chuyền: cùng thứ tự, cùng loại ô với dải lọc chung (Ngày, Khách hàng, Mã hàng). */
function BoardFilters({ value, onChange }: { value: BoardFilter; onChange: (v: BoardFilter) => void }) {
  const { customers } = useCustomers();
  const policy = useFieldPolicy(RESOURCE);
  const set = (patch: Partial<BoardFilter>) => onChange({ ...value, ...patch });
  const initial = defaultBoardFilter();
  const dirty = value.from !== initial.from || value.to !== initial.to || !!value.customer || !!value.style;
  return (
    <Group gap="sm" align="flex-end" wrap="wrap">
      <Group gap={6} align="flex-end" wrap="nowrap">
        <DateField label="Từ ngày" value={value.from} onChange={(v) => set({ from: v })} clearable={false} w={150} />
        <DateField label="Đến ngày" value={value.to} onChange={(v) => set({ to: v })} minDate={value.from || undefined} clearable={false} w={150} />
      </Group>
      {readable(policy, 'customerName') && <DebouncedAutocomplete label="Khách hàng" placeholder="Tất cả" data={customers} limit={50} value={value.customer} onChange={(v) => set({ customer: v })} w={200} />}
      {readable(policy, 'styleCode') && <DebouncedTextInput label="Mã hàng" placeholder="Gõ một phần mã" leftSection={<IconSearch size={14} />} value={value.style} onChange={(v) => set({ style: v })} w={170} />}
      <Checkbox label="Hiển thị thông tin chi tiết khi bấm dàn chuyền" checked={value.details} onChange={(e) => set({ details: e.currentTarget.checked })} mb={6} />
      {dirty && (
        <Button variant="subtle" color="gray" leftSection={<IconFilterOff size={15} />} onClick={() => onChange({ ...initial, details: value.details })}>
          Xóa lọc
        </Button>
      )}
    </Group>
  );
}

/** Bảng dàn chuyền kèm các trạng thái: khoảng ngày sai, đang tải, lỗi tải (Thử lại), nhà máy chưa có chuyền. */
function BoardArea({ filter, board, bars, focusPlanId, renderActions }: {
  filter: BoardFilter;
  board: UseQueryResult<Board>;
  /** Thanh vẽ thay cho thanh của máy chủ (popup chi tiết: thêm thanh xem trước của dòng đang sửa) */
  bars?: (BoardBar & { preview?: boolean })[];
  focusPlanId?: number;
  renderActions?: (bar: BoardBar) => ReactNode;
}) {
  const range = !filter.from || !filter.to ? 'Chọn Từ ngày và Đến ngày để xem bảng dàn chuyền.' : filter.from > filter.to ? 'Từ ngày phải trước Đến ngày.' : null;
  if (range) {
    return (
      <Alert color="orange" variant="light" py={6}>
        {range}
      </Alert>
    );
  }
  if (board.error) {
    return (
      <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py={6}>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <span>{loadError(board.error, 'Không tải được bảng dàn chuyền.')}</span>
          <Button size="xs" variant="default" loading={board.isFetching} onClick={() => void board.refetch()}>
            Thử lại
          </Button>
        </Group>
      </Alert>
    );
  }
  if (!board.data) {
    return (
      <Center py="xl" role="status" aria-label="Đang tải bảng dàn chuyền">
        <Loader size="sm" color="brand" />
      </Center>
    );
  }
  if (board.data.lines.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        Đơn vị cơ sở chưa có chuyền nào. Thêm chuyền ở Quản trị › Danh mục hệ thống.
      </Text>
    );
  }
  return (
    <LineBoard
      from={board.data.from}
      to={board.data.to}
      lines={board.data.lines}
      nonWorkingDays={board.data.nonWorkingDays}
      bars={bars ?? board.data.bars}
      focusPlanId={focusPlanId}
      details={filter.details}
      renderActions={renderActions}
    />
  );
}

/** Bảng dàn chuyền toàn nhà máy (tab trên màn Xếp chuyền). */
function BoardPanel({ filter, onOpenPlan }: { filter: BoardFilter; onOpenPlan: (id: number) => void }) {
  const board = useBoard(filter);
  // Hàm ổn định: bảng dàn chuyền (memo) không vẽ lại mọi thanh khi trang render lại
  const renderActions = useCallback(
    (b: BoardBar) => (
      <Button size="xs" mt={4} variant="default" onClick={() => onOpenPlan(b.planId)}>
        Mở chi tiết dàn chuyền
      </Button>
    ),
    [onOpenPlan],
  );
  return (
    <div style={{ flex: 1, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
      <BoardArea filter={filter} board={board} renderActions={renderActions} />
    </div>
  );
}

/** Dòng dàn chuyền đang sửa: ô số, ngày có thể trống trong lúc nhập (lưới bảng tính). Số ngày nghỉ, các ngày khác là số đã lưu */
interface EditLine extends Omit<ScheduleLine, 'qty' | 'avgOutput' | 'startDate'> {
  key: number;
  qty: number | null;
  avgOutput: number | null;
  startDate: string | null;
}
let nextKey = 1;
const started = (l: EditLine) => l.statusCode === 'IN_PRODUCTION' || l.statusCode === 'DONE';
// Dòng không sửa được (ngoài phạm vi sửa, kể cả dòng không thấy) không gửi lên nhưng vẫn tính vào tổng, như máy chủ
const mine = (r: Pick<EditLine, 'editable'>) => r.editable !== false;

/**
 * Số ngày SX và các ngày của một dòng: dòng mình sửa được thì tính theo lịch làm việc của ĐVCS kế hoạch (phase 5.12), dòng ngoài
 * phạm vi sửa (không gửi lên) thì số máy chủ đã lưu. Mỗi dòng là đối tượng bất biến của lưới: nhớ kết quả theo dòng, các ô của một
 * dòng không tính lại.
 */
function useLineCalc(calendar: WorkCalendar | null) {
  return useMemo(() => {
    const cache = new WeakMap<EditLine, Computed>();
    return (l: EditLine): Computed => {
      const hit = cache.get(l);
      if (hit) return hit;
      const out = mine(l) ? computeLine(calendar, l) : storedOf(l);
      cache.set(l, out);
      return out;
    };
  }, [calendar]);
}
const DATE_COLUMNS: [(typeof DATE_KEYS)[number], string][] = [
  ['endDate', 'Kết thúc vào chuyền'],
  ['outStartDate', 'Bắt đầu ra chuyền'],
  ['outEndDate', 'Kết thúc ra chuyền'],
  ['warehouseStartDate', 'Bắt đầu nhập kho'],
  ['warehouseEndDate', 'Kết thúc nhập kho'],
];
const lineStatusLabel = (r: EditLine) => LINE_STATUS[r.statusCode ?? 'PLANNED']?.label ?? '';
/** Các trường làm đổi thanh của một dòng: gõ cột khác thì bảng dàn chuyền không vẽ lại */
const barSignature = (r: EditLine) => [r.id ?? -r.key, r.lineCode, r.qty, r.avgOutput, r.startDate, r.statusCode].join('|');

// Lưới xem khi không được sửa (và khi đang tải, tải lỗi): số máy chủ đã tính lúc lưu
const SCHEDULE_VIEW_COLS: Column<EditLine>[] = [
  { key: 'lineCode', title: 'Chuyền', field: null, minWidth: 150, render: (r) => r.lineName ?? r.lineCode },
  { key: 'qty', title: 'Số lượng', format: 'number', field: null },
  { key: 'avgOutput', title: 'Năng suất TB', format: 'number', field: null },
  { key: 'startDate', title: 'Bắt đầu vào chuyền', format: 'date', field: null },
  { key: 'productionDays', title: 'Số ngày SX', format: 'number', field: null },
  { key: 'offDays', title: 'Số ngày nghỉ', format: 'number', field: null },
  ...DATE_COLUMNS.map(([key, title]): Column<EditLine> => ({ key, title, format: 'date', field: null })),
  { key: 'statusCode', title: 'Phân màu cỡ', field: null, render: (r) => <StatusBadge map={LINE_STATUS} code={r.statusCode ?? 'PLANNED'} /> },
];

/** Ngày nghỉ hằng tuần đọc thành chữ: "Chủ nhật", "thứ Bảy, Chủ nhật" */
const weeklyOffText = (days: number[]) =>
  days.length ? WEEKDAYS.filter((d) => days.includes(d.value)).map((d) => (d.value === 7 ? d.label : d.label.toLowerCase())).join(', ') : 'không có ngày nghỉ cố định trong tuần';

/** Cách tính các cột tự tính, theo đúng lịch của ĐVCS kế hoạch */
function ScheduleRules({ calendar: c }: { calendar: WorkCalendarJson }) {
  return (
    <Popover width={360} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Button size="compact-xs" variant="subtle" color="gray" leftSection={<IconInfoCircle size={14} />}>
          Cách tính ngày
        </Button>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm" mb={6}>Bạn nhập chuyền, số lượng, năng suất và ngày bắt đầu vào chuyền. Các cột xám tự tính theo lịch làm việc của đơn vị cơ sở:</Text>
        <List size="sm" spacing={4}>
          <List.Item>Số ngày SX = số lượng / năng suất, làm tròn lên.</List.Item>
          <List.Item>Số ngày nghỉ: {weeklyOffText(c.weeklyOffDays)} và ngày lễ, Tết trong lịch, từ ngày bắt đầu tới ngày kết thúc vào chuyền.</List.Item>
          <List.Item>Kết thúc vào chuyền = bắt đầu + số ngày SX + số ngày nghỉ − 1.</List.Item>
          <List.Item>Bắt đầu ra chuyền = bắt đầu vào chuyền + {c.outStartOffsetDays}; kết thúc ra chuyền = kết thúc vào chuyền + {c.outEndOffsetDays} ngày làm việc.</List.Item>
          <List.Item>Bắt đầu nhập kho = bắt đầu ra chuyền + {c.warehouseStartOffsetDays}; kết thúc nhập kho = kết thúc ra chuyền + {c.warehouseEndOffsetDays} ngày làm việc.</List.Item>
        </List>
        <Text size="xs" c="dimmed" mt={6}>Lịch làm việc do quản trị khai báo ở Danh mục hệ thống.</Text>
      </Popover.Dropdown>
    </Popover>
  );
}

/** Popup "Chi tiết dàn chuyền": thông tin chung, bảng nhập liệu dàn chuyền, bảng dàn chuyền để thấy chuyền trống. */
function ScheduleModal({ planId, onClose, onSaved }: { planId: number; onClose: () => void; onSaved: () => void }) {
  const policy = useFieldPolicy(RESOURCE);
  const { lines, loaded: linesLoaded } = useLinesState();
  const canEdit = useCanWrite(`${RESOURCE}:update`) && policy.editable('startDate');
  // Luôn tải lại khi mở và chỉ điền một lần từ lần tải đó: tải lại nền không đè lên phần đang nhập
  const detail = useQuery({ queryKey: ['order', 'line-plan', planId], queryFn: () => api<LinePlanDetail>(`/order/line-plans/${planId}`), refetchOnMount: 'always' });
  const plan = detail.data;
  const [rows, setRows] = useState<EditLine[]>([]);
  const [filled, setFilled] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (filled || !plan || !detail.isSuccess || !detail.isFetchedAfterMount) return;
    setRows(plan.lines.map((l) => ({ ...l, key: nextKey++ })));
    setFilled(true);
  }, [filled, plan, detail.isSuccess, detail.isFetchedAfterMount]);
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);

  const [boardFilter, setBoardFilter] = useState<BoardFilter>(defaultBoardFilter);
  const board = useBoard(boardFilter);

  const calendar = useMemo(() => (plan?.calendar ? toCalendar(plan.calendar) : null), [plan?.calendar]);
  const calc = useLineCalc(calendar);
  // Dòng chỉ đủ để vẽ thanh xem trước khi có chuyền và tính được ngày kết thúc
  const drawn = (r: EditLine) => !!(r.lineCode && calc(r).dates);
  // Dòng đã lưu, chưa sửa ô nào, mà ngày khác cách tính theo lịch hiện tại: Lưu là tính lại (người dùng chốt Q5 phase 5.12)
  const savedById = useMemo(() => new Map((plan?.lines ?? []).map((l) => [l.id, l])), [plan?.lines]);
  const outdatedCount = useMemo(
    () =>
      rows.filter((r) => {
        const saved = r.id === undefined ? undefined : savedById.get(r.id);
        return !!saved && mine(r) && isOutdated(saved, r, calc(r));
      }).length,
    [rows, calc, savedById],
  );
  const savedMine = (plan?.lines ?? []).filter((l) => l.editable !== false).reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const others = plan && typeof plan.scheduledQty === 'number' ? Math.max(0, plan.scheduledQty - savedMine) : 0;
  const total = rows.filter(mine).reduce((s, r) => s + (Number(r.qty) || 0), 0) + others;
  const planQty = typeof plan?.planQty === 'number' ? plan.planQty : null;
  const overQty = planQty !== null && total > planQty;
  const incomplete = rows.some((r) => !drawn(r));
  const saveBlocked = !filled
    ? 'Đang tải dàn chuyền…'
    : !dirty && !outdatedCount
      ? 'Chưa có thay đổi nào'
      : overQty
        ? `Tổng số lượng dàn chuyền vượt SL kế hoạch ${fmtNum(planQty)}`
        : incomplete
          ? 'Mỗi dòng cần đủ chuyền, số lượng, năng suất và ngày bắt đầu vào chuyền'
          : null;

  // Thanh xem trước: dòng đang sửa thay cho thanh đã lưu của kế hoạch này. Chỉ tính lại khi một trường làm đổi thanh đổi
  const previewRows = useStableByKey(rows.filter(drawn), rows.filter(drawn).map(barSignature).join(';'));
  const bars = useMemo(() => {
    // Chưa điền xong các dòng thì vẫn vẽ thanh đã lưu của kế hoạch này
    const saved = (board.data?.bars ?? []).filter((b) => !filled || b.planId !== planId);
    const preview: (BoardBar & { preview?: boolean })[] = previewRows
      .map((r) => ({
        id: r.id ?? -r.key,
        planId,
        planNo: plan?.planNo ?? '',
        lineCode: r.lineCode,
        startDate: r.startDate ?? '',
        endDate: calc(r).dates!.endDate,
        qty: Number(r.qty),
        avgOutput: Number(r.avgOutput),
        customerName: plan?.customerName ?? '',
        styleCode: plan?.styleCode ?? '',
        poBuyDate: plan?.poBuyDate ?? '',
        shipDate: plan?.shipDate ?? '',
        statusCode: r.statusCode ?? 'PLANNED',
        preview: dirty,
      }));
    return [...saved, ...preview];
  }, [board.data, previewRows, planId, plan, dirty, filled, calc]);

  const save = useMutation({
    mutationFn: () =>
      api<LinePlanDetail>(`/order/line-plans/${planId}/lines`, {
        method: 'PUT',
        body: {
          lines: rows.filter(mine).map((r) => ({
            id: r.id,
            lineCode: r.lineCode,
            qty: Number(r.qty),
            avgOutput: Number(r.avgOutput),
            startDate: r.startDate,
          })),
        },
      }),
    onSuccess: () => {
      toastOk(`Đã lưu dàn chuyền ${plan ? `${plan.styleCode} (${plan.planNo})` : ''}. Dòng mới đã có đề xuất phân màu cỡ theo tỷ lệ.`, 'Đã lưu');
      onClose();
      onSaved();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });

  // Lưới nhập kiểu bảng tính: dán nhiều dòng (chuyền, số lượng, năng suất, ngày) từ Excel; dòng ngoài phạm vi sửa tô xám,
  // dòng đang may hoặc đã xong không đổi chuyền, không xóa được
  const sheetCols = useMemo<SheetColumn<EditLine>[]>(() => {
    // Danh sách mở ra là cây bộ phận cha › chuyền thu gọn được; ô đóng chỉ hiện tên chuyền (trùng tên thì kèm mã)
    const options = lineOptions(lines, lineNameLabel(lines));
    const grouped = options.some((o) => o.groups);
    // Dòng đã xếp vào chuyền nay đã ngừng dùng: vẫn hiện chuyền đó (không chọn lại được cho dòng khác) để ô không bị trống.
    // Chuyền mồ côi (mã không còn là bộ phận nào) đã có nhãn "(chuyền cũ)" từ máy chủ, không thêm "(đã ngừng)"
    const optionsFor = (r: EditLine) =>
      !r.lineCode || options.some((o) => o.value === r.lineCode)
        ? options
        : [...options, { value: r.lineCode, label: `${r.lineName ?? r.lineCode}${linesLoaded && !r.lineName?.endsWith(ORPHAN_LINE_SUFFIX) ? ' (đã ngừng)' : ''}`, groups: grouped ? ['Đã ngừng dùng'] : undefined }];
    const locked = (r: EditLine) => !mine(r);
    return [
      sheetSelect<EditLine>(
        'Chuyền',
        { options: optionsFor, get: (r) => r.lineCode || null, set: (r, v) => ({ ...r, lineCode: v ?? '' }), unit: 'chuyền', nothingFoundMessage: LINE_NOT_FOUND, emptyMessage: LINE_EMPTY },
        { required: true, minWidth: 160, grow: 2, disabled: (r) => locked(r) || started(r) },
      ),
      sheetNumber<EditLine>('qty', 'Số lượng', { required: true, disabled: locked }),
      sheetNumber<EditLine>('avgOutput', 'Năng suất TB', { required: true, disabled: locked }),
      sheetDate<EditLine>('startDate', 'Bắt đầu vào chuyền', { required: true, disabled: locked }),
      sheetReadonly<EditLine>('Số ngày SX', (r) => calc(r).productionDays ?? '–', (r) => calc(r).productionDays ?? null, { minWidth: 90, align: 'right' }),
      sheetReadonly<EditLine>('Số ngày nghỉ', (r) => calc(r).dates?.offDays ?? '–', (r) => calc(r).dates?.offDays ?? null, { minWidth: 100, align: 'right' }),
      // Ngày tự tính theo lịch ĐVCS, không cho sửa tay (người dùng chốt Q3 phase 5.12)
      ...DATE_COLUMNS.map(([key, title]) =>
        sheetReadonly<EditLine>(title, (r) => fmtDate(calc(r).dates?.[key] ?? null) || '–', (r) => fmtDate(calc(r).dates?.[key] ?? null) || null, { minWidth: 130 }),
      ),
      sheetReadonly<EditLine>('Phân màu cỡ', (r) => <StatusBadge map={LINE_STATUS} code={r.statusCode ?? 'PLANNED'} />, lineStatusLabel, { minWidth: 120 }),
    ];
  }, [lines, linesLoaded, calc]);
  // Dòng mới nhận phần số lượng còn lại; thêm nhiều dòng một lần (hoặc dán quá cuối lưới) thì chỉ dòng đầu nhận, các dòng sau 0.
  // Năng suất, ngày vào chuyền để trống (ô vàng nhắc nhập): điền sẵn thì trông như số người dùng đã nhập
  let handedOut = 0;
  const newLine = (): EditLine => {
    const qty = planQty === null ? 0 : Math.max(0, planQty - total - handedOut);
    handedOut += qty;
    return {
      key: nextKey++,
      lineCode: '',
      qty,
      avgOutput: null,
      startDate: null,
      offDays: 0,
      outStartDate: null,
      outEndDate: null,
      warehouseStartDate: null,
      warehouseEndDate: null,
    };
  };

  const info = (label: string, value: ReactNode) => (
    <Group gap={6} wrap="nowrap" justify="space-between" className="info-row">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text size="sm" fw={600} ta="right">{value}</Text>
    </Group>
  );
  const cm = plan?.cmPrice;

  return (
    // Esc trong lưới là thoát sửa ô, bỏ vùng chọn: không để nó đóng popup
    <Modal opened onClose={close} closeOnEscape={!canEdit} fullScreen title={plan ? `Chi tiết dàn chuyền: ${plan.styleCode} (${plan.planNo})` : 'Chi tiết dàn chuyền'} classNames={{ body: 'schedule-body' }}>
      <div className="schedule-top">
        <div className="schedule-info">
          <Text fw={700} size="sm" mb={6}>Thông tin chung</Text>
          {info('Khách hàng', plan?.customerName ?? '')}
          {info('Mã hàng', plan?.styleCode ?? '')}
          {info('PO/Buy date', plan?.poBuyDate ?? '')}
          {policy.visible('cmPrice') && info('Giá CM (USD)', cm === MASK ? <Masked /> : fmtMoney(cm as number | null))}
          {info('SL kế hoạch', fmtNum(plan?.planQty))}
          {info('SL dàn chuyền', <span style={{ color: overQty ? 'var(--error)' : undefined }}>{fmtNum(total)}</span>)}
          {others > 0 && info('Trong đó bạn không sửa được', fmtNum(others))}
          {info('Ngày đồng bộ', fmtDate(plan?.syncedAt ?? null))}
          {info('Ngày xuất hàng', fmtDate(plan?.shipDate ?? null))}
        </div>
        <div className="schedule-editor">
          <Group justify="space-between" mb={6} gap="xs">
            <Text fw={700} size="sm">Bảng nhập liệu dàn chuyền</Text>
            <Group gap="xs">
              {!canEdit && <Text size="xs" c="dimmed">Bạn chỉ được xem dàn chuyền.</Text>}
              {plan?.calendar && <ScheduleRules calendar={plan.calendar} />}
            </Group>
          </Group>
          {canEdit && outdatedCount > 0 && (
            <Alert color="blue" variant="light" icon={<IconInfoCircle size={16} />} py={4} mb={6}>
              {fmtNum(outdatedCount)} dòng có ngày đã lưu khác cách tính theo lịch làm việc hiện tại (lịch vừa đổi, hoặc ngày nhập tay trước đây). Bấm Lưu thay đổi để tính lại.
            </Alert>
          )}
          {overQty && (
            <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />} py={4} mb={6}>
              Tổng số lượng dàn chuyền {fmtNum(total)}{others > 0 ? ` (gồm ${fmtNum(others)} ở chuyền bạn không sửa được)` : ''} vượt số lượng kế hoạch {fmtNum(planQty)}.
            </Alert>
          )}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {canEdit && filled ? (
              <SheetGrid
                label="Bảng nhập liệu dàn chuyền"
                value={rows}
                onChange={(next) => {
                  setRows(next);
                  setDirty(true);
                }}
                columns={sheetCols}
                rowKey={(r) => r.key}
                createRow={newLine}
                // Bản sao là dòng mới của mình; chép từ dòng ngoài phạm vi sửa thì bỏ chuyền (chuyền đó mình không xếp được)
                duplicateRow={(r) => ({ ...r, key: nextKey++, id: undefined, statusCode: undefined, editable: undefined, lineCode: mine(r) ? r.lineCode : '', lineName: mine(r) ? r.lineName : undefined })}
                canDeleteRow={(r) => mine(r) && !started(r)}
              />
            ) : (
              <DataGrid
                label="Bảng nhập liệu dàn chuyền"
                fill
                dense
                columns={SCHEDULE_VIEW_COLS}
                rows={rows}
                rowKey={(r) => r.key}
                loading={!filled && !detail.error}
                error={filled ? null : loadError(detail.error, 'Không tải được dàn chuyền của kế hoạch.')}
                onRetry={() => void detail.refetch()}
                empty="Kế hoạch này chưa được xếp chuyền."
              />
            )}
          </div>
          <Group justify="flex-end" gap="xs" mt={8}>
            {canEdit ? (
              <>
                {incomplete && rows.length > 0 && <Text size="xs" c="dimmed" mr="auto">Mỗi dòng cần chuyền, số lượng, năng suất và ngày bắt đầu vào chuyền.</Text>}
                <Button variant="default" onClick={close}>Hủy</Button>
                <ActionButton loading={save.isPending} blockedReason={saveBlocked} onClick={() => save.mutate()}>
                  Lưu thay đổi
                </ActionButton>
              </>
            ) : (
              <Button variant="default" onClick={onClose}>Đóng</Button>
            )}
          </Group>
        </div>
      </div>
      <div className="schedule-board">
        <Group justify="space-between" align="flex-end" mb={6} wrap="wrap">
          <Text fw={700} size="sm">Bảng dàn chuyền {dirty && <Text span size="xs" c="dimmed" fw={400}>(thanh gạch chéo là dòng đang sửa, chưa lưu)</Text>}</Text>
          <BoardFilters value={boardFilter} onChange={setBoardFilter} />
        </Group>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <BoardArea filter={boardFilter} board={board} bars={bars} focusPlanId={planId} />
        </div>
      </div>
    </Modal>
  );
}
