import { ActionIcon, Button, List, Loader, Popover, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconClock, IconInfoCircle, IconLayoutGrid } from '@tabler/icons-react';
import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { memo, useState } from 'react';
import { api } from '../../lib/api';
import { fmtNum, qs } from '../../lib/format';

/** Số liệu của các dòng đang khớp bộ lọc, đếm theo mã hàng. null: người xem không được xem cột mà số đó suy ra từ */
export interface PrepSummaryData {
  today: string;
  total: number | null;
  ready: number | null;
  atRisk: number | null;
  late: number | null;
}

/** Khóa riêng, không chung tiền tố với lưới: lưu ngày TH chờ lưới tải lại (throwOnError), số liệu lỗi không được làm hỏng luồng đó */
const KEY = ['sewing', 'prep-summary'] as const;
/** Gọi sau khi lưu ngày TH hoặc sửa một dòng */
export const refreshPrepSummary = (qc: QueryClient) => void qc.invalidateQueries({ queryKey: KEY });

interface Props {
  /** Đúng bộ lọc của lưới (kể cả tuần, lọc theo cột), trừ ô Trạng thái: đang lọc một trạng thái thì các số không về 0 (máy chủ cũng bỏ) */
  params: Record<string, string | number | null | undefined>;
  branch: string | undefined;
}

const ITEMS = [
  { key: 'total', label: 'Tổng đơn hàng', tone: 'total', Icon: IconLayoutGrid, note: 'Mã hàng có dàn chuyền', rule: 'Số mã hàng đã có dàn chuyền, khớp bộ lọc (mọi trang). Một mã hàng may trên nhiều chuyền tính là 1.' },
  { key: 'ready', label: 'Đủ điều kiện V/C', tone: 'ready', Icon: IconCircleCheck, note: 'Đến ngày V/C, đủ TH', rule: 'Mã hàng có dòng đã đến ngày vào chuyền và đã nhập ngày TH cho mọi bước.' },
  { key: 'atRisk', label: 'Nguy cơ trễ hạn', tone: 'risk', Icon: IconClock, note: 'Còn ≤ 2 ngày tới KH', rule: 'Mã hàng có bước chưa nhập ngày TH mà ngày KH là hôm nay hoặc trong 2 ngày tới.' },
  { key: 'late', label: 'Trễ hạn', tone: 'late', Icon: IconAlertTriangle, note: 'Chưa đủ đk, bước quá KH', rule: 'Mã hàng có dòng Chưa đủ đk V/C có bước trễ: xong sau ngày KH, hoặc đã qua ngày KH mà chưa có ngày TH.' },
] as const;

/**
 * Dải số liệu trên lưới Kế hoạch chuẩn bị SX (task 5.5.8): 4 thẻ màu thấp theo mẫu người dùng chọn, mỗi thẻ có nhãn và dòng
 * giải thích nên không chỉ nhận ra bằng màu. Tải song song với lưới (máy chủ tự chép dàn chuyền), theo bộ lọc chứ không theo trang.
 */
function PrepSummaryView({ params, branch }: Props) {
  const q = useQuery({
    queryKey: [...KEY, branch, params],
    queryFn: () => api<PrepSummaryData>(`/sewing/prep/summary${qs(params)}`),
    placeholderData: keepPreviousData,
  });
  const [open, setOpen] = useState(false);
  const d = q.data;
  // Số đang hiện là của bộ lọc trước hoặc đang tải lại: có vòng xoay (không làm mờ số, giữ tương phản chữ)
  const loading = q.isPlaceholderData || q.isFetching;
  const hidden = !!d && ITEMS.some((it) => d[it.key] === null);
  return (
    <section className="prep-summary" aria-label="Số liệu theo bộ lọc đang chọn" aria-busy={loading || undefined}>
      <div className="prep-summary-row">
        <dl className="prep-summary-list">
          {ITEMS.map(({ key, label, tone, Icon, note }) => {
            const v = d?.[key];
            return (
              <div key={key} className="prep-summary-item" data-tone={tone}>
                <dt title={label}>
                  <span className="prep-summary-icon" aria-hidden>
                    <Icon size={18} stroke={1.8} />
                  </span>
                  {label}
                </dt>
                <dd className="prep-summary-value">
                  {!d ? q.isError ? '–' : <span className="prep-summary-ph" /> : v === null ? <span title="Ẩn theo phân quyền của bạn">–</span> : fmtNum(v)}
                </dd>
                <dd className="prep-summary-note" title={note}>
                  {note}
                </dd>
              </div>
            );
          })}
        </dl>
        <div className="prep-summary-side">
          {/* Tooltip bọc ngoài Popover.Target: Target phải gắn aria-expanded, aria-controls lên chính nút */}
          <Popover opened={open} onChange={setOpen} width={320} position="bottom-end" withArrow shadow="md">
            <Tooltip label="Cách đếm các số liệu" withArrow disabled={open}>
              <Popover.Target>
                <ActionIcon variant="subtle" color="gray" size="md" aria-label="Cách đếm các số liệu" onClick={() => setOpen((o) => !o)}>
                  <IconInfoCircle size={18} />
                </ActionIcon>
              </Popover.Target>
            </Tooltip>
            <Popover.Dropdown>
              <Text size="sm" fw={600} mb={4}>
                Cách đếm (theo bộ lọc đang chọn, đếm theo mã hàng)
              </Text>
              <List size="sm" spacing={4}>
                {ITEMS.map((it) => (
                  <List.Item key={it.key}>
                    <b>{it.label}:</b> {it.rule}
                  </List.Item>
                ))}
              </List>
              <Text size="xs" c="dimmed" mt={6}>
                Một mã hàng có thể thuộc nhiều ô nên các ô không cộng lại bằng Tổng.
                {hidden && ' Ô "–" là số bạn không được xem theo phân quyền (ẩn hoặc che cột Mã hàng, Trạng thái hay các bước).'}
              </Text>
            </Popover.Dropdown>
          </Popover>
          {loading && d && <Loader size="xs" color="gray" aria-label="Đang tải số liệu" />}
        </div>
      </div>
      {q.isError && !q.isFetching && (
        // Chưa có số, hoặc lần tải lại sau khi lưu bị lỗi (số đang hiện là số cũ)
        <Button variant="subtle" color="red" size="compact-sm" className="prep-summary-retry" onClick={() => void q.refetch()}>
          {d ? 'Số liệu chưa cập nhật, thử lại' : 'Chưa tải được số liệu, thử lại'}
        </Button>
      )}
    </section>
  );
}

const sameParams = (a: Props['params'], b: Props['params']) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
};
/** Memo theo giá trị bộ lọc: trang tạo object bộ lọc mới mỗi lần vẽ, dải số liệu chỉ vẽ lại khi bộ lọc thật sự đổi */
export const PrepSummary = memo(PrepSummaryView, (a, b) => a.branch === b.branch && sameParams(a.params, b.params));
