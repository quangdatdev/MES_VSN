import { Alert, Badge, Button, Drawer, Group, MultiSelect, Paper, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Switch, Tabs, Text, Textarea } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconBan, IconCheck, IconEye, IconInfoCircle, IconPencil, IconPlus, IconShieldCheck, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { api, ApiError } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { fmtDateTime, today } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { escapeToClose, IconAction, levelColor, LoadError } from './common';
import { ACTION_LABEL, LEVELS, type AccessLevel, type AdminBranch, type EffectiveAccess, type PermissionMatrix, type ResourceFields, type ScopeCatalog, type UserAccessInfo } from './types';

/** Giá trị của DateTimePicker ("YYYY-MM-DD HH:mm:ss", giờ máy) → ISO gửi API, như ô datetime-local trước đây. */
const toIso = (v: string | null) => (v ? new Date(v.replace(' ', 'T')).toISOString() : null);
const toMs = (v: string) => new Date(v.replace(' ', 'T')).getTime();
const DATETIME = { valueFormat: 'DD/MM/YYYY HH:mm', placeholder: 'dd/mm/yyyy hh:mm', clearable: true } as const;

const SELF = 'Bạn không tự sửa quyền của chính mình. Nhờ quản trị viên khác.';
const MIN_REASON = 3;

/** Form con báo lên ngăn kéo là đang nhập dở: đóng ngăn kéo thì hỏi lại thay vì mất phần đang nhập. */
const DirtyContext = createContext<(key: string, dirty: boolean) => void>(() => {});
function useReportDirty(key: string, dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(key, dirty);
    return () => report(key, false);
  }, [report, key, dirty]);
}

/**
 * Phân quyền chi tiết của một người: phạm vi theo từng vai trò (L3), ngoại lệ quyền (L5), cột riêng (L4),
 * và xem thử người đó thấy gì ở một nhà máy. Mọi thay đổi ghi nhật ký và có hiệu lực ngay.
 */
export function UserAccessDrawer({ userId, onClose }: { userId: number; onClose: () => void }) {
  const access = useQuery({ queryKey: ['admin', 'user-access', userId], queryFn: () => api<UserAccessInfo>(`/admin/users/${userId}/access`) });
  const me = useSession((s) => s.user);
  const blocked = me?.id === userId ? SELF : null;
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback(
    (key: string, d: boolean) =>
      setDirtyKeys((prev) => {
        if (prev.has(key) === d) return prev;
        const next = new Set(prev);
        if (d) next.add(key);
        else next.delete(key);
        return next;
      }),
    [],
  );
  const dirty = dirtyKeys.size > 0;
  useLeaveGuard(dirty);
  // Tab Xem thử tính quyền thật trên máy chủ: chỉ dựng (và gọi API) khi người dùng mở tab đó lần đầu
  const [tab, setTab] = useState<string | null>('scope');
  const [seenEffective, setSeenEffective] = useState(false);
  if (tab === 'effective' && !seenEffective) setSeenEffective(true);
  const requestClose = () => confirmDiscard(dirty, onClose);
  // Ngăn kéo mở bằng bấm vào dòng: cú bấm thứ hai của đúp chuột rơi vào nền mờ vừa hiện, không tính là bấm ra ngoài để đóng
  const openedAt = useRef(0);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  const u = access.data?.user;
  const body = (render: (info: UserAccessInfo) => ReactNode) =>
    access.data ? (
      render(access.data)
    ) : access.isError ? (
      <LoadError error={access.error} what="phân quyền của người này" onRetry={() => void access.refetch()} retrying={access.isFetching} />
    ) : (
      <Stack gap="sm" role="status" aria-label="Đang tải">
        <Skeleton h={18} w="70%" />
        <Skeleton h={72} />
        <Skeleton h={72} />
      </Stack>
    );
  return (
    <Drawer
      opened
      onClose={requestClose}
      {...escapeToClose(requestClose)}
      closeOnClickOutside={false}
      overlayProps={{ onClick: () => Date.now() - openedAt.current > 500 && requestClose() }}
      position="right"
      size="min(760px, 100vw)"
      title={u ? `Phân quyền chi tiết: ${u.fullName} (${u.username})` : 'Phân quyền chi tiết'}
    >
      <DirtyContext.Provider value={report}>
        {blocked && (
          <Alert variant="light" color="orange" icon={<IconInfoCircle size={16} />} py={6} mb="md">
            Đây là tài khoản của bạn nên chỉ xem được. {SELF}
          </Alert>
        )}
        {/* Tab ẩn giữ bằng display:none (không dùng Activity): form đang nhập dở ở tab khác vẫn còn và vẫn được tính là chưa lưu */}
        <Tabs value={tab} onChange={setTab} keepMountedMode="display-none">
          <Tabs.List mb="md">
            <Tabs.Tab value="scope">Vai trò và phạm vi</Tabs.Tab>
            <Tabs.Tab value="override">Ngoại lệ quyền</Tabs.Tab>
            <Tabs.Tab value="field">Cột riêng</Tabs.Tab>
            <Tabs.Tab value="effective" leftSection={<IconEye size={14} />}>Xem thử</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="scope">{body((info) => <ScopeTab info={info} blocked={blocked} />)}</Tabs.Panel>
          <Tabs.Panel value="override">{body((info) => <OverrideTab info={info} blocked={blocked} />)}</Tabs.Panel>
          <Tabs.Panel value="field">{body((info) => <FieldTab info={info} blocked={blocked} />)}</Tabs.Panel>
          <Tabs.Panel value="effective">{seenEffective && <EffectiveTab userId={userId} />}</Tabs.Panel>
        </Tabs>
      </DirtyContext.Provider>
    </Drawer>
  );
}

