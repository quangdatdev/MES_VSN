import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { memo, useEffect, useRef, useState } from 'react';
import { fmtDate } from '../../lib/format';
import { isoWeekOf, mondayOf, sundayOf, weekMonday, weeksInYear } from '../../lib/weeks';

interface Props {
  /** Thứ Hai của tuần đang chọn; null: không chọn tuần (xem cả khoảng ngày) */
  week: string | null;
  /** Khoảng Ngày vào chuyền đang lọc ('' là không giới hạn), để tô các tuần nằm trong khoảng */
  from: string;
  to: string;
  today: string;
  /** Bấm lại tuần đang chọn thì bỏ chọn (null) */
  onPick: (monday: string | null) => void;
}

/**
 * Thanh tuần T1…T53 như file mẫu: tuần trong khoảng Từ ngày – Đến ngày tô xanh nhạt, tuần đang chọn nền cam, tuần này gạch
 * chân. Chọn một tuần là xem việc chuẩn bị đến hạn tới hết tuần đó (cả việc tồn) và các mã vào chuyền trong tuần.
 */
function WeekStripView({ week, from, to, today, onPick }: Props) {
  const now = mondayOf(today);
  const [year, setYear] = useState(() => isoWeekOf(week ?? now).year);
  // Chọn tuần ở năm khác (link, Xóa lọc) thì thanh nhảy theo
  useEffect(() => {
    if (week) setYear(isoWeekOf(week).year);
  }, [week]);
  const rail = useRef<HTMLDivElement>(null);
  // Tuần đang chọn luôn nằm trong vùng nhìn thấy của thanh (điện thoại, màn hẹp, xoay màn hình). Cuộn riêng thanh tuần,
  // không dùng scrollIntoView (kéo cả trang)
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const show = () => {
      const tab = el.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!tab) return;
      const left = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      if (left < el.scrollLeft || left + tab.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollLeft = left - (el.clientWidth - tab.offsetWidth) / 2;
    };
    show();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(show);
    ro.observe(el);
    return () => ro.disconnect();
  }, [week, year]);

  const count = weeksInYear(year);
  const label = week ? `T${isoWeekOf(week).week}: ${fmtDate(week)} – ${fmtDate(sundayOf(week))}` : 'Chưa chọn tuần: xem cả khoảng ngày';

  return (
    <div className="week-strip">
      <Tooltip label="Năm trước">
        <ActionIcon variant="default" size="md" aria-label="Năm trước" onClick={() => setYear((y) => y - 1)} disabled={year <= 2000}>
          <IconChevronLeft size={15} />
        </ActionIcon>
      </Tooltip>
      <Text fw={700} size="sm" w={40} ta="center" aria-live="polite">
        {year}
      </Text>
      <Tooltip label="Năm sau">
        <ActionIcon variant="default" size="md" aria-label="Năm sau" onClick={() => setYear((y) => y + 1)} disabled={year >= 2100}>
          <IconChevronRight size={15} />
        </ActionIcon>
      </Tooltip>
      <div ref={rail} className="week-rail" role="group" aria-label={`Tuần năm ${year}`}>
        {Array.from({ length: count }, (_, i) => {
          const monday = weekMonday(year, i + 1);
          const sunday = sundayOf(monday);
          const inRange = (!to || monday <= to) && (!from || sunday >= from);
          const picked = monday === week;
          // Tên đọc bắt đầu bằng chữ đang hiện trên nút (WCAG 2.5.3)
          const name = `T${i + 1}: ${fmtDate(monday)} – ${fmtDate(sunday)}${monday === now ? ' (tuần này)' : ''}${inRange ? '' : ', ngoài khoảng ngày đang lọc'}`;
          return (
            <Tooltip key={monday} label={name} openDelay={400}>
              <button
                type="button"
                className="week-tab"
                data-range={inRange || undefined}
                data-now={monday === now || undefined}
                aria-pressed={picked}
                aria-label={name}
                onClick={() => onPick(picked ? null : monday)}
              >
                T{i + 1}
              </button>
            </Tooltip>
          );
        })}
      </div>
      <Text size="sm" c="dimmed" visibleFrom="md" style={{ whiteSpace: 'nowrap' }}>
        {label}
      </Text>
    </div>
  );
}

/** Memo: 53 nút tuần (mỗi nút một Tooltip) chỉ vẽ lại khi tuần, khoảng ngày đổi, không theo mỗi lần màn render */
export const WeekStrip = memo(WeekStripView);
