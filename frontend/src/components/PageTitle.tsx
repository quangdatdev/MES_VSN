import { Group, Title, Tooltip, VisuallyHidden } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';

/**
 * Tiêu đề màn hình. Chú thích (màn này dùng để làm gì) không chiếm một dòng riêng: rê chuột, chạm vào tiêu đề hoặc Tab tới
 * nút ⓘ thì hiện. Trình đọc màn hình vẫn đọc chú thích ngay sau tiêu đề. Chú thích chỉ là chữ: không đặt link, nút vào đây.
 */
export function PageTitle({ title, description }: { title: string; description?: ReactNode }) {
  if (!description) return <Title order={1}>{title}</Title>;
  return (
    <Tooltip
      label={description}
      multiline
      w={380}
      position="bottom-start"
      withArrow
      openDelay={150}
      events={{ hover: true, focus: true, touch: true }}
      styles={{ tooltip: { maxWidth: 'calc(100vw - 32px)', lineHeight: 1.45 } }}
    >
      <Group gap={6} wrap="nowrap" className="page-title">
        <Title order={1}>{title}</Title>
        <button type="button" className="page-title-btn focus-ring" aria-label="Màn này dùng để làm gì">
          <IconInfoCircle size={17} stroke={1.8} className="page-title-info" aria-hidden />
        </button>
        <VisuallyHidden>{description}</VisuallyHidden>
      </Group>
    </Tooltip>
  );
}