/**
 * Sau khi lưu phạm vi, ngoại lệ, cột riêng: tải lại phân quyền của người này và phần Xem thử (song song). Các thao tác này
 * không đổi danh sách người dùng, vai trò, nhà máy hay ma trận quyền nên không tải lại các khóa đó.
 */
function useRefresh(userId: number) {
  const qc = useQueryClient();
  return () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'user-access', userId] }), qc.invalidateQueries({ queryKey: ['admin', 'effective', userId] })]);
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

// ---------------- Vai trò và phạm vi (L3) ----------------

const SCOPE_CATALOG = { queryKey: ['admin', 'scope-catalog'], queryFn: () => api<ScopeCatalog>('/admin/scope-catalog') };

function ScopeTab({ info, blocked }: { info: UserAccessInfo; blocked: string | null }) {
  const canEdit = useCan('admin.permission:update');
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  // Danh mục nhà máy, chuyền chỉ cần khi sửa phạm vi: tải khi mở bộ sửa, tải trước khi rê chuột hoặc Tab tới nút Sửa phạm vi
  const catalog = useQuery({ ...SCOPE_CATALOG, enabled: editing !== null });
  const prefetchCatalog = () => void qc.prefetchQuery(SCOPE_CATALOG);

  if (info.assignments.length === 0) {
    return <Text c="dimmed" size="sm">Người này chưa có vai trò nào. Gán vai trò ở cột Thao tác của danh sách người dùng.</Text>;
  }
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        Phạm vi gắn vào từng vai trò: vai trò này chỉ có hiệu lực ở nhà máy, chuyền được chọn. Để trống là không giới hạn thêm (vẫn chỉ trong các nhà máy người đó được chọn khi đăng nhập).
      </Text>
      {info.assignments.map((a) => (
        <Paper key={a.userRoleId} withBorder p="sm">
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Group gap={6}>
                <Text fw={700}>{a.roleName}</Text>
                {!a.roleActive && <Badge size="xs" color="gray">Vai trò ngừng dùng</Badge>}
              </Group>
              {a.scopes.length === 0 ? (
                <Text size="sm" c="dimmed">Không giới hạn phạm vi</Text>
              ) : (
                <Group gap={4} mt={4}>
                  {a.scopes.map((s) => (
                    <Badge key={s.id} variant="light" color={s.dimension === 'LINE' ? 'orange' : s.dimension === 'FACTORY' ? 'charcoal' : 'link'}>
                      {s.dimension === 'FACTORY' ? 'Nhà máy' : s.dimension === 'LINE' ? 'Chuyền' : s.dimension === 'OWNER' ? 'Người tạo' : s.dimension}: {s.mode === 'OWN' ? 'chỉ của mình' : s.mode === 'ALL' ? 'tất cả' : s.orgUnitName ? `${s.orgUnitName} (${s.orgUnitCode})` : s.value}
                    </Badge>
                  ))}
                </Group>
              )}
            </div>
            {canEdit && editing !== a.userRoleId && (
              // Một lần sửa một vai trò: mở bộ sửa vai trò khác sẽ gỡ bộ đang sửa và mất phần đã chọn
              <ActionButton
                size="xs"
                variant="default"
                leftSection={<IconPencil size={14} />}
                blockedReason={blocked ?? (editing !== null ? 'Đang sửa phạm vi của vai trò khác. Lưu hoặc hủy phần đó trước.' : null)}
                onPointerEnter={prefetchCatalog}
                onFocus={prefetchCatalog}
                onClick={() => setEditing(a.userRoleId)}
              >
                Sửa phạm vi
              </ActionButton>
            )}
          </Group>
          {editing === a.userRoleId &&
            (catalog.data ? (
              <ScopeEditor userId={info.user.id} assignment={a} catalog={catalog.data} onClose={() => setEditing(null)} />
            ) : catalog.isError ? (
              <LoadError mb={0} error={catalog.error} what="danh sách nhà máy, chuyền" onRetry={() => void catalog.refetch()} retrying={catalog.isFetching} />
            ) : (
              <Skeleton h={120} mt="sm" />
            ))}
        </Paper>
      ))}
    </Stack>
  );
}

