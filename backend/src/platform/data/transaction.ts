import { Logger } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely';

const logger = new Logger('Transaction');

/**
 * Chạy `fn` trong một transaction và giữ nguyên lỗi của `fn`. Khi SQL Server đã tự rollback (ví dụ lỗi 1205
 * deadlock), lệnh rollback Kysely gửi sau đó lỗi tiếp (3903) và che mất lỗi gốc, người dùng nhận 500 thay vì
 * thông báo "thử lại" (review 5.1 lượt 5). Lỗi rollback khi đó chỉ ghi log. Không có lỗi từ `fn` (lỗi lúc commit)
 * thì ném lỗi Kysely trả về.
 */
export async function inTransaction<DB, T>(db: Kysely<DB>, fn: (trx: Transaction<DB>) => Promise<T>): Promise<T> {
  let original: unknown;
  try {
    return await db.transaction().execute(async (trx) => {
      try {
        return await fn(trx);
      } catch (e) {
        original = e;
        throw e;
      }
    });
  } catch (e) {
    if (original !== undefined && e !== original) logger.warn(`Rollback lỗi sau lỗi của giao dịch: ${(e as Error)?.message ?? e}`);
    throw original ?? e;
  }
}
