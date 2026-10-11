import type { LineInfo } from './types';

/** Một lựa chọn của ô chọn (TreeSelect, cột chọn của SheetGrid) */
export interface GroupedOption {
  value: string;
  label: string;
  /** Các nhóm chứa lựa chọn, từ ngoài vào trong (nhà máy, xưởng): danh sách mở ra thành cây thu gọn được */
  groups?: string[];
  /** Chữ tìm được ngoài nhãn, mã và tên nhóm (ví dụ mã xưởng) */
  keywords?: string;
}

/** Thông báo khi tìm chuyền không ra */
export const LINE_NOT_FOUND = 'Không có chuyền khớp. Gõ tên, số chuyền hoặc tên xưởng.';
/** Danh sách chuyền rỗng khi chưa gõ gì (đang tải, nhà máy chưa có chuyền) */
export const LINE_EMPTY = 'Chưa có chuyền nào.';

/**
 * Lựa chọn chuyền theo cây Danh mục hệ thống › Chuyền may, theo thứ tự API đã xếp (xưởng rồi chuyền):
 * - một nhà máy chưa chia xưởng: danh sách phẳng như trước;
 * - có xưởng: gom theo xưởng; chuyền thẳng dưới nhà máy đứng ngoài các nhóm, sau cùng (như bảng cây ở Danh mục);
 * - xem nhiều nhà máy (A00): thêm cấp chi nhánh ngoài cùng, ghi tên chi nhánh (branchName, xem BranchName) kèm mã.
 * Nhóm theo mã xưởng, không theo tên: hai xưởng trùng tên trong một nhà máy thì tên nhóm kèm mã để không bị gộp làm một.
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
      const workshop = l.workshopName ?? l.workshopCode;
      groups.push(codesOfName.get(`${l.branchCode}|${l.workshopName}`)!.size > 1 ? `${workshop} (${l.workshopCode})` : workshop);
    }
    return { value: l.code, label: label(l), groups: groups.length ? groups : undefined, keywords: l.workshopCode ?? undefined };
  });
}
