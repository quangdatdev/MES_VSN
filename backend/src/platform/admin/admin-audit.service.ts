import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { CORE_DB, type CoreDb } from '../database/database.module';
import { AuditQuery } from './admin.dto';

@Injectable()
export class AdminAuditService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  async list(q: AuditQuery) {
    const base = () => {
      let qb = this.db.selectFrom('SysAuditLog');
      if (q.from) qb = qb.where('EventAt', '>=', new Date(q.from));
      if (q.to) qb = qb.where('EventAt', '<=', new Date(q.to));
      if (q.entityType) qb = qb.where('EntityType', '=', q.entityType);
      if (q.userId) qb = qb.where('UserId', '=', q.userId);
      if (q.q?.trim()) {
        const l = `%${q.q.trim().replace(/[%_[]/g, (c) => `[${c}]`)}%`;
        qb = qb.where((eb) => eb.or([eb('Username', 'like', l), eb('ActionCode', 'like', l), eb('EntityId', 'like', l)]));
      }
      return qb;
    };
    const total = await base().select(sql<number>`COUNT(*)`.as('n')).executeTakeFirstOrThrow();
    const rows = await base()
      .selectAll()
      .orderBy('EventAt', 'desc')
      .orderBy('Id', 'desc')
      .offset((q.page - 1) * q.pageSize)
      .fetch(q.pageSize)
      .execute();
    return {
      total: Number(total.n),
      page: q.page,
      pageSize: q.pageSize,
      items: rows.map((r) => ({
        id: String(r.Id),
        eventAt: r.EventAt,
        username: r.Username,
        branchCode: r.BranchCode,
        entityType: r.EntityType,
        entityId: r.EntityId,
        actionCode: r.ActionCode,
        oldValue: r.OldValue,
        newValue: r.NewValue,
        ip: r.IpAddress,
      })),
    };
  }
}