type ScopeRow = UserAccessInfo['assignments'][number]['scopes'][number];
/** Dòng phạm vi bộ sửa này hiển thị được: nhà máy, chuyền chọn theo danh sách; chỉ bản ghi của mình. */
const editableScope = (s: ScopeRow) => ((s.dimension === 'FACTORY' || s.dimension === 'LINE') && s.mode === 'LIST' && !!s.orgUnitId) || (s.dimension === 'OWNER' && s.mode === 'OWN');
const scopeText = (s: ScopeRow) =>
  `${s.dimension === 'FACTORY' ? 'Nhà máy' : s.dimension === 'LINE' ? 'Chuyền' : s.dimension === 'OWNER' ? 'Người tạo' : s.dimension}: ${
    s.mode === 'ORG_SUBTREE' ? `cả nhánh ${s.orgUnitName ?? s.orgUnitCode ?? ''}` : s.mode === 'ALL' ? 'tất cả' : s.mode === 'OWN' ? 'chỉ của mình' : (s.orgUnitName ?? s.value ?? '')
  }`;

type OrgUnit = ScopeCatalog['orgUnits'][number];

/**
 * Chuyền đang dùng cho ô chọn phạm vi, gom theo nhà máy và xưởng; branches khác rỗng thì chỉ chuyền của các nhà máy đó.
 * Thứ tự theo cây như ô chọn chuyền ở màn nghiệp vụ: nhà máy, xưởng, chuyền; chuyền không thuộc xưởng sau cùng của nhà máy.
 * Danh sách API đã xếp theo nhà máy, thứ tự, mã nên vị trí trong danh sách là thứ tự của xưởng và của chuyền.
 */
export function scopeLineGroups(orgUnits: OrgUnit[], branches: Set<string>): { group: string; items: { value: string; label: string }[] }[] {
  const unitById = new Map(orgUnits.map((o) => [o.id, o]));
  const position = new Map(orgUnits.map((o, i) => [o.id, i]));
  const workshopOf = (o: OrgUnit) => {
    const parent = o.parentId !== null ? unitById.get(o.parentId) : undefined;
    return parent?.orgType === 'WORKSHOP' ? parent : undefined;
  };
  const treeOrder = (o: OrgUnit) => {
    const w = workshopOf(o);
    return [w ? 0 : 1, w ? position.get(w.id)! : 0, position.get(o.id)!];
  };
  // Tên nhóm kèm mã xưởng: tên xưởng có thể trùng
  const groupOf = (o: OrgUnit) => {
    const w = workshopOf(o);
    return `Nhà máy ${o.branchCode}${w ? ` – ${w.name} (${w.code})` : ''}`;
  };
  return Object.entries(
    orgUnits
      .filter((o) => o.isActive && o.orgType === 'LINE' && (branches.size === 0 || branches.has(o.branchCode)))
      .sort((a, b) => a.branchCode.localeCompare(b.branchCode) || treeOrder(a).reduce((d, v, i) => d || v - treeOrder(b)[i], 0))
      .reduce<Record<string, { value: string; label: string }[]>>((g, o) => ({ ...g, [groupOf(o)]: [...(g[groupOf(o)] ?? []), { value: String(o.id), label: `${o.name} (${o.code})` }] }), {}),
  ).map(([group, items]) => ({ group, items }));
}

