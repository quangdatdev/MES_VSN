/** Các lỗi trong một lỗi driver ném ra: khi một request nhận nhiều lỗi, driver mssql của Kysely ném thẳng mảng (không bọc lại). */
function errorList(e: unknown): unknown[] {
  const nested = (e as { errors?: unknown })?.errors;
  return Array.isArray(e) ? e : [e, ...(Array.isArray(nested) ? nested : [])];
}

/** Mã lỗi SQL Server (tedious gắn ở `number`) */
export function sqlErrorNumbers(e: unknown): number[] {
  return errorList(e)
    .map((x) => (x as { number?: number })?.number)
    .filter((n): n is number => typeof n === 'number');
}

/** Lỗi 1205 của SQL Server: giao dịch bị chọn làm nạn nhân deadlock (đã bị SQL Server rollback). */
export function isDeadlock(e: unknown): boolean {
  return sqlErrorNumbers(e).includes(1205) || errorList(e).some((x) => /deadlock victim/i.test((x as Error)?.message ?? ''));
}
