import { Alert, Button, Center, Group, Loader, MultiSelect, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle, IconCheck, IconCircleX, IconEdit, IconFilterOff, IconPlus, IconRowInsertBottom, IconSearch, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton, PICK_ROW } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { ColumnFilterNote } from '../../components/ColumnFilter';
import { DataGrid, type Column } from '../../components/DataGrid';
import { DateField } from '../../components/DateField';
import { DebouncedAutocomplete, DebouncedTextInput } from '../../components/DebouncedInput';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetNumber, sheetReadonly, type SheetColumn } from '../../components/SheetGrid';
import { TreeSelect } from '../../components/TreeSelect';
import { WorkPage } from '../../components/WorkPage';
import { EmptyState } from '../../components/EmptyState';
import { ExportButton } from '../../components/ExportButton';
import { StatusBadge, statusOptions } from '../../components/StatusBadge';
import { api, ApiError } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { MASK, readable, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { fmtDate, fmtNum, qs } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { LINE_EMPTY, LINE_NOT_FOUND, lineOptions, useLines } from '../../lib/lines';
import { loadError, toastError, toastOk } from '../../lib/notify';
import { emptyFilter, usePagedList, type OrderFilter } from '../../lib/pagedList';
import { useCanWrite } from '../../shell/permissions';
import { useSession } from '../../store/session';
import type { Supply, SupplyDetail, SupplyKey, SupplySaveResult, SupplySheet } from './api';
import { appendRows, changes, keysOf, negative, overSync, overSyncCells, remainOf, rowKey, rowsOf, saveIssue, settle, type SupplyRow } from './cuttingSupplyRules';

const RESOURCE = 'cutting.supply';

/** Trạng thái lệnh cấp theo ảnh mẫu: xanh cấp toàn phần, vàng cấp một phần, đỏ chưa cấp */
export const SUPPLY_STATUS = {
  PENDING: { label: 'Chưa cấp', color: 'red' },
  PARTIAL: { label: 'Cấp 1 phần', color: 'yellow' },
  FULL: { label: 'Cấp toàn phần', color: 'teal' },
};

/** Ngày theo giờ Việt Nam của một thời điểm (Ngày tạo phiếu) */
const vnDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso));

const COLUMNS: Column<Supply>[] = [
  { key: 'createdAt', title: 'Ngày tạo phiếu', sortKey: 'createdAt', filterKey: 'createdAt', field: null, render: (r) => fmtDate(vnDay(r.createdAt)) },
  { key: 'supplyNo', title: 'Số lệnh cấp', sortKey: 'supplyNo', filterKey: 'supplyNo', format: 'code' },
  { key: 'supplyDate', title: 'Ngày cấp', sortKey: 'supplyDate', filterKey: 'supplyDate', format: 'date' },
  { key: 'branchCode', title: 'Chi nhánh', sortKey: 'branchCode', filterKey: 'branchCode', field: null },
  { key: 'styleCode', title: 'Mã hàng', sortKey: 'styleCode', filterKey: 'styleCode', format: 'code', minWidth: 180 },
  { key: 'dayQty', title: 'Tổng SL cấp', sortKey: 'dayQty', filterKey: 'dayQty', format: 'number' },
  { key: 'creatorName', title: 'Người lập', sortKey: 'creatorName', filterKey: 'creatorName', minWidth: 140 },
  { key: 'confirmerName', title: 'Người cấp', sortKey: 'confirmerName', filterKey: 'confirmerName', minWidth: 140 },
  {
    key: 'statusCode',
    title: 'Trạng thái',
    sortKey: 'statusCode',
    filterKey: 'statusCode',
    filterLabel: (v) => SUPPLY_STATUS[v as keyof typeof SUPPLY_STATUS]?.label ?? String(v),
    render: (r) => <StatusBadge map={SUPPLY_STATUS} code={String(r.statusCode)} />,
  },
  { key: 'note', title: 'Ghi chú', filterKey: 'note', minWidth: 160, maxWidth: 280 },
];
const NAMES: Record<string, string> = {
  ...Object.fromEntries(COLUMNS.map((c) => [c.key, c.title])),
  lineCode: 'Chuyền sản xuất',
  planQty: 'Số lượng kế hoạch',
  syncQty: 'Số lượng đồng bộ',
  suppliedQty: 'Số lượng đã cấp',
  remainQty: 'Số lượng còn lại',
};
NAMES.dayQty = 'Số lượng cấp trong ngày';

