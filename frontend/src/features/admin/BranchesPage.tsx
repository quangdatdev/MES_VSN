import { Badge, Button, Group, Modal, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconPencil, IconPlus, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { Can } from '../../shell/Can';
import { useCan } from '../../shell/permissions';
import { loadAccess } from '../../store/auth';
import { useSession } from '../../store/session';
import { EmptyRow, escapeToClose, IconAction, LoadError, SkeletonRows, upper } from './common';
import type { AdminBranch } from './types';

/** Trạng thái không đổi được ở dòng này: vẫn nói vì sao (rê chuột, chạm hoặc Tab tới). */
function StatusBadge({ active, reason }: { active: boolean; reason: string | null }) {
  const badge = (
    <Badge size="sm" color={active ? 'teal' : 'gray'} variant="light" tabIndex={reason ? 0 : undefined} className={reason ? 'focus-ring' : undefined} style={reason ? { cursor: 'help' } : undefined}>
      {active ? 'Đang dùng' : 'Ngừng dùng'}
    </Badge>
  );
  return reason ? <Tooltip label={reason} multiline maw={300} events={{ hover: true, focus: true, touch: true }}>{badge}</Tooltip> : badge;
}

export default function BranchesPage() {
  const qc = useQueryClient();
  const canEdit = useCan('admin.branch:update');
  const current = useSession((s) => s.branch);
  const [editing, setEditing] = useState<{ id: number; name: string; error?: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const branches = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => api<AdminBranch[]>('/admin/branches') });
  // Tên nhà máy là tên dự phòng của cột Chi nhánh ở các màn (khi danh mục chi nhánh BRAVO chưa có tên)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'branches'] }), qc.invalidateQueries({ queryKey: ['me', 'branch-names'] })]);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object; done: string }) => api(`/admin/branches/${id}`, { method: 'PUT', body }),
    onSuccess: (_x, v) => {
      toastOk(v.done);
      setEditing(null);
      void refresh();
      // Tên nhà máy đang chọn ở thanh trên cùng cập nhật theo; lỗi ở đây không làm hỏng thao tác vừa lưu.
      void loadAccess().catch(() => undefined);
    },
    onError: (e) => toastError(e),
  });

  function rename(b: AdminBranch) {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return setEditing({ ...editing, error: 'Nhập tên nhà máy' });
    update.mutate({ id: b.id, body: { name }, done: `Đã đổi tên nhà máy ${b.code} thành ${name}.` });
  }

  function toggleActive(b: AdminBranch, on: boolean) {
    if (on) return update.mutate({ id: b.id, body: { isActive: true }, done: `Đã dùng lại nhà máy ${b.code} – ${b.name}.` });
    confirmAction({
      title: `Ngừng dùng nhà máy ${b.code} – ${b.name}?`,
      consequence: 'Người đang làm việc ở nhà máy này bị đưa về màn đăng nhập và không chọn lại được cho tới khi dùng lại. Dữ liệu của nhà máy vẫn giữ nguyên.',
      confirmLabel: 'Ngừng dùng',
      onConfirm: () => update.mutate({ id: b.id, body: { isActive: false }, done: `Đã ngừng dùng nhà máy ${b.code} – ${b.name}.` }),
    });
  }

  const rows = branches.data ?? [];
  return (
    <>
      <PageHeader
        title="Nhà máy"
        subtitle="Tên nhà máy sửa được bất cứ lúc nào. Mã nhà máy gắn với dữ liệu nên không sửa được."
        actions={<Can permission="admin.branch:create"><Button leftSection={<IconPlus size={15} />} onClick={() => setCreating(true)}>Thêm nhà máy</Button></Can>}
      />
      {branches.isError && <LoadError error={branches.error} what="danh sách nhà máy" onRetry={() => void branches.refetch()} retrying={branches.isFetching} />}
      <div className="table-frame">
        <table className="dense-table">
          <thead><tr><th style={{ width: 90 }}>Mã</th><th>Tên hiển thị</th><th>Loại</th><th>Trạng thái</th><th style={{ width: 90 }}>Thao tác</th></tr></thead>
          <tbody>
            {branches.isPending && <SkeletonRows cols={5} rows={3} />}
            {rows.map((b) => {
              const isEditing = editing?.id === b.id;
              const lockReason = b.isAggregate
                ? 'Đơn vị tổng hợp luôn dùng, không ngừng dùng được.'
                : current?.code === b.code
                  ? 'Bạn đang làm việc ở nhà máy này nên không ngừng dùng được. Đổi sang nhà máy khác trước.'
                  : null;
              return (
                <tr key={b.id} data-inactive={!b.isActive || undefined}>
                  <td className="mono" style={{ fontWeight: 600 }}>{b.code}</td>
                  <td style={{ minWidth: 180 }}>
                    {isEditing ? (
                      <Group gap={4} wrap="nowrap" align="flex-start">
                        <TextInput
                          size="xs"
                          value={editing.name}
                          autoFocus
                          aria-label={`Tên mới của ${b.code}`}
                          error={editing.error}
                          onChange={(e) => setEditing({ id: b.id, name: e.currentTarget.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') rename(b);
                            if (e.key === 'Escape') setEditing(null);
                          }}
                          style={{ flex: 1 }}
                        />
                        <IconAction label="Lưu tên" color="teal" variant="light" loading={update.isPending} icon={<IconCheck size={16} />} onClick={() => rename(b)} />
                        <IconAction label="Hủy đổi tên" icon={<IconX size={16} />} onClick={() => setEditing(null)} />
                      </Group>
                    ) : (
                      <Group gap={6}>
                        <span>{b.name}</span>
                        {current?.code === b.code && <Badge size="xs" variant="light" color="link">Đang chọn</Badge>}
                      </Group>
                    )}
                  </td>
                  <td>{b.isAggregate ? <Badge size="sm" color="orange" variant="light">Tổng hợp, chỉ đọc</Badge> : <Text size="sm">Nhà máy</Text>}</td>
                  <td>
                    {canEdit && !lockReason ? (
                      <Switch
                        size="xs"
                        checked={b.isActive}
                        disabled={update.isPending}
                        aria-label={`Đang dùng: ${b.code}`}
                        label={b.isActive ? 'Đang dùng' : 'Ngừng dùng'}
                        onChange={(e) => toggleActive(b, e.currentTarget.checked)}
                      />
                    ) : (
                      <StatusBadge active={b.isActive} reason={canEdit ? lockReason : null} />
                    )}
                  </td>
                  <td>
                    {canEdit && !isEditing && <IconAction label={`Đổi tên ${b.code}`} icon={<IconPencil size={16} />} onClick={() => setEditing({ id: b.id, name: b.name })} />}
                  </td>
                </tr>
              );
            })}
            {branches.isSuccess && rows.length === 0 && <EmptyRow colSpan={5}>Chưa có nhà máy nào. Bấm “Thêm nhà máy” để tạo.</EmptyRow>}
          </tbody>
        </table>
      </div>
      {creating && <CreateBranch onClose={() => setCreating(false)} onDone={refresh} />}
    </>
  );
}

