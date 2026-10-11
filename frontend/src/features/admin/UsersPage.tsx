import { Badge, Button, Checkbox, Divider, Group, Modal, PasswordInput, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDisclosure } from '@mantine/hooks';
import { IconAdjustmentsHorizontal, IconBuildingFactory2, IconCircleCheck, IconKey, IconLockOpen, IconPencil, IconPlus, IconSearch, IconUserShield } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useMemo, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { PageHeader } from '../../components/PageHeader';
import { Pager } from '../../components/Pager';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import type { Paged } from '../../lib/types';
import { Can } from '../../shell/Can';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { emailError, EmptyRow, escapeToClose, FilterBar, IconAction, LoadError, SkeletonRows } from './common';
import { pageOf, useClampPage, useUrlParams } from '../../lib/useUrlParams';
import type { AdminBranch, AdminRole, AdminUser } from './types';
import { UserAccessDrawer } from './UserAccessDrawer';

type Dialog = { kind: 'create' } | { kind: 'edit' | 'roles' | 'branches' | 'password' | 'access'; user: AdminUser } | null;

const SELF_ROLES = 'Bạn không tự gán vai trò cho chính mình. Nhờ quản trị viên khác.';
const SELF_BRANCHES = 'Bạn không tự gán nhà máy cho chính mình. Nhờ quản trị viên khác.';
const SELF_PASSWORD = 'Không tự đặt lại mật khẩu của chính mình ở màn quản trị. Nhờ quản trị viên khác.';
/** Cỡ trang dùng chung cho truy vấn, kéo về trang cuối và chân bảng */
const PAGE_SIZE = 100;

interface UserRowProps {
  u: AdminUser;
  self: boolean;
  canEdit: boolean;
  canGrant: boolean;
  roleName: (id: number) => string;
  branchCode: (id: number) => string;
  onDialog: (d: Dialog) => void;
}

/** Một dòng người dùng (tới 5 nút có Tooltip): memo, mở popup hay ngăn kéo không vẽ lại cả 100 dòng */
const UserRow = memo(function UserRow({ u, self, canEdit, canGrant, roleName, branchCode, onDialog }: UserRowProps) {
  return (
    <tr onClick={() => onDialog({ kind: 'access', user: u })} style={{ cursor: 'pointer' }}>
      <td className="mono" style={{ fontWeight: 600 }}>{u.username}</td>
      <td>{u.fullName}{self && <Badge ml={6} size="xs" variant="light">Bạn</Badge>}</td>
      <td>{u.roleIds.length ? u.roleIds.map((r) => <Badge key={r} mr={4} size="sm" variant="light" color="gray">{roleName(r)}</Badge>) : <Text c="dimmed" size="sm">Chưa gán</Text>}</td>
      <td>{u.branchIds.length ? u.branchIds.map((b) => <Badge key={b} mr={4} size="sm" variant="outline" color="navy" className="mono">{branchCode(b)}</Badge>) : <Text c="dimmed" size="sm">Chưa gán</Text>}</td>
      <td>
        {!u.isActive ? (
          <Badge color="gray" variant="filled" size="sm">Đã khóa</Badge>
        ) : u.isLocked ? (
          <Badge color="red" variant="light" size="sm" title="Đăng nhập sai nhiều lần. Mở khóa ở Sửa thông tin.">Khóa tạm</Badge>
        ) : (
          <Badge color="teal" variant="light" size="sm">Hoạt động</Badge>
        )}
      </td>
      {/* Bấm vào khoảng trống quanh các nút không mở ngăn kéo: dễ bấm nhầm khi nhắm vào nút */}
      <td onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
        <Group gap={2} wrap="nowrap">
          <IconAction label="Phân quyền chi tiết" color="link" icon={<IconAdjustmentsHorizontal size={16} />} onClick={() => onDialog({ kind: 'access', user: u })} />
          {canEdit && <IconAction label="Sửa thông tin" icon={<IconPencil size={16} />} onClick={() => onDialog({ kind: 'edit', user: u })} />}
          {canGrant && <IconAction label="Gán vai trò" blockedReason={self ? SELF_ROLES : null} icon={<IconUserShield size={16} />} onClick={() => onDialog({ kind: 'roles', user: u })} />}
          {canGrant && <IconAction label="Gán nhà máy" blockedReason={self ? SELF_BRANCHES : null} icon={<IconBuildingFactory2 size={16} />} onClick={() => onDialog({ kind: 'branches', user: u })} />}
          {canEdit && <IconAction label="Đặt lại mật khẩu" blockedReason={self ? SELF_PASSWORD : null} icon={<IconKey size={16} />} onClick={() => onDialog({ kind: 'password', user: u })} />}
        </Group>
      </td>
    </tr>
  );
});

