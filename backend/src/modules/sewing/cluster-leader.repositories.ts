import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import { BaseRepository, ChildRepository, type DataAction, type Scope } from '../../platform/data/base.repository';
import { ResourceRegistry } from '../../platform/data/resource-registry';
import { SEWING_DB } from './sewing.db';
import type { Row, SewingDb, SewingTeamClusterTable, SewingTeamLeaderTable, SewingTeamTable } from './sewing.types';

export type SewingTeamRow = Row<SewingTeamTable>;
export type SewingTeamLeaderRow = Row<SewingTeamLeaderTable>;
export type SewingTeamClusterRow = Row<SewingTeamClusterTable>;

/** Trần số tổ một phiên đọc (A00: mọi ĐVCS); số chuyền cả công ty cỡ vài trăm */
const MAX_TEAMS = 5000;

/**
 * Tổ của Phân cụm trưởng (tài nguyên sewing.cluster, phase 5.18): một chuyền may. Lọc ĐVCS và phạm vi chuyền (LINE → LineCode) qua
 * BaseRepository; tổ trưởng, cụm là bảng con theo dòng tổ.
 */
@Injectable()
export class SewingTeamRepository extends BaseRepository<SewingTeamRow> {
  protected readonly table = 'SewingTeam';
  protected readonly resource = 'sewing.cluster';
  protected readonly sortable = ['Id', 'BranchCode', 'LineCode'];
  protected readonly defaultSort = 'BranchCode:asc,LineCode:asc';

  constructor(@Inject(SEWING_DB) db: SewingDb, registry: ResourceRegistry) {
    super(db, registry);
  }

  /** Mọi tổ trong phạm vi xem, theo ĐVCS rồi mã chuyền */
  visible(scope: Scope): Promise<SewingTeamRow[]> {
    return this.listAll(scope, { maxRows: MAX_TEAMS }, 'view');
  }
}

/** Tổ trưởng của tổ (Phân tổ trưởng): bảng con, phạm vi theo dòng tổ */
@Injectable()
export class SewingTeamLeaderRepository extends ChildRepository<SewingTeamLeaderRow> {
  protected readonly table = 'SewingTeamLeader';
  protected readonly parentKey = 'SewingTeamId';
  protected readonly orderBy = ['Id'];

  constructor(@Inject(SEWING_DB) db: SewingDb, parent: SewingTeamRepository) {
    super(db, parent);
  }
}

/**
 * Cụm theo mã hàng của tổ cùng cụm trưởng: bảng con, phạm vi theo dòng tổ. Dữ liệu Phân cụm tích lũy theo mã hàng nên màn chỉ đọc cụm
 * của mã hàng đang xem (review 5.18 M1), lọc phạm vi bằng `scopedIds` của nền tảng.
 */
@Injectable()
export class SewingTeamClusterRepository extends ChildRepository<SewingTeamClusterRow> {
  protected readonly table = 'SewingTeamCluster';
  protected readonly parentKey = 'SewingTeamId';
  protected readonly orderBy = ['StyleCode', 'SortOrder', 'Id'];

  constructor(@Inject(SEWING_DB) db: SewingDb, parent: SewingTeamRepository) {
    super(db, parent);
  }

  /** Cụm của một mã hàng ở tổ trong phạm vi của hành động, theo thứ tự trên chuyền */
  async ofStyle(scope: Scope, teamId: number, style: string, action: DataAction, db: Kysely<any> = this.db): Promise<SewingTeamClusterRow[]> {
    return (await db
      .selectFrom('SewingTeamCluster')
      .selectAll()
      .where('SewingTeamId', '=', teamId)
      .where('StyleCode', '=', style)
      .where('Id', 'in', await this.scopedIds(scope, action, db))
      .orderBy('SortOrder')
      .orderBy('Id')
      .execute()) as SewingTeamClusterRow[];
  }

  /** Mã hàng đã phân cụm cho tổ: số cụm, số cụm đã có cụm trưởng (trong phạm vi xem) */
  async styleSummary(scope: Scope, teamId: number): Promise<{ StyleCode: string; StyleLabel: string | null; Clusters: number; Assigned: number }[]> {
    const rows = await this.db
      .selectFrom('SewingTeamCluster')
      .select([
        'StyleCode',
        sql<string | null>`MAX(StyleLabel)`.as('StyleLabel'),
        sql<number>`COUNT(*)`.as('Clusters'),
        sql<number>`SUM(CASE WHEN LeaderEmployeeId IS NULL THEN 0 ELSE 1 END)`.as('Assigned'),
      ])
      .where('SewingTeamId', '=', teamId)
      .where('Id', 'in', await this.scopedIds(scope, 'view'))
      .groupBy('StyleCode')
      .orderBy('StyleCode')
      .execute();
    return rows.map((r: any) => ({ StyleCode: r.StyleCode, StyleLabel: r.StyleLabel, Clusters: Number(r.Clusters), Assigned: Number(r.Assigned) }));
  }
}
