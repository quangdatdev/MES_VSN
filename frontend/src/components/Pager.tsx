import { Group, Pagination, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { fmtNum } from '../lib/format';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  extra?: ReactNode;
}

const CONTROL_LABEL: Record<string, string> = { first: 'Trang đầu', previous: 'Trang trước', next: 'Trang sau', last: 'Trang cuối' };

/** Chân bảng: "Hiển thị 1-20 trong 36" và phân trang. */
export function Pager({ page, pageSize, total, onPage, extra }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const to = Math.min(total, page * pageSize);
  // Trang trên URL có thể vượt trang cuối (link cũ, vừa xóa dòng cuối): không hiện "151-120"
  const from = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, to);
  return (
    <Group justify="space-between" px="sm" py={6} style={{ borderTop: '1px solid var(--app-line)', background: 'var(--app-section)' }}>
      <Group gap="md">
        <Text size="sm">
          Hiển thị <b>{fmtNum(from)}-{fmtNum(to)}</b> trong <b>{fmtNum(total)}</b> dòng
        </Text>
        {extra}
      </Group>
      {pages > 1 && (
        <nav aria-label="Phân trang">
          <Pagination
            size="sm"
            total={pages}
            value={page}
            onChange={onPage}
            getControlProps={(c) => ({ 'aria-label': CONTROL_LABEL[c] })}
            getItemProps={(p) => ({ 'aria-label': `Trang ${p}` })}
          />
        </nav>
      )}
    </Group>
  );
}
