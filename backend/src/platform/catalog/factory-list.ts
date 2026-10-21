/**
 * Nhà máy SX của đơn hàng (quyết định 7.6): một hoặc nhiều mã nhà máy (SysProductionFactory.Code, là tên nhà máy theo OSM)
 * cách nhau dấu phẩy, như cột FtyName của view OSM ("VIET DUC,VSN-DN"). Lưu dạng chuẩn: không khoảng trắng quanh dấu phẩy,
 * không mã trùng, giữ thứ tự của OSM; lọc theo nhà máy của ĐVCS tách lại bằng STRING_SPLIT(..., ',').
 */
export const FACTORY_SEPARATOR = ',';
/** Như cột SysProductionFactory.Code */
export const FACTORY_CODE_MAX = 100;
/** Mô tả của nhà máy SX do bước đồng bộ OSM tự thêm vào danh mục (reset:demo không tắt các mục này) */
export const OSM_FACTORY_NOTE = 'Thêm tự động theo OSM';
/** Như cột SalesOrder.ProductionFactoryCode */
export const FACTORY_LIST_MAX = 400;

/** Tách danh sách: bỏ khoảng trắng hai đầu từng mã, bỏ mã trống, bỏ mã trùng (không phân biệt hoa thường như collation CI) */
export function splitFactories(list: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (list ?? '').split(FACTORY_SEPARATOR)) {
    const code = raw.replace(/\s+/g, ' ').trim();
    if (!code || seen.has(code.toUpperCase())) continue;
    seen.add(code.toUpperCase());
    out.push(code);
  }
  return out;
}

/** Ghép lại dạng chuẩn; không còn mã nào thì null */
export function joinFactories(codes: string[]): string | null {
  return codes.length ? codes.join(FACTORY_SEPARATOR) : null;
}

/** Dạng chuẩn của một danh sách (null khi trống) */
export const normalizeFactories = (list: string | null | undefined) => joinFactories(splitFactories(list));

/**
 * Nhà máy SX ghi được vào đơn hàng từ danh sách OSM: dạng chuẩn, hoặc null khi trống hay dài quá cột (FACTORY_LIST_MAX): ghi
 * vào sẽ lỗi cả lần nạp (review OSM M1). `tooLong` để bên gọi báo lại.
 */
export function factoryListFor(list: string | null | undefined): { code: string | null; tooLong: boolean } {
  const code = normalizeFactories(list);
  return code && code.length > FACTORY_LIST_MAX ? { code: null, tooLong: true } : { code, tooLong: false };
}
