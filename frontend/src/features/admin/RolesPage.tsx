import { Badge, Button, Group, Modal, Stack, Switch, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil, IconPlayerPause, IconPlayerPlay, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { Can } from '../../shell/Can';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { EmptyRow, escapeToClose, IconAction, LoadError, SkeletonRows, upper } from './common';
import type { AdminRole } from './types';

const OWN_ROLE = 'Bạn đang giữ vai trò này nên không tự ngừng dùng được. Nhờ quản trị viên khác.';
const SYSTEM_ROLE = 'Vai trò hệ thống luôn dùng, không ngừng dùng được.';

/** Hậu quả khi ngừng dùng: nói rõ bao nhiêu người mất quyền. */
const stopConsequence = (r: AdminRole) =>
  `${r.userCount > 0 ? `${r.userCount} người dùng đang giữ vai trò này sẽ mất các quyền của nó ngay. ` : 'Chưa có ai giữ vai trò này. '}Vai trò không còn gán được cho ai; bật lại lúc nào cũng được.`;

export default function RolesPage() {
  const qc = useQueryClient();
  const canEdit = useCan('admin.role:update');
  const canDelete = useCan('admin.role:delete');
  const myRoles = useSession((s) => s.roles);
  const [dialog, setDialog] = useState<'create' | AdminRole | null>(null);
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api<AdminRole[]>('/admin/roles') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] });
  const isMine = (r: AdminRole) => myRoles.some((m) => m.code === r.code);

  // Ngừng dùng qua DELETE: máy chủ chỉ tắt vai trò, không xóa (danh mục không xóa vật lý)
  const stop = useMutation({
    mutationFn: (r: AdminRole) => api(`/admin/roles/${r.id}`, { method: 'DELETE' }),
    onSuccess: (_x, r) => {
      toastOk(`Đã ngừng dùng vai trò ${r.name}.`, 'Đã ngừng dùng');
      void refresh();
    },
    onError: (e) => toastError(e),
  });
  const resume = useMutation({
    mutationFn: (r: AdminRole) => api(`/admin/roles/${r.id}`, { method: 'PUT', body: { isActive: true } }),
    onSuccess: (_x, r) => {
      toastOk(`Đã dùng lại vai trò ${r.name}.`);
      void refresh();
    },
    onError: (e) => toastError(e),
  });

  function confirmStop(r: AdminRole) {
    confirmAction({ title: `Ngừng dùng vai trò ${r.name}?`, consequence: stopConsequence(r), confirmLabel: 'Ngừng dùng vai trò', onConfirm: () => stop.mutate(r) });
  }

  const rows = roles.data ?? [];
  return (
    <>
      <PageHeader
        title="Vai trò"
        subtitle="Mỗi vai trò là một bộ quyền. Chỉnh quyền chi tiết ở màn Phân quyền."
        actions={<Can permission="admin.role:create"><Button leftSection={<IconPlus size={15} />} onClick={() => setDialog('create')}>Thêm vai trò</Button></Can>}
      />
      {roles.isError && <LoadError error={roles.error} what="danh sách vai trò" onRetry={() => void roles.refetch()} retrying={roles.isFetching} />}
      <div className="table-frame">
        <table className="dense-table">
          <thead><tr><th>Mã</th><th>Tên</th><th>Mô tả</th><th style={{ textAlign: 'right' }}>Quyền</th><th style={{ textAlign: 'right' }}>Người dùng</th><th>Trạng thái</th><th style={{ width: 90 }}>Thao tác</th></tr></thead>
          <tbody>
            {roles.isPending && <SkeletonRows cols={7} />}
            {rows.map((r) => (
              <tr key={r.id} data-inactive={!r.isActive || undefined}>
                <td className="mono" style={{ fontWeight: 600 }}>{r.code}</td>
                <td>{r.name}{r.isSystem && <Badge ml={6} size="xs" variant="light" color="gray">Hệ thống</Badge>}</td>
                <td style={{ whiteSpace: 'normal', maxWidth: 380 }}><Text size="sm" c="dimmed">{r.description}</Text></td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.permissionCount}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{r.userCount}</td>
                <td>{r.isActive ? <Badge color="teal" variant="light" size="sm">Đang dùng</Badge> : <Badge color="gray" size="sm">Ngừng dùng</Badge>}</td>
                <td>
                  <Group gap={2} wrap="nowrap">
                    {canEdit && <IconAction label={`Sửa vai trò ${r.name}`} icon={<IconPencil size={16} />} onClick={() => setDialog(r)} />}
                    {canDelete && r.isActive && (
                      <IconAction
                        label="Ngừng dùng vai trò"
                        color="red"
                        icon={<IconPlayerPause size={16} />}
                        blockedReason={r.isSystem ? SYSTEM_ROLE : isMine(r) ? OWN_ROLE : null}
                        onClick={() => confirmStop(r)}
                      />
                    )}
                    {canEdit && !r.isActive && (
                      <IconAction
                        label="Dùng lại vai trò"
                        color="teal"
                        icon={<IconPlayerPlay size={16} />}
                        blockedReason={isMine(r) ? 'Bạn đang giữ vai trò này nên không tự bật lại được. Nhờ quản trị viên khác.' : null}
                        loading={resume.isPending && resume.variables?.id === r.id}
                        onClick={() => resume.mutate(r)}
                      />
                    )}
                  </Group>
                </td>
              </tr>
            ))}
            {roles.isSuccess && rows.length === 0 && <EmptyRow colSpan={7}>Chưa có vai trò nào. Bấm “Thêm vai trò” để tạo.</EmptyRow>}
          </tbody>
        </table>
      </div>
      {dialog && <RoleDialog role={dialog === 'create' ? null : dialog} mine={dialog !== 'create' && isMine(dialog)} onClose={() => setDialog(null)} onDone={refresh} />}
    </>
  );
}

