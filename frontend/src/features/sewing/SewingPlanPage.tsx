import { Alert, Badge, Button, Center, Group, Loader, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconEdit, IconLock, IconLockOpen, IconRowInsertBottom, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName } from '../../components/BranchName';
import { DateField } from '../../components/DateField';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetNumber, sheetReadonly, sheetTime, type SheetColumn } from '../../components/SheetGrid';
import { TreeSelect } from '../../components/TreeSelect';
import { WorkPage } from '../../components/WorkPage';
import { api, ApiError } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum, qs } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { LINE_EMPTY, LINE_NOT_FOUND } from '../../lib/lines';
import { toastError, toastOk, toastWarn } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { loadError, useLines } from '../order/common';
import type { SewingPlanDay, SewingPlanLine, SewingPlanOption } from './api';
import {
  ALL_DEPT,
  badQty,
  badTime,
  changes,
  deliveredOf,
  deptOptions,
  matchStyle,
  overPlan,
  remainOf,
  revenueOf,
  rowsOf,
  saveIssue,
  settle,
  timesOutOfOrder,
  totalRow,
  totalsOf,
  type PlanRow,
} from './sewingPlanRules';

const RESOURCE = 'sewing.plan';
const NAMES: Record<string, string> = {
  lineCode: 'Tổ SX',
  styleCode: 'Mã hàng',
  poBuyDate: 'PO/buydate',
  cmPrice: 'Giá CM',
  startDate: 'Ngày vào chuyền',
  endDate: 'Ngày kết thúc',
  planQty: 'Tổng kế hoạch',
  deliveredQty: 'Đã giao',
  remainQty: 'Còn lại',
  linemapQty: 'Kế hoạch theo linemap',
  dayQty: 'Kế hoạch ngày xưởng giao',
  planRevenue: 'Doanh số kế hoạch',
  startTime: 'Từ giờ',
  endTime: 'Đến giờ',
};

/** Hôm nay theo giờ Việt Nam, khi máy chủ chưa trả `today` */
const vnToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const qtyText = (v: unknown) => (v === MASK ? MASK : typeof v === 'number' ? fmtNum(v) : '');
const moneyText = (v: unknown) => (v === MASK ? MASK : typeof v === 'number' ? `$ ${fmtMoney(v)}` : '');
const copyNum = (v: unknown) => (typeof v === 'number' ? v : null);
const textOf = (v: unknown) => (typeof v === 'string' ? v : '');

/**
 * Màn "Kế hoạch may" (phase 5.16) theo ảnh docs/screens/ke-hoach-may.png: chọn Đơn vị phòng ban, Ngày; lưới các dòng dàn chuyền đang
 * chạy ở ngày đó (Xếp chuyền), nhập Kế hoạch theo linemap, Kế hoạch ngày xưởng giao, giờ; Cập nhật lưu, Chốt khóa ngày, Hủy chốt mở lại.
 */
