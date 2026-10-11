import { Alert, Group } from '@mantine/core';
import { IconEye } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useSession } from '../store/session';
import { PageTitle } from './PageTitle';

interface Props {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
  /** Màn quản trị vẫn sửa được ở đơn vị tổng hợp A00: tắt dòng nhắc "chỉ đọc" */
  aggregateNote?: boolean;
  children: ReactNode;
}

/**
 * Trang làm việc của màn nghiệp vụ: tiêu đề và thao tác, dải lọc, phần thân kéo kín đến chân trang
 * (mô tả giao diện của BA: lưới full đến chân trang, có cuộn dọc và ngang).
 */
export function WorkPage({ title, subtitle, actions, filters, aggregateNote = true, children }: Props) {
  const aggregate = useSession((s) => s.branch?.isAggregate);
  return (
    <div className="work-page">
      <header className="work-head">
        <div style={{ minWidth: 0 }}>
          <PageTitle title={title} description={subtitle} />
        </div>
        {actions && <Group gap="xs" wrap="wrap">{actions}</Group>}
      </header>
      {aggregate && aggregateNote && (
        <Alert variant="light" color="orange" icon={<IconEye size={16} />} py={6} className="work-note">
          Đang xem tổng hợp mọi nhà máy, chỉ đọc. Muốn thêm hoặc sửa, đổi sang một nhà máy cụ thể ở thanh trên cùng.
        </Alert>
      )}
      {filters && <div className="work-filters">{filters}</div>}
      <div className="work-body">{children}</div>
    </div>
  );
}
