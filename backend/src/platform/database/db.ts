import { Kysely, MssqlDialect } from 'kysely';
import * as Tedious from 'tedious';
import * as Tarn from 'tarn';
import { env } from '../../config/env';

export interface DbOptions {
  /** Thời gian tối đa một câu lệnh (ms). Mặc định của tedious là 15 giây; thủ tục đồng bộ cần lâu hơn. */
  requestTimeoutMs?: number;
  /**
   * Không mở được kết nối thì báo lỗi ngay. Mặc định tarn thử lại 200 ms một lần suốt 30 giây: request treo và SQL Server
   * ghi hàng trăm lần đăng nhập lỗi.
   */
  failFast?: boolean;
  /** Số kết nối tối đa của pool (mặc định 10) */
  poolMax?: number;
}

export function createDb<T>(database: string, opts: DbOptions = {}): Kysely<T> {
  return new Kysely<T>({
    dialect: new MssqlDialect({
      tarn: { ...Tarn, options: { min: 0, max: opts.poolMax ?? 10, ...(opts.failFast ? { propagateCreateError: true } : {}) } },
      tedious: {
        ...Tedious,
        connectionFactory: () =>
          new Tedious.Connection({
            server: env.db.host,
            authentication: {
              type: 'default',
              options: { userName: env.db.user, password: env.db.password },
            },
            options: {
              port: env.db.port,
              database,
              encrypt: env.db.encrypt,
              trustServerCertificate: env.db.trustServerCertificate,
              rowCollectionOnRequestCompletion: true,
              ...(opts.requestTimeoutMs !== undefined ? { requestTimeout: opts.requestTimeoutMs } : {}),
            },
          }),
      },
    }),
  });
}
