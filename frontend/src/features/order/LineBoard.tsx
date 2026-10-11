import { Popover, Stack, Text } from '@mantine/core';
import { Fragment, memo, useMemo, type ReactNode } from 'react';
import { addDays, fmtDate, fmtNum, today } from '../../lib/format';
import type { BoardBar } from './api';
import { LINE_STATUS } from './common';

const DAY_W = 30;
const ROW_H = 34;
const LABEL_W = 116;

export interface BoardLine {
  code: string;
  name: string;
  /** false: chuyền đã ngừng dùng, chỉ còn hàng vì còn việc trong khoảng ngày */
  isActive?: boolean;
}

interface Props {
  from: string;
  to: string;
  lines: BoardLine[];
  bars: (BoardBar & { preview?: boolean })[];
  /** Kế hoạch đang mở: thanh của kế hoạch này nổi lên, thanh khác mờ đi */
  focusPlanId?: number | null;
  /** Hiện thông tin chi tiết khi bấm vào thanh */
  details?: boolean;
  renderActions?: (bar: BoardBar) => ReactNode;
}

const dayIndex = (from: string, d: string) => Math.round((Date.parse(d) - Date.parse(from)) / 86_400_000);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Thanh vẽ được: có ngày bắt đầu, kết thúc thật (cột ngày bị Ẩn hoặc Che thì không có vị trí để vẽ). */
const drawable = (b: BoardBar) => ISO_DAY.test(String(b.startDate ?? '')) && ISO_DAY.test(String(b.endDate ?? ''));
/** Chữ trên thanh: phần đầu tên khách (bị Che thì để nguyên "***"), mã hàng, số lượng. Mã hàng có gạch nên nối bằng dấu phẩy. */
const barLabel = (b: BoardBar) => [String(b.customerName ?? '').split(' ')[0], b.styleCode, `${fmtNum(b.qty)} sp`].filter(Boolean).join(', ');
const isSunday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
const NO_BARS: Props['bars'] = [];

interface RowProps {
  line: BoardLine;
  /** Các thanh của chuyền, theo ngày bắt đầu */
  list: Props['bars'];
  top: number;
  from: string;
  dayCount: number;
  width: number;
  focusPlanId?: number | null;
  details: boolean;
  renderActions?: (bar: BoardBar) => ReactNode;
}

