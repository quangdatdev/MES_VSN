import { Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import type { FieldPolicy } from '../lib/fieldPolicy';

/**
 * Báo cho người xem biết lưới đang bị phân quyền theo cột, thay vì để họ tưởng thiếu dữ liệu.
 * `names`: tên hiển thị của các cột trên màn này (cột không có tên ở đây thì không nhắc).
 */
export function PolicyHint({ policy, names }: { policy: FieldPolicy; names: Record<string, string> }) {
  const pick = (list: string[]) => list.filter((f) => names[f]).map((f) => names[f]);
  const hidden = pick(policy.hidden);
  const masked = pick(policy.masked);
  const readonly = pick(policy.readonly);
  if (!hidden.length && !masked.length && !readonly.length) return null;
  const parts = [hidden.length && `${hidden.length} cột ẩn`, masked.length && `${masked.length} cột che`, readonly.length && `${readonly.length} cột chỉ đọc`].filter(Boolean);

  return (
    <Popover width={300} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <UnstyledButton className="policy-chip focus-ring" aria-label={`${parts.join(', ')}, xem cột bị giới hạn theo phân quyền`}>
          <IconLock size={13} stroke={2} />
          {parts.join(', ')}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="sm" fw={700}>Cột bị giới hạn theo phân quyền của bạn</Text>
          {hidden.length > 0 && <Text size="sm"><b>Ẩn:</b> {hidden.join(', ')}</Text>}
          {masked.length > 0 && <Text size="sm"><b>Che (***):</b> {masked.join(', ')}</Text>}
          {readonly.length > 0 && <Text size="sm"><b>Chỉ đọc:</b> {readonly.join(', ')}</Text>}
          <Text size="xs" c="dimmed">Cần xem hoặc sửa thêm, hãy nhờ quản trị viên cấp ở Quản trị, mục Chính sách cột.</Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
