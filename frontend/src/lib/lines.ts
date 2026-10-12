import type { LineInfo } from './types';

/** Một lựa chọn của ô chọn (TreeSelect, cột chọn của SheetGrid) */
export interface GroupedOption {
  value: string;
  label: string;
  /** Các nhóm chứa lựa chọn, từ ngoài vào trong (ĐVCS, bộ phận cha): danh sách mở ra thành cây thu gọn được */
  groups?: string[];
  /** Chữ tìm được ngoài nhãn, mã và tên nhóm (ví dụ mã bộ phận cha) */
  keywords?: string;
}

/** Thông báo khi tìm chuyền không ra */
export const LINE_NOT_FOUND = 'Không có chuyền khớp. Gõ tên, mã chuyền hoặc tên bộ phận.';
/** Danh sách chuyền rỗng khi chưa gõ gì (đang tải, ĐVCS chưa có bộ phận tích "Xưởng sản xuất") */
export const LINE_EMPTY = 'Chưa có chuyền nào.';

/**
 * Lựa chọn chuyền may (phase 5.10: chuyền là bộ phận tích "Xưởng sản xuất" ở Sơ đồ tổ chức), theo thứ tự API đã xếp
 * (ĐVCS, bộ phận cha, chuyền):
 * - mọi chuyền nằm ở gốc cây (không có bộ phận cha): danh sách phẳng;
 * - có bộ phận cha: gom theo bộ phận cha; chuyền ở gốc cây đứng ngoài các nhóm, sau cùng. Chỉ một nhóm thì ô chọn tự mở sẵn;
 * - xem nhiều ĐVCS (A00): thêm cấp chi nhánh ngoài cùng, ghi tên chi nhánh (branchName, xem BranchName) kèm mã.
 * Nhóm theo mã bộ phận cha, không theo tên: hai bộ phận trùng tên trong một ĐVCS (Bộ phận may của hai nhà máy) thì tên nhóm
 * kèm mã để không bị gộp làm một.
 */
export function lineOptions(
  lines: LineInfo[],
  label: (l: LineInfo) => string = (l) => `${l.name} (${l.code})`,
  branchName: (code: string) => string = (code) => code,
): GroupedOption[] {
  const manyBranches = new Set(lines.map((l) => l.branchCode)).size > 1;
  const codesOfName = new Map<string, Set<string>>();
  for (const l of lines) {
    if (!l.workshopCode) continue;
    const k = `${l.branchCode}|${l.workshopName}`;
    codesOfName.set(k, (codesOfName.get(k) ?? new Set()).add(l.workshopCode));
  }
  return lines.map((l) => {
    const name = branchName(l.branchCode);
    const groups = manyBranches ? [name && name !== l.branchCode ? `${name} (${l.branchCode})` : `Chi nhánh ${l.branchCode}`] : [];
    if (l.workshopCode) {
      const parent = l.workshopName ?? l.workshopCode;
      groups.push(codesOfName.get(`${l.branchCode}|${l.workshopName}`)!.size > 1 ? `${parent} (${l.workshopCode})` : parent);
    }
    return { value: l.code, label: label(l), groups: groups.length ? groups : undefined, keywords: l.workshopCode ?? undefined };
  });
}

/**
 * Nhãn ngắn của chuyền cho ô đã chọn (cột Chuyền của lưới nhập): tên chuyền. Mã bộ phận do Nhân sự đặt, không có dạng cố định
 * để cắt lấy "số chuyền"; hai chuyền trùng tên (Chuyền 01 của hai bộ phận) thì kèm mã để ô đóng không lẫn.
 */
export function lineNameLabel(lines: LineInfo[]): (l: LineInfo) => string {
  const count = new Map<string, number>();
  for (const l of lines) count.set(l.name, (count.get(l.name) ?? 0) + 1);
  return (l) => ((count.get(l.name) ?? 0) > 1 ? `${l.name} (${l.code})` : l.name);
}
