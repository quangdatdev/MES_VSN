import { Alert, Badge, Button, Checkbox, Group, Select, Skeleton, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { FilterBar, LoadError } from './common';
import { useUrlParams } from '../../lib/useUrlParams';
import { ACTION_LABEL, type AdminRole, type PermissionMatrix } from './types';

type Resource = PermissionMatrix['modules'][number]['resources'][number];

/** Cột Màn hình dính trái khi bảng cuộn ngang (điện thoại, nhiều hành động): luôn biết đang tích cho màn nào. */
const stickyCell = (background: string): CSSProperties => ({ position: 'sticky', left: 0, zIndex: 1, background });
const STICKY_HEAD: CSSProperties = { position: 'sticky', left: 0, zIndex: 2, background: 'var(--app-section)' };
const actionText = (a: string) => ACTION_LABEL[a] ?? a;

/** Mọi quyền của các màn (theo một hành động, hoặc mọi hành động) */
const idsOf = (rs: Resource[], action?: string) => rs.flatMap((r) => r.permissions.filter((p) => !action || p.action === action).map((p) => p.id));

/** Ô chọn cả hàng, cả cột: `on` là số quyền đang tích trong `ids`. Memo: tích một ô chỉ vẽ lại các ô chọn có số đổi */
const Tick = memo(function Tick({ ids, on, onToggle, disabled, label }: { ids: number[]; on: number; onToggle: (ids: number[], on: boolean) => void; disabled: boolean; label: string }) {
  return (
    <Checkbox
      size="sm"
      aria-label={label}
      disabled={disabled || ids.length === 0}
      checked={ids.length > 0 && on === ids.length}
      indeterminate={on > 0 && on < ids.length}
      onChange={(e) => onToggle(ids, e.currentTarget.checked)}
    />
  );
});

const countOn = (ids: number[], draft: Set<number>) => ids.reduce((n, i) => n + (draft.has(i) ? 1 : 0), 0);

export default function PermissionsPage() {
  const qc = useQueryClient();
  const canEdit = useCan('admin.permission:update');
  const myRoles = useSession((s) => s.roles);
  const [params, setUrl] = useUrlParams();

  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api<AdminRole[]>('/admin/roles') });
  const matrix = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => api<PermissionMatrix>('/admin/permissions') });
  const active = useMemo(() => (roles.data ?? []).filter((r) => r.isActive), [roles.data]);
  // Vai trò lấy từ URL; chưa có (hoặc đã ngừng dùng) thì mặc định vai trò đầu tiên mà mình không giữ, để mở ra là sửa được ngay.
  const urlRole = Number(params.get('role')) || null;
  const roleId = active.some((r) => r.id === urlRole) ? urlRole : ((active.find((r) => !myRoles.some((m) => m.code === r.code)) ?? active[0])?.id ?? null);
  // URL đã có vai trò thì tải quyền của vai trò đó ngay, song song với danh sách vai trò (không chờ nối tiếp)
  const fetchRole = roles.data ? roleId : urlRole;
  const saved = useQuery({
    queryKey: ['admin', 'role-permissions', fetchRole],
    queryFn: () => api<{ permissionIds: number[] }>(`/admin/roles/${fetchRole}/permissions`),
    enabled: fetchRole !== null,
  });

  const role = active.find((r) => r.id === roleId);
  const isMine = !!role && myRoles.some((r) => r.code === role.code);
  // Chưa tải được quyền đã lưu thì không cho sửa: lưu lúc đó sẽ ghi đè toàn bộ quyền của vai trò.
  const loadFailed = matrix.isError || saved.isError;
  const readOnly = !canEdit || isMine || roleId === null || !saved.isSuccess || loadFailed;
  const savedSet = useMemo(() => new Set(saved.data?.permissionIds ?? []), [saved.data]);
  // Bản nháp gắn với vai trò đang xem; chưa tích gì thì là quyền đã lưu. Không chép dữ liệu vào state bằng effect (lần vẽ
  // đầu mọi ô bị tô "đã đổi"), tải lại nền cũng không xóa phần đang tích
  const [edit, setEdit] = useState<{ roleId: number; ids: Set<number> } | null>(null);
  const draft = edit && edit.roleId === roleId ? edit.ids : savedSet;
  const changes = useMemo(() => {
    let added = 0;
    let removed = 0;
    draft.forEach((i) => !savedSet.has(i) && added++);
    savedSet.forEach((i) => !draft.has(i) && removed++);
    return { added, removed, total: added + removed };
  }, [draft, savedSet]);
  useLeaveGuard(changes.total > 0);

  // Hàm ổn định cho các dòng (memo): đọc vai trò và quyền đã lưu qua ref. Gán sau khi vẽ xong: đổi vai trò đi qua
  // startTransition, lượt vẽ dở của vai trò mới không được làm ô vừa tích rơi vào vai trò đó
  const latest = useRef({ roleId, savedSet });
  useLayoutEffect(() => {
    latest.current = { roleId, savedSet };
  });
  const toggle = useCallback(
    (ids: number[], on: boolean) =>
      setEdit((e) => {
        const { roleId: rid, savedSet: base } = latest.current;
        if (rid === null) return e;
        const next = new Set(e && e.roleId === rid ? e.ids : base);
        ids.forEach((i) => (on ? next.add(i) : next.delete(i)));
        return { roleId: rid, ids: next };
      }),
    [],
  );

  const save = useMutation({
    // `draft`: bản nháp lúc bấm Lưu, để biết người dùng có tích thêm trong lúc chờ không
    mutationFn: (v: { roleId: number; ids: number[]; draft: Set<number> }) => api<{ added: number; removed: number }>(`/admin/roles/${v.roleId}/permissions`, { method: 'PUT', body: { permissionIds: v.ids } }),
    onSuccess: (r, v) => {
      toastOk(`Đã lưu quyền cho "${role?.name}": thêm ${r.added}, bỏ ${r.removed}. Người dùng thấy thay đổi ở lần tải kế tiếp.`);
      // Quyền vừa lưu thành quyền đã lưu ngay: bảng không nháy về trạng thái cũ trong lúc tải lại
      qc.setQueryData(['admin', 'role-permissions', v.roleId], { permissionIds: v.ids });
      // Không tích thêm gì trong lúc lưu thì bỏ bản nháp; có thì giữ (ô vừa lưu thôi tính là đổi)
      setEdit((e) => (e?.roleId === v.roleId && e.ids === v.draft ? null : e));
      void qc.invalidateQueries({ queryKey: ['admin', 'role-permissions', v.roleId] });
      void qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });

  function pickRole(v: string | null) {
    const next = v ? Number(v) : null;
    if (next === roleId) return;
    confirmDiscard(
      changes.total > 0,
      () => {
        setEdit(null);
        setUrl({ role: next });
      },
      `Bạn đã sửa ${changes.total} quyền của vai trò "${role?.name}" nhưng chưa bấm Lưu quyền.`,
    );
  }

  const saveBlocked = !canEdit
    ? 'Bạn chỉ có quyền xem phân quyền, không sửa được.'
    : isMine
      ? 'Bạn đang giữ vai trò này nên không tự sửa quyền của nó. Nhờ quản trị viên khác.'
      : loadFailed
        ? 'Chưa tải được quyền của vai trò. Bấm Thử lại.'
        : !saved.isSuccess
          ? 'Đang tải quyền của vai trò…'
          : changes.total === 0
            ? 'Chưa có thay đổi nào để lưu.'
            : null;

  const actions = useMemo(() => matrix.data?.actions ?? [], [matrix.data]);
  // Quyền theo cột của cả bảng: tính một lần theo ma trận, không mỗi lần tích
  const columnIds = useMemo(() => {
    const all = (matrix.data?.modules ?? []).flatMap((m) => m.resources);
    return actions.map((a) => idsOf(all, a));
  }, [matrix.data, actions]);
  const roleName = role?.name ?? '';

  return (
    <>
      <PageHeader
        title="Phân quyền"
        subtitle="Chọn vai trò, tích các hành động được phép trên từng màn hình rồi bấm Lưu quyền."
        actions={
          <>
            {changes.total > 0 && <Badge color="orange" variant="light">Chưa lưu: +{changes.added} / −{changes.removed}</Badge>}
            <ActionButton variant="default" blockedReason={changes.total === 0 ? 'Chưa có thay đổi nào.' : null} onClick={() => confirmDiscard(true, () => setEdit(null), 'Mọi ô đã đổi trở lại như lần lưu gần nhất.')}>Hoàn tác</ActionButton>
            <ActionButton blockedReason={saveBlocked} loading={save.isPending} onClick={() => roleId !== null && save.mutate({ roleId, ids: [...draft], draft })}>Lưu quyền</ActionButton>
          </>
        }
      />

      <FilterBar>
        <Select
          label="Vai trò"
          allowDeselect={false}
          placeholder={roles.isPending ? 'Đang tải…' : undefined}
          data={active.map((r) => ({ value: String(r.id), label: `${r.name} (${r.code})` }))}
          value={roleId === null ? null : String(roleId)}
          onChange={pickRole}
          w={300}
          maw="100%"
        />
        {role?.description && <Text size="sm" c="dimmed" pb={6}>{role.description}</Text>}
      </FilterBar>

      {roles.isError && <LoadError error={roles.error} what="danh sách vai trò" onRetry={() => void roles.refetch()} retrying={roles.isFetching} />}
      {roles.isSuccess && active.length === 0 && <Text c="dimmed" size="sm" mb="sm">Chưa có vai trò nào đang dùng. Thêm hoặc bật lại vai trò ở màn Vai trò.</Text>}

      {isMine && (
        <Alert mb="sm" variant="light" color="orange" icon={<IconInfoCircle size={18} />} title="Bạn đang giữ vai trò này">
          Để tránh tự nâng hoặc tự gỡ quyền của chính mình, bạn chỉ xem được vai trò này. Nhờ một quản trị viên khác sửa.
        </Alert>
      )}

      {loadFailed && (
        <Alert mb="sm" variant="light" color="red" icon={<IconInfoCircle size={18} />} title="Chưa tải được quyền của vai trò">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="sm">Ma trận đang khóa để tránh lưu nhầm. Kiểm tra kết nối rồi thử lại.</Text>
            <Button size="xs" variant="default" loading={matrix.isFetching || saved.isFetching} onClick={() => { void matrix.refetch(); void saved.refetch(); }}>Thử lại</Button>
          </Group>
        </Alert>
      )}

      {matrix.isLoading || saved.isLoading ? (
        <Skeleton h={320} />
      ) : (
        <div className="table-frame" data-fill>
          <table className="dense-table" aria-label={roleName ? `Quyền của vai trò ${roleName}` : 'Ma trận quyền'}>
            <thead>
              <tr>
                <th style={{ ...STICKY_HEAD, minWidth: 260 }}>Màn hình</th>
                {actions.map((a, i) => (
                  <th key={a} style={{ textAlign: 'center', width: 96 }}>
                    <Group gap={6} justify="center" wrap="nowrap">
                      <Tick ids={columnIds[i]} on={countOn(columnIds[i], draft)} onToggle={toggle} disabled={readOnly} label={`Chọn cả cột ${actionText(a)}`} />
                      {actionText(a)}
                    </Group>
                  </th>
                ))}
                <th style={{ textAlign: 'center', width: 80 }}>Cả hàng</th>
              </tr>
            </thead>
            <tbody>
              {matrix.data?.modules.map((m) => (
                <ModuleRows key={m.code} module={m} roleName={roleName} actions={actions} draft={draft} savedSet={savedSet} toggle={toggle} readOnly={readOnly} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * Trạng thái các ô của một dòng thành một chuỗi, mỗi hành động một ký tự: '-' màn không có hành động đó, 'a'/'b' chưa tích
 * hoặc đã tích, viết hoa là khác quyền đã lưu. Dòng memo so chuỗi này: tích một ô chỉ vẽ lại dòng chứa ô đó.
 */
function rowMarks(r: Resource, actions: string[], draft: Set<number>, savedSet: Set<number>) {
  return actions
    .map((a) => {
      const p = r.permissions.find((x) => x.action === a);
      if (!p) return '-';
      const on = draft.has(p.id);
      const mark = on ? 'b' : 'a';
      return on !== savedSet.has(p.id) ? mark.toUpperCase() : mark;
    })
    .join('');
}

function ModuleRows({ module, roleName, actions, draft, savedSet, toggle, readOnly }: {
  module: PermissionMatrix['modules'][number];
  roleName: string;
  actions: string[];
  draft: Set<number>;
  savedSet: Set<number>;
  toggle: (ids: number[], on: boolean) => void;
  readOnly: boolean;
}) {
  const ids = useMemo(() => ({ byAction: actions.map((a) => idsOf(module.resources, a)), all: idsOf(module.resources) }), [module, actions]);
  return (
    <>
      <tr style={{ background: 'var(--app-section)' }}>
        <td style={{ ...stickyCell('var(--app-section)'), fontWeight: 700 }}>{module.name}</td>
        {actions.map((a, i) => (
          <td key={a} style={{ textAlign: 'center' }}>
            <Tick ids={ids.byAction[i]} on={countOn(ids.byAction[i], draft)} onToggle={toggle} disabled={readOnly} label={`${module.name}: chọn cả cột ${actionText(a)}`} />
          </td>
        ))}
        <td style={{ textAlign: 'center' }}>
          <Tick ids={ids.all} on={countOn(ids.all, draft)} onToggle={toggle} disabled={readOnly} label={`${module.name}: chọn tất cả`} />
        </td>
      </tr>
      {module.resources.map((r) => (
        <ResourceRow key={r.id} resource={r} moduleName={module.name} roleName={roleName} actions={actions} marks={rowMarks(r, actions, draft, savedSet)} readOnly={readOnly} toggle={toggle} />
      ))}
    </>
  );
}

const ResourceRow = memo(function ResourceRow({ resource: r, moduleName, roleName, actions, marks, readOnly, toggle }: {
  resource: Resource;
  moduleName: string;
  roleName: string;
  actions: string[];
  marks: string;
  readOnly: boolean;
  toggle: (ids: number[], on: boolean) => void;
}) {
  const rowIds = useMemo(() => idsOf([r]), [r]);
  const on = [...marks].filter((m) => m === 'b' || m === 'B').length;
  return (
    <tr>
      <td style={{ ...stickyCell('var(--app-surface)'), paddingLeft: 24 }}>{r.name}</td>
      {actions.map((a, i) => {
        const p = r.permissions.find((x) => x.action === a);
        const mark = marks[i];
        const changed = mark === 'A' || mark === 'B';
        return (
          <td key={a} style={{ textAlign: 'center', position: 'relative', background: changed ? 'var(--brand-soft)' : undefined }}>
            {p ? (
              <>
                <Checkbox
                  size="sm"
                  style={{ display: 'inline-flex' }}
                  aria-label={`${roleName} – ${moduleName} – ${r.name}: ${actionText(a)}${changed ? ' (chưa lưu)' : ''}`}
                  disabled={readOnly}
                  checked={mark === 'b' || mark === 'B'}
                  onChange={(e) => toggle([p.id], e.currentTarget.checked)}
                />
                {/* Dấu chấm cho ô vừa đổi: không chỉ dựa vào màu nền để biết ô nào chưa lưu */}
                {changed && <span aria-hidden style={{ position: 'absolute', top: 0, right: 6, fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>•</span>}
              </>
            ) : <Text size="xs" c="dimmed">–</Text>}
          </td>
        );
      })}
      <td style={{ textAlign: 'center' }}>
        <Tick ids={rowIds} on={on} onToggle={toggle} disabled={readOnly} label={`${r.name}: chọn cả hàng`} />
      </td>
    </tr>
  );
});
