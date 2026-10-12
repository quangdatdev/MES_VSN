import { Alert, Button, Checkbox, Group, Modal, SimpleGrid, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { api } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { escapeToClose } from './common';
import type { AdminBranch, AdminUser } from './types';

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
const toggle = (list: number[], id: number, on: boolean) => (on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id));

interface Props {
  user: AdminUser;
  branches: AdminBranch[];
  onClose: () => void;
  onDone: () => Promise<unknown>;
}

/** Nhà máy SX đang dùng của một ĐVCS, để người gán biết đăng nhập đơn vị đó thì lập kế hoạch cho nhà máy nào */
function factoryHint(b: AdminBranch) {
  if (b.isAggregate) return 'Xem tổng hợp mọi đơn vị, chỉ đọc';
  const names = b.factories.filter((f) => f.isActive).map((f) => f.name);
  return names.length ? `Nhà máy SX: ${names.join(', ')}` : 'Chưa có nhà máy SX';
}

/**
 * Đơn vị cơ sở của một người (ADR 0013): chọn được khi đăng nhập. Lập kế hoạch xuất hàng theo nhà máy SX thuộc ĐVCS đang
 * đăng nhập (danh mục Nhà máy SX), không tích nhà máy theo người (ADR 0013 mục 11).
 */
export function UserBranchesDialog({ user, branches, onClose, onDone }: Props) {
  const [branchIds, setBranchIds] = useState<number[]>(user.branchIds);
  const [saving, { open, close }] = useDisclosure(false);
  const dirty = !sameSet(branchIds, user.branchIds);

  const activeBranches = branches.filter((b) => b.isActive || branchIds.includes(b.id));
  const stopped = branches.filter((b) => !b.isActive && branchIds.includes(b.id)).map((b) => `${b.code} – ${b.name}`);

  async function save() {
    open();
    try {
      await api(`/admin/users/${user.id}/branches`, { method: 'PUT', body: { branchIds, defaultBranchId: user.defaultBranchId ?? undefined } });
      toastOk(`Đã cập nhật đơn vị cơ sở của ${user.username}.`);
      await onDone();
      onClose();
    } catch (e) {
      toastError(e, 'Chưa lưu được');
    } finally {
      close();
    }
  }

  useLeaveGuard(dirty);
  const requestClose = () => confirmDiscard(dirty, onClose);
  return (
    <Modal opened onClose={requestClose} {...escapeToClose(requestClose)} title={`Đơn vị cơ sở của ${user.username}`} size="lg">
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Người dùng chọn một trong các đơn vị này khi đăng nhập. Khi lập kế hoạch xuất hàng, họ chọn được đơn hàng của các nhà máy SX thuộc đơn vị đang đăng
          nhập. Nhà máy SX gắn đơn vị ở Quản trị › Danh mục hệ thống › Nhà máy SX.
        </Text>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" verticalSpacing={8}>
          {activeBranches.map((b) => (
            <Checkbox
              key={b.id}
              label={`${b.code} – ${b.name}${b.isActive ? '' : ' (ngừng dùng)'}`}
              description={factoryHint(b)}
              checked={branchIds.includes(b.id)}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                setBranchIds((p) => toggle(p, b.id, on));
              }}
            />
          ))}
        </SimpleGrid>

        {stopped.length > 0 && (
          <Alert color="orange" variant="light" py={8}>
            Đang tích đơn vị đã ngừng dùng: {stopped.join(', ')}. Bỏ chọn để gỡ; không lưu lại được đơn vị đã ngừng dùng.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={requestClose}>Hủy</Button>
          <ActionButton onClick={save} loading={saving} blockedReason={stopped.length ? 'Bỏ chọn đơn vị đã ngừng dùng trước khi lưu.' : !dirty ? 'Chưa có thay đổi nào.' : null}>
            Lưu thay đổi
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  );
}