/** Phần dưới: xem chi tiết lệnh đang chọn, hoặc form Thêm mới, Sửa */
type Mode = { kind: 'view' } | { kind: 'new' } | { kind: 'edit'; id: number };

/**
 * Màn "Xác nhận cấp BTP" (phase 5.15) theo ảnh docs/screens/cap-ban-thanh-pham.png: lưới trên là các lệnh cấp (một lệnh mỗi Ngày cấp,
 * mã hàng); hàng nút; khung dưới là chi tiết lệnh đang chọn, hoặc form nhập số cấp trong ngày theo chuyền, màu, cỡ.
 */
export default function CuttingSupplyPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const list = usePagedList<Supply>('cutting-supply', '/cutting/supply');
  const columns = useMemo(() => withBranchNames(COLUMNS, branchName), [branchName]);
  const canUpdate = useCanWrite(`${RESOURCE}:update`);
  const canCreate = useCanWrite(`${RESOURCE}:create`) && canUpdate;
  // Chuyền, Mã hàng là khóa của dòng nhập: bị Ẩn, Che thì form không dựng được dòng (review 5.15 M3)
  const keysHidden = !readable(policy, 'lineCode') || !readable(policy, 'styleCode') ? 'Cột Chuyền sản xuất hoặc Mã hàng bị ẩn, che với bạn nên không nhập được số cấp' : null;
  const canDelete = useCanWrite(`${RESOURCE}:delete`);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const [dirty, setDirty] = useState(false);
  const items = list.query.data?.items ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const detailKey = ['order', 'cutting-supply-detail', selectedId];
  const detail = useQuery({ queryKey: detailKey, queryFn: () => api<SupplyDetail>(`/cutting/supply/${selectedId}`), enabled: selectedId !== null });
  const d = detail.data && detail.data.id === selectedId ? detail.data : null;
  const editing = mode.kind !== 'view';
  const label = d ? String(d.supplyNo ?? `#${d.id}`) : '';

  /** Rời form đang nhập (chọn lệnh khác, Hủy): hỏi lại khi còn ô chưa lưu */
  const leaveForm = (then: () => void) =>
    confirmDiscard(editing && dirty, () => {
      setDirty(false);
      setMode({ kind: 'view' });
      then();
    });

  const refresh = async (id: number | null) => {
    await qc.invalidateQueries({ queryKey: ['order'] });
    setSelectedId(id);
  };

  const act = useMutation({
    mutationFn: ({ path, method }: { path: string; method: 'POST' | 'DELETE'; done: string }) => api<SupplyDetail | { removed: boolean }>(path, { method }),
    onSuccess: async (res, v) => {
      toastOk(`${v.done} lệnh ${label}.`, v.done);
      await refresh(v.method === 'DELETE' ? null : selectedId);
      if (v.method !== 'DELETE') qc.setQueryData(detailKey, res);
    },
    onError: (e) => toastError(e, 'Chưa thực hiện được'),
  });
  const confirmSupply = () =>
    d &&
    confirmAction({
      title: `Xác nhận cấp lệnh ${label}?`,
      consequence: 'Bạn là người cấp của lệnh này. Trạng thái tính theo số lượng còn lại lúc bấm: còn dòng chưa cấp hết là Cấp 1 phần. Lệnh đã xác nhận không sửa, không xóa được tới khi Hủy duyệt.',
      confirmLabel: 'Xác nhận cấp',
      danger: false,
      onConfirm: () => act.mutate({ path: `/cutting/supply/${d.id}/confirm`, method: 'POST', done: 'Đã xác nhận cấp' }),
    });
  const unconfirm = () =>
    d &&
    confirmAction({
      title: `Hủy duyệt lệnh ${label}?`,
      consequence: 'Lệnh về Chưa cấp, bỏ người cấp; sau đó sửa, xóa được lệnh.',
      confirmLabel: 'Hủy duyệt',
      onConfirm: () => act.mutate({ path: `/cutting/supply/${d.id}/unconfirm`, method: 'POST', done: 'Đã hủy duyệt' }),
    });
  const remove = () =>
    d &&
    confirmAction({
      title: `Xóa lệnh cấp ${label}?`,
      consequence: (
        <>
          Xóa lệnh <b>{label}</b> cùng mọi số cấp của lệnh (ngày {fmtDate(String(d.supplyDate ?? ''))}). Không lấy lại được.
        </>
      ),
      confirmLabel: 'Xóa lệnh',
      onConfirm: () => act.mutate({ path: `/cutting/supply/${d.id}`, method: 'DELETE', done: 'Đã xóa' }),
    });

  const busy = editing ? 'Lưu hoặc hủy form đang nhập trước' : keysHidden;
  const need = (ok: boolean | undefined, why: string) => (editing ? busy : null) ?? (!selected ? PICK_ROW : !d ? 'Đang tải lệnh…' : ok ? null : why);

  return (
    <WorkPage
      title="Xác nhận cấp BTP"
      subtitle={
        branch?.isAggregate
          ? 'Lệnh cấp bán thành phẩm của mọi đơn vị cơ sở bạn được xem, chỉ đọc'
          : 'Mỗi lệnh gom số cấp của một mã hàng trong một ngày cho các chuyền. Chọn lệnh để xem chi tiết bên dưới.'
      }
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="lenh-cap-btp.csv" />
        </>
      }
      filters={<SupplyFilters policy={policy} value={list.filter} onChange={list.setFilter} columns={list.columnsOf(NAMES, policy)} />}
    >
      <div className="split-rows supply-split" data-editing={editing || undefined}>
        <div className="pane">
          <DataGrid
            label="Danh sách lệnh cấp BTP"
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
            onRowClick={(r) => r.id !== selectedId && leaveForm(() => setSelectedId(r.id))}
            empty={
              <EmptyState
                filtered={list.filtered}
                what="lệnh cấp"
                onClear={list.clearFilter}
                hint={canCreate ? 'Chưa có lệnh cấp nào. Bấm Thêm mới để ghi số bán thành phẩm cấp cho chuyền.' : 'Chưa có lệnh cấp nào.'}
              />
            }
            footer={<Pager page={list.page} pageSize={list.pageSize} total={list.query.data?.total ?? 0} onPage={list.setPage} />}
          />
        </div>
        <div className="pane supply-pane">
          <Group gap="xs" wrap="wrap" className="supply-actions">
            {canCreate && (
              <ActionButton leftSection={<IconPlus size={16} />} blockedReason={busy} onClick={() => leaveForm(() => setMode({ kind: 'new' }))}>
                Thêm mới
              </ActionButton>
            )}
            {canUpdate && (
              <ActionButton variant="default" leftSection={<IconEdit size={16} />} blockedReason={keysHidden ?? need(d?.canEdit, 'Lệnh đã xác nhận cấp: Hủy duyệt trước khi sửa')} onClick={() => d && setMode({ kind: 'edit', id: d.id })}>
                Sửa
              </ActionButton>
            )}
            {canDelete && (
              <ActionButton variant="default" color="red" leftSection={<IconTrash size={16} />} loading={act.isPending && act.variables?.method === 'DELETE'} blockedReason={need(d?.canDelete, 'Lệnh đã xác nhận cấp: Hủy duyệt trước khi xóa')} onClick={remove}>
                Xóa
              </ActionButton>
            )}
            {canUpdate && (
              <ActionButton variant="default" leftSection={<IconCheck size={16} />} loading={act.isPending && act.variables?.path.endsWith('/confirm')} blockedReason={need(d?.canConfirm, 'Lệnh đã được xác nhận cấp')} onClick={confirmSupply}>
                Xác nhận cấp
              </ActionButton>
            )}
            {canUpdate && (
              <ActionButton variant="default" color="red" leftSection={<IconCircleX size={16} />} loading={act.isPending && act.variables?.path.endsWith('/unconfirm')} blockedReason={need(d?.canUnconfirm, 'Lệnh chưa được xác nhận cấp')} onClick={unconfirm}>
                Hủy duyệt
              </ActionButton>
            )}
          </Group>
          {editing ? (
            <SupplyForm
              key={mode.kind === 'edit' ? `edit-${mode.id}` : 'new'}
              source={mode.kind === 'edit' ? d : null}
              policy={policy}
              onDirty={setDirty}
              onCancel={() => leaveForm(() => undefined)}
              onSaved={async (id, removed) => {
                setDirty(false);
                setMode({ kind: 'view' });
                // Lệnh đang chọn vừa tự bỏ (mọi ô về 0) thì không chọn lại
                const fallback = mode.kind === 'edit' ? mode.id : selectedId;
                await refresh(id ?? (fallback !== null && !removed.includes(fallback) ? fallback : null));
              }}
            />
          ) : (
            <SupplyView detail={d} loading={selectedId !== null && !d && !detail.error} error={detail.error} onRetry={() => void detail.refetch()} picked={selectedId !== null} />
          )}
        </div>
      </div>
    </WorkPage>
  );
}

