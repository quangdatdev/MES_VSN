import { Button, Stack } from '@mantine/core';
import { IconFilterOff } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/** Câu báo lưới rỗng: đang lọc thì nói không có gì khớp, kèm nút Xóa lọc; chưa lọc thì câu hướng dẫn. */
export function EmptyState({ filtered, what, hint, onClear }: { filtered: boolean; what: string; hint: ReactNode; onClear: () => void }) {
  if (!filtered) return <>{hint}</>;
  return (
    <Stack align="center" gap={8}>
      <span>Không có {what} nào khớp bộ lọc.</span>
      <Button size="xs" variant="default" leftSection={<IconFilterOff size={14} />} onClick={onClear}>
        Xóa lọc
      </Button>
    </Stack>
  );
}
