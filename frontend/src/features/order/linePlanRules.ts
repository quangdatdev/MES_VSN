import type { ScheduleLine } from './api';

/**
 * Dòng dàn chuyền đã lưu mà người dùng bỏ ra khi lưu, cần hỏi lại vì lưu là xóa luôn phần phân màu cỡ của dòng đó (phase 5.13):
 * dòng Đã phân màu cỡ trong số dòng người dùng sửa được. Không xem được trạng thái dòng (cột bị Ẩn, Che) thì tính mọi dòng đã lưu
 * bị bỏ, vì không biết dòng nào đã phân màu cỡ.
 */
export function droppedAllocated(saved: ScheduleLine[], keptIds: ReadonlySet<number | undefined>, statusKnown: boolean, editable: (l: ScheduleLine) => boolean): ScheduleLine[] {
  return saved.filter((l) => l.id !== undefined && editable(l) && !keptIds.has(l.id) && (!statusKnown || l.statusCode === 'ALLOCATED'));
}