/** Dải lọc theo ảnh mẫu: Ngày tạo phiếu từ, đến; Chi nhánh; Số lệnh cấp; Mã hàng; Người lập; Trạng thái. Lọc ngay khi đổi. */
function SupplyFilters({ value, onChange, policy, columns }: { value: OrderFilter; onChange: (f: OrderFilter) => void; policy: FieldPolicy; columns: { names: string[]; onClear: () => void } }) {
  const set = (patch: Partial<OrderFilter>) => onChange({ ...value, ...patch });
  const dirty = Object.values(value).some(Boolean) || columns.names.length > 0;
  const creators = useQuery({
    queryKey: ['order', 'cutting-supply-creators'],
    queryFn: () => api<{ values: (string | null)[] }>(`/cutting/supply/values${qs({ field: 'creatorName' })}`),
    enabled: readable(policy, 'creatorName'),
    staleTime: 60_000,
  });
  const creatorList = useMemo(() => (creators.data?.values ?? []).filter((v): v is string => !!v), [creators.data]);
  return (
    <Group gap="sm" align="flex-end" wrap="wrap" className="filter-bar">
      <Group gap={6} align="flex-end" wrap="nowrap">
        <DateField label="Ngày tạo phiếu từ" value={value.createdFrom} onChange={(v) => set({ createdFrom: v })} w={136} />
        <DateField label="đến" value={value.createdTo} onChange={(v) => set({ createdTo: v })} minDate={value.createdFrom || undefined} w={136} />
      </Group>
      {readable(policy, 'supplyNo') && <DebouncedTextInput label="Số lệnh cấp" placeholder="Nhập số lệnh cấp" value={value.supplyNo} onChange={(v) => set({ supplyNo: v })} w={150} />}
      {readable(policy, 'styleCode') && <DebouncedTextInput label="Mã hàng" placeholder="Gõ một phần mã" leftSection={<IconSearch size={14} />} value={value.style} onChange={(v) => set({ style: v })} w={170} />}
      {readable(policy, 'creatorName') && <DebouncedAutocomplete label="Người lập" placeholder="Tất cả" data={creatorList} limit={50} value={value.creator} onChange={(v) => set({ creator: v })} w={160} />}
      {readable(policy, 'statusCode') && <Select label="Trạng thái" placeholder="Tất cả" data={statusOptions(SUPPLY_STATUS)} value={value.status || null} onChange={(v) => set({ status: v ?? '' })} clearable w={150} />}
      <ColumnFilterNote names={columns.names} />
      {dirty && (
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconFilterOff size={15} />}
          onClick={() => {
            onChange(emptyFilter);
            columns.onClear();
          }}
        >
          Xóa lọc
        </Button>
      )}
    </Group>
  );
}