export default function UsersPage() {
  const qc = useQueryClient();
  const me = useSession((s) => s.user);
  const canEdit = useCan('admin.user:update');
  const canGrant = useCan('admin.permission:update');
  const [params, setUrl] = useUrlParams();
  const page = pageOf(params);
  // URL giữ nguyên chữ đã gõ (kể cả khoảng trắng cuối, để ô tìm không bị sửa lại giữa lúc gõ); truy vấn dùng chữ đã cắt
  const rawQuery = params.get('q') ?? '';
  const query = rawQuery.trim();
  // Xóa tìm kiếm dựng lại ô tìm: chữ đang gõ dở (chưa kịp lên URL) cũng mất theo
  const [searchKey, setSearchKey] = useState(0);
  const clearSearch = () => {
    setSearchKey((k) => k + 1);
    setUrl({ q: null, page: null });
  };
  const [dialog, setDialog] = useState<Dialog>(null);

  const users = useQuery({
    queryKey: ['admin', 'users', page, query],
    queryFn: () => api<Paged<AdminUser>>(`/admin/users?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(query)}`),
    placeholderData: keepPreviousData,
  });
  useClampPage(users.data, page, PAGE_SIZE, (p) => setUrl({ page: p === 1 ? null : p }));
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api<AdminRole[]>('/admin/roles') });
  const branches = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => api<AdminBranch[]>('/admin/branches') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'users'] });
  const roleById = useMemo(() => new Map((roles.data ?? []).map((r) => [r.id, r.name])), [roles.data]);
  const branchById = useMemo(() => new Map((branches.data ?? []).map((b) => [b.id, b.code])), [branches.data]);
  const rolesPending = roles.isPending;
  const branchesPending = branches.isPending;
  const roleName = useCallback((id: number) => roleById.get(id) ?? (rolesPending ? '…' : `#${id}`), [roleById, rolesPending]);
  const branchCode = useCallback((id: number) => branchById.get(id) ?? (branchesPending ? '…' : `#${id}`), [branchById, branchesPending]);
  const rows = users.data?.items ?? [];

  return (
    <>
      <PageHeader
        title="Người dùng"
        subtitle="Tạo tài khoản, gán vai trò và nhà máy. Bấm vào một người để xem phân quyền chi tiết: phạm vi chuyền, ngoại lệ, cột riêng."
        actions={
          <Can permission="admin.user:create">
            <Button leftSection={<IconPlus size={15} />} onClick={() => setDialog({ kind: 'create' })}>Thêm người dùng</Button>
          </Can>
        }
      />
      <FilterBar>
        {/* Ô tìm giữ chữ đang gõ (không vẽ lại bảng mỗi phím); URL và truy vấn đổi khi ngừng gõ */}
        <DebouncedTextInput
          key={searchKey}
          placeholder="Tìm theo tên đăng nhập, họ tên, email"
          leftSection={<IconSearch size={14} />}
          value={rawQuery}
          onChange={(v) => setUrl({ q: v, page: null })}
          w={360}
          maw="100%"
          aria-label="Tìm người dùng"
        />
      </FilterBar>
      {users.isError && <LoadError error={users.error} what="danh sách người dùng" onRetry={() => void users.refetch()} retrying={users.isFetching} />}
      <div className="table-frame">
        <table className="dense-table">
          <thead>
            <tr><th>Tên đăng nhập</th><th>Họ tên</th><th>Vai trò</th><th>Nhà máy</th><th>Trạng thái</th><th style={{ width: 190 }}>Thao tác</th></tr>
          </thead>
          <tbody>
            {users.isPending && <SkeletonRows cols={6} />}
            {rows.map((u) => (
              <UserRow key={u.id} u={u} self={u.id === me?.id} canEdit={canEdit} canGrant={canGrant} roleName={roleName} branchCode={branchCode} onDialog={setDialog} />
            ))}
            {users.isSuccess && rows.length === 0 && (
              query ? (
                <EmptyRow colSpan={6} action={<Button size="xs" variant="default" onClick={clearSearch}>Xóa tìm kiếm</Button>}>
                  Không tìm thấy người dùng nào khớp “{query}”.
                </EmptyRow>
              ) : (
                <EmptyRow colSpan={6}>Chưa có người dùng nào. Bấm “Thêm người dùng” để tạo.</EmptyRow>
              )
            )}
          </tbody>
        </table>
        {users.data && <Pager page={page} pageSize={PAGE_SIZE} total={users.data.total} onPage={(p) => setUrl({ page: p === 1 ? null : p })} />}
      </div>

      {dialog?.kind === 'access' && <UserAccessDrawer userId={dialog.user.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'create' && <CreateUser onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === 'edit' && <EditUser user={dialog.user} onClose={() => setDialog(null)} onDone={refresh} />}
      {dialog?.kind === 'password' && <ResetPassword user={dialog.user} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'roles' && (
        <PickMany
          title={`Vai trò của ${dialog.user.username}`}
          hint="Quyền của người dùng là tổng quyền của mọi vai trò được gán. Bỏ một vai trò thì phạm vi của vai trò đó cũng bị gỡ (có ghi nhật ký); vai trò giữ nguyên thì giữ nguyên phạm vi."
          options={(roles.data ?? []).filter((r) => r.isActive).map((r) => ({ value: r.id, label: r.name, hint: r.description }))}
          stopped={(roles.data ?? []).filter((r) => !r.isActive && dialog.user.roleIds.includes(r.id)).map((r) => ({ value: r.id, label: r.name }))}
          initial={dialog.user.roleIds}
          onClose={() => setDialog(null)}
          onSave={async (ids) => {
            await api(`/admin/users/${dialog.user.id}/roles`, { method: 'PUT', body: { roleIds: ids } });
            toastOk(`Đã cập nhật vai trò của ${dialog.user.username}. Người dùng thấy thay đổi ở lần tải kế tiếp.`);
            await refresh();
          }}
        />
      )}
      {dialog?.kind === 'branches' && (
        <PickMany
          title={`Nhà máy của ${dialog.user.username}`}
          hint="Người dùng chỉ chọn được những nhà máy ở đây khi đăng nhập. A00 là chế độ xem tổng hợp, chỉ đọc."
          options={(branches.data ?? []).filter((b) => b.isActive).map((b) => ({ value: b.id, label: `${b.code} – ${b.name}`, hint: b.isAggregate ? 'Xem tổng hợp mọi nhà máy, chỉ đọc' : null }))}
          stopped={(branches.data ?? []).filter((b) => !b.isActive && dialog.user.branchIds.includes(b.id)).map((b) => ({ value: b.id, label: `${b.code} – ${b.name}` }))}
          initial={dialog.user.branchIds}
          onClose={() => setDialog(null)}
          onSave={async (ids) => {
            await api(`/admin/users/${dialog.user.id}/branches`, { method: 'PUT', body: { branchIds: ids, defaultBranchId: dialog.user.defaultBranchId ?? undefined } });
            toastOk(`Đã cập nhật nhà máy được phép chọn của ${dialog.user.username}.`);
            await refresh();
          }}
        />
      )}
    </>
  );
}

