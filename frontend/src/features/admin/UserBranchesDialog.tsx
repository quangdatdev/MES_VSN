import { Alert, Button, Checkbox, Group, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { api } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { escapeToClose, LoadError } from './common';
import type { AdminBranch, AdminFactory, AdminUser } from './types';

const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));
const toggle = (list: number[], id: number, on: boolean) => (on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id));

interface Props {
  user: AdminUser;
  branches: AdminBranch[];
  /** Danh mục Nhà máy SX; null khi chưa tải xong hoặc lỗi (xem factoriesError) */
  factories: AdminFactory[] | null;
  factoriesError: unknown;
  onRetryFactories: () => void;
  onClose: () => void;
  onDone: () => Promise<unknown>;
}

/**
 * Đơn vị cơ sở và nhà máy SX của một người (ADR 0013), lưu cùng một lần. ĐVCS: chọn được khi đăng nhập. Nhà máy SX: khi lập
 * kế hoạch xuất hàng chỉ chọn được đơn hàng của các nhà máy này, ở bất kỳ ĐVCS nào người đó đang làm việc.
 */
export function UserBranchesDialog({ user, branches, factories, factoriesError, onRetryFactories, onClose, onDone }: Props) {
  const [branchIds, setBranchIds] = useState<number[]>(user.branchIds);
  const [factoryIds, setFactoryIds] = useState<number[]>(user.productionFactoryIds);
  const [saving, { open, close }] = useDisclosure(false);
  const dirty = !sameSet(branchIds, user.branchIds) || !sameSet(factoryIds, user.productionFactoryIds);

  const activeBranches = branches.filter((b) => b.isActive || branchIds.includes(b.id));
  // Nhà máy gom theo ĐVCS quản lý (thứ tự như danh sách ĐVCS); nhà máy chưa gắn ĐVCS để cuối
  const groups = useMemo(() => {
    const shown = (factories ?? []).filter((f) => f.isActive || factoryIds.includes(f.id));
    const order = branches.filter((b) => !b.isAggregate).map((b) => b.code);
    const codes = [...new Set(shown.map((f) => f.branchCode))].sort((a, b) => (a === null ? 1 : b === null ? -1 : order.indexOf(a) - order.indexOf(b)));
    return codes.map((code) => ({
      code,
      label: code === null ? 'Chưa gắn đơn vị cơ sở' : `${branches.find((b) => b.code === code)?.name ?? code} (${code})`,
      items: shown.filter((f) => f.branchCode === code),
    }));
  }, [factories, branches, factoryIds]);

  const stopped = [
    ...branches.filter((b) => !b.isActive && branchIds.includes(b.id)).map((b) => `${b.code} – ${b.name}`),
    ...(factories ?? []).filter((f) => !f.isActive && factoryIds.includes(f.id)).map((f) => f.name),
  ];

  async function save() {
    open();
    try {
      await api(`/admin/users/${user.id}/branches`, {
        method: 'PUT',
        // Danh mục nhà máy chưa tải được thì không gửi: máy chủ giữ nguyên nhà máy đang tích
        body: { branchIds, defaultBranchId: user.defaultBranchId ?? undefined, ...(factories ? { productionFactoryIds: factoryIds } : {}) },
      });
      toastOk(`Đã cập nhật đơn vị cơ sở và nhà máy SX của ${user.username}.`);
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
    <Modal opened onClose={requestClose} {...escapeToClose(requestClose)} title={`Đơn vị cơ sở và nhà máy SX của ${user.username}`} size="lg">
      <Stack gap="md">
        <Stack gap={6}>
          <Title order={3} fz={15}>Đơn vị cơ sở</Title>
          <Text size="sm" c="dimmed">Người dùng chọn một trong các đơn vị này khi đăng nhập. A00 là chế độ xem tổng hợp, chỉ đọc.</Text>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" verticalSpacing={6}>
            {activeBranches.map((b) => (
              <Checkbox
                key={b.id}
                label={`${b.code} – ${b.name}${b.isActive ? '' : ' (ngừng dùng)'}`}
                description={b.isAggregate ? 'Xem tổng hợp mọi đơn vị, chỉ đọc' : undefined}
                checked={branchIds.includes(b.id)}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setBranchIds((p) => toggle(p, b.id, on));
                }}
              />
            ))}
          </SimpleGrid>
        </Stack>

        <Stack gap={6}>
          <Title order={3} fz={15}>Nhà máy SX</Title>
          <Text size="sm" c="dimmed">Khi lập kế hoạch xuất hàng, người dùng chỉ chọn được đơn hàng có Nhà máy SX nằm trong các nhà máy được tích, dù đang làm việc ở đơn vị nào.</Text>
          {factoriesError ? (
            <LoadError mb={0} error={factoriesError} what="danh mục Nhà máy SX" onRetry={onRetryFactories} retrying={false} />
          ) : factories === null ? (
            <Text size="sm" c="dimmed">Đang tải danh mục Nhà máy SX…</Text>
          ) : groups.length === 0 ? (
            <Text size="sm" c="dimmed">Chưa có nhà máy SX nào. Thêm ở Quản trị › Danh mục hệ thống › Nhà máy SX.</Text>
          ) : (
            groups.map((g) => (
              <div key={g.code ?? '-'}>
                <Text size="xs" fw={600} c="dimmed" mb={4}>{g.label}</Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="xs" verticalSpacing={6}>
                  {g.items.map((f) => (
                    <Checkbox
                      key={f.id}
                      label={`${f.name}${f.isActive ? '' : ' (ngừng dùng)'}`}
                      description={f.code}
                      checked={factoryIds.includes(f.id)}
                      onChange={(e) => {
                        const on = e.currentTarget.checked;
                        setFactoryIds((p) => toggle(p, f.id, on));
                      }}
                    />
                  ))}
                </SimpleGrid>
              </div>
            ))
          )}
        </Stack>

        {stopped.length > 0 && (
          <Alert color="orange" variant="light" py={8}>
            Đang tích mục đã ngừng dùng: {stopped.join(', ')}. Bỏ chọn để gỡ; không lưu lại được mục đã ngừng dùng.
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={requestClose}>Hủy</Button>
          <ActionButton onClick={save} loading={saving} blockedReason={stopped.length ? 'Bỏ chọn mục đã ngừng dùng trước khi lưu.' : !dirty ? 'Chưa có thay đổi nào.' : null}>
            Lưu thay đổi
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  );
}