export default function SewingPlanPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const aggregate = useSession((s) => !!s.branch?.isAggregate);
  const lines = useLines();
  const branchName = useBranchName();
  const deptChoices = useMemo(() => deptOptions(lines, (c) => branchName(c)), [lines, branchName]);
  const [params, setParams] = useSearchParams();
  const date = params.get('date') || vnToday();
  const dept = params.get('dept') || '';
  const [extra, setExtra] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const view = `${date}|${dept}`;
  const key = ['sewing-plan', date, dept, extra.join(',')];
  const day = useQuery({
    queryKey: key,
    queryFn: () => api<SewingPlanDay>(`/sewing/plan${qs({ date, dept: dept || undefined, extra: extra.length ? extra.join(',') : undefined })}`),
  });
  const data = day.data && day.data.date === date ? day.data : null;

  // Lưới nhập: số đang gõ giữ qua các lần tải lại của cùng ngày, cùng đơn vị (thêm dòng, sau lỗi lưu); đổi ngày, đơn vị thì bỏ
  const [rows, setRows] = useState<PlanRow[]>([]);
  const loadedView = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const same = loadedView.current === view;
    loadedView.current = view;
    setRows((prev) => rowsOf(data.items, same ? new Map(prev.filter((r) => changesOf(r)).map((r) => [r.key, r])) : undefined));
    // Dữ liệu đổi theo ngày, đơn vị: một lần mỗi lần tải
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const dirty = changes(rows).length > 0;
  useLeaveGuard(dirty);
  const today = data?.today ?? vnToday();
  const editableDay = !!data?.editableDay;
  const past = date < today;

  /** Đổi ngày, đơn vị: hỏi lại khi còn ô chưa lưu (số đã gõ chỉ thuộc ngày đang xem) */
  const go = (patch: { date?: string; dept?: string }) =>
    confirmDiscard(
      dirty,
      () => {
        const next = new URLSearchParams(params);
        if (patch.date !== undefined) next.set('date', patch.date);
        if (patch.dept !== undefined) {
          if (patch.dept) next.set('dept', patch.dept);
          else next.delete('dept');
        }
        setExtra([]);
        setParams(next, { replace: true });
      },
      'Số kế hoạch bạn vừa nhập cho ngày, đơn vị đang xem chưa cập nhật sẽ mất.',
    );

  const refresh = () => qc.invalidateQueries({ queryKey: ['sewing-plan'] });
  // Khóa `line` (không phải mã cột lineCode): chính sách cột của Tổ SX không chặn lần ghi (review 5.16 M1)
  // Tổ SX bị Che thì mã chuyền là "***": không gửi phiên bản (máy chủ không kiểm được người khác vừa ghi, giới hạn đã ghi ở tài liệu)
  const versions = (data?.lines ?? []).filter((l) => l.lineCode !== MASK).map((l) => ({ line: l.lineCode, version: l.version }));
  const canCreate = useCan(`${RESOURCE}:create`);

  const save = useMutation({
    mutationFn: (items: ReturnType<typeof changes>) => api<{ saved: number }>('/sewing/plan', { method: 'PUT', body: { date, items, versions } }),
    onSuccess: async (res, items) => {
      toastOk(`Đã cập nhật ${res.saved} dòng của ngày ${fmtDate(date)}.`, 'Đã cập nhật');
      // Đánh dấu đã lưu đúng số đã gửi; ô gõ thêm trong lúc đang lưu vẫn là chưa lưu (review 5.16 L2)
      const sent = new Map(items.map((i) => [String(i.lineId), i]));
      setRows((prev) =>
        prev.map((r) => {
          const i = sent.get(r.key);
          if (!i) return r;
          const saved = { ...r.saved };
          if (i.linemapQty !== undefined) saved.linemapQty = i.linemapQty;
          if (i.dayQty !== undefined) saved.dayQty = i.dayQty;
          if (i.startTime !== undefined) saved.startTime = i.startTime;
          if (i.endTime !== undefined) saved.endTime = i.endTime;
          return { ...r, saved };
        }),
      );
      await refresh();
    },
    onError: (e) => {
      toastError(e, 'Chưa cập nhật được');
      // Dòng không còn ở Xếp chuyền: bỏ số đã gõ của các dòng đó, giữ phần còn lại để cập nhật tiếp
      const gone = e instanceof ApiError && e.status === 404 ? ((e.details as { ids?: number[] } | null)?.ids ?? []) : [];
      if (gone.length) setRows((prev) => prev.map((r) => (r.item && gone.includes(r.item.lineId) ? { ...r, linemapQty: r.saved.linemapQty, dayQty: r.saved.dayQty, startTime: r.saved.startTime, endTime: r.saved.endTime } : r)));
      // Người khác vừa ghi, Xếp chuyền vừa đổi: tải lại, giữ số đang gõ
      if (e instanceof ApiError && [404, 409, 422].includes(e.status)) void refresh();
    },
  });

  const lockAct = useMutation({
    mutationFn: (lock: boolean) => api<{ locked?: number; unlocked?: number }>(`/sewing/plan/${lock ? 'lock' : 'unlock'}`, { method: 'POST', body: { date, dept: dept || undefined, versions } }),
    onSuccess: async (res, lock) => {
      toastOk(lock ? `Đã chốt kế hoạch may ngày ${fmtDate(date)} của ${res.locked} chuyền.` : `Đã hủy chốt ${res.unlocked} chuyền, sửa lại được.`, lock ? 'Đã chốt' : 'Đã hủy chốt');
      await refresh();
    },
    onError: async (e) => {
      toastError(e, 'Chưa thực hiện được');
      await refresh();
    },
  });

  const shownLines = data?.lines ?? [];
  const lockable = shownLines.filter((l) => l.canEdit && !l.locked);
  const unlockable = shownLines.filter((l) => l.canEdit && l.locked);
  const deptLabel = dept ? (deptChoices.find((o) => o.value === dept)?.label ?? dept) : 'mọi chuyền';
  const dayReason = !data ? 'Đang tải…' : aggregate ? 'Đang xem tổng hợp, chỉ đọc' : past ? 'Ngày đã qua: không điều chỉnh được' : !editableDay ? 'Bạn chỉ được xem Kế hoạch may' : null;
  const lockReason =
    dayReason ??
    (dirty
      ? 'Cập nhật hoặc bỏ thay đổi trước khi chốt'
      : !shownLines.length
        ? 'Không có dòng nào để chốt'
        : !lockable.length
          ? 'Mọi chuyền đang hiện đã chốt'
          : !canCreate && lockable.some((l) => l.version === '0')
            ? 'Có chuyền chưa lập kế hoạch trong ngày: chốt lần đầu cần quyền Thêm ở Kế hoạch may'
            : null);
  const unlockReason = dayReason ?? (!unlockable.length ? 'Chưa có chuyền nào được chốt' : null);
  const askLock = () =>
    confirmAction({
      title: `Chốt kế hoạch may ngày ${fmtDate(date)}?`,
      consequence: `Khóa kế hoạch của ${lockable.length} chuyền đang hiện (${deptLabel}). Sau khi chốt không sửa được tới khi Hủy chốt; qua ngày thì không hủy chốt được nữa.`,
      confirmLabel: 'Chốt',
      danger: false,
      onConfirm: () => lockAct.mutate(true),
    });
  const askUnlock = () =>
    confirmAction({
      title: `Hủy chốt kế hoạch may ngày ${fmtDate(date)}?`,
      consequence: `Mở lại ${unlockable.length} chuyền đã chốt (${deptLabel}) để điều chỉnh. Nhớ chốt lại sau khi sửa.`,
      confirmLabel: 'Hủy chốt',
      onConfirm: () => lockAct.mutate(false),
    });

  const shown = useMemo(() => rows.filter((r) => matchStyle(r, search)), [rows, search]);
  const totals = useMemo(() => totalsOf(shown), [shown]);
  // Dòng Tổng: hai cột nhập hiện tổng ngay trong ô (ô khóa); cột Che thì để trống
  const gridRows = useMemo(
    () => (shown.length ? [...shown, { ...totalRow(), linemapQty: typeof totals.linemapQty === 'number' ? totals.linemapQty : null, dayQty: typeof totals.dayQty === 'number' ? totals.dayQty : null }] : shown),
    [shown, totals],
  );
  const needCreate = !canCreate && rows.some((r) => r.item?.firstOfDay && changesOf(r));
  const issue = dayReason ?? (needCreate ? 'Có chuyền chưa lập kế hoạch trong ngày: lập lần đầu cần quyền Thêm ở Kế hoạch may' : saveIssue(rows));
  const over = rows.filter(overPlan).length;

  return (
    <WorkPage
      title="Kế hoạch may"
      subtitle={
        aggregate
          ? 'Kế hoạch theo ngày của các chuyền mọi đơn vị cơ sở bạn được xem, chỉ đọc'
          : 'Kế hoạch sản xuất theo ngày cho từng chuyền, mã hàng, PO lấy từ Xếp chuyền. Cập nhật để lưu, Chốt khi kế hoạch của ngày đã đúng.'
      }
      actions={<PolicyHint policy={policy} names={NAMES} />}
      filters={
        <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap" className="filter-bar">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <TreeSelect
              label="Đơn vị phòng ban"
              placeholder="Chọn đơn vị"
              options={deptChoices}
              value={dept || ALL_DEPT}
              onChange={(v) => v !== (dept || ALL_DEPT) && go({ dept: !v || v === ALL_DEPT ? '' : v })}
              unit="đơn vị"
              nothingFoundMessage={LINE_NOT_FOUND}
              emptyMessage={LINE_EMPTY}
              w={260}
            />
            <DateField label="Ngày" value={date} onChange={(v) => v && v !== date && go({ date: v })} clearable={false} required w={150} />
            <DayStatus lines={shownLines} past={past} loading={!data} />
          </Group>
          {!aggregate && (
            <Group gap="xs">
              <ActionButton leftSection={<IconLock size={16} />} loading={lockAct.isPending && lockAct.variables === true} blockedReason={lockReason} onClick={askLock}>
                Chốt
              </ActionButton>
              <ActionButton variant="default" color="red" leftSection={<IconLockOpen size={16} />} loading={lockAct.isPending && lockAct.variables === false} blockedReason={unlockReason} onClick={askUnlock}>
                Hủy chốt
              </ActionButton>
            </Group>
          )}
        </Group>
      }
    >
      <div className="plan-pane">
        <Group justify="space-between" align="flex-end" gap="sm" wrap="wrap">
          <TextInput
            label="Danh sách mã hàng"
            placeholder="Lọc theo mã hàng, tên sản phẩm"
            leftSection={<IconSearch size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={320}
            maw="100%"
          />
          {!aggregate && editableDay && (
            <Button variant="light" leftSection={<IconRowInsertBottom size={16} />} onClick={() => setAdding(true)}>
              Thêm dòng
            </Button>
          )}
        </Group>
        <div className="plan-sheet">
          {data ? (
            <PlanSheet key={view} rows={gridRows} totals={totals} policy={policy} onChange={(next) => setRows((prev) => mergeInto(prev, settle(next, prev)))} empty={search ? 'Không có mã hàng nào khớp ô lọc.' : 'Không có dòng dàn chuyền nào chạy trong ngày này ở đơn vị đã chọn. Đổi ngày, đơn vị hoặc bấm Thêm dòng.'} />
          ) : (
            <Center h="100%">
              {day.error ? (
                <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                  <Stack gap={6} align="flex-start">
                    {loadError(day.error, 'Không tải được kế hoạch may.')}
                    <Button size="xs" variant="default" onClick={() => void day.refetch()}>
                      Thử lại
                    </Button>
                  </Stack>
                </Alert>
              ) : (
                <Loader size="sm" aria-label="Đang tải kế hoạch may" />
              )}
            </Center>
          )}
        </div>
        {over > 0 && (
          <Text size="sm" c="red">
            {over} dòng giao vượt Tổng kế hoạch (ô tô đỏ). Muốn giao thêm, tăng Số lượng của dòng ở Xếp chuyền trước.
          </Text>
        )}
        {!aggregate && (
          <Group gap="xs">
            <ActionButton leftSection={<IconEdit size={16} />} loading={save.isPending} blockedReason={issue} onClick={() => save.mutate(changes(rows))}>
              Cập nhật
            </ActionButton>
            {dirty && (
              <Button variant="default" onClick={() => confirmDiscard(true, () => setRows((prev) => prev.map((r) => ({ ...r, linemapQty: r.saved.linemapQty, dayQty: r.saved.dayQty, startTime: r.saved.startTime, endTime: r.saved.endTime }))))}>
                Bỏ thay đổi
              </Button>
            )}
          </Group>
        )}
      </div>
      {adding && (
        <AddLineDialog
          dept={dept}
          have={new Set(rows.map((r) => r.item?.lineId ?? 0))}
          lockedLines={new Set(shownLines.filter((l) => l.locked).map((l) => l.lineCode))}
          onClose={() => setAdding(false)}
          onAdd={(lineId) => {
            setAdding(false);
            setExtra((prev) => [...new Set([...prev, lineId])]);
          }}
        />
      )}
    </WorkPage>
  );
}

