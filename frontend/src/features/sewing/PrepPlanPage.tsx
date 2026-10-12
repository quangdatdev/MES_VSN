import { Alert, Button, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, VisuallyHidden } from '@mantine/core';
import { IconAlertTriangle, IconArrowBackUp, IconDownload, IconFilterOff, IconListDetails, IconRefresh, IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName } from '../../components/BranchName';
import { ColumnFilterButton, ColumnFilterNote } from '../../components/ColumnFilter';
import { DataGrid, Masked, type Column } from '../../components/DataGrid';
import { DateField } from '../../components/DateField';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetDate, sheetNumber, sheetReadonly, type HeadFilter, type SheetColumn } from '../../components/SheetGrid';
import { TreeSelect } from '../../components/TreeSelect';
import { WorkPage } from '../../components/WorkPage';
import { useAfterClose } from '../../lib/afterClose';
import { api, ApiError, download } from '../../lib/api';
import { useColumnFilters, valuesLoader, type LoadValues } from '../../lib/columnFilter';
import { confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { addDays, fmtDate, fmtDateTime, fmtNum, qs } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { lineOptions } from '../../lib/lines';
import { toastError, toastOk, toastWarn } from '../../lib/notify';
import type { LineInfo } from '../../lib/types';
import { useMobile } from '../../lib/useMobile';
import { pageOf, useClampPage, useUrlParams, type UrlPatch } from '../../lib/useUrlParams';
import { isoWeekOf, mondayOf, sundayOf } from '../../lib/weeks';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { PREP_STATUS, type PrepDetail, type PrepDoneSaved, type PrepPage, type PrepRow, type PrepStatus, type PrepStep } from './api';
import { PrepSummary, refreshPrepSummary } from './PrepSummary';
import { WeekStrip } from './WeekStrip';

const RESOURCE = 'order.prep';
/** 100 dòng mỗi trang, theo Chi nhánh → Tổ SX → Mã hàng như file mẫu */
const PAGE_SIZE = 100;
/** Ô ngày, ô tuần để trống có chủ ý thì ghi dấu này lên URL, phân biệt với chưa chọn (dùng mặc định) */
const ALL = 'all';
const PICK_ROW = 'Chọn một dòng trong bảng trước';
/** Máy chủ nhận tối đa 500 dòng, 5.000 ô mỗi lần lưu */
const MAX_SAVE_ROWS = 500;
const MAX_SAVE_CELLS = 5000;

const NAMES: Record<string, string> = {
  lineCode: 'Tổ SX',
  styleCode: 'Mã hàng',
  styleType: 'Loại mã',
  confirmedQty: 'Số lượng chốt UD',
  priorityFactor: 'HS Ưu đãi VC',
  startDate: 'Ngày vào chuyền',
  steps: 'Các bước chuẩn bị',
  statusCode: 'Trạng thái',
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Mặc định: từ đầu năm (thấy cả việc tồn) đến hết 3 tuần sau tuần này, như file mẫu */
const defaultFrom = (today: string) => `${today.slice(0, 4)}-01-01`;
const defaultTo = (today: string) => sundayOf(addDays(mondayOf(today), 21));
const fromUrl = (raw: string | null, fallback: string) => (raw === ALL ? '' : (raw ?? fallback));
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

interface Filter {
  startFrom: string;
  startTo: string;
  branch: string;
  line: string;
  style: string;
  styleType: string;
  status: string;
}

// Mảng rỗng dùng chung khi chưa có chuyền: mảng mới mỗi lần vẽ làm cột của hai lưới dựng lại liên tục
const NO_LINES: LineInfo[] = [];

function useLines() {
  const branch = useSession((s) => s.branch?.code);
  return useQuery({ queryKey: ['me', 'lines', branch], queryFn: () => api<LineInfo[]>('/me/lines'), staleTime: 60_000 }).data ?? NO_LINES;
}

/** Bộ lọc ghi lên URL: ô ngày để trống có chủ ý ghi dấu ALL (khác với chưa chọn) */
function filterToUrl(f: Partial<Filter>): UrlPatch {
  const out: UrlPatch = { ...f };
  if (f.startFrom !== undefined) out.startFrom = f.startFrom || ALL;
  if (f.startTo !== undefined) out.startTo = f.startTo || ALL;
  return out;
}

/** Cột xem được nguyên giá trị (không Ẩn, không Che) thì mới có ô lọc theo nó */
const readable = (policy: FieldPolicy, field: string) => policy.level(field) !== 'HIDDEN' && policy.level(field) !== 'MASKED';

const stepOf = (r: PrepRow, stepId: number) => (Array.isArray(r.steps) ? r.steps.find((v) => v.stepId === stepId) : undefined);
const savedDone = (r: PrepRow, stepId: number) => stepOf(r, stepId)?.doneDate ?? null;

/**
 * Trạng thái vào chuyền theo các ngày TH đang hiện (kể cả ô vừa nhập chưa lưu), cùng quy tắc với máy chủ: chưa đến ngày
 * vào chuyền thì Chưa đến ngày V/C; đã đến ngày thì đủ TH là Đủ điều kiện V/C, thiếu là Chưa đủ đk V/C.
 */
export function liveStatus(startDate: string, done: (string | null)[], today: string): PrepStatus {
  if (startDate > today) return 'NOT_DUE';
  return done.every(Boolean) ? 'READY' : 'NOT_READY';
}

/** Một ô TH vừa nhập chưa lưu: `previous` là ngày lúc bắt đầu sửa, để máy chủ biết người khác có sửa chen không */
export interface DraftCell {
  value: string | null;
  previous: string | null;
  label: string;
}
export type Draft = Map<string, DraftCell>;
export const cellKey = (rowId: number, stepId: number) => `${rowId}:${stepId}`;

/**
 * Áp các ô vừa đổi trên lưới vào nháp: ô bằng ngày đã lưu thì bỏ khỏi nháp; ô mới đổi nhớ ngày lúc bắt đầu sửa.
 * `inflight`: các ô đang gửi lưu. Sửa ô đó về đúng ngày đã lưu cũ trong lúc chờ thì vẫn giữ trong nháp, vì lưu xong ô sẽ
 * mang ngày vừa gửi chứ không phải ngày người dùng chọn sau cùng. Không ô nào đổi thì trả lại đúng nháp cũ (màn không vẽ lại).
 */
export function withEdits(prev: Draft, edits: { key: string; value: string | null; saved: string | null; label: string }[], inflight?: Draft | null): Draft {
  let next: Draft | null = null;
  for (const e of edits) {
    const sending = inflight?.get(e.key);
    const cur = prev.get(e.key);
    if (e.value === e.saved && !(sending && sending.value !== e.value)) {
      if (!cur) continue;
      next ??= new Map(prev);
      next.delete(e.key);
    } else if (!cur || cur.value !== e.value || cur.label !== e.label) {
      next ??= new Map(prev);
      next.set(e.key, { value: e.value, previous: cur ? cur.previous : e.saved, label: e.label });
    }
  }
  return next ?? prev;
}

/**
 * Dữ liệu mới tải về: bỏ khỏi nháp các ô đã bằng ngày đã lưu (vừa lưu nhưng lúc đó chưa tải lại được, người khác nhập
 * trùng ngày), để nút Lưu, dấu "vừa nhập" và câu hỏi khi rời màn không còn tính các ô đó. Ô đang gửi lưu thì để
 * `afterSave` xử lý. Không bỏ ô nào thì trả lại đúng nháp cũ (không vẽ lại).
 */
export function withoutSaved(draft: Draft, rows: PrepRow[], inflight?: Draft | null): Draft {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let next: Draft | null = null;
  for (const [key, c] of draft) {
    if (inflight?.has(key)) continue;
    const [id, stepId] = key.split(':').map(Number);
    const row = byId.get(id);
    if (!row || !Array.isArray(row.steps) || savedDone(row, stepId) !== c.value) continue;
    next ??= new Map(draft);
    next.delete(key);
  }
  return next ?? draft;
}

/**
 * Lưu xong: ô đã gửi mà chưa sửa thêm thì bỏ khỏi nháp; ô sửa tiếp trong lúc đang lưu thì giữ, ngày lúc bắt đầu sửa nay
 * là ngày vừa lưu. `keep`: chưa tải lại được dữ liệu mới thì giữ cả ô đã gửi (lưới vẫn hiện ngày vừa lưu, lưu lại không
 * đổi gì).
 */
export function afterSave(draft: Draft, sent: Draft, keep = false): Draft {
  const next = new Map(draft);
  for (const [key, c] of sent) {
    const cur = next.get(key);
    if (!cur) continue;
    if (cur.value === c.value && !keep) next.delete(key);
    else next.set(key, { ...cur, previous: c.value });
  }
  return next;
}

/** Bỏ ô nháp của các dòng (dòng không còn, ngoài phạm vi sửa) hoặc của từng ô (người khác vừa sửa) */
export function withoutCells(draft: Draft, rows: number[], cells: { id: number; stepId: number }[] = []): Draft {
  const gone = new Set(rows.map(String));
  const keys = new Set(cells.map((c) => cellKey(c.id, c.stepId)));
  return new Map([...draft].filter(([key]) => !gone.has(key.split(':')[0]) && !keys.has(key)));
}

/** Các ô TH vừa nhập gom theo dòng, đúng dạng máy chủ nhận */
export function draftItems(draft: Draft) {
  const byRow = new Map<number, { stepId: number; doneDate: string | null; previous: string | null }[]>();
  for (const [key, c] of draft) {
    const [id, stepId] = key.split(':').map(Number);
    byRow.set(id, [...(byRow.get(id) ?? []), { stepId, doneDate: c.value, previous: c.previous }]);
  }
  return [...byRow].map(([id, steps]) => ({ id, steps }));
}

function StatusLabel({ code }: { code: PrepRow['statusCode'] }) {
  if (code === undefined) return null;
  if (code === MASK) return <Masked />;
  const s = PREP_STATUS[code];
  return (
    <span className="prep-status" data-status={code} title={s.hint}>
      {s.label}
    </span>
  );
}

/** Ô KH: ngày kế hoạch, dấu * khi số ngày KH chỉnh riêng cho dòng này */
function PlanCell({ r, stepId }: { r: PrepRow; stepId: number }) {
  if (r.steps === MASK) return <Masked />;
  const v = stepOf(r, stepId);
  if (!v) return <span className="cell-empty">–</span>;
  return (
    <span className="prep-cell" title={`Số ngày KH: ${v.planDays}${v.custom ? ' (chỉnh riêng cho dòng này)' : ''}`}>
      {fmtDate(v.planDate)}
      {v.custom && (
        <>
          <sup aria-hidden>*</sup>
          <VisuallyHidden> (số ngày chỉnh riêng)</VisuallyHidden>
        </>
      )}
    </span>
  );
}

/** Ô TH ở lưới xem: làm xong sau ngày KH thì tô đỏ, có góc tam giác và chữ đọc cho trình đọc màn hình */
function DoneCell({ r, stepId }: { r: PrepRow; stepId: number }) {
  if (r.steps === MASK) return <Masked />;
  const v = stepOf(r, stepId);
  if (!v?.doneDate) return <span className="cell-empty">–</span>;
  const late = v.doneDate > v.planDate;
  return (
    <span className="prep-th" data-late={late || undefined} title={late ? 'Làm xong sau ngày KH' : undefined}>
      {late && <VisuallyHidden>Xong sau ngày KH: </VisuallyHidden>}
      {fmtDate(v.doneDate)}
    </span>
  );
}

function Legend({ editing }: { editing: boolean }) {
  return (
    <Group gap="md" className="prep-legend" wrap="wrap">
      <span className="prep-swatch">
        <i data-kind="alarm" />
        Chưa đủ đk V/C
      </span>
      <span className="prep-swatch">
        <i data-kind="late" />
        TH sau ngày KH
      </span>
      {editing && (
        <span className="prep-swatch">
          <i data-kind="dirty" />
          Vừa nhập, chưa lưu
        </span>
      )}
      <span>* số ngày KH chỉnh riêng</span>
    </Group>
  );
}

type ThKey = `th${number}`;
/** Một dòng của lưới nhập: dữ liệu gốc của dòng và ngày TH đang hiện của từng bước (`th<Id bước>`) */
interface GridRow {
  id: number;
  src: PrepRow;
  [key: ThKey]: string | null;
}
const thKey = (stepId: number) => `th${stepId}` as ThKey;
const plain = (v: unknown) => (v == null || v === MASK ? '' : String(v));
const textCell = (v: unknown, title?: boolean) =>
  v === MASK ? <Masked /> : v == null || v === '' ? <span className="cell-empty">–</span> : <span title={title ? String(v) : undefined}>{String(v)}</span>;

export default function PrepPlanPage() {
  const policy = useFieldPolicy(RESOURCE);
  const aggregate = useSession((s) => !!s.branch?.isAggregate);
  const branch = useSession((s) => s.branch?.code);
  const canUpdate = useCan(`${RESOURCE}:update`) && !aggregate;
  const canExport = useCan(`${RESOURCE}:export`);
  // Lưới nhập khi được sửa các bước; chỉ xem hoặc cột bị Che thì lưới xem (giữ cách hiện ***, ADR 0008)
  const editing = canUpdate && policy.level('steps') === 'EDITABLE';
  const lines = useLines();
  const lineName = useMemo(() => new Map(lines.map((l) => [l.code, l.name])), [lines]);
  const branchName = useBranchName();
  const lineChoices = useMemo(() => lineOptions(lines, undefined, branchName), [lines, branchName]);
  const qc = useQueryClient();

  const [url, patch] = useUrlParams();
  const page = pageOf(url);
  const sort = editing ? '' : (url.get('sort') ?? '');
  const clientToday = todayLocal();
  const [filter, setFilter] = useState<Filter>(() => ({
    startFrom: fromUrl(url.get('startFrom'), defaultFrom(clientToday)),
    startTo: fromUrl(url.get('startTo'), defaultTo(clientToday)),
    branch: url.get('branch') ?? '',
    line: url.get('line') ?? '',
    style: url.get('style') ?? '',
    styleType: url.get('styleType') ?? '',
    status: url.get('status') ?? '',
  }));
  // Lần đầu mở: ghi khoảng ngày mặc định lên URL (link gửi đi giữ đúng khoảng ngày đang xem). Về sau mỗi lần đổi lọc ghi
  // URL ngay trong `set` (ô Mã hàng tự chờ ngừng gõ): màn vẽ lại một lần và gọi danh sách một lần
  const wroteDefaults = useRef(false);
  useEffect(() => {
    if (wroteDefaults.current) return;
    wroteDefaults.current = true;
    patch(filterToUrl(filter));
  }, [filter, patch]);
  const rawWeek = url.get('week');
  // Chưa chọn: tuần này; bỏ chọn có chủ ý: xem cả khoảng ngày
  // Không xem được Ngày vào chuyền thì không có thanh tuần (máy chủ cũng bỏ qua tuần)
  const week = !readable(policy, 'startDate') || rawWeek === ALL ? null : isDay(rawWeek) ? mondayOf(rawWeek) : mondayOf(clientToday);
  const cols = useColumnFilters(url, patch);
  const params = {
    startFrom: filter.startFrom,
    startTo: filter.startTo,
    branch: aggregate ? filter.branch : '',
    line: filter.line,
    // URL giữ nguyên chữ đã gõ, truy vấn cắt khoảng trắng (SQL Server tính cả khoảng trắng cuối trong LIKE)
    style: filter.style.trim(),
    styleType: filter.styleType,
    status: filter.status,
    week: week ?? '',
    cf: cols.param,
  };
  // Đổi lọc và về trang 1 trong cùng một lần ghi URL
  const set = (p: Partial<Filter>, extra: UrlPatch = {}) => {
    setFilter((f) => ({ ...f, ...p }));
    patch({ ...filterToUrl(p), page: null, ...extra });
  };
  // Chỉ tính bộ lọc có ô trên màn (cột bị Ẩn/Che thì không có ô lọc, máy chủ cũng bỏ qua)
  const FILTER_FIELD: Record<keyof Filter, string | null> = { startFrom: 'startDate', startTo: 'startDate', branch: null, line: 'lineCode', style: 'styleCode', styleType: 'styleType', status: 'statusCode' };
  const filtered =
    !!week || cols.active || (Object.entries(filter) as [keyof Filter, string][]).some(([k, v]) => !!v && (FILTER_FIELD[k] === null ? aggregate : readable(policy, FILTER_FIELD[k]!)));
  const clearAll = () => set({ startFrom: '', startTo: '', branch: '', line: '', style: '', styleType: '', status: '' }, { week: ALL, cf: null });
  /** Chọn tuần ngoài khoảng ngày đang lọc thì nới khoảng ngày tới tuần đó, để thấy các mã vào chuyền trong tuần */
  const filterRef = useRef(filter);
  filterRef.current = filter;
  // Hàm ổn định: thanh tuần (memo, 53 nút có Tooltip) không vẽ lại mỗi lần màn render
  const pickWeek = useCallback(
    (monday: string | null) => {
      const widen: Partial<Filter> = {};
      if (monday) {
        const sunday = sundayOf(monday);
        const f = filterRef.current;
        if (f.startTo && f.startTo < sunday) widen.startTo = sunday;
        if (f.startFrom && f.startFrom > monday) widen.startFrom = monday;
        if (Object.keys(widen).length) setFilter((cur) => ({ ...cur, ...widen }));
      }
      patch({ ...filterToUrl(widen), week: monday ?? ALL, page: null });
    },
    [patch],
  );

  const list = useQuery({
    queryKey: ['sewing', 'prep', branch, page, sort, params],
    queryFn: () => api<PrepPage>(`/sewing/prep${qs({ page, pageSize: PAGE_SIZE, sort, ...params })}`),
    placeholderData: keepPreviousData,
  });
  useClampPage(list.data, page, PAGE_SIZE, (p) => patch({ page: p > 1 ? p : null }));
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const stepData = list.data?.stepInfo;
  const steps = useMemo(() => (Array.isArray(stepData) ? stepData : []), [stepData]);
  const today = list.data?.today ?? clientToday;

  // Loại mã: giá trị đang có trong dữ liệu theo các bộ lọc khác, tải khi mở ô chọn (đóng lại thì không tải nền khi đổi lọc)
  const [typesOpen, setTypesOpen] = useState(false);
  const typeParams = { ...params, styleType: '' };
  const styleTypes = useQuery({
    queryKey: ['sewing', 'prep', 'style-types', branch, typeParams],
    queryFn: () => valuesLoader('/sewing/prep', typeParams)('styleType', ''),
    enabled: typesOpen && readable(policy, 'styleType'),
    staleTime: 30_000,
  });
  const typeOptions = useMemo(() => {
    const values = (styleTypes.data?.values ?? []).filter((v): v is string => typeof v === 'string' && v !== '');
    return filter.styleType && !values.includes(filter.styleType) ? [filter.styleType, ...values] : values;
  }, [styleTypes.data, filter.styleType]);

  // Đơn vị (chỉ phiên A00): các nhà máy đang có dòng trong phạm vi xem được, không phải nhà máy tài khoản được gán
  const [branchesOpen, setBranchesOpen] = useState(false);
  const branchValues = useQuery({
    queryKey: ['sewing', 'prep', 'branches', branch],
    queryFn: () => valuesLoader('/sewing/prep', {})('branchCode', ''),
    enabled: aggregate && branchesOpen,
    staleTime: 30_000,
  });
  const branchOptions = useMemo(() => {
    const codes = (branchValues.data?.values ?? []).filter((v): v is string => typeof v === 'string' && v !== '');
    const all = filter.branch && !codes.includes(filter.branch) ? [filter.branch, ...codes] : codes;
    return all.map((code) => ({ value: code, label: branchName(code) }));
  }, [branchValues.data, filter.branch, branchName]);

  // ---------- Ô TH nhập trên bảng, chưa lưu (giữ qua đổi trang, đổi bộ lọc; bấm Lưu thay đổi mới ghi) ----------
  const [draft, setDraft] = useState<Draft>(() => new Map());
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** Ô đang gửi lưu (ảnh chụp nháp lúc bấm Lưu thay đổi) */
  const inflight = useRef<Draft | null>(null);
  const dirty = draft.size > 0;
  useLeaveGuard(dirty);
  // Tự đổi nhà máy thì màn mở lại từ đầu (đã hỏi lại). Tab khác đổi nhà máy thì màn vẫn mở: ô đang nhập thuộc nhà máy cũ,
  // máy chủ không nhận nữa, nên bỏ và báo bằng thông báo không tự đóng
  const branchSeen = useRef(branch);
  useEffect(() => {
    if (branchSeen.current === branch) return;
    branchSeen.current = branch;
    const lost = draftRef.current.size;
    setDraft(new Map());
    if (lost) toastWarn(`Phiên đã chuyển sang đơn vị cơ sở khác từ một tab khác. ${fmtNum(lost)} ngày TH vừa nhập ở đơn vị cũ chưa được lưu và đã bỏ.`, 'Đã bỏ phần chưa lưu', true);
  }, [branch]);
  useEffect(() => setDraft((d) => withoutSaved(d, items, inflight.current)), [items]);
  const rowDirty = (id: number) => [...draftRef.current.keys()].some((k) => k.startsWith(`${id}:`));

  // Dòng không đổi thì giữ nguyên đối tượng: lưới chỉ vẽ lại dòng vừa sửa
  const rowCache = useRef(new Map<number, GridRow>());
  const gridRows = useMemo(() => {
    const next = new Map<number, GridRow>();
    const out = items.map((r) => {
      const values = steps.map((s) => {
        const d = draft.get(cellKey(r.id, s.id));
        return d ? d.value : savedDone(r, s.id);
      });
      const old = rowCache.current.get(r.id);
      const same = !!old && old.src === r && steps.every((s, i) => old[thKey(s.id)] === values[i]);
      const g = same ? old : ({ id: r.id, src: r, ...Object.fromEntries(steps.map((s, i) => [thKey(s.id), values[i]])) } as GridRow);
      next.set(r.id, g);
      return g;
    });
    rowCache.current = next;
    return out;
  }, [items, steps, draft]);

  // Thư viện giữ nguyên đối tượng của dòng không bị sửa: chỉ dựng nháp cho các dòng vừa đổi (thường một dòng), không
  // phải 100 dòng × mọi bước mỗi lần ghi ô
  const onGridChange = (next: GridRow[]) => {
    const before = new Map(gridRows.map((g) => [g.id, g]));
    const changed = next.filter((g) => g.src.canEdit && before.get(g.id) !== g);
    if (changed.length === 0) return;
    setDraft((prev) =>
      withEdits(
        prev,
        changed
          .flatMap((g) =>
            steps.map((s) => ({
              key: cellKey(g.id, s.id),
              value: g[thKey(s.id)] ?? null,
              saved: savedDone(g.src, s.id),
              label: `${plain(g.src.styleCode) || `Dòng ${g.id}`} (${lineName.get(plain(g.src.lineCode)) ?? plain(g.src.lineCode)}), ${s.name}`,
            })),
          ),
        inflight.current,
      ),
    );
  };

  const statusOf = useCallback(
    (g: GridRow): PrepRow['statusCode'] => {
      const r = g.src;
      if (r.statusCode === MASK || r.statusCode === undefined || !isDay(r.startDate)) return r.statusCode;
      return liveStatus(r.startDate, steps.map((s) => g[thKey(s.id)] ?? null), today);
    },
    [steps, today],
  );

  // Lọc theo cột trên tiêu đề lưới nhập: cùng bộ lọc trên URL, cùng nguồn giá trị và cùng các cột với lưới xem. Hàm lấy
  // giá trị đọc bộ lọc qua ref để cột của lưới không dựng lại mỗi lần vẽ
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const loadValues = useCallback<LoadValues>((field, search) => valuesLoader('/sewing/prep', paramsRef.current)(field, search), []);
  const colFilters = cols.filters;
  const setColFilter = cols.setFilter;
  const headFilter = useCallback(
    (field: string, title: string, label: (v: string | number) => string): HeadFilter | undefined =>
      // Cột bị Che thì không lọc (máy chủ cũng từ chối)
      !readable(policy, field)
        ? undefined
        : {
            active: !!colFilters[field],
            node: (
              <ColumnFilterButton
                title={title}
                field={field}
                current={colFilters[field]}
                others={Object.fromEntries(Object.entries(colFilters).filter(([k]) => k !== field))}
                load={loadValues}
                label={label}
                onChange={(f) => setColFilter(field, f)}
              />
            ),
          },
    [policy, colFilters, setColFilter, loadValues],
  );

  const sheetCols = useMemo<SheetColumn<GridRow>[]>(() => {
    const visible = policy.visible;
    const asText = (v: string | number) => String(v);
    const asNum = (v: string | number) => fmtNum(v);
    const asDate = (v: string | number) => fmtDate(String(v));
    const out: SheetColumn<GridRow>[] = [
      sheetReadonly<GridRow>('ĐVCS', (g) => branchName(g.src.branchCode), (g) => branchName(g.src.branchCode), { minWidth: 112, headFilter: headFilter('branchCode', 'ĐVCS', (v) => branchName(String(v))) }),
    ];
    if (visible('lineCode'))
      out.push(
        sheetReadonly<GridRow>('Tổ SX', (g) => (g.src.lineCode === MASK ? <Masked /> : textCell(lineName.get(plain(g.src.lineCode)) ?? g.src.lineCode)), (g) => lineName.get(plain(g.src.lineCode)) ?? plain(g.src.lineCode), {
          minWidth: 100,
          headFilter: headFilter('lineCode', 'Tổ SX', (v) => lineName.get(String(v)) ?? String(v)),
        }),
      );
    if (visible('styleCode')) out.push(sheetReadonly<GridRow>('Mã hàng', (g) => textCell(g.src.styleCode, true), (g) => plain(g.src.styleCode), { minWidth: 190, headFilter: headFilter('styleCode', 'Mã hàng', asText) }));
    if (visible('styleType')) out.push(sheetReadonly<GridRow>('Loại mã', (g) => textCell(g.src.styleType, true), (g) => plain(g.src.styleType), { minWidth: 96, headFilter: headFilter('styleType', 'Loại mã', asText) }));
    if (visible('confirmedQty'))
      out.push(
        sheetReadonly<GridRow>('Số lượng chốt UD', (g) => (typeof g.src.confirmedQty === 'number' ? fmtNum(g.src.confirmedQty) : textCell(g.src.confirmedQty)), (g) => (typeof g.src.confirmedQty === 'number' ? g.src.confirmedQty : null), {
          minWidth: 104,
          align: 'right',
          headFilter: headFilter('confirmedQty', 'Số lượng chốt UD', asNum),
        }),
      );
    if (visible('priorityFactor'))
      out.push(
        sheetReadonly<GridRow>('HS Ưu đãi VC', (g) => (typeof g.src.priorityFactor === 'number' ? fmtNum(g.src.priorityFactor) : textCell(g.src.priorityFactor)), (g) => (typeof g.src.priorityFactor === 'number' ? g.src.priorityFactor : null), {
          minWidth: 96,
          align: 'right',
          headFilter: headFilter('priorityFactor', 'HS Ưu đãi VC', asNum),
        }),
      );
    if (visible('startDate'))
      out.push(
        sheetReadonly<GridRow>('Ngày vào chuyền', (g) => (isDay(g.src.startDate) ? fmtDate(g.src.startDate) : textCell(g.src.startDate)), (g) => (isDay(g.src.startDate) ? fmtDate(g.src.startDate) : null), {
          minWidth: 112,
          headFilter: headFilter('startDate', 'Ngày vào chuyền', asDate),
        }),
      );
    if (visible('statusCode'))
      out.push(
        sheetReadonly<GridRow>('Trạng thái', (g) => <StatusLabel code={statusOf(g)} />, (g) => {
          const code = statusOf(g);
          return code && code !== MASK ? PREP_STATUS[code].label : null;
        }, {
          minWidth: 136,
          className: (g) => {
            const code = statusOf(g);
            return code === 'NOT_READY' ? 'prep-alarm' : code === 'READY' ? 'prep-ready' : undefined;
          },
        }),
      );
    if (visible('steps'))
      for (const s of steps) {
        const key = thKey(s.id);
        out.push(
          sheetReadonly<GridRow>('KH', (g) => <PlanCell r={g.src} stepId={s.id} />, (g) => fmtDate(stepOf(g.src, s.id)?.planDate), { minWidth: 92, group: s.name, groupKey: `s${s.id}` }),
          sheetDate<GridRow>(key, 'TH', {
            minWidth: 106,
            group: s.name,
            groupKey: `s${s.id}`,
            disabled: (g) => !g.src.canEdit,
            // Ngày sau hôm nay: sai (viền đỏ), máy chủ cũng từ chối
            error: (g) => !!g[key] && g[key]! > today,
            className: (g) => {
              const v = g[key];
              const plan = stepOf(g.src, s.id)?.planDate;
              const late = !!v && !!plan && v > plan && v <= today;
              return [late ? 'prep-late' : undefined, draftRef.current.has(cellKey(g.id, s.id)) ? 'prep-dirty' : undefined].filter(Boolean).join(' ') || undefined;
            },
          }),
        );
      }
    out.push(
      sheetReadonly<GridRow>('Ngày tạo', (g) => (g.src.createdAt ? fmtDateTime(g.src.createdAt) : textCell(null)), (g) => (g.src.createdAt ? fmtDateTime(g.src.createdAt) : null), {
        minWidth: 140,
        headFilter: headFilter('createdAt', 'Ngày tạo', asDate),
      }),
    );
    return out;
  }, [steps, today, policy, branchName, lineName, statusOf, headFilter]);

  const stepsMasked = policy.level('steps') === 'MASKED';
  const columns = useMemo<Column<PrepRow>[]>(
    () => [
      {
        key: 'branchCode',
        title: 'ĐVCS',
        field: null,
        filterKey: 'branchCode',
        filterLabel: (v) => branchName(String(v)),
        render: (r) => {
          const name = branchName(r.branchCode);
          return name !== r.branchCode ? <span title={r.branchCode}>{name}</span> : name;
        },
      },
      { key: 'lineCode', title: 'Tổ SX', sortKey: 'lineCode', filterKey: 'lineCode', filterLabel: (v) => lineName.get(String(v)) ?? String(v), minWidth: 100, render: (r) => (typeof r.lineCode === 'string' ? <span title={r.lineCode}>{lineName.get(r.lineCode) ?? r.lineCode}</span> : null) },
      { key: 'styleCode', title: 'Mã hàng', sortKey: 'styleCode', filterKey: 'styleCode', format: 'code', maxWidth: 200 },
      { key: 'styleType', title: 'Loại mã', filterKey: 'styleType' },
      { key: 'confirmedQty', title: 'Số lượng chốt UD', format: 'number', filterKey: 'confirmedQty' },
      { key: 'priorityFactor', title: 'HS Ưu đãi VC', format: 'number', filterKey: 'priorityFactor' },
      { key: 'startDate', title: 'Ngày vào chuyền', sortKey: 'startDate', filterKey: 'startDate', format: 'date' },
      { key: 'statusCode', title: 'Trạng thái', render: (r) => <StatusLabel code={r.statusCode} /> },
      // Các bước bị Che: một cột "***" thay cho hai cột mỗi bước (32 ô che giống nhau mỗi dòng không cho thêm thông tin)
      ...(stepsMasked
        ? [{ key: 'steps', title: NAMES.steps, field: 'steps' }]
        : steps.flatMap((s): Column<PrepRow>[] => [
            { key: `kh${s.id}`, title: 'KH', group: s.name, field: 'steps', minWidth: 92, render: (r) => <PlanCell r={r} stepId={s.id} /> },
            { key: `th${s.id}`, title: 'TH', group: s.name, field: 'steps', minWidth: 96, render: (r) => <DoneCell r={r} stepId={s.id} /> },
          ])),
      { key: 'createdAt', title: 'Ngày tạo', format: 'datetime', sortKey: 'createdAt', filterKey: 'createdAt' },
    ],
    [steps, lineName, branchName, stepsMasked],
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const [openId, setOpenId] = useState<number | null>(null);
  const refreshAfterDialog = useAfterClose(() => {
    void qc.invalidateQueries({ queryKey: ['sewing', 'prep'] });
    refreshPrepSummary(qc);
  });
  const UNSAVED_ROW = 'Dòng này có ngày TH vừa nhập chưa lưu: bấm Lưu thay đổi hoặc Bỏ thay đổi trước';
  const openRow = (id: number) => {
    if (rowDirty(id)) toastWarn(UNSAVED_ROW, 'Chưa mở được chi tiết');
    else setOpenId(id);
  };

  const exportFile = useMutation({
    mutationFn: () => download(`/sewing/prep/export${qs({ sort, ...params })}`, `ke-hoach-chuan-bi-sx-${branch ?? ''}.csv`),
    onError: (e) => toastError(e, 'Chưa xuất được file'),
  });

  const pending = useMemo(() => draftItems(draft), [draft]);
  const future = [...draft.values()].filter((c) => !!c.value && c.value > today);
  const save = useMutation({
    // Gửi ảnh chụp nháp lúc bấm: ô gõ thêm trong lúc đang lưu vẫn còn trong nháp sau khi lưu xong
    mutationFn: (sent: Draft) => api<PrepDoneSaved>('/sewing/prep', { method: 'PUT', body: { items: draftItems(sent) } }),
    onMutate: (sent) => {
      inflight.current = sent;
    },
    onSettled: () => {
      inflight.current = null;
    },
    onSuccess: async (r, sent) => {
      // Tải lại xong mới bỏ ô nháp: lưới không nháy lại ngày cũ. Tải lại lỗi thì giữ ô đã gửi (lưới vẫn hiện ngày vừa lưu)
      refreshPrepSummary(qc);
      // Chỉ chờ danh sách (khóa ['sewing','prep', nhà máy, …]); loại mã, đơn vị, chi tiết chỉ đánh dấu cũ: lỗi tải lại của
      // chúng không giữ các ô vừa lưu trong nháp
      void qc.invalidateQueries({ queryKey: ['sewing', 'prep'], refetchType: 'none' });
      const fresh = await qc.invalidateQueries({ queryKey: ['sewing', 'prep', branch] }, { throwOnError: true }).then(
        () => true,
        () => false,
      );
      setDraft((d) => afterSave(d, sent, !fresh));
      toastOk(r.cells ? `Đã lưu ${fmtNum(r.cells)} ngày TH của ${fmtNum(r.rows)} dòng.` : 'Các ngày đã nhập trùng với dữ liệu đã lưu.');
    },
    onError: (e, sent) => {
      const details = e instanceof ApiError ? (e.details as { cells?: { id: number; stepId: number }[]; ids?: number[] } | null) : null;
      if (e instanceof ApiError && e.code === 'CONFLICT' && details?.cells?.length) {
        // Ô người khác vừa sửa: thay bằng ngày mới của họ, giữ các ô khác đang nhập
        setDraft((d) => withoutCells(d, [], details.cells));
        void qc.invalidateQueries({ queryKey: ['sewing', 'prep'] });
        refreshPrepSummary(qc);
        toastWarn(`${e.message} Các ô khác bạn vừa nhập vẫn còn trên bảng.`, 'Có ô vừa được người khác sửa');
        return;
      }
      if (e instanceof ApiError && e.code === 'NOT_FOUND' && details?.ids?.length) {
        // Dòng không còn (dàn chuyền đổi) hoặc ngoài phạm vi sửa: bỏ ô nháp của các dòng đó, giữ phần còn lại để lưu tiếp
        const gone = new Set(details.ids.map(String));
        const lost = [...sent.keys()].filter((k) => gone.has(k.split(':')[0])).length;
        setDraft((d) => withoutCells(d, details.ids!));
        void qc.invalidateQueries({ queryKey: ['sewing', 'prep'] });
        refreshPrepSummary(qc);
        toastWarn(`${e.message} Đã bỏ ${fmtNum(lost)} ô của các dòng đó; bấm Lưu thay đổi để lưu các ô còn lại.`, 'Có dòng không lưu được');
        return;
      }
      toastError(e, 'Chưa lưu được');
    },
  });
  const blocked = !dirty
    ? 'Chưa có thay đổi nào'
    : future.length
      ? `${future.length} ngày TH sau hôm nay (ô viền đỏ): sửa lại trước khi lưu`
      : pending.length > MAX_SAVE_ROWS || draft.size > MAX_SAVE_CELLS
        ? `Mỗi lần lưu tối đa ${MAX_SAVE_ROWS} dòng, ${fmtNum(MAX_SAVE_CELLS)} ô: lưu bớt rồi nhập tiếp`
        : null;
  const discard = () => confirmDiscard(true, () => setDraft(new Map()), `${fmtNum(draft.size)} ngày TH vừa nhập sẽ mất.`);

  const error = list.error ? (list.error instanceof ApiError ? list.error.message : 'Không tải được kế hoạch chuẩn bị SX. Kiểm tra kết nối rồi thử lại.') : null;
  const weekNo = week ? isoWeekOf(week).week : null;
  const emptyMessage = week ? (
    <Stack align="center" gap={8}>
      <span>
        Không có việc chuẩn bị đến hạn tới hết T{weekNo} ({fmtDate(sundayOf(week))}), cũng không có mã vào chuyền trong tuần này.
      </span>
      <Group gap="xs" justify="center">
        <Button size="xs" variant="default" onClick={() => pickWeek(null)}>
          Xem cả khoảng ngày
        </Button>
        <Button size="xs" variant="default" leftSection={<IconFilterOff size={14} />} onClick={clearAll}>
          Xóa lọc
        </Button>
      </Group>
    </Stack>
  ) : filtered ? (
    <Stack align="center" gap={8}>
      <span>Không có dòng nào khớp bộ lọc.</span>
      <Button size="xs" variant="default" leftSection={<IconFilterOff size={14} />} onClick={clearAll}>
        Xóa lọc
      </Button>
    </Stack>
  ) : (
    'Chưa có dòng dàn chuyền nào. Dòng dàn chuyền lập ở Quản trị đơn hàng › Xếp chuyền sẽ tự hiện ở đây.'
  );
  const pager = list.data && (
    <Pager
      page={page}
      pageSize={PAGE_SIZE}
      total={list.data.total}
      onPage={(p) => patch({ page: p > 1 ? p : null })}
      extra={
        <>
          {editing && list.isFetching && <Loader size="xs" color="brand" aria-label="Đang tải" />}
          <Legend editing={editing} />
        </>
      }
    />
  );
  const detailBlocked = !selected ? PICK_ROW : rowDirty(selected.id) ? UNSAVED_ROW : null;

  return (
    <WorkPage
      title="Kế hoạch chuẩn bị SX"
      subtitle={
        editing
          ? 'Mỗi dòng là một dòng dàn chuyền ở Xếp chuyền. Gõ ngày làm xong vào ô TH rồi bấm Lưu thay đổi. Bấm đúp vào dòng để xem hướng dẫn hoặc chỉnh số ngày KH của mã hàng đó.'
          : 'Mỗi dòng là một dòng dàn chuyền ở Xếp chuyền. KH của bước = Ngày vào chuyền − Số ngày KH (danh mục Cấu hình chuẩn bị SX). Bấm đúp vào dòng để xem hướng dẫn của mã hàng đó.'
      }
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <Button variant="default" leftSection={<IconRefresh size={15} />} loading={list.isFetching && !list.isLoading} onClick={() => void list.refetch()}>
            Tải lại
          </Button>
          {canExport && (
            <Button variant="default" leftSection={<IconDownload size={15} />} loading={exportFile.isPending} onClick={() => exportFile.mutate()}>
              Xuất file
            </Button>
          )}
          <ActionButton leftSection={<IconListDetails size={15} />} variant="default" blockedReason={detailBlocked} onClick={() => selected && openRow(selected.id)}>
            {canUpdate ? 'Sửa chi tiết' : 'Xem chi tiết'}
          </ActionButton>
          {/* Đang lưu thì không bỏ được: các ô đã gửi vẫn sẽ được ghi */}
          {dirty && !save.isPending && (
            <Button variant="default" leftSection={<IconArrowBackUp size={15} />} onClick={discard}>
              Bỏ thay đổi
            </Button>
          )}
          {editing && (
            <ActionButton loading={save.isPending} blockedReason={blocked} onClick={() => save.mutate(draftRef.current)}>
              {dirty ? `Lưu thay đổi (${fmtNum(draft.size)} ô)` : 'Lưu thay đổi'}
            </ActionButton>
          )}
        </>
      }
      filters={
        <Stack gap={8}>
          <Group gap="sm" align="flex-end" wrap="wrap" className="filter-bar">
            {readable(policy, 'startDate') && (
              <Group gap={6} align="flex-end" wrap="wrap">
                <DateField label="Từ ngày" title="Ngày vào chuyền từ" value={filter.startFrom} onChange={(v) => set({ startFrom: v })} maxDate={filter.startTo || undefined} w={140} />
                <DateField label="Đến ngày" title="Ngày vào chuyền đến" value={filter.startTo} onChange={(v) => set({ startTo: v })} minDate={filter.startFrom || undefined} w={140} />
              </Group>
            )}
            {aggregate && (
              <Select
                label="Đơn vị"
                placeholder="Tất cả"
                data={branchOptions}
                onDropdownOpen={() => setBranchesOpen(true)}
                onDropdownClose={() => setBranchesOpen(false)}
                nothingFoundMessage={
                  branchValues.isFetching ? 'Đang tải…' : branchValues.isError ? 'Chưa tải được danh sách đơn vị cơ sở. Đóng rồi mở lại để thử lại.' : 'Chưa có đơn vị cơ sở nào có dòng dàn chuyền.'
                }
                value={filter.branch || null}
                onChange={(v) => set({ branch: v ?? '' })}
                clearable
                w={170}
              />
            )}
            {readable(policy, 'lineCode') && <TreeSelect label="Tổ SX" placeholder="Tất cả" options={lineChoices} value={filter.line || null} onChange={(v) => set({ line: v ?? '' })} clearable unit="tổ" nothingFoundMessage="Không có tổ khớp. Gõ tên, số tổ hoặc tên xưởng." emptyMessage="Chưa có tổ nào." w={170} />}
            {readable(policy, 'styleCode') && (
              <DebouncedTextInput label="Mã hàng" placeholder="Gõ một phần mã" leftSection={<IconSearch size={14} />} value={filter.style} onChange={(v) => set({ style: v })} w={170} />
            )}
            {readable(policy, 'styleType') && (
              <Select
                label="Loại mã"
                placeholder="Tất cả"
                data={typeOptions}
                value={filter.styleType || null}
                onChange={(v) => set({ styleType: v ?? '' })}
                onDropdownOpen={() => setTypesOpen(true)}
                onDropdownClose={() => setTypesOpen(false)}
                nothingFoundMessage={styleTypes.isFetching ? 'Đang tải…' : 'Chưa có loại mã nào được nhập.'}
                searchable
                clearable
                w={150}
              />
            )}
            {readable(policy, 'statusCode') && (
              <Select
                label="Trạng thái"
                placeholder="Tất cả"
                data={(['NOT_READY', 'NOT_DUE', 'READY'] as const).map((value) => ({ value, label: PREP_STATUS[value].label }))}
                value={filter.status || null}
                onChange={(v) => set({ status: v ?? '' })}
                clearable
                w={170}
              />
            )}
            <ColumnFilterNote names={Object.keys(cols.filters).filter((k) => readable(policy, k)).map((k) => columns.find((c) => c.filterKey === k)?.title ?? k)} />
            {filtered && (
              <Button variant="subtle" color="gray" leftSection={<IconFilterOff size={15} />} onClick={clearAll}>
                Xóa lọc
              </Button>
            )}
          </Group>
          {readable(policy, 'startDate') && <WeekStrip week={week} from={filter.startFrom} to={filter.startTo} today={today} onPick={pickWeek} />}
          <PrepSummary params={{ ...params, status: '' }} branch={branch} />
        </Stack>
      }
    >
      {editing ? (
        <div className="prep-sheet">
          {error && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} py={6} mb={6}>
              <Group justify="space-between" gap="sm">
                <Text size="sm">{error}</Text>
                <Button size="xs" variant="default" loading={list.isFetching} onClick={() => void list.refetch()}>
                  Thử lại
                </Button>
              </Group>
            </Alert>
          )}
          {future.length > 0 && (
            <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} py={6} mb={6}>
              Ngày TH không được sau hôm nay ({fmtDate(today)}): {future.slice(0, 3).map((c) => `${c.label} ${fmtDate(c.value)}`).join('; ')}
              {future.length > 3 ? ` và ${future.length - 3} ô khác` : ''}.
            </Alert>
          )}
          {!list.data ? (
            !error && <Skeleton h={320} role="status" aria-label="Đang tải kế hoạch chuẩn bị SX" />
          ) : (
            <>
              <SheetGrid
                label="Kế hoạch chuẩn bị SX"
                value={gridRows}
                onChange={onGridChange}
                columns={sheetCols}
                rowKey={(g) => g.id}
                indexOffset={(page - 1) * PAGE_SIZE}
                onActiveRowChange={(g) => setSelectedId(g.id)}
                selectedKey={selected?.id ?? null}
                onRowOpen={(g) => openRow(g.id)}
                empty={emptyMessage}
                hint="Gõ ngày làm xong vào ô TH (dd/mm/yyyy hoặc dd/mm), dán được nhiều ô từ Excel, Delete để xóa ngày. Ngày chỉ ghi khi bấm Lưu thay đổi."
              />
              {pager}
            </>
          )}
        </div>
      ) : (
        <DataGrid
          label="Kế hoạch chuẩn bị SX"
          fill
          columns={columns}
          rows={items}
          rowKey={(r) => r.id}
          policy={policy}
          loading={list.isFetching}
          error={error}
          onRetry={() => void list.refetch()}
          indexOffset={(page - 1) * PAGE_SIZE}
          sort={sort}
          onSort={(s) => patch({ sort: s || null, page: null })}
          columnFilters={cols.filters}
          onColumnFilter={cols.setFilter}
          loadValues={loadValues}
          selectedKey={selected?.id ?? null}
          onRowClick={(r) => setSelectedId(r.id)}
          onRowDoubleClick={(r) => openRow(r.id)}
          empty={emptyMessage}
          footer={pager}
        />
      )}
      {/* Dòng ngoài phạm vi sửa (canEdit) chỉ xem được trong popup */}
      {openId !== null && <PrepDialog id={openId} canEdit={canUpdate && !!items.find((r) => r.id === openId)?.canEdit} policy={policy} lineName={lineName} onClose={() => setOpenId(null)} onSaved={refreshAfterDialog} />}
    </WorkPage>
  );
}