function RoleDialog({ role, mine, onClose, onDone }: { role: AdminRole | null; mine: boolean; onClose: () => void; onDone: () => void }) {
  const form = useForm({
    initialValues: { code: role?.code ?? '', name: role?.name ?? '', description: role?.description ?? '', isActive: role?.isActive ?? true },
    validateInputOnBlur: true,
    validate: {
      code: (v) => (role || /^[A-Z][A-Z0-9_]{1,29}$/.test(v) ? null : 'Viết hoa, gồm chữ, số, gạch dưới (2-30 ký tự)'),
      name: (v) => (v.trim() ? null : 'Nhập tên vai trò'),
    },
  });
  const m = useMutation({
    mutationFn: (v: typeof form.values) =>
      role
        ? api(`/admin/roles/${role.id}`, { method: 'PUT', body: { name: v.name, description: v.description, ...(role.isSystem ? {} : { isActive: v.isActive }) } })
        : api('/admin/roles', { method: 'POST', body: { code: v.code, name: v.name, description: v.description || undefined } }),
    onSuccess: (_x, v) => {
      if (!role) toastOk(`Đã thêm vai trò ${v.name}. Hãy vào Phân quyền để cấp quyền cho vai trò này.`);
      else if (role.isActive && !v.isActive) toastOk(`Đã ngừng dùng vai trò ${v.name}.`, 'Đã ngừng dùng');
      else if (!role.isActive && v.isActive) toastOk(`Đã dùng lại vai trò ${v.name}.`);
      else toastOk(`Đã lưu vai trò ${v.name}.`);
      onDone();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  function submit(v: typeof form.values) {
    if (!(role && role.isActive && !v.isActive)) return m.mutate(v);
    confirmAction({ title: `Ngừng dùng vai trò ${role.name}?`, consequence: stopConsequence(role), confirmLabel: 'Ngừng dùng vai trò', onConfirm: () => m.mutate(v) });
  }
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  const code = form.getInputProps('code');
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title={role ? `Sửa vai trò ${role.code}` : 'Thêm vai trò'}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput
            label="Mã vai trò"
            withAsterisk={!role}
            description={role ? 'Mã không đổi được sau khi tạo.' : 'Ví dụ: WAREHOUSE'}
            readOnly={!!role}
            className={role ? 'field-readonly' : undefined}
            data-autofocus={!role || undefined}
            {...code}
            onChange={upper((v) => form.setFieldValue('code', v))}
          />
          <TextInput label="Tên hiển thị" withAsterisk data-autofocus={role ? true : undefined} {...form.getInputProps('name')} />
          <Textarea label="Mô tả" autosize minRows={2} {...form.getInputProps('description')} />
          {role && !role.isSystem && (
            <Switch
              label="Đang dùng"
              description={mine ? 'Bạn đang giữ vai trò này nên không tự ngừng dùng được.' : role.isActive ? 'Tắt để ngừng dùng: người đang giữ vai trò mất các quyền của nó.' : undefined}
              disabled={mine}
              {...form.getInputProps('isActive', { type: 'checkbox' })}
            />
          )}
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={m.isPending}>{role ? 'Lưu thay đổi' : 'Thêm vai trò'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