function CreateUser({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const form = useForm({
    initialValues: { username: '', fullName: '', email: '', initialPassword: '' },
    validateInputOnBlur: true,
    validate: {
      username: (v) => (/^[a-z0-9._-]{3,50}$/.test(v) ? null : 'Gồm 3-50 ký tự thường, số, dấu chấm, gạch ngang hoặc gạch dưới'),
      fullName: (v) => (v.trim() ? null : 'Nhập họ tên'),
      email: emailError,
      initialPassword: (v) => (v.length >= 8 ? null : 'Tối thiểu 8 ký tự'),
    },
  });
  const m = useMutation({
    mutationFn: (v: typeof form.values) => api('/admin/users', { method: 'POST', body: { ...v, fullName: v.fullName.trim(), email: v.email.trim() || undefined } }),
    onSuccess: (_r, v) => {
      toastOk(`Đã thêm người dùng ${v.username}. Hãy gán vai trò và nhà máy để họ đăng nhập được.`);
      onDone();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title="Thêm người dùng">
      <form onSubmit={form.onSubmit((v) => m.mutate(v))}>
        <Stack gap="sm">
          <TextInput label="Tên đăng nhập" withAsterisk data-autofocus {...form.getInputProps('username')} />
          <TextInput label="Họ tên" withAsterisk {...form.getInputProps('fullName')} />
          <TextInput label="Email" {...form.getInputProps('email')} />
          <PasswordInput label="Mật khẩu ban đầu" withAsterisk description="Báo cho người dùng và nhờ họ đổi sau khi đăng nhập." {...form.getInputProps('initialPassword')} />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={m.isPending}>Thêm người dùng</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

type UserBody = { fullName: string; email: string | null; isActive: boolean };

function EditUser({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => void }) {
  const me = useSession((s) => s.user);
  const self = user.id === me?.id;
  const form = useForm({
    initialValues: { fullName: user.fullName, email: user.email ?? '', isActive: user.isActive },
    validateInputOnBlur: true,
    validate: { fullName: (v) => (v.trim() ? null : 'Nhập họ tên'), email: emailError },
  });
  const m = useMutation({
    mutationFn: (body: UserBody) => api(`/admin/users/${user.id}`, { method: 'PUT', body }),
    onSuccess: (_r, body) => {
      toastOk(
        user.isActive && !body.isActive
          ? `Đã khóa tài khoản ${user.username}. Mọi phiên đăng nhập của người này đã bị thu hồi.`
          : !user.isActive && body.isActive
            ? `Đã mở lại tài khoản ${user.username}.`
            : `Đã lưu người dùng ${user.username}.`,
      );
      onDone();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  // Mở khóa tạm là việc riêng: không đóng popup, không đụng tới họ tên, email đang sửa
  const unlock = useMutation({
    mutationFn: () => api(`/admin/users/${user.id}`, { method: 'PUT', body: { unlock: true } }),
    onSuccess: () => {
      toastOk(`Đã mở khóa ${user.username}. Người này đăng nhập lại được ngay.`, 'Đã mở khóa');
      onDone();
    },
    onError: (e) => toastError(e),
  });
  function submit(v: typeof form.values) {
    const body: UserBody = { fullName: v.fullName.trim(), email: v.email.trim() || null, isActive: v.isActive };
    if (!(user.isActive && !v.isActive)) return m.mutate(body);
    confirmAction({
      title: `Khóa tài khoản ${user.username}?`,
      consequence: 'Người này bị đăng xuất khỏi mọi thiết bị và không đăng nhập được cho đến khi mở lại.',
      confirmLabel: 'Khóa tài khoản',
      onConfirm: () => m.mutate(body),
    });
  }
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title={`Sửa ${user.username}`}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput label="Họ tên" withAsterisk {...form.getInputProps('fullName')} />
          <TextInput label="Email" {...form.getInputProps('email')} />
          <Switch
            label="Cho phép đăng nhập"
            description={self ? 'Bạn không tự khóa tài khoản của chính mình.' : 'Tắt để khóa tài khoản: chặn đăng nhập và thu hồi mọi phiên đang mở.'}
            disabled={self}
            {...form.getInputProps('isActive', { type: 'checkbox' })}
          />
          {user.isLocked && (
            <Group justify="space-between" p="xs" gap="xs" style={{ border: '1px solid var(--app-line-strong)', borderRadius: 4 }}>
              {unlock.isSuccess ? (
                <Group gap={6} wrap="nowrap">
                  <IconCircleCheck size={16} color="var(--mantine-color-teal-text)" aria-hidden />
                  <Text size="sm">Đã mở khóa. Người này đăng nhập lại được ngay.</Text>
                </Group>
              ) : (
                <>
                  <Text size="sm">Tài khoản đang bị khóa tạm do đăng nhập sai nhiều lần.</Text>
                  <Button size="xs" variant="light" leftSection={<IconLockOpen size={14} />} loading={unlock.isPending} onClick={() => unlock.mutate()}>Mở khóa</Button>
                </>
              )}
            </Group>
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={m.isPending}>Lưu thay đổi</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const form = useForm({
    initialValues: { newPassword: '' },
    validateInputOnBlur: true,
    validate: { newPassword: (v) => (v.length >= 8 ? null : 'Tối thiểu 8 ký tự') },
  });
  const m = useMutation({
    mutationFn: (v: { newPassword: string }) => api(`/admin/users/${user.id}/reset-password`, { method: 'POST', body: v }),
    onSuccess: () => {
      toastOk(`Đã đặt lại mật khẩu cho ${user.username}. Mọi phiên đăng nhập cũ của người này đã bị thu hồi.`);
      onClose();
    },
    onError: (e) => toastError(e),
  });
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title={`Đặt lại mật khẩu cho ${user.username}`}>
      <form onSubmit={form.onSubmit((v) => m.mutate(v))}>
        <Stack gap="sm">
          <Text size="sm">Mọi phiên đăng nhập của {user.fullName} sẽ bị thu hồi. Báo mật khẩu mới cho họ.</Text>
          <PasswordInput label="Mật khẩu mới" withAsterisk data-autofocus {...form.getInputProps('newPassword')} />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={m.isPending}>Đặt lại mật khẩu</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

type PickOption = { value: number; label: string; hint?: string | null };

export function PickMany({ title, hint, options, stopped = [], initial, onClose, onSave }: {
  title: string;
  hint: string;
  options: PickOption[];
  /** Mục đang gán nhưng đã ngừng dùng: vẫn hiện để bỏ chọn được, máy chủ không nhận lưu lại mục này. */
  stopped?: PickOption[];
  initial: number[];
  onClose: () => void;
  onSave: (ids: number[]) => Promise<void>;
}) {
  const [picked, setPicked] = useState<number[]>(initial);
  const [saving, { open, close }] = useDisclosure(false);
  const dirty = picked.length !== initial.length || picked.some((x) => !initial.includes(x));
  const stoppedPicked = stopped.filter((o) => picked.includes(o.value));
  async function save() {
    open();
    try {
      await onSave(picked);
      onClose();
    } catch (e) {
      toastError(e, 'Chưa lưu được');
    } finally {
      close();
    }
  }
  const box = (o: PickOption) => (
    <Checkbox
      key={o.value}
      label={o.label}
      description={o.hint ?? undefined}
      checked={picked.includes(o.value)}
      onChange={(e) => {
        // Đọc trước khi gọi setPicked: hàm cập nhật chạy sau khi sự kiện xong, lúc đó currentTarget đã là null
        const on = e.currentTarget.checked;
        setPicked((p) => (on ? [...p.filter((x) => x !== o.value), o.value] : p.filter((x) => x !== o.value)));
      }}
    />
  );
  useLeaveGuard(dirty);
  const requestClose = () => confirmDiscard(dirty, onClose);
  return (
    <Modal opened onClose={requestClose} {...escapeToClose(requestClose)} title={title}>
      <Stack gap="xs">
        <Text size="sm" c="dimmed">{hint}</Text>
        {options.map(box)}
        {stopped.length > 0 && (
          <>
            <Divider label="Đã ngừng dùng" labelPosition="left" mt={4} />
            <Text size="xs" c="dimmed">Đang gán nhưng đã ngừng dùng. Bỏ chọn để gỡ; không lưu lại được mục đã ngừng dùng.</Text>
            {stopped.map(box)}
          </>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={requestClose}>Hủy</Button>
          <ActionButton
            onClick={save}
            loading={saving}
            blockedReason={
              stoppedPicked.length ? `Bỏ chọn mục đã ngừng dùng trước khi lưu: ${stoppedPicked.map((o) => o.label).join(', ')}.` : !dirty ? 'Chưa có thay đổi nào.' : null
            }
          >
            Lưu thay đổi
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  );
}
