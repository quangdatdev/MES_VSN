import { Alert, Button, Center, Loader, Select, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconAlertTriangle, IconDeviceFloppy, IconEye } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName } from '../../components/BranchName';
import { PolicyHint } from '../../components/PolicyHint';
import { WorkPage } from '../../components/WorkPage';
import { api, ApiError } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy } from '../../lib/fieldPolicy';
import { qs } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { loadError, toastError, toastOk } from '../../lib/notify';
import { useUrlParams } from '../../lib/useUrlParams';
import { useSession } from '../../store/session';
import type { ClusterDetail, ClusterEmployee, ClusterStyle, ClusterTeam, ClusterTeams } from './api';
import { afterSave, assignedOf, changes, discard, employeeLabel, isDirty, pickOf, rowsOf, type ClusterRow, type LeaderPick } from './clusterLeaderRules';

const RESOURCE = 'sewing.cluster';
const NAMES: Record<string, string> = { leaderEmployeeId: 'Tên cụm trưởng' };
const NO_TEAMS: ClusterTeam[] = [];
const NO_STYLES: ClusterStyle[] = [];
const NO_ROWS: ClusterRow[] = [];

/** Nhãn người đang chọn: "Tên - Mã - Phòng ban", kèm dấu khi người đó đã nghỉ việc (cụm trưởng cũ) */
const pickLabel = (p: LeaderPick) => `${employeeLabel(p) || `#${p.id}`}${p.active === false ? ' (đã nghỉ việc)' : ''}`;
const styleLabel = (s: { styleCode: string; styleLabel: string | null }) => (s.styleLabel ? `${s.styleCode} - ${s.styleLabel}` : s.styleCode);
/** Khóa của tổ ở ô Chọn tổ: mã tổ trùng nhau được giữa hai ĐVCS (A00 xem cả hai) */
const teamKey = (t: ClusterTeam) => `${t.branchCode}|${t.lineCode}`;

/**
 * Màn "Phân cụm trưởng" (phase 5.18) theo ảnh docs/screens/phan-cum-truong.png: Chọn tổ, Chọn mã hàng (mã đã phân cụm cho tổ), bảng
 * STT, Tên cụm, Tên cụm trưởng; tổ trưởng chọn người cho từng cụm rồi Lưu. Tổ, cụm lấy từ GSD (đang giả lập). Người không phải tổ trưởng
 * của tổ thì chỉ xem; máy chủ quyết định và trả lý do.
 */
