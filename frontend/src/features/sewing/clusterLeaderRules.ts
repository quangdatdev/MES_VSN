import { MASK } from '../../lib/fieldPolicy';
import type { ClusterEmployee, ClusterItem } from './api';

/** Người đang chọn của một ô: đủ để hiện nhãn khi chưa có trong kết quả tìm */
export interface LeaderPick {
  id: number;
  code: string | null;
  fullName: string | null;
  departmentName: string | null;
  /** false: đã nghỉ việc */
  active: boolean | null;
}

/** Một dòng của bảng: cụm trưởng đã lưu và đang chọn */
export interface ClusterRow {
  id: number;
  code: string;
  name: string;
  /** Cột Tên cụm trưởng bị Che: hiện "***", không sửa */
  masked: boolean;
  saved: number | null;
  value: number | null;
  /** Người đang chọn (null: chưa phân) */
  pick: LeaderPick | null;
  /** Người đã lưu, để Bỏ thay đổi */
  savedPick: LeaderPick | null;
}

/** Nhãn của người theo ảnh mẫu: "Tên - Mã - Phòng ban"; thiếu phần nào thì bỏ phần đó */
export const employeeLabel = (p: { fullName?: string | null; code?: string | null; departmentName?: string | null }) => [p.fullName, p.code, p.departmentName].filter((x) => !!x).join(' - ');

export const pickOf = (e: ClusterEmployee): LeaderPick => ({ id: e.id, code: e.code, fullName: e.fullName, departmentName: e.departmentName, active: true });

const savedOf = (item: ClusterItem): LeaderPick | null =>
  typeof item.leaderEmployeeId === 'number' ? { id: item.leaderEmployeeId, code: item.leaderCode ?? null, fullName: item.leaderName ?? null, departmentName: item.leaderDepartment ?? null, active: item.leaderActive ?? null } : null;

/**
 * Dòng của bảng từ dữ liệu máy chủ. `keep`: dòng đang chọn dở của lần tải trước (cùng tổ, cùng mã hàng). Ô chọn dở giữ lại khi cụm
 * trưởng đã lưu không đổi từ lúc bắt đầu chọn; người khác vừa đổi (sau lỗi 409) thì ô lấy người mới, bỏ phần chọn dở.
 */
export function rowsOf(items: ClusterItem[], keep?: Map<number, ClusterRow>): ClusterRow[] {
  return items.map((item) => {
    const masked = item.leaderEmployeeId === MASK;
    const saved = typeof item.leaderEmployeeId === 'number' ? item.leaderEmployeeId : null;
    const savedPick = savedOf(item);
    const draft = keep?.get(item.id);
    const keepDraft = !!draft && !masked && draft.saved === saved && draft.value !== draft.saved;
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      masked,
      saved,
      value: keepDraft ? draft.value : saved,
      pick: keepDraft ? draft.pick : savedPick,
      savedPick,
    };
  });
}

export const isDirty = (r: ClusterRow) => !r.masked && r.value !== r.saved;

/** Phần gửi lên khi Lưu: chỉ cụm đã đổi, kèm cụm trưởng lúc mở màn để máy chủ phát hiện người khác vừa đổi */
export const changes = (rows: ClusterRow[]) => rows.filter(isDirty).map((r) => ({ id: r.id, leaderEmployeeId: r.value, previous: r.saved }));

/** Số cụm đang có cụm trưởng (theo phần đang chọn); null khi cột bị Che */
export const assignedOf = (rows: ClusterRow[]) => (rows.some((r) => r.masked) ? null : rows.filter((r) => r.value != null).length);

/**
 * Đánh dấu đã lưu đúng các dòng đã gửi (ảnh chụp lúc bấm Lưu); ô chọn lại trong lúc đang lưu vẫn là chưa lưu, so với người vừa lưu.
 */
export function afterSave(rows: ClusterRow[], sent: ClusterRow[]): ClusterRow[] {
  const byId = new Map(sent.map((s) => [s.id, s]));
  return rows.map((r) => {
    const s = byId.get(r.id);
    return s ? { ...r, saved: s.value, savedPick: s.pick } : r;
  });
}

/** Bỏ phần chọn dở, về cụm trưởng đã lưu */
export const discard = (rows: ClusterRow[]) => rows.map((r) => (isDirty(r) ? { ...r, value: r.saved, pick: r.savedPick } : r));
