import { describe, expect, it } from 'vitest';
import type { ScheduleLine } from '../features/order/api';
import { droppedAllocated } from '../features/order/linePlanRules';

// Xếp chuyền (phase 5.13): lưu dàn chuyền mà bỏ dòng đã phân màu cỡ thì xóa luôn phần phân màu cỡ của dòng đó, nên hỏi lại trước

const line = (id: number, statusCode?: string, editable = true) => ({ id, lineCode: `A01-L0${id}`, lineName: `Chuyền ${id}`, statusCode, editable }) as ScheduleLine;
const mine = (l: ScheduleLine) => l.editable !== false;

describe('Xếp chuyền: dòng đã lưu bị bỏ cần hỏi lại', () => {
  const saved = [line(1, 'ALLOCATED'), line(2, 'PLANNED'), line(3, 'ALLOCATED', false), line(4, 'ALLOCATED')];

  it('xem được trạng thái: chỉ dòng Đã phân màu cỡ bị bỏ, trong số dòng mình sửa được', () => {
    expect(droppedAllocated(saved, new Set([4]), true, mine).map((l) => l.id)).toEqual([1]);
  });

  it('không xem được trạng thái (cột bị Ẩn, Che): mọi dòng đã lưu mình sửa được mà bị bỏ', () => {
    const blind = saved.map((l) => ({ ...l, statusCode: undefined }));
    expect(droppedAllocated(blind, new Set([4]), false, mine).map((l) => l.id)).toEqual([1, 2]);
  });

  it('giữ đủ các dòng đã lưu (kể cả khi thêm dòng mới chưa có Id): không hỏi', () => {
    expect(droppedAllocated(saved, new Set([1, 2, 3, 4, undefined]), false, mine)).toEqual([]);
  });
});
