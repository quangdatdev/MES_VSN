import { Alert, Badge, Button, Checkbox, Drawer, Group, Loader, SegmentedControl, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import { IconAlertTriangle, IconDatabaseImport, IconHistory, IconRefresh } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { PageHeader } from '../../components/PageHeader';
import { Pager } from '../../components/Pager';
import { api, ApiError } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { toastError, toastOk } from '../../lib/notify';
import type { Paged } from '../../lib/types';
import { useCan } from '../../shell/permissions';
import { EmptyRow, FilterBar, LoadError, SkeletonRows } from './common';
import { useUrlParams } from '../../lib/useUrlParams';
import type { SyncRunInfo, SyncRunRow, SyncSourceInfo, SyncStatus } from './types';

const SOURCES_KEY = ['admin', 'sync', 'sources'];
const GROUP_LABEL: Record<string, string> = { CATALOG: 'Danh mục', ORDER: 'Đơn hàng' };
const GROUP_ORDER = ['CATALOG', 'ORDER'];
const FILTERS = ['ALL', 'CATALOG', 'ORDER', 'FAILED'] as const;
type Filter = (typeof FILTERS)[number];
const STATUS: Record<SyncStatus, { label: string; color: string }> = {
  QUEUED: { label: 'Đang chờ', color: 'gray' },
  RUNNING: { label: 'Đang chạy', color: 'link' },
  SUCCEEDED: { label: 'Thành công', color: 'teal' },
  FAILED: { label: 'Lỗi', color: 'red' },
};
const busy = (r: SyncRunInfo | null) => r?.status === 'QUEUED' || r?.status === 'RUNNING';

/** Giờ của nguồn (không múi giờ): đọc thẳng chuỗi, không qua Date để khỏi bị đổi múi giờ */
function sourceTime(s: string | null) {
  if (!s) return null;
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y} ${t.slice(0, 5)}`;
}

function ago(iso: string | null, now: number) {
  if (!iso) return '';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'vừa xong';
  if (min < 60) return `${min} phút trước`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} giờ trước`;
  return fmtDateTime(iso);
}

// ---------- Đồng hồ dùng chung cho "x phút trước", "Đã chạy …" ----------
// Chỉ các ô chữ thời gian vẽ lại mỗi nhịp, không vẽ lại cả bảng nguồn và ngăn kéo lịch sử
let clockNow = Date.now();
let clockRate = 30_000;
let clockTimer: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();
function startClock() {
  clearInterval(clockTimer);
  clockTimer = setInterval(() => {
    clockNow = Date.now();
    clockListeners.forEach((l) => l());
  }, clockRate);
}
function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  if (clockListeners.size === 1) {
    clockNow = Date.now();
    startClock();
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) clearInterval(clockTimer);
  };
}
/** Có nguồn đang chạy thì nhảy mỗi giây (thời gian đang chạy), không thì mỗi 30 giây */
function setClockRate(ms: number) {
  if (ms === clockRate) return;
  clockRate = ms;
  clockNow = Date.now();
  if (clockListeners.size) {
    startClock();
    clockListeners.forEach((l) => l());
  }
}
const useNow = () => useSyncExternalStore(subscribeClock, () => clockNow);

function Ago({ iso }: { iso: string | null }) {
  const now = useNow();
  return <>{ago(iso, now)}</>;
}

function Elapsed({ since }: { since: string | null }) {
  const now = useNow();
  return <>{duration(now - new Date(since ?? now).getTime())}</>;
}