// ---------------- Popup một dòng: như màn "Hướng dẫn, chỉ dẫn và điều chỉnh số ngày kế hoạch theo mã hàng" ----------------

interface StepRow {
  key: number;
  name: string;
  active: boolean;
  defaultDays: number;
  /** Số ngày KH đang dùng; để trống là theo danh mục */
  planDays: number | null;
  doneDate: string | null;
  performer: string;
  dataSource: string;
}

interface Head {
  styleType: string;
  confirmedQty: number | '';
  priorityFactor: number | '';
}

const headOf = (d: PrepDetail): Head => ({
  styleType: typeof d.styleType === 'string' && d.styleType !== MASK ? d.styleType : '',
  confirmedQty: typeof d.confirmedQty === 'number' ? d.confirmedQty : '',
  priorityFactor: typeof d.priorityFactor === 'number' ? d.priorityFactor : '',
});

const rowsOf = (d: PrepDetail): StepRow[] =>
  (Array.isArray(d.stepInfo) ? d.stepInfo : []).map((s: PrepStep) => {
    const v = Array.isArray(d.steps) ? d.steps.find((x) => x.stepId === s.id) : undefined;
    return {
      key: s.id,
      name: s.isActive ? s.name : `${s.name} (đã ngừng dùng)`,
      active: s.isActive,
      defaultDays: s.planDays,
      planDays: v ? v.planDays : s.planDays,
      doneDate: v?.doneDate ?? null,
      performer: s.performer ?? '',
      dataSource: s.dataSource ?? '',
    };
  });