function ScopeEditor({ userId, assignment, catalog, onClose }: { userId: number; assignment: UserAccessInfo['assignments'][number]; catalog: ScopeCatalog; onClose: () => void }) {
  const refresh = useRefresh(userId);
  // Phạm vi bộ sửa chưa hiển thị được (cả nhánh, chiều khác) giữ nguyên khi lưu: bỏ đi âm thầm là nới quyền (review 5.1 lượt 2 F6)
  const kept = assignment.scopes.filter((s) => !editableScope(s));
  const ids = (dim: string) => assignment.scopes.filter((s) => s.dimension === dim && s.mode === 'LIST' && s.orgUnitId).map((s) => String(s.orgUnitId));
  const initialOwn = assignment.scopes.some((s) => s.dimension === 'OWNER' && s.mode === 'OWN');
  const [factories, setFactories] = useState<string[]>(ids('FACTORY'));
  const [lines, setLines] = useState<string[]>(ids('LINE'));
  const [own, setOwn] = useState(initialOwn);
  const dirty = !sameSet(factories, ids('FACTORY')) || !sameSet(lines, ids('LINE')) || own !== initialOwn;
  useReportDirty(`scope-${assignment.userRoleId}`, dirty);
  const units = catalog.orgUnits.filter((o) => o.isActive);
  const factoryData = units.filter((o) => o.orgType === 'FACTORY').map((o) => ({ value: String(o.id), label: `${o.code} – ${o.name}` }));
  // Chuyền gom theo nhà máy và xưởng; nếu đã chọn nhà máy thì chỉ gợi ý chuyền của các nhà máy đó
  const pickedBranches = new Set(units.filter((o) => factories.includes(String(o.id))).map((o) => o.code));
  const lineData = scopeLineGroups(catalog.orgUnits, pickedBranches);
  // Chuyền đã chọn nay đã ngừng dùng (màn Danh mục hệ thống): vẫn hiện tên thay vì số Id để quản trị thấy và bỏ chọn
  const stopped = catalog.orgUnits.filter((o) => o.orgType === 'LINE' && !o.isActive && lines.includes(String(o.id)));
  const lineOptions = stopped.length ? [...lineData, { group: 'Đã ngừng dùng', items: stopped.map((o) => ({ value: String(o.id), label: `${o.name} (${o.code}, đã ngừng)` })) }] : lineData;

  const save = useMutation({
    mutationFn: () =>
      api(`/admin/users/${userId}/roles/${assignment.roleId}/scope`, {
        method: 'PUT',
        body: {
          scopes: [
            ...kept.map((s) => ({ dimension: s.dimension, mode: s.mode, orgUnitId: s.orgUnitId ?? undefined, value: s.value ?? undefined })),
            ...factories.map((id) => ({ dimension: 'FACTORY', mode: 'LIST', orgUnitId: Number(id) })),
            ...lines.map((id) => ({ dimension: 'LINE', mode: 'LIST', orgUnitId: Number(id) })),
            ...(own ? [{ dimension: 'OWNER', mode: 'OWN' }] : []),
          ],
        },
      }),
    onSuccess: async () => {
      toastOk(`Đã lưu phạm vi của vai trò ${assignment.roleName}.`);
      await refresh();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  return (
    <Stack gap="xs" mt="sm" pt="sm" style={{ borderTop: '1px dashed var(--app-line)' }}>
      {kept.length > 0 && (
        <Text size="xs" c="dimmed">
          Giữ nguyên khi lưu (chưa sửa được ở đây): {kept.map(scopeText).join('; ')}.
        </Text>
      )}
      <MultiSelect label="Nhà máy" description="Vai trò chỉ có hiệu lực khi đang làm việc ở các nhà máy này. Ở chế độ xem tổng hợp (A00) chỉ đọc dữ liệu của các nhà máy này." placeholder="Không giới hạn" data={factoryData} value={factories} onChange={setFactories} clearable />
      <MultiSelect label="Chuyền" description="Chỉ thấy và sửa dữ liệu của các chuyền này ở màn có cột chuyền (ví dụ Phân bổ màu cỡ)." placeholder="Không giới hạn" data={lineOptions} value={lines} onChange={setLines} searchable clearable maxDropdownHeight={260} />
      <Switch label="Chỉ bản ghi do chính người này tạo" checked={own} onChange={(e) => setOwn(e.currentTarget.checked)} />
      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="xs" onClick={() => confirmDiscard(dirty, onClose)}>Hủy</Button>
        <ActionButton size="xs" loading={save.isPending} blockedReason={dirty ? null : 'Chưa có thay đổi nào.'} onClick={() => save.mutate()}>
          Lưu phạm vi
        </ActionButton>
      </Group>
    </Stack>
  );
}

// ---------------- Ngoại lệ quyền (L5) ----------------

function OverrideTab({ info, blocked }: { info: UserAccessInfo; blocked: string | null }) {
  const canEdit = useCan('admin.permission:update');
  const refresh = useRefresh(info.user.id);
  const [adding, setAdding] = useState(false);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/admin/users/${info.user.id}/overrides/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toastOk(`Đã gỡ ngoại lệ quyền của ${info.user.fullName}.`, 'Đã gỡ');
      await refresh();
    },
    onError: (e) => toastError(e),
  });
  const now = Date.now();
  return (
    <Stack gap="sm">
      <Alert variant="light" color="link" icon={<IconInfoCircle size={16} />} py={6}>
        Chặn thắng mọi vai trò. Cho phép thêm một quyền riêng cho người này, dữ liệu vẫn trong phạm vi các vai trò của họ. Ngoại lệ hết hạn tự mất hiệu lực đúng giờ.
      </Alert>
      {info.overrides.length === 0 && !adding && <Text size="sm" c="dimmed">Chưa có ngoại lệ nào.</Text>}
      {info.overrides.map((o) => {
        const expired = !!o.validToAt && new Date(o.validToAt).getTime() < now;
        const pending = !!o.validFromAt && new Date(o.validFromAt).getTime() > now;
        return (
          <Paper key={o.id} withBorder p="sm" style={{ opacity: expired ? 0.6 : 1 }}>
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <div>
                <Group gap={6}>
                  <Badge color={o.effect === 'DENY' ? 'red' : 'teal'} leftSection={o.effect === 'DENY' ? <IconBan size={12} /> : <IconCheck size={12} />}>
                    {o.effect === 'DENY' ? 'Chặn' : 'Cho phép'}
                  </Badge>
                  <Text fw={600} size="sm" title={o.permissionCode}>{o.permissionName}</Text>
                  {expired && <Badge size="xs" color="gray">Đã hết hạn</Badge>}
                  {pending && <Badge size="xs" color="orange">Chưa tới giờ</Badge>}
                </Group>
                <Text size="xs" c="dimmed" mt={2}>
                  {o.validFromAt ? `Từ ${fmtDateTime(o.validFromAt)}. ` : ''}{o.validToAt ? `Đến ${fmtDateTime(o.validToAt)}.` : 'Không thời hạn.'}
                </Text>
                <Text size="sm" mt={4}>Lý do: {o.reason}</Text>
              </div>
              {canEdit && (
                <IconAction
                  label="Gỡ ngoại lệ"
                  color="red"
                  blockedReason={blocked}
                  icon={<IconTrash size={16} />}
                  onClick={() =>
                    confirmAction({
                      title: `Gỡ ngoại lệ “${o.permissionName}”?`,
                      consequence:
                        o.effect === 'DENY'
                          ? `${info.user.fullName} dùng lại được quyền này nếu vai trò của họ có quyền đó. Có hiệu lực ngay.`
                          : `${info.user.fullName} mất quyền này, trừ khi vai trò của họ cũng có quyền đó. Có hiệu lực ngay.`,
                      confirmLabel: 'Gỡ ngoại lệ',
                      onConfirm: () => remove.mutate(o.id),
                    })
                  }
                />
              )}
            </Group>
          </Paper>
        );
      })}
      {canEdit && (adding ? <OverrideForm userId={info.user.id} onClose={() => setAdding(false)} /> : (
        <ActionButton variant="default" leftSection={<IconPlus size={15} />} blockedReason={blocked} onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>
          Thêm ngoại lệ
        </ActionButton>
      ))}
    </Stack>
  );
}