/** Số đẹp của ô số lượng; ô bị Che hiện "***", không có thì để trống */
const qtyText = (v: unknown) => (v === MASK ? MASK : typeof v === 'number' ? fmtNum(v) : '');
const qtyCopy = (v: unknown) => (typeof v === 'number' ? v : null);

/**
 * Cột của lưới chi tiết theo ảnh: Chuyền sản xuất, Mã hàng, Màu, Cỡ, SL kế hoạch, SL đồng bộ, SL đã cấp, SL cấp trong ngày (ô nhập
 * duy nhất), SL còn lại (tô đỏ khi âm hoặc tổng cấp vượt số đã cắt). Quyền sửa, ô vượt (tính lại mỗi phím gõ) đọc qua ref để cột giữ nguyên.
 */
function useSheetColumns(editable: (r: SupplyRow) => boolean, over: () => Set<string>) {
  const fns = useRef({ editable, over });
  fns.current = { editable, over };
  return useMemo<SheetColumn<SupplyRow>[]>(() => {
    const lockCls = (r: SupplyRow) => (r.locked || !r.inPlan ? 'cut-removed' : undefined);
    return [
      sheetReadonly<SupplyRow>('Chuyền sản xuất', (r) => r.lineName, (r) => r.lineName, { minWidth: 104, grow: 1, className: lockCls }),
      sheetReadonly<SupplyRow>('Mã hàng', (r) => <span title={r.productName ?? undefined}>{r.style}</span>, (r) => r.style, { minWidth: 150, grow: 2, className: lockCls }),
      sheetReadonly<SupplyRow>('Màu sản phẩm', (r) => r.colorName, (r) => r.colorName, { minWidth: 110, grow: 1, className: lockCls }),
      sheetReadonly<SupplyRow>('Cỡ sản phẩm', (r) => r.sizeName, (r) => r.sizeName, { minWidth: 92, className: lockCls }),
      sheetReadonly<SupplyRow>('SL kế hoạch', (r) => qtyText(r.planQty), (r) => qtyCopy(r.planQty), { minWidth: 96, align: 'right' }),
      sheetReadonly<SupplyRow>('SL đồng bộ', (r) => qtyText(r.syncQty), (r) => qtyCopy(r.syncQty), {
        minWidth: 96,
        align: 'right',
        className: (r) => (overSync(r, fns.current.over()) ? 'sheet-error' : undefined),
      }),
      sheetReadonly<SupplyRow>('SL đã cấp', (r) => qtyText(r.suppliedQty), (r) => qtyCopy(r.suppliedQty), { minWidth: 96, align: 'right' }),
      sheetNumber<SupplyRow>('dayQty', 'SL cấp trong ngày', { minWidth: 120, disabled: (r) => !fns.current.editable(r), className: (r) => (r.dayMasked ? 'cut-masked' : undefined) }),
      sheetReadonly<SupplyRow>('SL còn lại', (r) => qtyText(remainOf(r)), (r) => qtyCopy(remainOf(r)), {
        minWidth: 96,
        align: 'right',
        className: (r) => (negative(r) ? 'sheet-error' : undefined),
      }),
    ];
    // Cột dựng một lần: quyền sửa, ô vượt đọc qua ref
  }, []);
}