export default function ClusterLeaderPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branch = useSession((s) => s.branch?.code ?? '');
  const aggregate = useSession((s) => !!s.branch?.isAggregate);
  const branchName = useBranchName();
  const [params, patch] = useUrlParams();
  const lineParam = params.get('line') ?? '';
  // Xem tổng hợp (A00): chuyền đổi ĐVCS có thể có hai tổ cùng mã ở hai ĐVCS, nên URL ghi kèm ĐVCS của tổ (review 5.18 L8)
  const teamBranchParam = params.get('branch') ?? '';
  const styleParam = params.get('style') ?? '';

  const teams = useQuery({ queryKey: ['sewing', 'cluster', branch, 'teams'], queryFn: () => api<ClusterTeams>('/sewing/cluster/teams') });
  const teamList = teams.data?.items ?? NO_TEAMS;
  // Chỉ có một tổ (tổ trưởng một tổ) thì chọn sẵn; tổ trên URL không còn thì như chưa chọn
  const team =
    teamList.find((t) => t.lineCode === lineParam && (!teamBranchParam || t.branchCode === teamBranchParam)) ?? (!lineParam && teamList.length === 1 ? teamList[0] : undefined);
  const teamId = team?.id;

  const styles = useQuery({
    queryKey: ['sewing', 'cluster', branch, 'styles', teamId],
    queryFn: () => api<{ items: ClusterStyle[] }>(`/sewing/cluster/styles${qs({ teamId })}`),
    enabled: teamId != null,
  });
  const styleList = styles.data?.items ?? NO_STYLES;
  const style = styleList.find((s) => s.styleCode === styleParam) ?? (!styleParam && styleList.length === 1 ? styleList[0] : undefined);
  const styleCode = style?.styleCode;

  const detailKey = useMemo(() => ['sewing', 'cluster', branch, 'detail', teamId, styleCode], [branch, teamId, styleCode]);
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => api<ClusterDetail>(`/sewing/cluster${qs({ teamId, style: styleCode })}`),
    enabled: teamId != null && !!styleCode,
  });
  const data = detail.data && detail.data.team.id === teamId && detail.data.styleCode === styleCode ? detail.data : null;

  // Người đang chọn giữ qua các lần tải lại của cùng tổ, cùng mã hàng (sau lưu, sau lỗi); đổi tổ, mã hàng thì bỏ
  const view = `${teamId ?? ''}|${styleCode ?? ''}`;
  const [state, setState] = useState<{ view: string; rows: ClusterRow[] }>({ view: '', rows: NO_ROWS });
  useEffect(() => {
    if (!data) return;
    setState((prev) => ({ view, rows: rowsOf(data.items, prev.view === view ? new Map(prev.rows.filter(isDirty).map((r) => [r.id, r])) : undefined) }));
    // Dựng lại dòng mỗi lần tải xong dữ liệu của tổ, mã hàng đang xem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const rows = state.view === view && data ? state.rows : NO_ROWS;
  const dirty = rows.some(isDirty);
  useLeaveGuard(dirty);

  /** Đổi tổ (bỏ mã hàng đang chọn), đổi mã hàng: hỏi lại khi còn người chọn chưa lưu */
  const go = (next: { team?: ClusterTeam; style?: string }) =>
    confirmDiscard(
      dirty,
      () => patch(next.team ? { line: next.team.lineCode, branch: aggregate ? next.team.branchCode : null, style: null } : { style: next.style }),
      'Cụm trưởng bạn vừa chọn chưa lưu sẽ mất.',
    );

  const onPick = useCallback((id: number, pick: LeaderPick | null) => {
    setState((s) => ({ ...s, rows: s.rows.map((r) => (r.id === id ? { ...r, value: pick?.id ?? null, pick } : r)) }));
  }, []);

  const save = useMutation({
    mutationFn: (sent: ClusterRow[]) => api<{ saved: number }>('/sewing/cluster', { method: 'PUT', body: { teamId, style: styleCode, items: changes(sent) } }),
    onSuccess: async (res, sent) => {
      toastOk(res.saved ? `Đã lưu cụm trưởng của ${res.saved} cụm.` : 'Cụm trưởng không có gì đổi.', 'Đã lưu');
      setState((s) => ({ ...s, rows: afterSave(s.rows, sent) }));
      // Số cụm đã phân ở ô Chọn mã hàng
      await qc.invalidateQueries({ queryKey: ['sewing', 'cluster', branch, 'styles', teamId] });
      await qc.invalidateQueries({ queryKey: detailKey });
    },
    onError: (e) => {
      toastError(e, 'Chưa lưu được');
      // Người khác vừa đổi, cụm vừa đổi ở GSD, người chọn vừa nghỉ việc: tải lại, giữ phần chọn của các cụm khác
      if (e instanceof ApiError && [404, 409, 422].includes(e.status)) void qc.invalidateQueries({ queryKey: detailKey });
    },
  });

  const showLeader = policy.visible('leaderEmployeeId');
  const canEdit = !aggregate && !!data?.canEdit && policy.editable('leaderEmployeeId');
  const assigned = assignedOf(rows);
  const saveReason = !data
    ? 'Chọn tổ và mã hàng trước'
    : !data.canEdit
      ? (data.readOnlyReason ?? 'Bạn chỉ được xem')
      : !policy.editable('leaderEmployeeId')
        ? 'Cột Tên cụm trưởng chỉ đọc với bạn'
        : !dirty
          ? 'Chưa chọn thay đổi nào'
          : null;

  const teamOptions = useMemo(() => teamList.map((t) => ({ value: teamKey(t), label: aggregate ? `${t.lineName} (${branchName(t.branchCode)})` : t.lineName })), [teamList, aggregate, branchName]);
  const styleOptions = useMemo(() => styleList.map((s) => ({ value: s.styleCode, label: styleLabel(s) })), [styleList]);
  const styleCount = useMemo(() => new Map(styleList.map((s) => [s.styleCode, s])), [styleList]);

  return (
    <WorkPage
      title="Phân cụm trưởng"
      subtitle={aggregate ? 'Cụm trưởng của các tổ mọi đơn vị cơ sở bạn được xem, chỉ đọc' : 'Chọn cụm trưởng cho từng cụm công đoạn của mã hàng ở tổ. Chỉ tổ trưởng của tổ lưu được.'}
      actions={<PolicyHint policy={policy} names={NAMES} />}
      filters={
        <div className="cluster-pick">
          <Text component="label" htmlFor="cluster-team" className="cluster-pick-label">
            Chọn tổ
          </Text>
          <Select
            id="cluster-team"
            placeholder={teams.isPending ? 'Đang tải…' : teamList.length ? 'Chọn tổ' : 'Không có tổ nào'}
            data={teamOptions}
            value={team ? teamKey(team) : null}
            onChange={(v) => {
              const next = teamList.find((t) => teamKey(t) === v);
              if (next && next !== team) go({ team: next });
            }}
            allowDeselect={false}
            searchable={teamList.length > 8}
            nothingFoundMessage="Không có tổ nào khớp"
          />
          <Text component="label" htmlFor="cluster-style" className="cluster-pick-label">
            Chọn mã hàng
          </Text>
          <Select
            id="cluster-style"
            placeholder={!team ? 'Chọn tổ trước' : styles.isFetching && !styleList.length ? 'Đang tải…' : styleList.length ? 'Chọn mã hàng' : 'Tổ chưa có mã hàng nào được phân cụm'}
            data={styleOptions}
            value={style?.styleCode ?? null}
            onChange={(v) => v && v !== style?.styleCode && go({ style: v })}
            allowDeselect={false}
            disabled={!team}
            searchable
            nothingFoundMessage="Không có mã hàng nào khớp"
            renderOption={({ option }) => {
              const s = styleCount.get(option.value);
              return (
                <span className="cluster-style-option">
                  <span>{option.label}</span>
                  {s && <span className="cluster-style-count">{s.assigned == null ? `${s.clusters} cụm` : `${s.assigned}/${s.clusters} cụm`}</span>}
                </span>
              );
            }}
          />
          {data && data.teamLeaders.length > 0 && (
            <>
              <span className="cluster-pick-label">Tổ trưởng</span>
              <Text size="sm">{data.teamLeaders.map((l) => `${l.fullName} (${l.code})`).join(', ')}</Text>
            </>
          )}
        </div>
      }
    >
      <section className="cluster-pane" aria-labelledby="cluster-title">
        <div className="cluster-head">
          <h2 id="cluster-title">Danh sách cụm</h2>
          {data && rows.length > 0 && (
            <Text size="sm" c="dimmed">
              {assigned == null || !showLeader ? `${rows.length} cụm` : `Đã phân ${assigned}/${rows.length} cụm`}
            </Text>
          )}
        </div>
        {data && !aggregate && data.readOnlyReason && (
          <Alert variant="light" color="blue" icon={<IconEye size={16} />} py={6} maw={720}>
            {data.readOnlyReason}
          </Alert>
        )}
        {data && canEdit && !data.canSearch && (
          <Alert variant="light" color="orange" icon={<IconAlertTriangle size={16} />} py={6} maw={720}>
            Bạn chưa được tra Danh bạ nhân viên nên chỉ bỏ được cụm trưởng, chưa chọn người mới được. Nhờ quản trị viên cấp quyền.
          </Alert>
        )}
        <Body
          state={
            teams.error
              ? { error: loadError(teams.error, 'Không tải được danh sách tổ.'), retry: () => void teams.refetch() }
              : teams.isPending
                ? 'loading'
                : !teamList.length
                  ? 'Đơn vị cơ sở này chưa có tổ nào có dữ liệu Phân cụm (tổ, cụm lấy từ GSD).'
                  : !team
                    ? 'Chọn tổ để xem các mã hàng đã phân cụm.'
                    : styles.error
                      ? { error: loadError(styles.error, 'Không tải được mã hàng của tổ.'), retry: () => void styles.refetch() }
                      : styles.isPending
                        ? 'loading'
                        : !styleList.length
                          ? 'Tổ này chưa có mã hàng nào được phân cụm.'
                          : !style
                            ? 'Chọn mã hàng để phân cụm trưởng.'
                            : detail.error
                              ? { error: loadError(detail.error, 'Không tải được danh sách cụm.'), retry: () => void detail.refetch() }
                              : !data
                                ? 'loading'
                                : null
          }
        >
          <div className="table-frame">
            <table className="cluster-table">
              <thead>
                <tr>
                  <th scope="col" className="cluster-no">
                    STT
                  </th>
                  <th scope="col" className="cluster-name">
                    Tên cụm
                  </th>
                  {showLeader && <th scope="col">Tên cụm trưởng</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <ClusterLine key={r.id} row={r} index={i + 1} showLeader={showLeader} editable={canEdit && !r.masked} teamId={teamId!} branch={branch} canSearch={!!data?.canSearch} onPick={onPick} />
                ))}
              </tbody>
            </table>
          </div>
        </Body>
        {data && !aggregate && (
          <div className="cluster-actions">
            <ActionButton leftSection={<IconDeviceFloppy size={16} />} loading={save.isPending} blockedReason={saveReason} onClick={() => save.mutate(rows.filter(isDirty))}>
              Lưu
            </ActionButton>
            {dirty && (
              <Button variant="default" onClick={() => confirmDiscard(true, () => setState((s) => ({ ...s, rows: discard(s.rows) })))}>
                Bỏ thay đổi
              </Button>
            )}
          </div>
        )}
      </section>
    </WorkPage>
  );
}

