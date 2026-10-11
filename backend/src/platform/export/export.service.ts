import { Injectable, StreamableFile } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { FieldPolicyService, MASK } from '../permission/field-policy.service';
import { PermissionService } from '../permission/permission.service';

export interface ExportColumn {
  /** Mã trường JSON (trùng mã cột đăng ký ở SysResourceField nếu có). */
  key: string;
  label: string;
  /**
   * Mã cột trong chính sách cột khi khác key: cột tên đi theo cột mã (branchName theo branchCode) để Ẩn, Che cột mã cũng ẩn,
   * che cột tên. Không có thì dùng key.
   */
  field?: string;
}

/** Ô bắt đầu bằng = + - @ bị Excel hiểu là công thức: thêm dấu nháy để chặn chèn công thức qua dữ liệu. */
const cell = (v: unknown) => {
  if (v == null) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Xuất file đi qua đúng chính sách cột như màn hình (ADR 0005): cột Ẩn không có trong file, cột Che ra "***",
 * cột nhạy cảm được xuất thì ghi nhật ký đọc dữ liệu nhạy cảm (EXPORT).
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly fields: FieldPolicyService,
    private readonly permissions: PermissionService,
  ) {}

  async csv(user: AuthUser, resource: string, columns: ExportColumn[], rows: Record<string, unknown>[], fileName: string): Promise<StreamableFile> {
    const shaped = await this.fields.shape(user, resource, rows, 'EXPORT');
    const { levels } = await this.fields.levels(await this.permissions.accessOf(user), resource);
    const visible = columns.filter((c) => levels.get(c.field ?? c.key) !== 'HIDDEN');
    const value = (r: Record<string, unknown>, c: ExportColumn) => (c.field && levels.get(c.field) === 'MASKED' && r[c.key] != null ? MASK : r[c.key]);
    const lines = [visible.map((c) => cell(c.label)).join(','), ...shaped.map((r) => visible.map((c) => cell(value(r, c))).join(','))];
    // BOM để Excel mở đúng tiếng Việt
    const body = Buffer.from(`\uFEFF${lines.join('\r\n')}`, 'utf8');
    const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_');
    return new StreamableFile(body, { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="${safeName}"` });
  }
}