/** Ghép các dòng vừa sửa (lưới có thể đang lọc theo mã hàng) vào danh sách đầy đủ, giữ thứ tự */
const mergeInto = (all: PlanRow[], edited: PlanRow[]) => {
  const byKey = new Map(edited.map((r) => [r.key, r]));
  return all.map((r) => byKey.get(r.key) ?? r);
};

const changesOf = (r: PlanRow) => r.linemapQty !== r.saved.linemapQty || r.dayQty !== r.saved.dayQty || (r.startTime ?? r.saved.startTime) !== r.saved.startTime || (r.endTime ?? r.saved.endTime) !== r.saved.endTime;

/** Trạng thái chốt của ngày: dải duy nhất có màu đậm trên màn, vì chốt là việc chính của màn */
function DayStatus({ lines, past, loading }: { lines: SewingPlanLine[]; past: boolean; loading: boolean }) {
  if (loading) return null;
  const locked = lines.filter((l) => l.locked);
  const lockers = [...new Set(locked.map((l) => l.lockerName).filter(Boolean))];
  const last = locked.map((l) => l.lockedAt).filter(Boolean).sort().pop() ?? null;
  const all = lines.length > 0 && locked.length === lines.length;
  return (
    <div className="plan-status" data-state={all ? 'locked' : locked.length ? 'partial' : 'open'}>
      {all ? (
        <Badge color="teal" variant="filled" leftSection={<IconLock size={12} />}>
          Đã chốt
        </Badge>
      ) : locked.length ? (
        <Badge color="yellow" variant="filled" leftSection={<IconLock size={12} />}>
          Đã chốt {locked.length}/{lines.length} chuyền
        </Badge>
      ) : (
        <Badge color="gray" variant="light">
          Chưa chốt
        </Badge>
      )}
      <Text size="xs" c="dimmed">
        {locked.length > 0 && lockers.length === 1 ? `bởi ${lockers[0]}, lúc ${fmtDateTime(last)}` : locked.length > 0 ? `lần chốt gần nhất ${fmtDateTime(last)}` : null}
        {past ? `${locked.length ? '. ' : ''}Ngày đã qua, chỉ xem` : null}
      </Text>
    </div>
  );
}