/** Chi tiết lệnh đang chọn (chỉ xem) */
function SupplyView({ detail, loading, error, onRetry, picked }: { detail: SupplyDetail | null; loading: boolean; error: unknown; onRetry: () => void; picked: boolean }) {
  const rows = useMemo(() => (detail ? rowsOf(detail.rows) : []), [detail]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const columns = useSheetColumns(
    () => false,
    () => overSyncCells(rowsRef.current),
  );
  if (!picked) return <div className="supply-empty">Chọn một lệnh cấp ở lưới trên để xem chi tiết.</div>;
  if (!detail)
    return (
      <Center className="supply-empty">
        {loading ? (
          <Loader size="sm" aria-label="Đang tải lệnh cấp" />
        ) : (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
            <Stack gap={6} align="flex-start">
              {loadError(error, 'Không tải được lệnh cấp.')}
              <Button size="xs" variant="default" onClick={onRetry}>
                Thử lại
              </Button>
            </Stack>
          </Alert>
        )}
      </Center>
    );
  return (
    <>
      <div className="supply-head">
        <TextInput label="Ngày cấp" value={fmtDate(String(detail.supplyDate ?? ''))} readOnly className="field-readonly" w={150} />
        <TextInput label="Người lập" value={String(detail.creatorName ?? '')} readOnly className="field-readonly" w={200} />
        <TextInput label="Người cấp" value={String(detail.confirmerName ?? '')} placeholder="Chưa xác nhận" readOnly className="field-readonly" w={200} />
        <TextInput label="Ghi chú" value={String(detail.note ?? '')} readOnly className="field-readonly supply-note" />
      </div>
      <div className="supply-sheet">
        <SheetGrid key={detail.id} label={`Chi tiết lệnh cấp ${String(detail.supplyNo ?? '')}`} value={rows} onChange={() => undefined} columns={columns} rowKey={(r) => r.key} hint="Chỉ xem. Bấm Sửa để đổi số cấp của lệnh Chưa cấp." />
      </div>
    </>
  );
}

/**
 * Form Thêm mới, Sửa: Ngày cấp (mặc định hôm nay, sửa được, không sau hôm nay), Người lập (tài khoản đăng nhập), Ghi chú; thêm dòng
 * bằng thanh chọn Chuyền → Mã hàng → Màu, Cỡ; nhập Số lượng cấp trong ngày. Đổi Ngày cấp thì nạp lại số đã lưu của ngày đó (cột Trong
 * ngày, Đã cấp, Còn lại đổi; SL kế hoạch, SL đồng bộ giữ). Lưu thì máy chủ gom dòng theo mã hàng vào lệnh của ngày đó.
 */
function SupplyForm({
  source,
  policy,
  onDirty,
  onCancel,
  onSaved,
}: {
  source: SupplyDetail | null;
  policy: FieldPolicy;
  onDirty: (dirty: boolean) => void;
  onCancel: () => void;
  onSaved: (id: number | null, removed: number[]) => Promise<void>;
}) {
  const user = useSession((s) => s.user);
  const [date, setDate] = useState<string>(() => String(source?.supplyDate ?? source?.today ?? ''));
  const [today, setToday] = useState<string | null>(source?.today ?? null);
  const initialNote = source && typeof source.note === 'string' && source.note !== MASK ? source.note : '';
  const [note, setNote] = useState(initialNote);
  const [savedNote, setSavedNote] = useState(initialNote);
  // Lệnh mở Sửa được là lệnh Chưa cấp: dòng không khóa
  const [rows, setRows] = useState<SupplyRow[]>(() => (source ? rowsOf(source.rows) : []));
  const [loadingSheet, setLoadingSheet] = useState(false);

  // Ngày cấp mặc định hôm nay theo máy chủ (giờ Việt Nam): form Thêm mới hỏi lưới rỗng để biết hôm nay
  useEffect(() => {
    if (date) return;
    const local = vnDay(new Date().toISOString());
    void api<SupplySheet>('/cutting/supply/sheet', { method: 'POST', body: { date: local, items: [] } })
      .then((s) => {
        setToday(s.today);
        setDate(s.today);
      })
      .catch(() => setDate(local));
  }, [date]);

  const canEditDay = policy.editable('dayQty');
  const canEditNote = policy.editable('note');
  const noteChanged = canEditNote && note.trim() !== savedNote.trim();
  const dirty = changes(rows).length > 0 || noteChanged;
  useLeaveGuard(dirty);
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const editRef = useRef(canEditDay);
  editRef.current = canEditDay;
  const editable = (r: SupplyRow) => editRef.current && !r.locked && !r.dayMasked && (r.inPlan || (r.savedDay ?? 0) > 0);
  // Ô vượt SL đồng bộ tính một lần mỗi lần lưới đổi (cột đọc qua ref, không tính lại cho từng ô)
  const over = useMemo(() => overSyncCells(rows), [rows]);
  const overRef = useRef(over);
  overRef.current = over;
  const columns = useSheetColumns(editable, () => overRef.current);
  const change = (next: SupplyRow[]) => setRows((prev) => settle(next, prev, editable));

  /** Tính lại các dòng theo Ngày cấp (máy chủ): đổi ngày thì thay số; thêm dòng thì nối vào cuối */
  const loadSheet = async (on: string, keys: SupplyKey[]) => {
    setLoadingSheet(true);
    try {
      const s = await api<SupplySheet>('/cutting/supply/sheet', { method: 'POST', body: { date: on, items: keys } });
      setToday(s.today);
      return s;
    } finally {
      setLoadingSheet(false);
    }
  };

  const pickDate = (next: string) => {
    if (!next || next === date || (today && next > today)) return;
    confirmDiscard(
      changes(rows).length > 0,
      async () => {
        try {
          const keys = keysOf(rows);
          const s = await loadSheet(next, keys);
          setDate(next);
          setRows(rowsOf(s.rows, keys));
          // Ghi chú theo lệnh đã có của ngày đó (một mã hàng); không có thì giữ chữ đang gõ
          const one = s.supplies.length === 1 ? (s.supplies[0].note ?? '') : null;
          if (one !== null) {
            setNote(one);
            setSavedNote(one);
          }
        } catch (e) {
          toastError(e, 'Chưa tải được số của ngày đó');
        }
      },
      'Số cấp bạn vừa nhập cho ngày đang xem chưa lưu sẽ mất.',
    );
  };

  const addRows = async (keys: SupplyKey[]) => {
    try {
      const s = await loadSheet(date, keys);
      setRows((prev) => appendRows(prev, rowsOf(s.rows, keys)));
    } catch (e) {
      toastError(e, 'Chưa thêm được dòng');
    }
  };

  /** Mã hàng của form: Ghi chú áp cho lệnh của từng mã hàng ở Ngày cấp (cả khi chỉ đổi Ghi chú) */
  const stylesOf = () => {
    const list = [...new Set(rows.map((r) => r.style).filter(Boolean))];
    if (!list.length && typeof source?.styleCode === 'string' && source.styleCode !== MASK) list.push(source.styleCode);
    return list;
  };

  const save = useMutation({
    mutationFn: () =>
      api<SupplySaveResult>('/cutting/supply', {
        method: 'PUT',
        body: { date, items: changes(rows), styles: stylesOf(), ...(noteChanged ? { note: note.trim() || null } : {}) },
      }),
    onSuccess: async (res) => {
      const kept = res.saved.filter((s) => !s.removed);
      const made = kept.filter((s) => s.created).map((s) => s.supplyNo);
      toastOk(made.length ? `Đã tạo lệnh ${made.join(', ')}.` : `Đã lưu số cấp ngày ${fmtDate(date)}.`, 'Đã lưu');
      await onSaved(kept.length === 1 ? kept[0].id : null, res.saved.filter((s) => s.removed).map((s) => s.id));
    },
    onError: (e) => {
      toastError(e, 'Chưa lưu được');
      // 422, 409 có thể do phân bổ, số cắt, số cấp vừa đổi ở nơi khác: tải lại số, giữ số đang nhập
      if (e instanceof ApiError && (e.status === 422 || e.status === 409)) {
        const keys = keysOf(rows);
        void loadSheet(date, keys)
          .then((s) =>
            // Ghép theo lưới mới nhất (cả ô sửa, dòng thêm trong lúc chờ tải): giữ số đang gõ của ô đã sửa, giữ dòng thêm sau
            setRows((now) => {
              const typed = new Map(now.map((r) => [r.key, r.dayQty]));
              const fresh = rowsOf(s.rows, keys).map((r) => {
                if (!typed.has(r.key) || !editable(r)) return r;
                return { ...r, dayQty: typed.get(r.key) ?? null };
              });
              const have = new Set(fresh.map((r) => r.key));
              return [...fresh, ...now.filter((r) => !have.has(r.key))];
            }),
          )
          .catch(() => undefined);
      }
    },
  });

  const issue = !date ? 'Đang lấy ngày hôm nay…' : !stylesOf().length ? 'Thêm ít nhất một dòng: chọn chuyền, mã hàng rồi bấm Thêm vào lưới' : saveIssue(rows, noteChanged);
  const locked = rows.filter((r) => r.locked).length;
  const blank = rows.filter((r) => r.savedDay === null && r.dayQty === null);

  return (
    <>
      <div className="supply-head">
        <DateField label="Ngày cấp" value={date} onChange={pickDate} maxDate={today ?? undefined} clearable={false} required w={150} />
        <TextInput label="Người lập" value={source ? String(source.creatorName ?? '') : (user?.fullName ?? '')} readOnly className="field-readonly" w={200} />
        <TextInput label="Ghi chú" placeholder="Nhập ghi chú (nếu có)" value={note} onChange={(e) => setNote(e.currentTarget.value)} maxLength={500} readOnly={!canEditNote} className={canEditNote ? 'supply-note' : 'field-readonly supply-note'} />
      </div>
      {canEditDay && <SupplyPicker date={date} have={rows} onAdd={addRows} adding={loadingSheet} />}
      {locked > 0 && (
        <Text size="sm" c="dimmed">
          {locked} dòng thuộc lệnh đã xác nhận cấp của ngày {fmtDate(date)}: chỉ xem. Hủy duyệt lệnh đó trước khi sửa.
        </Text>
      )}
      <div className="supply-sheet">
        <SheetGrid
          label="Số cấp trong ngày theo chuyền, màu, cỡ"
          value={rows}
          onChange={change}
          columns={columns}
          rowKey={(r) => r.key}
          empty={<span>Chưa có dòng nào. Chọn chuyền, mã hàng ở thanh trên rồi bấm Thêm vào lưới.</span>}
          hint={canEditDay ? 'Nhập SL cấp trong ngày; để trống hoặc 0 là không cấp. SL còn lại = SL kế hoạch − SL đã cấp (các ngày khác) − SL cấp trong ngày. Dán từ Excel: chọn ô đầu rồi Ctrl+V.' : undefined}
        />
      </div>
      {over.size > 0 && (
        <Text size="sm" c="red">
          Ô SL đồng bộ tô đỏ: tổng cấp mọi chuyền của màu cỡ đó vượt số đã cắt.
        </Text>
      )}
      <Group justify="space-between" gap="xs">
        <Group gap="xs">
          <ActionButton loading={save.isPending} blockedReason={loadingSheet ? 'Đang tải số…' : issue} onClick={() => save.mutate()}>
            Lưu lại
          </ActionButton>
          <Button variant="default" onClick={onCancel}>
            Hủy
          </Button>
        </Group>
        {blank.length > 0 && (
          <Button variant="subtle" color="gray" size="sm" onClick={() => setRows((prev) => prev.filter((r) => !(r.savedDay === null && r.dayQty === null)))}>
            Bỏ {blank.length} dòng chưa nhập số
          </Button>
        )}
      </Group>
    </>
  );
}

/**
 * Thanh thêm dòng: Chuyền (cây sơ đồ tổ chức) → Mã hàng (đã phân màu cỡ cho chuyền) → Màu, Cỡ (của chuyền và mã hàng; để trống là tất
 * cả) → Thêm vào lưới: mỗi màu cỡ một dòng, bỏ dòng đã có.
 */
function SupplyPicker({ date, have, onAdd, adding }: { date: string; have: SupplyRow[]; onAdd: (keys: SupplyKey[]) => Promise<void>; adding: boolean }) {
  const lines = useLines();
  const branchName = useBranchName();
  const lineChoices = useMemo(() => lineOptions(lines, undefined, branchName), [lines, branchName]);
  const [line, setLine] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const styles = useQuery({
    queryKey: ['order', 'cutting-supply-styles', line],
    queryFn: () => api<{ styleCode: string; productName: string }[]>(`/cutting/supply/options/styles${qs({ line })}`),
    enabled: !!line,
  });
  const cells = useQuery({
    queryKey: ['order', 'cutting-supply-cells', line, style],
    queryFn: () => api<{ colorName: string; sizeName: string }[]>(`/cutting/supply/options/color-sizes${qs({ line, style })}`),
    enabled: !!line && !!style,
  });
  const all = useMemo(() => cells.data ?? [], [cells.data]);
  const colorList = useMemo(() => [...new Set(all.map((c) => c.colorName))], [all]);
  const sizeList = useMemo(() => [...new Set(all.filter((c) => !colors.length || colors.includes(c.colorName)).map((c) => c.sizeName))], [all, colors]);
  const keys = useMemo<SupplyKey[]>(
    () =>
      line && style
        ? all.filter((c) => (!colors.length || colors.includes(c.colorName)) && (!sizes.length || sizes.includes(c.sizeName))).map((c) => ({ line, style, colorName: c.colorName, sizeName: c.sizeName }))
        : [],
    [all, line, style, colors, sizes],
  );
  const haveKeys = useMemo(() => new Set(have.map((r) => r.key)), [have]);
  const fresh = keys.filter((k) => !haveKeys.has(rowKey(k)));
  const styleOptions = (styles.data ?? []).map((s) => ({ value: s.styleCode, label: s.productName ? `${s.styleCode} (${s.productName})` : s.styleCode }));
  const why = !line
    ? 'Chọn chuyền sản xuất'
    : !style
      ? 'Chọn mã hàng'
      : cells.isFetching
        ? 'Đang tải màu cỡ…'
        : !keys.length
          ? 'Không có màu cỡ nào khớp'
          : !fresh.length
            ? 'Các màu cỡ này đã có trong lưới'
            : !date
              ? 'Đang lấy ngày hôm nay…'
              : null;

  return (
    <Group gap="sm" align="flex-end" wrap="wrap" className="supply-picker">
      <TreeSelect
        label="Chuyền sản xuất"
        placeholder="Chọn chuyền"
        options={lineChoices}
        value={line}
        onChange={(v) => {
          setLine(v);
          setStyle(null);
          setColors([]);
          setSizes([]);
        }}
        unit="chuyền"
        nothingFoundMessage={LINE_NOT_FOUND}
        emptyMessage={LINE_EMPTY}
        w={190}
      />
      <Select
        label="Mã hàng"
        placeholder={!line ? 'Chọn chuyền trước' : styles.isFetching ? 'Đang tải…' : 'Chọn mã hàng'}
        data={styleOptions}
        value={style}
        onChange={(v) => {
          setStyle(v);
          setColors([]);
          setSizes([]);
        }}
        disabled={!line}
        searchable
        nothingFoundMessage={line && !styles.isFetching ? 'Chuyền này chưa được phân màu cỡ mã hàng nào' : undefined}
        w={250}
      />
      <MultiSelect label="Màu sản phẩm" placeholder={colors.length ? undefined : 'Tất cả'} data={colorList} value={colors} onChange={setColors} disabled={!style} clearable searchable w={170} />
      <MultiSelect label="Cỡ sản phẩm" placeholder={sizes.length ? undefined : 'Tất cả'} data={sizeList} value={sizes.filter((s) => sizeList.includes(s))} onChange={setSizes} disabled={!style} clearable searchable w={150} />
      <ActionButton variant="light" leftSection={<IconRowInsertBottom size={16} />} loading={adding} blockedReason={why} onClick={() => void onAdd(fresh)}>
        Thêm vào lưới{fresh.length ? ` (${fresh.length})` : ''}
      </ActionButton>
    </Group>
  );
}