/** Lý do bắt buộc: báo lỗi dưới ô sau khi rời ô, không báo ngay khi vừa mở form. */
function reasonError(reason: string, touched: boolean) {
  return touched && reason.trim().length < MIN_REASON ? `Nhập lý do, tối thiểu ${MIN_REASON} ký tự` : null;
}

function OverrideForm({ userId, onClose }: { userId: number; onClose: () => void }) {
  const refresh = useRefresh(userId);
  const matrix = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => api<PermissionMatrix>('/admin/permissions') });
  const [permissionId, setPermissionId] = useState<string | null>(null);
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW');
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const dirty = !!permissionId || effect !== 'ALLOW' || !!from || !!to || reason.trim() !== '';
  useReportDirty('override', dirty);
  const data = useMemo(
    () => (matrix.data?.modules ?? []).map((m) => ({ group: m.name, items: m.resources.flatMap((r) => r.permissions.map((p) => ({ value: String(p.id), label: `${r.name}: ${ACTION_LABEL[p.action] ?? p.action}` }))) })),
    [matrix.data],
  );
  const toError = to && toMs(to) <= (from ? toMs(from) : Date.now()) ? (from ? 'Phải sau thời điểm “Hiệu lực từ”' : 'Phải sau thời điểm hiện tại') : null;
  const blockedReason = !permissionId
    ? 'Chọn quyền trước.'
    : reason.trim().length < MIN_REASON
      ? `Nhập lý do, tối thiểu ${MIN_REASON} ký tự.`
      : toError
        ? `Thời hạn “Đến”: ${toError.toLowerCase()}.`
        : null;
  const save = useMutation({
    mutationFn: () => api(`/admin/users/${userId}/overrides`, { method: 'POST', body: { permissionId: Number(permissionId), effect, validFromAt: toIso(from), validToAt: toIso(to), reason: reason.trim() } }),
    onSuccess: async () => {
      toastOk('Đã thêm ngoại lệ. Có hiệu lực ngay.', 'Đã thêm');
      await refresh();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  return (
    <Paper withBorder p="sm" bg="var(--app-section)">
      <Stack gap="xs">
        {matrix.isError && <LoadError mb={0} error={matrix.error} what="danh sách quyền" onRetry={() => void matrix.refetch()} retrying={matrix.isFetching} />}
        <SegmentedControl aria-label="Loại ngoại lệ" value={effect} onChange={(v) => setEffect(v as 'ALLOW' | 'DENY')} data={[{ value: 'ALLOW', label: 'Cho phép thêm' }, { value: 'DENY', label: 'Chặn' }]} />
        <Select
          label="Quyền"
          withAsterisk
          placeholder={matrix.isPending ? 'Đang tải danh sách quyền…' : 'Chọn màn hình và hành động'}
          data={data}
          value={permissionId}
          onChange={setPermissionId}
          searchable
          className="field-required"
        />
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" verticalSpacing="xs">
          <DateTimePicker {...DATETIME} label="Hiệu lực từ" description="Để trống: ngay bây giờ" minDate={today()} value={from} onChange={setFrom} />
          <DateTimePicker {...DATETIME} label="Đến" description="Để trống: không thời hạn" minDate={from ? from.slice(0, 10) : today()} value={to} onChange={setTo} error={toError} />
        </SimpleGrid>
        <Textarea
          label="Lý do"
          withAsterisk
          description={`Tối thiểu ${MIN_REASON} ký tự`}
          placeholder="Ví dụ: Xem kế hoạch xuất hàng để chuẩn bị nguyên phụ liệu"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          onBlur={() => setReasonTouched(true)}
          error={reasonError(reason, reasonTouched)}
          className="field-required"
          autosize
          minRows={2}
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="xs" onClick={() => confirmDiscard(dirty, onClose)}>Hủy</Button>
          <ActionButton size="xs" blockedReason={blockedReason} loading={save.isPending} onClick={() => save.mutate()}>Lưu ngoại lệ</ActionButton>
        </Group>
      </Stack>
    </Paper>
  );
}

// ---------------- Cột riêng (L4 theo người) ----------------

function FieldTab({ info, blocked }: { info: UserAccessInfo; blocked: string | null }) {
  const canEdit = useCan('admin.fieldpolicy:update');
  const refresh = useRefresh(info.user.id);
  const [adding, setAdding] = useState(false);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/admin/users/${info.user.id}/field-policies/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toastOk(`Đã gỡ cột riêng của ${info.user.fullName}.`, 'Đã gỡ');
      await refresh();
    },
    onError: (e) => toastError(e),
  });
  return (
    <Stack gap="sm">
      <Alert variant="light" color="link" icon={<IconInfoCircle size={16} />} py={6}>
        Cột riêng thắng mọi vai trò của người này, ví dụ "được xem giá CM đến 31/12". Bắt buộc ghi lý do.
      </Alert>
      {info.fieldPolicies.length === 0 && !adding && <Text size="sm" c="dimmed">Chưa có cột riêng nào.</Text>}
      {info.fieldPolicies.map((p) => (
        <Paper key={p.id} withBorder p="sm">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <div>
              <Group gap={6}>
                <Badge color={levelColor(p.accessLevel)} variant="light">{LEVELS.find((l) => l.value === p.accessLevel)?.label}</Badge>
                <Text size="sm" fw={600}>{p.resourceName}: {p.fieldName}</Text>
              </Group>
              <Text size="xs" c="dimmed" mt={2}>{p.validToAt ? `Đến ${fmtDateTime(p.validToAt)}.` : 'Không thời hạn.'} Lý do: {p.reason}</Text>
            </div>
            {canEdit && (
              <IconAction
                label="Gỡ cột riêng"
                color="red"
                blockedReason={blocked}
                icon={<IconTrash size={16} />}
                onClick={() =>
                  confirmAction({
                    title: `Gỡ cột riêng “${p.resourceName}: ${p.fieldName}”?`,
                    consequence: 'Người này sẽ theo chính sách cột của vai trò từ lần tải trang kế tiếp.',
                    confirmLabel: 'Gỡ cột riêng',
                    onConfirm: () => remove.mutate(p.id),
                  })
                }
              />
            )}
          </Group>
        </Paper>
      ))}
      {canEdit && (adding ? <FieldForm userId={info.user.id} onClose={() => setAdding(false)} /> : (
        <ActionButton variant="default" leftSection={<IconPlus size={15} />} blockedReason={blocked} onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>
          Thêm cột riêng
        </ActionButton>
      ))}
    </Stack>
  );
}