function CreateBranch({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const form = useForm({
    initialValues: { code: '', name: '' },
    validateInputOnBlur: true,
    validate: { code: (v) => (/^A\d{2}$/.test(v) && v !== 'A00' ? null : 'Dạng A04, A05... (A00 dành cho tổng hợp)'), name: (v) => (v.trim() ? null : 'Nhập tên nhà máy') },
  });
  const m = useMutation({
    mutationFn: (v: typeof form.values) => api('/admin/branches', { method: 'POST', body: { code: v.code, name: v.name.trim() } }),
    onSuccess: (_x, v) => {
      toastOk(`Đã thêm nhà máy ${v.code} – ${v.name.trim()}. Vào Người dùng để cho phép người dùng chọn nhà máy này.`);
      onDone();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title="Thêm nhà máy">
      <form onSubmit={form.onSubmit((v) => m.mutate(v))}>
        <Stack gap="sm">
          <TextInput
            label="Mã nhà máy"
            withAsterisk
            description="Mã không đổi được sau khi tạo."
            placeholder="A04"
            data-autofocus
            {...form.getInputProps('code')}
            onChange={upper((v) => form.setFieldValue('code', v))}
          />
          <TextInput label="Tên hiển thị" withAsterisk {...form.getInputProps('name')} />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={m.isPending}>Thêm nhà máy</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