/** Phần thân theo trạng thái: đang tải, lỗi kèm Thử lại, câu hướng dẫn bước tiếp, hoặc bảng */
function Body({ state, children }: { state: 'loading' | string | { error: string | null; retry: () => void } | null; children: ReactNode }) {
  if (state === null) return <>{children}</>;
  return (
    <Center className="cluster-state">
      {state === 'loading' ? (
        <Loader size="sm" aria-label="Đang tải" />
      ) : typeof state === 'string' ? (
        <Text size="sm" c="dimmed" ta="center" maw={520}>
          {state}
        </Text>
      ) : (
        <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
          <Stack gap={6} align="flex-start">
            {state.error}
            <Button size="xs" variant="default" onClick={state.retry}>
              Thử lại
            </Button>
          </Stack>
        </Alert>
      )}
    </Center>
  );
}

interface LineProps {
  row: ClusterRow;
  index: number;
  showLeader: boolean;
  editable: boolean;
  teamId: number;
  branch: string;
  canSearch: boolean;
  onPick: (id: number, pick: LeaderPick | null) => void;
}

/** Một cụm: dòng chỉ vẽ lại khi chính nó đổi (chọn người ở dòng khác không vẽ lại cả bảng) */
const ClusterLine = memo(function ClusterLine({ row, index, showLeader, editable, teamId, branch, canSearch, onPick }: LineProps) {
  return (
    <tr data-dirty={isDirty(row) || undefined}>
      <td className="cluster-no">{index}</td>
      <td className="cluster-name">{row.name}</td>
      {showLeader && (
        <td className="cluster-leader">
          {row.masked ? (
            <span title="Cột bị che theo chính sách cột">{MASK}</span>
          ) : editable ? (
            <LeaderPicker row={row} teamId={teamId} branch={branch} canSearch={canSearch} onPick={onPick} />
          ) : row.pick ? (
            pickLabel(row.pick)
          ) : (
            <span className="cluster-none">Chưa phân</span>
          )}
        </td>
      )}
    </tr>
  );
});