function FieldForm({ userId, onClose }: { userId: number; onClose: () => void }) {
  const refresh = useRefresh(userId);
  const resources = useQuery({ queryKey: ['admin', 'resource-fields'], queryFn: () => api<ResourceFields[]>('/admin/resource-fields') });
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [fieldCode, setFieldCode] = useState<string | null>(null);
  const [level, setLevel] = useState<AccessLevel>('READONLY');
  const [to, setTo] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const dirty = !!resourceId || !!fieldCode || level !== 'READONLY' || !!to || reason.trim() !== '';
  useReportDirty('field', dirty);
  const fields = resources.data?.find((r) => String(r.id) === resourceId)?.fields ?? [];
  const toError = to && toMs(to) <= Date.now() ? 'Phải sau thời điểm hiện tại' : null;
  const blockedReason = !resourceId
    ? 'Chọn màn hình trước.'
    : !fieldCode
      ? 'Chọn cột.'
      : reason.trim().length < MIN_REASON
        ? `Nhập lý do, tối thiểu ${MIN_REASON} ký tự.`
        : toError
          ? `Hiệu lực đến: ${toError.toLowerCase()}.`
          : null;
  const save = useMutation({
    mutationFn: () => api(`/admin/users/${userId}/field-policies`, { method: 'POST', body: { resourceId: Number(resourceId), fieldCode, accessLevel: level, validToAt: toIso(to), reason: reason.trim() } }),
    onSuccess: async () => {
      toastOk('Đã thêm cột riêng. Có hiệu lực ngay.', 'Đã thêm');
      await refresh();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  return (
    <Paper withBorder p="sm" bg="var(--app-section)">
      <Stack gap="xs">
        {resources.isError && <LoadError mb={0} error={resources.error} what="danh sách màn hình" onRetry={() => void resources.refetch()} retrying={resources.isFetching} />}
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" verticalSpacing="xs">
          <Select
            label="Màn hình"
            withAsterisk
            placeholder={resources.isPending ? 'Đang tải…' : 'Chọn màn hình'}
            data={(resources.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
            value={resourceId}
            onChange={(v) => {
              setResourceId(v);
              setFieldCode(null);
            }}
          />
          <Select
            label="Cột"
            withAsterisk
            description={resourceId ? undefined : 'Chọn màn hình trước'}
            data={fields.map((f) => ({ value: f.code, label: `${f.name}${f.isSensitive ? ' (nhạy cảm)' : ''}` }))}
            value={fieldCode}
            onChange={setFieldCode}
            disabled={!resourceId}
          />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" verticalSpacing="xs">
          <Select label="Mức" withAsterisk data={LEVELS.map((l) => ({ value: l.value, label: l.label }))} value={level} onChange={(v) => setLevel((v as AccessLevel) ?? 'READONLY')} allowDeselect={false} />
          <DateTimePicker {...DATETIME} label="Hiệu lực đến" description="Để trống: không thời hạn" minDate={today()} value={to} onChange={setTo} error={toError} />
        </SimpleGrid>
        <Textarea
          label="Lý do"
          withAsterisk
          description={`Tối thiểu ${MIN_REASON} ký tự`}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          onBlur={() => setReasonTouched(true)}
          error={reasonError(reason, reasonTouched)}
          className="field-required"
          autosize
          minRows={2}
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="xs" onClick={() => confirmDiscard(dirty, onClose)}>Hủy</Button>
          <ActionButton size="xs" blockedReason={blockedReason} loading={save.isPending} onClick={() => save.mutate()}>Lưu cột riêng</ActionButton>
        </Group>
      </Stack>
    </Paper>
  );
}

// ---------------- Xem thử quyền thực tế ----------------

function EffectiveTab({ userId }: { userId: number }) {
  const branches = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => api<AdminBranch[]>('/admin/branches') });
  // Mặc định nhà máy cụ thể đầu tiên trong danh mục, không gắn cứng mã nhà máy (CLAUDE.md mục 6)
  const [picked, setBranchCode] = useState<string | null>(null);
  const branchCode = picked ?? (branches.data ?? []).find((b) => b.isActive && !b.isAggregate)?.code ?? null;
  const eff = useQuery({ queryKey: ['admin', 'effective', userId, branchCode], queryFn: () => api<EffectiveAccess>(`/admin/users/${userId}/effective?branchCode=${branchCode}`), enabled: !!branchCode });
  const resources = useQuery({ queryKey: ['admin', 'resource-fields'], queryFn: () => api<ResourceFields[]>('/admin/resource-fields') });
  const fieldName = (res: string, code: string) => resources.data?.find((r) => r.code === res)?.fields.find((f) => f.code === code)?.name ?? code;
  const e = eff.data;
  return (
    <Stack gap="sm">
      <Select label="Khi làm việc ở" data={(branches.data ?? []).filter((b) => b.isActive).map((b) => ({ value: b.code, label: `${b.code} – ${b.name}` }))} value={branchCode} onChange={setBranchCode} allowDeselect={false} w={260} maw="100%" />
      {branches.error &&
        (branches.error instanceof ApiError && branches.error.status === 403 ? (
          <Alert color="red" variant="light" py={6}>Không tải được danh sách nhà máy: bạn cần quyền xem Nhà máy ở màn Quản trị.</Alert>
        ) : (
          <LoadError mb={0} error={branches.error} what="danh sách nhà máy" onRetry={() => void branches.refetch()} retrying={branches.isFetching} />
        ))}
      {eff.error && <LoadError mb={0} error={eff.error} what="quyền thực tế" onRetry={() => void eff.refetch()} retrying={eff.isFetching} />}
      {eff.isLoading && <Skeleton h={160} />}
      {e && !e.branch.allowed && (
        <Alert color="orange" variant="light" py={6}>Người này chưa được chọn nhà máy {e.branch.code} khi đăng nhập. Kết quả dưới đây chỉ để tham khảo.</Alert>
      )}
      {e && (
        <>
          <Group gap={6}>
            <Text size="sm">Vai trò có hiệu lực:</Text>
            {e.roles.length ? e.roles.map((r) => <Badge key={r.code} variant="light" color="charcoal">{r.name}</Badge>) : <Text size="sm" c="dimmed">không có</Text>}
          </Group>
          {e.screens.length === 0 ? (
            <Text c="dimmed" size="sm">Ở nhà máy này, người này không dùng được màn hình nào.</Text>
          ) : (
            <div className="grid-wrap">
              <table className="grid" aria-label="Màn hình được dùng">
                <thead>
                  <tr><th>Màn hình</th><th>Được làm</th><th>Phạm vi dữ liệu</th></tr>
                </thead>
                <tbody>
                  {e.screens.map((s) => (
                    <tr key={s.code}>
                      <td style={{ whiteSpace: 'normal' }}>
                        <Text size="sm" fw={600}>{s.name}</Text>
                        {e.fieldLevels[s.code] && Object.entries(e.fieldLevels[s.code]).some(([, l]) => l !== 'EDITABLE') && (
                          <Group gap={4} mt={2}>
                            {Object.entries(e.fieldLevels[s.code]).filter(([, l]) => l !== 'EDITABLE').map(([f, l]) => (
                              <Badge key={f} size="xs" variant="light" color={levelColor(l)}>{fieldName(s.code, f)}: {LEVELS.find((x) => x.value === l)?.label}</Badge>
                            ))}
                          </Group>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'normal' }}>{s.actions.map((a) => ACTION_LABEL[a] ?? a).join(', ')}</td>
                      <td style={{ whiteSpace: 'normal' }}>{s.scope.length ? s.scope.join(' hoặc ') : <Text span size="sm" c="dimmed">Toàn bộ nhà máy</Text>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Group gap={6} c="dimmed">
            <IconShieldCheck size={16} />
            <Text size="xs">Kết quả tính đúng như máy chủ áp khi người này đăng nhập (vai trò, phạm vi, ngoại lệ, chính sách cột).</Text>
          </Group>
        </>
      )}
    </Stack>
  );
}
