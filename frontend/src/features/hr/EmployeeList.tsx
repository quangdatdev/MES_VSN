import { Badge, Button, Pagination, SegmentedControl, Select, Skeleton, Stack, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { memo, useCallback, useRef } from 'react';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { fmtNum } from '../../lib/format';
import { useClampPage } from '../../lib/useUrlParams';
import { useCan } from '../../shell/permissions';
import { EMPLOYEE_PAGE_SIZE, useEmployees, type EmployeeQuery } from './api';
import { LoadError } from './common';
import type { EmployeeCard, JobTitleOption } from './types';

/** Chữ cái đầu của tên gọi (tiếng Việt: từ cuối của họ tên) làm ảnh đại diện */
export const initialOf = (name: string) => (name.trim().split(/\s+/).pop()?.[0] ?? '?').toUpperCase();

interface Props {
  filter: EmployeeQuery;
  /** Đã biết phạm vi (phòng ban trên URL đã đổi ra Id): chưa biết thì chưa tải */
  ready: boolean;
  onFilter: (patch: Partial<EmployeeQuery>) => void;
  /** Tên phạm vi đang lọc ("Tất cả phòng ban" hoặc tên phòng ban) */
  scopeName: string;
  titles: JobTitleOption[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Có bộ lọc nào ngoài phòng ban không (để nút Xóa lọc) */
  onClear: () => void;
}

/**
 * Danh sách nhân viên dạng thẻ bên dưới cây phòng ban: tìm (mã, mã chấm công, tên, email, chức danh; không dấu), lọc chức danh,
 * tình trạng; mới tạo lên trước, 20 thẻ mỗi trang. Lọc, tìm chạy trên máy chủ (quyết định 10.6).
 */
export function EmployeeList({ filter, ready, onFilter, scopeName, titles, selectedId, onSelect, onClear }: Props) {
  const canCreate = useCan('hr.employee:create');
  // Trang truyền hàm mới mỗi lần vẽ: thẻ nhận hàm ổn định để memo của thẻ có tác dụng (quy-tac J.5)
  const latest = useRef(onSelect);
  latest.current = onSelect;
  const select = useCallback((id: number) => latest.current(id), []);
  const list = useEmployees(filter, ready);
  const data = list.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / EMPLOYEE_PAGE_SIZE)) : 1;
  // Link cũ có trang vượt trang cuối: về trang cuối, không báo nhầm là chưa có nhân viên
  useClampPage(data, filter.page, EMPLOYEE_PAGE_SIZE, (page) => onFilter({ page }));
  const filtered = !!filter.q.trim() || filter.jobTitleId != null || filter.status != null;
  return (
    <div className="hr-list">
      <div className="hr-side-head">
        <Text fw={700} size="sm" component="h2" className="hr-list-title" title={scopeName}>
          Nhân viên, {scopeName}
        </Text>
        {data && <Text size="xs" c="dimmed" className="num">{fmtNum(data.total)} người</Text>}
      </div>
      <div className="hr-side-tools">
        <DebouncedTextInput
          size="xs"
          placeholder="Tìm mã, tên, email, chức danh"
          aria-label="Tìm nhân viên"
          leftSection={<IconSearch size={14} />}
          value={filter.q}
          onChange={(q) => onFilter({ q, page: 1 })}
        />
        <Select
          size="xs"
          placeholder="Mọi chức danh"
          aria-label="Lọc theo chức danh"
          clearable
          searchable
          data={titles.map((t) => ({ value: String(t.id), label: t.name }))}
          value={filter.jobTitleId == null ? null : String(filter.jobTitleId)}
          onChange={(v) => onFilter({ jobTitleId: v ? Number(v) : null, page: 1 })}
          nothingFoundMessage="Không có chức danh khớp."
        />
        <SegmentedControl
          size="xs"
          fullWidth
          aria-label="Lọc theo tình trạng"
          value={filter.status == null ? 'all' : String(filter.status)}
          onChange={(v) => onFilter({ status: v === 'all' ? null : Number(v), page: 1 })}
          data={[
            { value: 'all', label: 'Tất cả' },
            { value: '1', label: 'Đang làm việc' },
            { value: '2', label: 'Nghỉ việc' },
          ]}
        />
      </div>
      <div className="hr-side-scroll" data-refreshing={(list.isPlaceholderData && list.isFetching) || undefined}>
        {list.isError && <LoadError error={list.error} what="danh sách nhân viên" onRetry={() => list.refetch()} retrying={list.isFetching} />}
        {list.isPending ? (
          <Stack gap={6} p={6} aria-busy>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} h={54} radius="md" />
            ))}
          </Stack>
        ) : data && data.items.length === 0 ? (
          <Stack gap={6} p="sm" align="flex-start">
            <Text size="sm">{filtered ? 'Không có nhân viên khớp bộ lọc.' : 'Chưa có nhân viên nào trong phạm vi này.'}</Text>
            {!filtered && canCreate && (
              <Text size="sm" c="dimmed">
                Bấm Thêm nhân viên hoặc Nhập từ Excel ở đầu trang để thêm.
              </Text>
            )}
            {filtered && <Button size="xs" variant="default" onClick={onClear}>Xóa lọc</Button>}
          </Stack>
        ) : (
          <ul className="hr-cards" aria-label="Danh sách nhân viên">
            {data?.items.map((e) => <Card key={e.id} e={e} selected={e.id === selectedId} onSelect={select} />)}
          </ul>
        )}
      </div>
      {pages > 1 && (
        <nav className="hr-list-pager" aria-label="Phân trang danh sách nhân viên">
          <Pagination
            size="sm"
            total={pages}
            value={Math.min(filter.page, pages)}
            onChange={(page) => onFilter({ page })}
            siblings={0}
            boundaries={1}
            getControlProps={(c) => ({ 'aria-label': { first: 'Trang đầu', previous: 'Trang trước', next: 'Trang sau', last: 'Trang cuối' }[c] })}
            getItemProps={(p) => ({ 'aria-label': `Trang ${p}` })}
          />
        </nav>
      )}
    </div>
  );
}

const Card = memo(function Card({ e, selected, onSelect }: { e: EmployeeCard; selected: boolean; onSelect: (id: number) => void }) {
  const left = e.employmentStatus === 2;
  return (
    <li>
      <button type="button" className="hr-card focus-ring" aria-current={selected || undefined} data-left={left || undefined} onClick={() => onSelect(e.id)}>
        <span className="hr-avatar" aria-hidden>{initialOf(e.fullName)}</span>
        <span className="hr-card-body">
          <span className="hr-card-name">{e.fullName}</span>
          <span className="hr-card-meta">
            {e.jobTitleName}, {e.departmentName}
          </span>
        </span>
        <span className="hr-card-side">
          <span className="mono hr-card-code">{e.code}</span>
          {left && (
            <Badge size="xs" variant="light" color="gray">
              Nghỉ việc
            </Badge>
          )}
        </span>
      </button>
    </li>
  );
});