/**
 * Ô Tên cụm trưởng: tìm trên máy chủ theo mã hoặc tên (không nạp hết danh bạ); chỉ hỏi máy chủ khi mở ô. Người đang chọn luôn có trong
 * danh sách để ô hiện đúng nhãn. Nút × bỏ cụm trưởng.
 */
function LeaderPicker({ row, teamId, branch, canSearch, onPick }: { row: ClusterRow; teamId: number; branch: string; canSearch: boolean; onPick: LineProps['onPick'] }) {
  const [opened, setOpened] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced] = useDebouncedValue(term, 300);
  const q = debounced.trim();
  const found = useQuery({
    queryKey: ['sewing', 'cluster', branch, 'employees', teamId, q],
    queryFn: () => api<{ canSearch: boolean; items: ClusterEmployee[] }>(`/sewing/cluster/employees${qs({ teamId, q: q || undefined })}`),
    enabled: opened && canSearch,
    staleTime: 60_000,
  });
  const options = useMemo(() => {
    const list = (found.data?.items ?? []).map((e) => ({ value: String(e.id), label: employeeLabel(e) }));
    if (row.pick && !list.some((o) => o.value === String(row.pick!.id))) list.unshift({ value: String(row.pick.id), label: pickLabel(row.pick) });
    return list;
  }, [found.data, row.pick]);
  return (
    <Select
      aria-label={`Tên cụm trưởng của cụm ${row.name}`}
      placeholder={canSearch ? 'Gõ mã hoặc tên để tìm' : 'Chưa phân'}
      searchable
      clearable
      data={options}
      value={row.value == null ? null : String(row.value)}
      onChange={(v) => {
        if (!v) return onPick(row.id, null);
        const e = found.data?.items.find((x) => String(x.id) === v);
        onPick(row.id, e ? pickOf(e) : row.pick);
      }}
      // Chọn xong, ô tự đặt chữ tìm bằng nhãn người vừa chọn: không phải chữ gõ, không gửi lên máy chủ
      onSearchChange={(text) => setTerm(options.some((o) => o.label === text) ? '' : text)}
      // Máy chủ đã lọc theo chữ gõ (không dấu): không lọc thêm ở trình duyệt
      filter={({ options: all }) => all}
      onDropdownOpen={() => setOpened(true)}
      nothingFoundMessage={!canSearch ? 'Bạn chưa được tra Danh bạ nhân viên' : found.isFetching ? 'Đang tìm…' : 'Không có nhân viên đang làm khớp'}
      // Danh sách thấp để không tràn khỏi khung khi ô ở các dòng cuối (vẫn lật lên trên khi thiếu chỗ)
      maxDropdownHeight={232}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