/** Số ngày KH bằng số của danh mục thì không tính là chỉnh riêng */
const effectiveDays = (r: StepRow) => r.planDays ?? r.defaultDays;
const sameStep = (a: StepRow, b: StepRow) => effectiveDays(a) === effectiveDays(b) && (a.doneDate ?? null) === (b.doneDate ?? null);

function PrepDialog({ id, canEdit, policy, lineName, onClose, onSaved }: { id: number; canEdit: boolean; policy: FieldPolicy; lineName: Map<string, string>; onClose: () => void; onSaved: () => void }) {
  const mobile = useMobile();
  const detail = useQuery({ queryKey: ['sewing', 'prep', 'detail', id], queryFn: () => api<PrepDetail>(`/sewing/prep/${id}`), refetchOnMount: 'always' });
  const [head, setHead] = useState<Head | null>(null);
  const [rows, setRows] = useState<StepRow[] | null>(null);
  const d = detail.data;
  // Điền một lần mỗi lần mở: tải lại nền không đè phần đang nhập
  if (d && !detail.isFetching && rows === null) {
    setHead(headOf(d));
    setRows(rowsOf(d));
  }
  const original = useMemo(() => (d ? { head: headOf(d), rows: rowsOf(d) } : null), [d]);
  const today = d?.today ?? todayLocal();
  const stepsLevel = policy.level('steps');
  const canSteps = canEdit && stepsLevel === 'EDITABLE' && Array.isArray(d?.steps);
  const start = typeof d?.startDate === 'string' && d.startDate !== MASK ? d.startDate : null;

  const changedSteps = rows && original ? rows.filter((r) => !sameStep(r, original.rows.find((o) => o.key === r.key)!)) : [];
  const headChanged = !!head && !!original && (head.styleType !== original.head.styleType || head.confirmedQty !== original.head.confirmedQty || head.priorityFactor !== original.head.priorityFactor);
  const dirty = headChanged || changedSteps.length > 0;
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);

  const futureDone = (rows ?? []).filter((r) => r.doneDate && r.doneDate > today);
  const badDays = (rows ?? []).filter((r) => r.planDays != null && r.planDays > 365);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      if (head && original) {
        if (head.styleType !== original.head.styleType && policy.editable('styleType')) body.styleType = head.styleType || null;
        if (head.confirmedQty !== original.head.confirmedQty && policy.editable('confirmedQty')) body.confirmedQty = head.confirmedQty === '' ? null : head.confirmedQty;
        if (head.priorityFactor !== original.head.priorityFactor && policy.editable('priorityFactor')) body.priorityFactor = head.priorityFactor === '' ? null : head.priorityFactor;
      }
      if (canSteps && changedSteps.length) body.steps = changedSteps.map((r) => ({ stepId: r.key, planDays: effectiveDays(r) === r.defaultDays ? null : effectiveDays(r), doneDate: r.doneDate }));
      return api(`/sewing/prep/${id}`, { method: 'PUT', body });
    },
    onSuccess: () => {
      toastOk(`Đã lưu kế hoạch chuẩn bị SX mã hàng ${typeof d?.styleCode === 'string' ? d.styleCode : ''}.`);
      onClose();
      onSaved();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });

  const sheetCols = useMemo<SheetColumn<StepRow>[]>(
    () => [
      sheetReadonly<StepRow>('Nội dung', (r) => r.name, (r) => r.name, { minWidth: 220, grow: 2 }),
      sheetNumber<StepRow>('planDays', 'Số ngày KH', { minWidth: 100, disabled: !canSteps, error: (r) => r.planDays != null && r.planDays > 365 }),
      sheetReadonly<StepRow>('KH', (r) => (start ? fmtDate(addDays(start, -effectiveDays(r))) : ''), (r) => (start ? fmtDate(addDays(start, -effectiveDays(r))) : null), { minWidth: 110 }),
      // Như lưới chính: TH sau ngày KH tô đỏ (theo số ngày KH đang nhập), ngày sau hôm nay là sai
      sheetDate<StepRow>('doneDate', 'TH', {
        minWidth: 120,
        disabled: !canSteps,
        error: (r) => !!r.doneDate && r.doneDate > today,
        className: (r) => (start && r.doneDate && r.doneDate <= today && r.doneDate > addDays(start, -effectiveDays(r)) ? 'prep-late' : undefined),
      }),
      sheetReadonly<StepRow>('Người thực hiện', (r) => r.performer, (r) => r.performer, { minWidth: 140 }),
      sheetReadonly<StepRow>('Nguồn dữ liệu đầu vào', (r) => <span title={r.dataSource}>{r.dataSource}</span>, (r) => r.dataSource, { minWidth: 260, grow: 3 }),
    ],
    [canSteps, start, today],
  );

  const viewCols = useMemo<Column<StepRow>[]>(
    () => [
      { key: 'name', title: 'Nội dung', field: null, maxWidth: 280 },
      { key: 'planDays', title: 'Số ngày KH', field: null, format: 'number' },
      { key: 'kh', title: 'KH', field: null, render: (r) => (start ? fmtDate(addDays(start, -effectiveDays(r))) : '') },
      {
        key: 'doneDate',
        title: 'TH',
        field: null,
        render: (r) => {
          if (!r.doneDate) return <span className="cell-empty">–</span>;
          const late = !!start && r.doneDate > addDays(start, -effectiveDays(r));
          return (
            <span className="prep-th" data-late={late || undefined} title={late ? 'Làm xong sau ngày KH' : undefined}>
              {late && <VisuallyHidden>Xong sau ngày KH: </VisuallyHidden>}
              {fmtDate(r.doneDate)}
            </span>
          );
        },
      },
      { key: 'performer', title: 'Người thực hiện', field: null },
      { key: 'dataSource', title: 'Nguồn dữ liệu đầu vào', field: null, maxWidth: 360 },
    ],
    [start],
  );

  const headField = (field: 'styleType' | 'confirmedQty' | 'priorityFactor', label: string, input: (lock: { readOnly?: boolean; className?: string; description?: string }) => ReactNode) => {
    const level = policy.level(field);
    if (level === 'HIDDEN') return null;
    if (level === 'MASKED') return <TextInput label={label} value={MASK} readOnly className="field-readonly" description="Bị che theo phân quyền" />;
    if (!canEdit) return input({ readOnly: true, className: 'field-readonly' });
    return input(level === 'READONLY' ? { readOnly: true, className: 'field-readonly', description: 'Bạn chỉ được xem trường này' } : {});
  };

  const blocked = !dirty
    ? 'Chưa có thay đổi nào'
    : futureDone.length
      ? 'Ngày thực hiện không được sau hôm nay'
      : badDays.length
        ? 'Số ngày KH tối đa 365'
        : null;

  return (
    <Modal
      opened
      onClose={close}
      // Esc trong lưới là thoát sửa ô, bỏ vùng chọn: không để nó đóng popup
      closeOnEscape={!canSteps}
      size="min(1180px, 96vw)"
      fullScreen={mobile}
      title={d ? `Chuẩn bị SX: ${typeof d.styleCode === 'string' ? d.styleCode : ''}` : 'Chuẩn bị SX'}
    >
      {detail.isError ? (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          <Group justify="space-between" gap="sm">
            <Text size="sm">{detail.error instanceof ApiError ? detail.error.message : 'Không tải được dòng này. Kiểm tra kết nối rồi thử lại.'}</Text>
            <Button size="xs" variant="default" onClick={() => void detail.refetch()} loading={detail.isFetching}>
              Thử lại
            </Button>
          </Group>
        </Alert>
      ) : !d || !head || !rows ? (
        <Stack gap="sm" role="status" aria-label="Đang tải">
          <Skeleton h={56} />
          <Skeleton h={320} />
        </Stack>
      ) : (
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="xs">
            <Info label="Tổ SX" value={typeof d.lineCode === 'string' ? (lineName.get(d.lineCode) ?? d.lineCode) : d.lineCode} />
            <Info label="Ngày vào chuyền" value={start ? fmtDate(start) : d.startDate} />
            <Info label="Kế hoạch" value={d.planNo} />
            <Info label="Khách hàng" value={d.customerName} />
            <Info label="Tên sản phẩm" value={d.productName} />
            <Info label="SL của chuyền" value={typeof d.lineQty === 'number' ? fmtNum(d.lineQty) : d.lineQty} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            {headField('styleType', 'Loại mã', (lock) => <TextInput label="Loại mã" maxLength={50} value={head.styleType} onChange={(e) => setHead({ ...head, styleType: e.currentTarget.value })} {...lock} />)}
            {headField('confirmedQty', 'Số lượng chốt UD', (lock) => (
              <NumberInput label="Số lượng chốt UD" min={0} max={100_000_000} allowDecimal={false} thousandSeparator="." decimalSeparator="," value={head.confirmedQty} onChange={(v) => setHead({ ...head, confirmedQty: v === '' ? '' : Number(v) })} {...lock} />
            ))}
            {headField('priorityFactor', 'HS Ưu đãi VC', (lock) => (
              <NumberInput label="HS Ưu đãi VC" min={0} decimalScale={2} thousandSeparator="." decimalSeparator="," value={head.priorityFactor} onChange={(v) => setHead({ ...head, priorityFactor: v === '' ? '' : Number(v) })} {...lock} />
            ))}
          </SimpleGrid>
          {stepsLevel === 'HIDDEN' || stepsLevel === 'MASKED' ? (
            <Alert variant="light" color="gray">Các bước chuẩn bị bị {stepsLevel === 'HIDDEN' ? 'ẩn' : 'che'} theo phân quyền của bạn.</Alert>
          ) : (
            <>
              {(futureDone.length > 0 || badDays.length > 0) && (
                <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} py={8}>
                  {futureDone.map((r) => `${r.name}: ngày thực hiện ${fmtDate(r.doneDate)} sau hôm nay`).concat(badDays.map((r) => `${r.name}: số ngày KH tối đa 365`)).join('. ')}.
                </Alert>
              )}
              <div style={{ height: mobile ? '60vh' : 'min(56vh, 520px)', display: 'flex', flexDirection: 'column' }}>
                {canSteps ? (
                  <SheetGrid label="Các bước chuẩn bị" value={rows} onChange={setRows} columns={sheetCols} rowKey={(r) => r.key} />
                ) : (
                  <DataGrid label="Các bước chuẩn bị" fill rows={rows} rowKey={(r) => r.key} columns={viewCols} />
                )}
              </div>
              <Text size="xs" c="dimmed">
                KH = Ngày vào chuyền − Số ngày KH (ngày lịch). Xóa trắng ô Số ngày KH để dùng lại số mặc định của danh mục Cấu hình chuẩn bị SX.
              </Text>
            </>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>
              {canEdit ? 'Hủy' : 'Đóng'}
            </Button>
            {canEdit && (
              <ActionButton loading={save.isPending} blockedReason={blocked} onClick={() => save.mutate()}>
                Lưu thay đổi
              </ActionButton>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="sm" fw={600} truncate="end">
        {value === MASK ? <Masked /> : value == null || value === '' ? '–' : value}
      </Text>
    </div>
  );
}
