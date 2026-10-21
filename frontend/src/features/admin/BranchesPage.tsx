import { Badge, Button, Group, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconPencil, IconRefresh, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { api } from '../../lib/api';
import { confirmAction } from '../../lib/confirm';
import { toastError, toastOk } from '../../lib/notify';
import { Can } from '../../shell/Can';
import { useCan } from '../../shell/permissions';
import { loadAccess } from '../../store/auth';
import { useSession } from '../../store/session';
import { EmptyRow, IconAction, LoadError, SkeletonRows } from './common';
import type { AdminBranch, BranchImportResult } from './types';

/** Trạng thái không đổi được ở dòng này: vẫn nói vì sao (rê chuột, chạm hoặc Tab tới). */
function StatusBadge({ active, reason }: { active: boolean; reason: string | null }) {
  const badge = (
    <Badge size="sm" color={active ? 'teal' : 'gray'} variant="light" tabIndex={reason ? 0 : undefined} className={reason ? 'focus-ring' : undefined} style={reason ? { cursor: 'help' } : undefined}>
      {active ? 'Đang dùng' : 'Ngừng dùng'}
    </Badge>
  );
  return reason ? <Tooltip label={reason} multiline maw={300} events={{ hover: true, focus: true, touch: true }}>{badge}</Tooltip> : badge;
}

/** Nguồn của ĐVCS: BRAVO, riêng của MES (đơn vị tổng hợp), hoặc không còn trong BRAVO */
function SourceBadge({ b }: { b: AdminBranch }) {
  if (b.isAggregate) return <Badge size="sm" color="orange" variant="light">Tổng hợp, chỉ đọc</Badge>;
  if (b.inBravo === true) return <Text size="sm">BRAVO</Text>;
  if (b.inBravo === false) {
    return (
      <Tooltip label="Mã này không có trong danh mục chi nhánh BRAVO. Không dùng nữa thì tắt ở cột Trạng thái." multiline maw={280} events={{ hover: true, focus: true, touch: true }}>
        <Badge size="sm" color="yellow" variant="light" tabIndex={0} className="focus-ring" style={{ cursor: 'help' }}>Không có trong BRAVO</Badge>
      </Tooltip>
    );
  }
  return <Text size="sm" c="dimmed">MES</Text>;
}

/**
 * Quản trị › Đơn vị cơ sở (quyết định 6.1): danh sách theo danh mục chi nhánh BRAVO, tự cập nhật sau mỗi lần đồng bộ danh mục
 * chi nhánh. Mã, tên của ĐVCS có trong BRAVO sửa ở BRAVO; ở đây bật, tắt (ai chọn được khi đăng nhập) và xem nhà máy SX.
 */
export default function BranchesPage() {
  const qc = useQueryClient();
  const canEdit = useCan('admin.branch:update');
  const current = useSession((s) => s.branch);
  const [editing, setEditing] = useState<{ id: number; name: string; error?: string } | null>(null);
  const branches = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => api<AdminBranch[]>('/admin/branches') });
  // Tên ĐVCS là tên hiện ở cột Chi nhánh, ĐVCS của các màn
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['admin', 'branches'] }), qc.invalidateQueries({ queryKey: ['me', 'branch-names'] })]);

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object; done: string }) => api(`/admin/branches/${id}`, { method: 'PUT', body }),
    onSuccess: (_x, v) => {
      toastOk(v.done);
      setEditing(null);
      void refresh();
      // Tên đơn vị đang chọn ở thanh trên cùng cập nhật theo; lỗi ở đây không làm hỏng thao tác vừa lưu.
      void loadAccess().catch(() => undefined);
    },
    onError: (e) => toastError(e),
  });

  const importBravo = useMutation({
    mutationFn: () => api<BranchImportResult>('/admin/branches/import', { method: 'POST' }),
    onSuccess: (r) => {
      const parts = [r.added.length && `thêm ${r.added.map((b) => b.code).join(', ')}`, r.updated.length && `đổi tên ${r.updated.map((b) => b.code).join(', ')}`].filter(Boolean);
      toastOk(parts.length ? `Đã ${parts.join(', ')} theo BRAVO.` : `Đã khớp với ${r.rows} chi nhánh của BRAVO, không có gì thay đổi.`, 'Đã cập nhật từ BRAVO');
      void refresh();
      void loadAccess().catch(() => undefined);
    },
    onError: (e) => toastError(e, 'Chưa cập nhật được từ BRAVO'),
  });

  function rename(b: AdminBranch) {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return setEditing({ ...editing, error: 'Nhập tên đơn vị' });
    update.mutate({ id: b.id, body: { name }, done: `Đã đổi tên ${b.code} thành ${name}.` });
  }

  function toggleActive(b: AdminBranch, on: boolean) {
    if (on) return update.mutate({ id: b.id, body: { isActive: true }, done: `Đã dùng lại ${b.code} – ${b.name}.` });
    confirmAction({
      title: `Ngừng dùng ${b.code} – ${b.name}?`,
      consequence: 'Người đang làm việc ở đơn vị này bị đưa về màn đăng nhập và không chọn lại được cho tới khi dùng lại. Dữ liệu của đơn vị vẫn giữ nguyên.',
      confirmLabel: 'Ngừng dùng',
      onConfirm: () => update.mutate({ id: b.id, body: { isActive: false }, done: `Đã ngừng dùng ${b.code} – ${b.name}.` }),
    });
  }

  const rows = branches.data ?? [];
  return (
    <>
      <PageHeader
        title="Đơn vị cơ sở"
        subtitle="Theo danh mục chi nhánh của BRAVO, tự cập nhật sau mỗi lần đồng bộ. Mã và tên sửa ở BRAVO; ở đây bật, tắt đơn vị được chọn khi đăng nhập. Nhà máy SX của từng đơn vị thêm ở Danh mục hệ thống."
        actions={
          <Can permission="admin.branch:update">
            <Button variant="default" leftSection={<IconRefresh size={15} />} loading={importBravo.isPending} onClick={() => importBravo.mutate()}>
              Cập nhật từ BRAVO
            </Button>
          </Can>
        }
      />
      {branches.isError && <LoadError error={branches.error} what="danh sách đơn vị cơ sở" onRetry={() => void branches.refetch()} retrying={branches.isFetching} />}
      <div className="table-frame">
        <table className="dense-table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>Mã</th>
              <th>Tên</th>
              <th>Tên đầy đủ</th>
              <th>Nhà máy SX</th>
              <th>Nguồn</th>
              <th>Trạng thái</th>
              <th style={{ width: 60 }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {branches.isPending && <SkeletonRows cols={7} rows={3} />}
            {rows.map((b) => {
              const isEditing = editing?.id === b.id;
              // Tên của đơn vị theo BRAVO lần cập nhật sau sẽ ghi đè, nên chỉ sửa được tên đơn vị riêng của MES
              const renamable = canEdit && b.inBravo !== true;
              const lockReason = b.isAggregate
                ? 'Đơn vị tổng hợp luôn dùng, không ngừng dùng được.'
                : current?.code === b.code
                  ? 'Bạn đang làm việc ở đơn vị này nên không ngừng dùng được. Đổi sang đơn vị khác trước.'
                  : null;
              return (
                <tr key={b.id} data-inactive={!b.isActive || undefined}>
                  <td className="mono" style={{ fontWeight: 600 }}>{b.code}</td>
                  <td style={{ minWidth: 160 }}>
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
                  <td style={{ whiteSpace: 'normal', minWidth: 200 }}>
                    <Text size="sm" c={b.description ? undefined : 'dimmed'}>{b.description || '–'}</Text>
                  </td>
                  <td style={{ whiteSpace: 'normal' }}>
                    {b.isAggregate ? (
                      <Text size="sm" c="dimmed">–</Text>
                    ) : b.factories.length ? (
                      <Group gap={4}>
                        {b.factories.map((f) => (
                          <Badge key={f.code} size="sm" variant="light" color={f.isActive ? 'gray' : 'gray.4'} title={`${f.code}${f.isActive ? '' : ' (ngừng dùng)'}`} style={f.isActive ? undefined : { textDecoration: 'line-through' }}>
                            {f.name}
                          </Badge>
                        ))}
                      </Group>
                    ) : (
                      <Text size="sm" c="dimmed">Chưa có</Text>
                    )}
                  </td>
                  <td><SourceBadge b={b} /></td>
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
                  <td>{renamable && !isEditing && <IconAction label={`Đổi tên ${b.code}`} icon={<IconPencil size={16} />} onClick={() => setEditing({ id: b.id, name: b.name })} />}</td>
                </tr>
              );
            })}
            {branches.isSuccess && rows.length === 0 && <EmptyRow colSpan={7}>Chưa có đơn vị cơ sở nào. Đồng bộ danh mục chi nhánh BRAVO rồi bấm “Cập nhật từ BRAVO”.</EmptyRow>}
          </tbody>
        </table>
      </div>
    </>
  );
}