/**
 * Lưới theo ảnh mẫu: Tổ SX, Mã hàng, PO/buydate, Giá CM, Ngày vào chuyền, Ngày kết thúc, Tổng kế hoạch, Đã giao, Còn lại, Kế hoạch theo
 * linemap, Kế hoạch ngày xưởng giao, Doanh số kế hoạch, Từ giờ, Đến giờ; dòng Tổng (n) nền xanh cuối lưới. Thư viện chỉ đọc cột ở lần vẽ
 * đầu: quyền sửa, số tổng đọc qua ref; cột bị Ẩn thì không có (lưới dựng lại khi chính sách cột đổi).
 */
function PlanSheet({ rows, totals, policy, onChange, empty }: { rows: PlanRow[]; totals: ReturnType<typeof totalsOf>; policy: FieldPolicy; onChange: (rows: PlanRow[]) => void; empty: string }) {
  const totalsRef = useRef(totals);
  totalsRef.current = totals;
  const policyRef = useRef(policy);
  policyRef.current = policy;
  const visibleKey = Object.keys(NAMES).filter((f) => policy.visible(f)).join(',');
  const columns = useMemo<SheetColumn<PlanRow>[]>(() => {
    const visible = new Set(visibleKey.split(','));
    const t = () => totalsRef.current;
    const can = (r: PlanRow, field: string) => !r.total && !!r.item?.canEdit && policyRef.current.editable(field);
    const cls = (r: PlanRow, extra?: string | false) => [r.total ? 'cut-total' : r.item?.sourceGone ? 'cut-removed' : undefined, extra].filter(Boolean).join(' ') || undefined;
    const ro = (field: string, title: string, render: (r: PlanRow) => unknown, o: { minWidth: number; grow?: number; money?: boolean; text?: boolean; date?: boolean; error?: (r: PlanRow) => boolean; total?: (x: ReturnType<typeof totalsOf>) => unknown }) =>
      visible.has(field)
        ? [
            sheetReadonly<PlanRow>(
              title,
              (r) => {
                const v = r.total ? (o.total ? o.total(t()) : '') : render(r);
                return o.text ? textOf(v) : o.date ? (v === MASK ? MASK : fmtDate(textOf(v))) : o.money ? moneyText(v) : qtyText(v);
              },
              (r) => {
                const v = r.total ? (o.total ? o.total(t()) : null) : render(r);
                return o.text || o.date ? textOf(v) : copyNum(v);
              },
              { minWidth: o.minWidth, grow: o.grow, align: o.text || o.date ? undefined : 'right', className: (r) => cls(r, !r.total && !!o.error?.(r) && 'sheet-error') },
            ),
          ]
        : [];
    const input = (col: SheetColumn<PlanRow>, field: string) => (visible.has(field) ? [col] : []);
    return [
      ...(visible.has('lineCode')
        ? [
            sheetReadonly<PlanRow>(
              'Tổ SX',
              (r) => (r.total ? `Tổng (${t().count})` : <span title={textOf(r.item?.lineCode)}>{r.item?.lineName ?? textOf(r.item?.lineCode)}</span>),
              (r) => (r.total ? `Tổng (${t().count})` : (r.item?.lineName ?? textOf(r.item?.lineCode))),
              { minWidth: 84, className: (r) => cls(r) },
            ),
          ]
        : []),
      ...ro('styleCode', 'Mã hàng', (r) => r.item?.styleCode, { minWidth: 190, grow: 2, text: true }),
      ...ro('poBuyDate', 'PO/buydate', (r) => r.item?.poBuyDate, { minWidth: 96, text: true }),
      ...ro('cmPrice', 'Giá CM', (r) => r.item?.cmPrice, { minWidth: 76, money: true }),
      ...ro('startDate', 'Ngày vào chuyền', (r) => r.item?.startDate, { minWidth: 90, date: true }),
      ...ro('endDate', 'Ngày kết thúc', (r) => r.item?.endDate, { minWidth: 90, date: true }),
      ...ro('planQty', 'Tổng kế hoạch', (r) => r.item?.planQty, { minWidth: 82, total: (x) => x.planQty }),
      ...ro('deliveredQty', 'Đã giao', deliveredOf, { minWidth: 76, total: (x) => x.deliveredQty, error: overPlan }),
      ...ro('remainQty', 'Còn lại', remainOf, { minWidth: 76, total: (x) => x.remainQty, error: (r) => overPlan(r) || (typeof remainOf(r) === 'number' && (remainOf(r) as number) < 0) }),
      ...input(
        sheetNumber<PlanRow>('linemapQty', 'Kế hoạch theo linemap', {
          minWidth: 104,
          disabled: (r) => !can(r, 'linemapQty'),
          error: (r) => badQty(r.linemapQty),
          className: (r) => cls(r),
        }),
        'linemapQty',
      ),
      ...input(
        sheetNumber<PlanRow>('dayQty', 'Kế hoạch ngày xưởng giao', {
          minWidth: 112,
          disabled: (r) => !can(r, 'dayQty'),
          error: (r) => badQty(r.dayQty) || overPlan(r),
          className: (r) => cls(r),
        }),
        'dayQty',
      ),
      ...ro('planRevenue', 'Doanh số kế hoạch', revenueOf, { minWidth: 92, money: true, total: (x) => x.planRevenue }),
      ...input(sheetTime<PlanRow>('startTime', 'Từ giờ', { minWidth: 70, disabled: (r) => !can(r, 'startTime'), error: (r) => badTime(r.startTime) || timesOutOfOrder(r), className: (r) => cls(r) }), 'startTime'),
      ...input(sheetTime<PlanRow>('endTime', 'Đến giờ', { minWidth: 70, disabled: (r) => !can(r, 'endTime'), error: (r) => badTime(r.endTime) || timesOutOfOrder(r), className: (r) => cls(r) }), 'endTime'),
    ];
  }, [visibleKey]);
  // Ô của dòng Tổng đọc số qua ref; dòng Tổng là đối tượng mới mỗi lần lưới đổi nên ô của nó vẽ lại
  return (
    <SheetGrid
      key={visibleKey}
      label="Kế hoạch may theo chuyền, mã hàng"
      value={rows}
      onChange={onChange}
      columns={columns}
      rowKey={(r) => r.key}
      rowLabel={(r) => (r.total ? '-' : undefined)}
      empty={<span>{empty}</span>}
      hint="Nhập Kế hoạch theo linemap, Kế hoạch ngày xưởng giao và giờ cho ngày đang chọn. Đã giao cộng Kế hoạch ngày xưởng giao các ngày tới ngày đang chọn. Dán từ Excel: chọn ô đầu rồi Ctrl+V."
    />
  );
}

