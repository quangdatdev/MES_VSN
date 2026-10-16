import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { sql, type SqlBool } from 'kysely';
import type { LineSource } from '../../platform/org/line-source';
import { OrgService, type LineInfo } from '../../platform/org/org.service';
import { HR_DB } from './hr.db';
import type { HrDb } from './hr.types';

/**
 * Chuyền may là bộ phận tích "Xưởng sản xuất" (phase 5.10). Đăng ký vào OrgService để module Đơn hàng, May hỏi chuyền
 * qua nền tảng mà không import module Nhân sự. Đọc thẳng bảng (không qua BaseRepository) vì đây là danh mục cho mọi
 * người đăng nhập (`/me/lines`), không phải dữ liệu nhân sự theo quyền `hr.orgchart`; lọc ĐVCS làm ở OrgService.lines.
 */
@Injectable()
export class HrLineSource implements LineSource, OnModuleInit {
  constructor(
    @Inject(HR_DB) private readonly db: HrDb,
    private readonly org: OrgService,
  ) {}

  onModuleInit() {
    this.org.registerSource(this);
  }

  async loadLines(): Promise<LineInfo[]> {
    const rows = await this.db
      .selectFrom('Department as d')
      .leftJoin('Department as p', 'p.Id', 'd.ParentId')
      .select(['d.Code', 'd.Name', 'd.BranchCode', 'd.IsActive', 'd.Path', 'p.Code as ParentCode', 'p.Name as ParentName'])
      // Hằng số trong câu lệnh (không phải tham số): SQL Server mới dùng được chỉ mục có lọc IX_Department_ProductionWorkshop
      .where(sql<SqlBool>`d.IsProductionWorkshop = 1`)
      .where('d.BranchCode', 'is not', null)
      .orderBy('d.BranchCode')
      .orderBy(sql`CASE WHEN p.Id IS NULL THEN 1 ELSE 0 END`)
      .orderBy('p.SortOrder')
      .orderBy('p.Code')
      .orderBy('d.SortOrder')
      .orderBy('d.Code')
      .execute();
    // Tên các bộ phận cha theo Path ('/VSN/X01/L01/'): cây sơ đồ tổ chức cho ô Đơn vị phòng ban (phase 5.16). Chỉ tên, mã của bộ phận có
    // chuyền bên dưới, như tên bộ phận cha đã trả trước đây
    const codes = [...new Set(rows.flatMap((r) => r.Path.split('/').filter(Boolean).slice(0, -1)))];
    const names = new Map<string, string>();
    for (let i = 0; i < codes.length; i += 1000) {
      for (const d of await this.db.selectFrom('Department').select(['Code', 'Name']).where('Code', 'in', codes.slice(i, i + 1000)).execute()) names.set(d.Code, d.Name);
    }
    return rows.map((r) => ({
      code: r.Code,
      name: r.Name,
      branchCode: r.BranchCode!,
      isActive: !!r.IsActive,
      workshopCode: r.ParentCode,
      workshopName: r.ParentName,
      ancestors: r.Path.split('/').filter(Boolean).slice(0, -1).map((code) => ({ code, name: names.get(code) ?? code })),
    }));
  }
}