/** Một hàng chuyền. Vẽ lại khi thanh của chính chuyền đó đổi: sửa một dòng dàn chuyền không vẽ lại mọi chuyền. */
function BoardRowView({ line, list, top, from, dayCount, width, focusPlanId, details, renderActions }: RowProps) {
  return (
    <div className="board-row" style={{ top, height: ROW_H }}>
      <div className="board-label" style={{ width: LABEL_W }} title={`${line.name} (${line.code})${line.isActive === false ? ', đã ngừng dùng' : ''}`} data-inactive={line.isActive === false || undefined}>
        <b>{line.code.split('-').pop()?.replace(/^L/, '')}</b>
        <span>{line.name}{line.isActive === false && ' (đã ngừng)'}</span>
      </div>
      <div className="board-track" style={{ width }}>
        {list.map((b, i) => {
          const next = list[i + 1];
          const start = Math.max(0, dayIndex(from, b.startDate));
          const end = Math.min(dayCount - 1, dayIndex(from, b.endDate));
          if (end < 0 || start > dayCount - 1) return null;
          const gapStart = end + 1;
          const gapEnd = next ? Math.min(dayCount, dayIndex(from, next.startDate)) : gapStart;
          const status = b.preview ? 'đang sửa, chưa lưu' : (LINE_STATUS[b.statusCode]?.label ?? b.statusCode);
          const label = barLabel(b);
          const name = `${line.name}: ${label}, ${fmtDate(b.startDate)} đến ${fmtDate(b.endDate)}, ${status}`;
          // Bấm để xem chi tiết thì là nút; thanh không bấm được (xem trước, tắt chi tiết) chỉ là hình có tên đọc
          const clickable = details && !b.preview;
          const common = {
            'data-status': b.statusCode,
            'data-preview': b.preview || undefined,
            'data-dim': focusPlanId != null && b.planId !== focusPlanId ? true : undefined,
            'data-focus': focusPlanId != null && b.planId === focusPlanId ? true : undefined,
            title: name,
            'aria-label': name,
          };
          const pos = { left: start * DAY_W + 1, width: (end - start + 1) * DAY_W - 2 };
          const bar = clickable ? (
            <button type="button" className="board-bar focus-ring" style={pos} {...common}>
              {label}
            </button>
          ) : (
            <div role="img" className="board-bar" style={pos} {...common}>
              {label}
            </div>
          );
          return (
            // Khóa theo thanh, không theo vị trí: sửa ngày làm đổi thứ tự thì thanh không bị dựng lại (Popover đang mở không
            // đóng). Thanh xem trước và thanh đã lưu có thể trùng id nên khóa kèm loại thanh
            <Fragment key={`${b.preview ? 'p' : 'b'}${b.id}`}>
              {clickable ? (
                <Popover width={280} position="bottom-start" withArrow shadow="md">
                  <Popover.Target>{bar}</Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap={4}>
                      <Text size="sm" fw={700}>{b.customerName}</Text>
                      <Text size="sm">Mã hàng <b>{b.styleCode}</b>, kế hoạch {b.planNo}</Text>
                      <Text size="sm">PO/Buy date: {b.poBuyDate}</Text>
                      <Text size="sm">{line.name}: <b>{fmtNum(b.qty)}</b> sp, năng suất {fmtNum(b.avgOutput)} sp/ngày</Text>
                      <Text size="sm">Vào chuyền {fmtDate(b.startDate)}, xong {fmtDate(b.endDate)}</Text>
                      <Text size="sm" c="dimmed">Xuất hàng {fmtDate(b.shipDate)}. {status}.</Text>
                      {renderActions?.(b)}
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
              ) : (
                bar
              )}
              {gapEnd > gapStart && <div className="board-gap" style={{ left: gapStart * DAY_W, width: (gapEnd - gapStart) * DAY_W }} title="Chuyền trống" />}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

/** So từng thanh theo tham chiếu: thanh của chuyền khác đổi thì danh sách của chuyền này là mảng mới nhưng cùng các thanh */
const sameBars = (a: Props['bars'], b: Props['bars']) => a.length === b.length && a.every((x, i) => x === b[i]);
const BoardRow = memo(BoardRowView, (a, b) => {
  const { list: la, ...ra } = a;
  const { list: lb, ...rb } = b;
  return sameBars(la, lb) && (Object.keys(ra) as (keyof typeof ra)[]).every((k) => ra[k] === rb[k]);
});

/**
 * Bảng dàn chuyền: mỗi chuyền một hàng, mỗi ngày một cột (Chủ nhật tô đậm, là ngày nghỉ).
 * Thanh cam: đang may; thanh xanh: đã xếp, chưa vào chuyền; thanh xám: đã xong; ô vàng nhạt: chuyền đang trống giữa hai việc.
 * Trạng thái không chỉ nói bằng màu: có trong tên đọc của thanh và khi rê chuột.
 */
function LineBoardView({ from, to, lines, bars, focusPlanId, details = true, renderActions }: Props) {
  const days = useMemo(() => {
    const n = Math.max(0, dayIndex(from, to)) + 1;
    return Array.from({ length: n }, (_, i) => addDays(from, i));
  }, [from, to]);
  const months = useMemo(() => {
    const out: { key: string; label: string; span: number }[] = [];
    for (const d of days) {
      const key = d.slice(0, 7);
      const last = out.at(-1);
      if (last?.key === key) last.span++;
      else out.push({ key, label: `${d.slice(5, 7)}/${d.slice(0, 4)}`, span: 1 });
    }
    return out;
  }, [days]);
  const byLine = useMemo(() => {
    const m = new Map<string, Props['bars']>();
    for (const b of bars.filter(drawable)) m.set(b.lineCode, [...(m.get(b.lineCode) ?? []), b]);
    for (const list of m.values()) list.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return m;
  }, [bars]);
  const todayIdx = dayIndex(from, today());
  const width = days.length * DAY_W;
  const hasPreview = bars.some((b) => b.preview);

  return (
    <div className="board" role="region" aria-label="Bảng dàn chuyền">
      <div className="board-scroll">
        <div className="board-sheet" style={{ width: LABEL_W + width }}>
          <div className="board-head">
            <div className="board-corner" style={{ width: LABEL_W }}>Chuyền</div>
            <div>
              <div className="board-months">
                {months.map((m) => (
                  <div key={m.key} style={{ width: m.span * DAY_W }}>{m.label}</div>
                ))}
              </div>
              <div className="board-days">
                {days.map((d) => (
                  <div key={d} data-sunday={isSunday(d) || undefined} data-today={d === today() || undefined} style={{ width: DAY_W }} title={fmtDate(d)}>
                    {isSunday(d) ? 'CN' : Number(d.slice(8, 10))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="board-body" style={{ height: lines.length * ROW_H }}>
            {/* Lớp nền: Chủ nhật và vạch hôm nay phủ suốt các hàng */}
            <div className="board-underlay" style={{ left: LABEL_W, width }}>
              {days.map((d, i) => (isSunday(d) ? <div key={d} className="board-sunday" style={{ left: i * DAY_W, width: DAY_W }} /> : null))}
              {todayIdx >= 0 && todayIdx < days.length && <div className="board-today" style={{ left: todayIdx * DAY_W + DAY_W / 2 }} title="Hôm nay" />}
            </div>
            {lines.map((line, r) => (
              <BoardRow
                key={line.code}
                line={line}
                list={byLine.get(line.code) ?? NO_BARS}
                top={r * ROW_H}
                from={from}
                dayCount={days.length}
                width={width}
                focusPlanId={focusPlanId}
                details={details}
                renderActions={renderActions}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="board-legend">
        <span><i data-k="IN_PRODUCTION" />Đang may</span>
        <span><i data-k="ALLOCATED" />Đã xếp, đã phân màu cỡ</span>
        <span><i data-k="PLANNED" />Đã xếp, chưa phân màu cỡ</span>
        <span><i data-k="DONE" />Đã xong</span>
        {hasPreview && (
          <span>
            <i data-k="preview" />
            Đang sửa, chưa lưu
          </span>
        )}
        <span><i data-k="gap" />Chuyền trống</span>
        <span><i data-k="sunday" />Chủ nhật</span>
        <span><i data-k="today" />Hôm nay</span>
      </div>
    </div>
  );
}

/**
 * Bảng dàn chuyền (memo): trang hay popup render lại vì việc khác (gõ ô lọc, gõ cột không làm đổi thanh) thì không vẽ lại
 * bảng; thanh đổi thì chỉ hàng chuyền có thanh đổi vẽ lại.
 */
export const LineBoard = memo(LineBoardView);
