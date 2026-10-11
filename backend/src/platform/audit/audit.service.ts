import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_DB, type CoreDb } from '../database/database.module';

export interface AuditEntry {
  userId?: number | null;
  username?: string | null;
  branchCode?: string | null;
  entityType: string;
  entityId?: string | number | null;
  actionCode: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
}

/** Cắt theo độ dài cột: dữ liệu do client gửi (tên đăng nhập, IP) không được làm hỏng câu INSERT nhật ký. */
const clip = (v: string | null | undefined, max: number) => (v == null ? null : v.slice(0, max));

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  /** Ghi nhật ký; lỗi ghi log không được làm hỏng thao tác chính (đăng nhập, ghi dữ liệu nghiệp vụ). */
  async log(e: AuditEntry): Promise<void> {
    try {
      await this.insert(e, this.db);
    } catch (err) {
      this.logger.error(`Không ghi được audit ${e.actionCode}: ${(err as Error).message}`);
    }
  }

  /**
   * Ghi nhiều mục một lần (lưu cả bảng), chia lô vì SQL Server giới hạn 2100 tham số mỗi câu. Như `log`: gọi sau khi thao
   * tác chính đã commit, lỗi ghi log không làm hỏng thao tác chính.
   */
  async logMany(entries: AuditEntry[]): Promise<void> {
    for (let i = 0; i < entries.length; i += 100) {
      const chunk = entries.slice(i, i + 100);
      try {
        await this.db.insertInto('SysAuditLog').values(chunk.map(row)).execute();
      } catch (err) {
        this.logger.error(`Không ghi được ${chunk.length} mục audit ${chunk[0].actionCode}: ${(err as Error).message}`);
      }
    }
  }

  /** Thay đổi phân quyền bắt buộc có nhật ký: ghi trong cùng transaction, lỗi thì hủy cả thay đổi. */
  async logStrict(e: AuditEntry, executor: CoreDb): Promise<void> {
    await this.insert(e, executor);
  }

  private async insert(e: AuditEntry, executor: CoreDb): Promise<void> {
    await executor.insertInto('SysAuditLog').values(row(e)).execute();
  }
}

function row(e: AuditEntry) {
  return {
    UserId: e.userId ?? null,
    Username: clip(e.username, 50),
    BranchCode: clip(e.branchCode, 10),
    EntityType: e.entityType.slice(0, 40),
    EntityId: e.entityId == null ? null : String(e.entityId).slice(0, 40),
    ActionCode: e.actionCode.slice(0, 30),
    OldValue: e.oldValue === undefined ? null : JSON.stringify(e.oldValue),
    NewValue: e.newValue === undefined ? null : JSON.stringify(e.newValue),
    IpAddress: clip(e.ip, 45),
  };
}