/** Thêm dòng: Chuyền (chỉ chuyền đã được xếp chuyền) → Mã hàng (theo chuyền) → PO/Buy date (theo mã hàng), trong các dòng dàn chuyền */
function AddLineDialog({ dept, have, lockedLines, onClose, onAdd }: { dept: string; have: Set<number>; lockedLines: Set<string>; onClose: () => void; onAdd: (lineId: number) => void }) {
  const mobile = useMobile();
  const options = useQuery({ queryKey: ['sewing-plan-options', dept], queryFn: () => api<SewingPlanOption[]>(`/sewing/plan/options${qs({ dept: dept || undefined })}`) });
  const all = options.data ?? [];
  const [line, setLine] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  // Chuyền đã chốt trong ngày: không thêm dòng được (Hủy chốt trước), review 5.16 H2
  const lineList = [...new Map(all.filter((o) => typeof o.lineCode === 'string').map((o) => [o.lineCode as string, o.lineName ?? (o.lineCode as string)])).entries()].map(([value, label]) => ({
    value,
    label: lockedLines.has(value) ? `${label} (đã chốt)` : label,
    disabled: lockedLines.has(value),
  }));
  const styleList = [...new Map(all.filter((o) => o.lineCode === line && typeof o.styleCode === 'string').map((o) => [o.styleCode as string, o.productName ? `${o.styleCode} (${o.productName})` : (o.styleCode as string)])).entries()].map(([value, label]) => ({ value, label }));
  const poList = all
    .filter((o) => o.lineCode === line && o.styleCode === style)
    .map((o) => ({
      value: String(o.lineId),
      label: `${textOf(o.poBuyDate) || 'Không có PO'}: vào chuyền ${fmtDate(textOf(o.startDate))}, ${qtyText(o.planQty)} sản phẩm${have.has(o.lineId) ? ' (đã có trong lưới)' : ''}`,
      disabled: have.has(o.lineId),
    }));
  const why = options.isFetching ? 'Đang tải dòng dàn chuyền…' : !line ? 'Chọn chuyền sản xuất' : !style ? 'Chọn mã hàng' : !pick ? 'Chọn PO/Buy date' : null;
  return (
    <Modal opened onClose={onClose} title="Thêm dòng vào kế hoạch may" size="md" fullScreen={mobile}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Chọn trong các dòng đã xếp ở Xếp chuyền, cho mã vào chuyền sớm hoặc trễ hơn ngày đã xếp.
        </Text>
        {options.error ? <Alert color="red" variant="light">{loadError(options.error, 'Không tải được dòng dàn chuyền.')}</Alert> : null}
        <Select
          label="Chuyền sản xuất"
          placeholder={options.isFetching ? 'Đang tải…' : 'Chọn chuyền'}
          data={lineList}
          value={line}
          onChange={(v) => {
            setLine(v);
            setStyle(null);
            setPick(null);
          }}
          searchable
          nothingFoundMessage={options.isFetching ? undefined : 'Đơn vị này chưa có chuyền nào được xếp chuyền'}
          data-autofocus
        />
        <Select label="Mã hàng" placeholder={line ? 'Chọn mã hàng' : 'Chọn chuyền trước'} data={styleList} value={style} onChange={(v) => { setStyle(v); setPick(null); }} disabled={!line} searchable />
        <Select label="PO/Buy date" placeholder={style ? 'Chọn PO/Buy date' : 'Chọn mã hàng trước'} data={poList} value={pick} onChange={setPick} disabled={!style} />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onClose}>
            Hủy
          </Button>
          <ActionButton
            leftSection={<IconRowInsertBottom size={16} />}
            blockedReason={why}
            onClick={() => {
              if (!pick) return;
              if (have.has(Number(pick))) toastWarn('Dòng này đã có trong lưới.', 'Đã có');
              else onAdd(Number(pick));
            }}
          >
            Thêm vào lưới
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  );
}