function duration(ms: number | null) {
  if (ms == null) return '';
  if (ms < 1000) return 'dưới 1 giây';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${s % 60} giây`;
}

/** Kết quả gọn: chỉ nêu số khác 0 ngoài số dòng đọc */
function Counts({ run }: { run: SyncRunInfo }) {
  const parts = [
    run.insertedCount ? `${fmtNum(run.insertedCount)} mới` : null,
    run.updatedCount ? `${fmtNum(run.updatedCount)} đổi` : null,
    run.deletedCount ? `${fmtNum(run.deletedCount)} xóa` : null,
  ].filter(Boolean);
  return (
    <Text size="sm">
      Đọc {fmtNum(run.readCount ?? 0)} dòng{parts.length ? `, ${parts.join(', ')}` : ', không có thay đổi'}
    </Text>
  );
}

function StatusCell({ run }: { run: SyncRunInfo | null }) {
  if (!run) return <Text size="sm" c="dimmed">Chưa chạy</Text>;
  const s = STATUS[run.status];
  const when = run.status === 'RUNNING' ? run.startedAt : run.status === 'QUEUED' ? run.queuedAt : run.finishedAt;
  return (
    <Group gap={6} wrap="nowrap">
      <Badge size="sm" variant="light" color={s.color} miw="max-content" leftSection={busy(run) ? <Loader size={10} color={s.color} /> : undefined}>{s.label}</Badge>
      <Text size="xs" c="dimmed"><Ago iso={when} /></Text>
    </Group>
  );
}

export default function SyncPage() {
  const qc = useQueryClient();
  const canRun = useCan('admin.sync:update');
  const [params, setUrl] = useUrlParams();
  const filter: Filter = FILTERS.find((f) => f === params.get('group')) ?? 'ALL';
  const setFilter = (v: Filter) => setUrl({ group: v === 'ALL' ? null : v });
  const [selected, setSelected] = useState<number[]>([]);
  const [history, setHistory] = useState<SyncSourceInfo | null>(null);

  const sources = useQuery({
    queryKey: SOURCES_KEY,
    queryFn: () => api<SyncSourceInfo[]>('/admin/sync/sources'),
    // Có nguồn đang chờ hoặc đang chạy thì tự tải lại để thấy kết quả, xong thì thôi
    refetchInterval: (q) => (q.state.data?.some((s) => busy(s.lastRun)) ? 2000 : false),
  });
  const rows = useMemo(() => sources.data ?? [], [sources.data]);
  const anyBusy = rows.some((s) => busy(s.lastRun));

  // Đồng hồ cho "x phút trước" và thời gian đang chạy
  useEffect(() => setClockRate(anyBusy ? 1000 : 30_000), [anyBusy]);

  const start = useMutation({
    mutationFn: (body: { sourceIds?: number[]; full?: boolean }) => api<{ batchId: string; queued: number; skipped: string[] }>('/admin/sync/start', { method: 'POST', body }),
    onSuccess: (r) => {
      const skipped = r.skipped.length ? ` Bỏ qua vì đang chạy: ${r.skipped.join(', ')}.` : '';
      toastOk(`Đã xếp hàng ${r.queued} nguồn. Bảng tự cập nhật khi chạy xong.${skipped}`, r.queued ? 'Đang đồng bộ' : 'Không có nguồn nào được xếp');
      setSelected([]);
      void qc.invalidateQueries({ queryKey: SOURCES_KEY });
    },
    onError: (e) => toastError(e),
  });

  const counts = {
    ALL: rows.length,
    CATALOG: rows.filter((s) => s.group === 'CATALOG').length,
    ORDER: rows.filter((s) => s.group === 'ORDER').length,
    FAILED: rows.filter((s) => s.lastRun?.status === 'FAILED').length,
  };
  const visible = rows.filter((s) => (filter === 'ALL' ? true : filter === 'FAILED' ? s.lastRun?.status === 'FAILED' : s.group === filter));
  // Nhóm lạ (chưa có nhãn) vẫn hiện, xếp sau các nhóm đã biết
  const groupCodes = [...GROUP_ORDER, ...new Set(rows.map((s) => s.group).filter((g) => !GROUP_ORDER.includes(g)))];
  const groups = groupCodes.map((g) => ({ g, items: visible.filter((s) => s.group === g) })).filter((x) => x.items.length > 0);
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.includes(s.id));
  const toggle = (id: number, on: boolean) => setSelected((p) => (on ? [...p.filter((x) => x !== id), id] : p.filter((x) => x !== id)));
  // Chỉ chạy nguồn đã chọn mà đang hiện: chọn rồi đổi bộ lọc thì không chạy ngầm nguồn khuất
  const picked = selected.filter((id) => visible.some((s) => s.id === id));
  const target = picked.length ? picked : undefined;
  const fullCount = picked.length || rows.length;
  const noSource = rows.length === 0 ? 'Chưa có nguồn đồng bộ nào.' : null;

  function confirmFull() {
    confirmAction({
      title: `Chép lại từ đầu ${fullCount} nguồn?`,
      consequence: (
        <Stack gap="xs">
          <Text size="sm">
            Bỏ qua mốc, đọc lại mọi dòng của view nguồn rồi so với dữ liệu đã chép: dòng mới được thêm, dòng đổi được ghi lại, dòng đã bị xóa bên BRAVO bị xóa khỏi MES.
          </Text>
          <Text size="sm" c="dimmed">Nặng hơn đồng bộ thường, có nguồn hàng trăm nghìn dòng. Nên chạy ngoài giờ cao điểm.</Text>
        </Stack>
      ),
      confirmLabel: 'Chép lại từ đầu',
      onConfirm: () => start.mutate({ sourceIds: target, full: true }),
    });
  }

  const notReady = sources.error instanceof ApiError && sources.error.code === 'SYNC_NOT_READY';
  const running = rows.filter((s) => s.lastRun?.status === 'RUNNING').length;
  const waiting = rows.filter((s) => s.lastRun?.status === 'QUEUED').length;
  const lastFinished = rows.map((s) => s.lastRun?.finishedAt).filter((x): x is string => !!x).sort().at(-1) ?? null;

  return (
    <>
      <PageHeader
        title="Đồng bộ dữ liệu"
        subtitle="Chép dữ liệu từ database trung gian của BRAVO vào MES. Mỗi lần chỉ đọc dòng được tạo hoặc sửa sau mốc của lần trước, cộng một lượt đối chiếu khóa để biết dòng đã bị xóa."
        actions={
          canRun && !notReady && (
            <>
              <ActionButton
                variant="default"
                color="red"
                leftSection={<IconRefresh size={16} />}
                loading={start.isPending && !!start.variables?.full}
                blockedReason={noSource ?? (start.isPending ? 'Đang gửi lệnh đồng bộ, đợi xong rồi bấm tiếp.' : null)}
                onClick={confirmFull}
              >
                {picked.length ? `Chép lại từ đầu ${picked.length} nguồn` : 'Chép lại từ đầu'}
              </ActionButton>
              <ActionButton leftSection={<IconDatabaseImport size={16} />} loading={start.isPending && !start.variables?.full} blockedReason={noSource ?? (start.isPending ? 'Đang gửi lệnh đồng bộ, đợi xong rồi bấm tiếp.' : null)} onClick={() => start.mutate({ sourceIds: target })}>
                {picked.length ? `Đồng bộ ${picked.length} nguồn` : 'Đồng bộ tất cả'}
              </ActionButton>
            </>
          )
        }
      />

      {notReady && (
        <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Chưa dùng được màn Đồng bộ" mb="md">
          {/* Chi tiết kỹ thuật của máy chủ để trong title cho IT, người dùng chỉ cần biết phải nhờ ai */}
          <Text size="sm" title={(sources.error as ApiError).message}>Chưa thiết lập nơi lưu dữ liệu đồng bộ (MES_Sync). Liên hệ IT để tạo và cấp quyền.</Text>
        </Alert>
      )}
      {sources.isError && !notReady && <LoadError error={sources.error} what="danh sách nguồn" onRetry={() => void sources.refetch()} retrying={sources.isFetching} />}

      {!notReady && (
        <>
          <FilterBar>
            <SegmentedControl
              size="xs"
              aria-label="Lọc nguồn theo nhóm"
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              data={[
                { value: 'ALL', label: `Tất cả (${counts.ALL})` },
                { value: 'CATALOG', label: `Danh mục (${counts.CATALOG})` },
                { value: 'ORDER', label: `Đơn hàng (${counts.ORDER})` },
                { value: 'FAILED', label: `Có lỗi (${counts.FAILED})` },
              ]}
            />
            <VisuallyHidden aria-live="polite">{anyBusy ? 'Đang đồng bộ' : ''}</VisuallyHidden>
            <Text size="sm" c="dimmed" pb={4} style={{ marginLeft: 'auto' }}>
              {!sources.isSuccess
                ? ''
                : anyBusy
                ? `Đang chạy ${running} nguồn${waiting ? `, ${waiting} nguồn đang chờ` : ''}.`
                : lastFinished
                  ? <>Lần chạy gần nhất xong <Ago iso={lastFinished} />{counts.FAILED ? `, ${counts.FAILED} nguồn đang lỗi` : ', mọi nguồn đều thành công'}.</>
                  : 'Chưa đồng bộ lần nào. Lần đầu nên chạy Đồng bộ tất cả.'}
            </Text>
          </FilterBar>

          <div className="table-frame">
            <table className="dense-table">
              <thead>
                <tr>
                  {canRun && (
                    <th style={{ width: 36 }}>
                      <Checkbox
                        size="sm"
                        aria-label="Chọn mọi nguồn đang hiện"
                        checked={allVisibleSelected}
                        indeterminate={!allVisibleSelected && visible.some((s) => selected.includes(s.id))}
                        onChange={() => setSelected(allVisibleSelected ? selected.filter((id) => !visible.some((s) => s.id === id)) : [...new Set([...selected, ...visible.map((s) => s.id)])])}
                      />
                    </th>
                  )}
                  <th>Nguồn</th>
                  <th>Cách lấy</th>
                  <th>Mốc dữ liệu</th>
                  <th>Lần chạy gần nhất</th>
                  <th>Kết quả</th>
                  <th style={{ textAlign: 'right' }}>Dòng trong MES</th>
                  <th style={{ width: 100 }}><VisuallyHidden>Thao tác</VisuallyHidden></th>
                </tr>
              </thead>
              <tbody>
                {groups.map(({ g, items }) => [
                  <tr key={`g-${g}`} className="table-group">
                    <td colSpan={canRun ? 8 : 7}>{GROUP_LABEL[g] ?? `Khác (${g})`}</td>
                  </tr>,
                  ...items.map((s) => (
                    <tr key={s.id}>
                      {canRun && (
                        <td>
                          <Checkbox size="sm" aria-label={`Chọn ${s.name}`} checked={selected.includes(s.id)} onChange={(e) => toggle(s.id, e.currentTarget.checked)} />
                        </td>
                      )}
                      <td>
                        <Text size="sm" fw={600} title={s.sourceObject}>{s.name}</Text>
                      </td>
                      <td>
                        <Tooltip
                          multiline
                          w={280}
                          label={s.mode === 'FULL' ? (s.description ?? 'Lấy toàn bộ view mỗi lần') : `Lấy dòng có ModifiedAt hoặc CreatedAt từ mốc lùi ${s.overlapMinutes} phút (phòng dòng ghi trễ). Dòng giống hệt không ghi lại.`}
                        >
                          <Text component="span" size="sm" tabIndex={0} className="focus-ring" style={{ cursor: 'help' }}>{s.mode === 'FULL' ? 'Toàn bộ mỗi lần' : 'Tăng dần'}</Text>
                        </Tooltip>
                      </td>
                      <td>
                        {s.mode === 'FULL' ? (
                          <Text size="sm" c="dimmed">Không dùng</Text>
                        ) : s.watermarkAt ? (
                          <Text size="sm" className="mono">{sourceTime(s.watermarkAt)}</Text>
                        ) : (
                          <Text size="sm" c="dimmed">Chưa có</Text>
                        )}
                        {s.mode === 'INCREMENTAL' && (
                          <Text size="xs" c="dimmed">{s.lastFullAt ? <>Chép toàn bộ <Ago iso={s.lastFullAt} /></> : 'Chưa chép toàn bộ lần nào'}</Text>
                        )}
                      </td>
                      <td><StatusCell run={s.lastRun} /></td>
                      <td style={{ whiteSpace: 'normal', minWidth: 220, maxWidth: 380 }}>
                        {s.lastRun?.status === 'SUCCEEDED' && <Counts run={s.lastRun} />}
                        {s.lastRun?.status === 'RUNNING' && <Text size="sm" c="dimmed">Đã chạy <Elapsed since={s.lastRun.startedAt} /></Text>}
                        {s.lastRun?.status === 'FAILED' && (
                          <Text size="sm" c="red" lineClamp={2} title={s.lastRun.errorMessage ?? undefined}>{s.lastRun.errorMessage}</Text>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">{s.targetCount == null ? <Text span size="sm" c="dimmed">–</Text> : fmtNum(s.targetCount)}</td>
                      <td>
                        <Button size="compact-sm" variant="subtle" color="link" leftSection={<IconHistory size={14} />} onClick={() => setHistory(s)}>
                          Lịch sử
                        </Button>
                      </td>
                    </tr>
                  )),
                ])}
                {sources.isSuccess && visible.length === 0 && (
                  filter === 'FAILED' ? (
                    <EmptyRow colSpan={canRun ? 8 : 7}>Không có nguồn nào đang lỗi.</EmptyRow>
                  ) : rows.length > 0 ? (
                    <EmptyRow colSpan={canRun ? 8 : 7} action={<Button size="xs" variant="default" onClick={() => setFilter('ALL')}>Xem tất cả nguồn</Button>}>Nhóm này chưa có nguồn nào.</EmptyRow>
                  ) : (
                    <EmptyRow colSpan={canRun ? 8 : 7}>Chưa khai báo nguồn đồng bộ. Liên hệ IT.</EmptyRow>
                  )
                )}
                {sources.isPending && <SkeletonRows cols={canRun ? 8 : 7} rows={4} />}
              </tbody>
            </table>
          </div>
          <Text size="xs" c="dimmed" mt={6}>
            Mốc dữ liệu là thời điểm sửa mới nhất đã nhận, theo giờ của BRAVO. Đồng bộ tăng dần có đối soát khóa nên thấy cả dòng bị xóa, nhưng không thấy cột đổi mà ngày sửa không đổi; thỉnh thoảng nên chạy Chép lại từ đầu.
          </Text>
        </>
      )}


      {history && <HistoryDrawer source={rows.find((s) => s.id === history.id) ?? history} onClose={() => setHistory(null)} />}
    </>
  );
}

function HistoryDrawer({ source, onClose }: { source: SyncSourceInfo; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const runs = useQuery({
    queryKey: ['admin', 'sync', 'runs', source.id, page],
    queryFn: () => api<Paged<SyncRunRow>>(`/admin/sync/runs?sourceId=${source.id}&page=${page}&pageSize=100`),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((r) => busy(r)) ? 2000 : false),
  });

  return (
    <Drawer opened onClose={onClose} position="right" size="min(1100px, 100%)" title={`Lịch sử đồng bộ: ${source.name}`}>
      <Stack gap="md">
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 16px', margin: 0, fontSize: 14 }}>
          <dt><Text size="sm" c="dimmed">View nguồn</Text></dt>
          <dd style={{ margin: 0 }} className="mono">{source.sourceObject}</dd>
          <dt><Text size="sm" c="dimmed">Bảng trong MES</Text></dt>
          <dd style={{ margin: 0 }} className="mono">MES_Sync.{source.targetTable}</dd>
          <dt><Text size="sm" c="dimmed">Khóa</Text></dt>
          <dd style={{ margin: 0 }} className="mono">{source.keyColumns}</dd>
          <dt><Text size="sm" c="dimmed">Cách lấy</Text></dt>
          <dd style={{ margin: 0 }}>{source.mode === 'FULL' ? 'Toàn bộ mỗi lần' : `Tăng dần, lùi ${source.overlapMinutes} phút so với mốc`}</dd>
          {source.description && (
            <>
              <dt><Text size="sm" c="dimmed">Ghi chú</Text></dt>
              <dd style={{ margin: 0 }}>{source.description}</dd>
            </>
          )}
        </dl>

        {runs.isError && <LoadError mb={0} error={runs.error} what="lịch sử đồng bộ" onRetry={() => void runs.refetch()} retrying={runs.isFetching} />}
        <div className="table-frame">
          <table className="dense-table">
            <thead>
              <tr>
                <th>Bắt đầu</th>
                <th>Người chạy</th>
                <th>Lấy từ</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Đọc</th>
                <th style={{ textAlign: 'right' }}>Mới</th>
                <th style={{ textAlign: 'right' }}>Đổi</th>
                <th style={{ textAlign: 'right' }}>Xóa</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {runs.isPending && <SkeletonRows cols={9} rows={4} />}
              {runs.data?.items.map((r) => [
                <tr key={r.id}>
                  <td className="mono">{fmtDateTime(r.startedAt ?? r.queuedAt, { seconds: true })}</td>
                  <td>{r.createdBy ?? 'Hệ thống'}</td>
                  <td>{r.mode === 'FULL' ? 'Toàn bộ' : <span className="mono">{sourceTime(r.sinceAt)}</span>}</td>
                  <td><Badge size="sm" variant="light" color={STATUS[r.status].color} miw="max-content">{STATUS[r.status].label}</Badge></td>
                  <td style={{ textAlign: 'right' }} className="mono">{fmtNum(r.readCount ?? undefined)}</td>
                  <td style={{ textAlign: 'right' }} className="mono">{fmtNum(r.insertedCount ?? undefined)}</td>
                  <td style={{ textAlign: 'right' }} className="mono">{fmtNum(r.updatedCount ?? undefined)}</td>
                  <td style={{ textAlign: 'right' }} className="mono">{fmtNum(r.deletedCount ?? undefined)}</td>
                  <td>{duration(r.durationMs)}</td>
                </tr>,
                r.errorMessage ? (
                  <tr key={`${r.id}-err`}>
                    <td colSpan={9} style={{ whiteSpace: 'normal' }}>
                      <Text size="sm" c="red">{r.errorMessage}</Text>
                    </td>
                  </tr>
                ) : null,
              ])}
              {runs.data?.items.length === 0 && <EmptyRow colSpan={9}>Nguồn này chưa chạy lần nào.</EmptyRow>}
            </tbody>
          </table>
          {runs.data && <Pager page={page} pageSize={100} total={runs.data.total} onPage={setPage} />}
        </div>
      </Stack>
    </Drawer>
  );
}
