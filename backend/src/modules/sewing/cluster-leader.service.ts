import { Inject, Injectable } from '@nestjs/common';
import { AppException, Errors } from '../../common/app.exception';
import type { AuthUser } from '../../platform/auth/auth.types';
import { AuditService, type AuditEntry } from '../../platform/audit/audit.service';
import { scopeOf, type Scope } from '../../platform/data/base.repository';
import { inTransaction } from '../../platform/data/transaction';
import { EmployeeDirectoryService } from '../../platform/org/employee-directory.service';
import type { EmployeeInfo } from '../../platform/org/employee-source';
import { OrgService } from '../../platform/org/org.service';
import { UserDirectoryService } from '../../platform/org/user-directory.service';
import { FieldPolicyService } from '../../platform/permission/field-policy.service';
import type { ClusterDetailQuery, ClusterEmployeeQuery, ClusterLeaderSaveDto, ClusterTeamQuery } from './cluster-leader.dto';
import { SewingTeamClusterRepository, SewingTeamLeaderRepository, SewingTeamRepository, type SewingTeamRow } from './cluster-leader.repositories';
import { SEWING_DB } from './sewing.db';
import type { SewingDb } from './sewing.types';

const RESOURCE = 'sewing.cluster';
/** Số người mỗi lần tìm ở ô Tên cụm trưởng (tìm trên máy chủ, không nạp hết danh bạ) */
const PICK_LIMIT = 30;

const invalid = (msg: string, details: unknown = null) => new AppException('VALIDATION_FAILED', msg, 422, details);
const denied = (msg: string) => new AppException('PERMISSION_DENIED', msg, 403);
const NOT_LINKED = 'Tài khoản của bạn chưa gắn với nhân viên nên chưa phân cụm trưởng được. Nhờ quản trị viên gắn ở Quản trị › Người dùng.';
const NOT_LEADER = 'Chỉ tổ trưởng của tổ này mới phân cụm trưởng được.';

/** Các tổ người đăng nhập thấy, kèm tổ trưởng của từng tổ và các tổ người đó làm tổ trưởng */
interface TeamsView {
  scope: Scope;
  /** Nhân viên của tài khoản (SysUser.EmployeeId); null: chưa gắn */
  employeeId: number | null;
  teams: SewingTeamRow[];
  /** Id tổ → Id nhân viên tổ trưởng */
  leaders: Map<number, number[]>;
  /** Tổ người đăng nhập làm tổ trưởng (trong phạm vi xem) */
  mine: Set<number>;
}

/**
 * Phân cụm trưởng (phase 5.18): tổ trưởng chọn cụm trưởng cho từng cụm của một mã hàng ở tổ mình. Tổ, tổ trưởng, cụm là bản chép dữ liệu
 * GSD (đang giả lập) ở MES_Sewing; mọi đọc ghi qua SewingTeamRepository (lọc ĐVCS, phạm vi chuyền) và hai bảng con.
 *
 * Tổ nào người đăng nhập thấy (người dùng chốt Q1, Q2): là tổ trưởng của ít nhất một tổ trong phạm vi xem (theo nhân viên gắn với tài
 * khoản) thì chỉ thấy các tổ đó; không thì thấy mọi tổ trong phạm vi xem, chỉ đọc. Lưu được khi: không ở A00, có quyền Sửa, tổ trong
 * phạm vi sửa và người lưu là tổ trưởng của tổ. Điều kiện tổ trưởng là luật nghiệp vụ thêm sau phân quyền, không thay cho phân quyền.
 */
@Injectable()
export class ClusterLeaderService {
  constructor(
    @Inject(SEWING_DB) private readonly db: SewingDb,
    private readonly teams: SewingTeamRepository,
    private readonly leaders: SewingTeamLeaderRepository,
    private readonly clusters: SewingTeamClusterRepository,
    private readonly users: UserDirectoryService,
    private readonly directory: EmployeeDirectoryService,
    private readonly org: OrgService,
    private readonly fields: FieldPolicyService,
    private readonly audit: AuditService,
  ) {}

  private async view(user: AuthUser): Promise<TeamsView> {
    const scope = scopeOf(user);
    const all = await this.teams.visible(scope);
    const leaders = new Map<number, number[]>();
    for (const l of await this.leaders.listByParents(scope, all.map((t) => t.Id), 'view')) leaders.set(l.SewingTeamId, [...(leaders.get(l.SewingTeamId) ?? []), l.EmployeeId]);
    const employeeId = await this.users.employeeIdOf(user.userId);
    const mine = new Set(all.filter((t) => employeeId != null && (leaders.get(t.Id) ?? []).includes(employeeId)).map((t) => t.Id));
    return { scope, employeeId, teams: mine.size ? all.filter((t) => mine.has(t.Id)) : all, leaders, mine };
  }

  /** Một tổ trong các tổ người đăng nhập thấy; ngoài đó (tổ của tổ trưởng khác, ngoài phạm vi) là 404 như không có */
  private async teamOf(user: AuthUser, teamId: number) {
    const v = await this.view(user);
    const team = v.teams.find((t) => t.Id === teamId);
    if (!team) throw Errors.notFound('Không thấy tổ này, hoặc tổ nằm ngoài phạm vi của bạn.');
    return { ...v, team };
  }

  /** Vì sao không sửa được tổ; null là sửa được. Chính sách cột của Tên cụm trưởng giao diện tự xét, máy chủ kiểm khi ghi */
  private async readOnlyReason(v: TeamsView, team: SewingTeamRow): Promise<string | null> {
    if (v.scope.isAggregate) return 'Đang xem tổng hợp mọi đơn vị cơ sở, chỉ đọc.';
    if (!this.teams.grantsFor(v.scope, 'update').length) return 'Bạn chỉ được xem Phân cụm trưởng.';
    if (v.employeeId == null) return NOT_LINKED;
    if (!v.mine.has(team.Id)) return NOT_LEADER;
    if (!(await this.teams.allows(v.scope, 'update', team as unknown as Record<string, unknown>))) return 'Tổ nằm ngoài phạm vi sửa của bạn.';
    return null;
  }

  /** Ô Chọn tổ: tổ người đăng nhập thấy, tên tổ theo cây sơ đồ tổ chức (tên chuyền) */
  async teamList(user: AuthUser) {
    const v = await this.view(user);
    const lineName = await this.org.lineNamer();
    const items = [];
    for (const t of v.teams) {
      items.push({ id: t.Id, branchCode: t.BranchCode, lineCode: t.LineCode, lineName: lineName(t.LineCode), canEdit: (await this.readOnlyReason(v, t)) === null });
    }
    return { linked: v.employeeId != null, leader: v.mine.size > 0, items };
  }

  /** Ô Chọn mã hàng: mã hàng đã được phân cụm cho tổ, kèm số cụm và số cụm đã có cụm trưởng */
  async styles(user: AuthUser, q: ClusterTeamQuery) {
    const v = await this.teamOf(user, q.teamId);
    const blind = await this.blind(user);
    const rows = await this.clusters.styleSummary(v.scope, v.team.Id);
    // Số đã phân suy ra từ cột Tên cụm trưởng: không xem được cột thì không trả
    return { items: rows.map((r) => ({ styleCode: r.StyleCode, styleLabel: r.StyleLabel, clusters: r.Clusters, assigned: blind ? null : r.Assigned })) };
  }

  /** Bảng của màn: các cụm của mã hàng ở tổ theo thứ tự trên chuyền, cụm trưởng hiện "Tên - Mã - Phòng ban" theo hồ sơ hiện tại */
  async detail(user: AuthUser, q: ClusterDetailQuery) {
    const v = await this.teamOf(user, q.teamId);
    const rows = await this.clusters.ofStyle(v.scope, v.team.Id, q.style, 'view');
    if (!rows.length) throw Errors.notFound('Mã hàng này chưa được phân cụm cho tổ.');
    const blind = await this.blind(user);
    const teamLeaders = v.leaders.get(v.team.Id) ?? [];
    const people = await this.people(v.scope, [...teamLeaders, ...(blind ? [] : rows.map((r) => r.LeaderEmployeeId).filter((x): x is number => x != null))]);
    const lineName = await this.org.lineNamer();
    const reason = await this.readOnlyReason(v, v.team);
    return {
      team: { id: v.team.Id, branchCode: v.team.BranchCode, lineCode: v.team.LineCode, lineName: lineName(v.team.LineCode) },
      teamLeaders: teamLeaders.map((id) => people.get(id)).filter((p): p is EmployeeInfo => !!p).map((p) => ({ id: p.id, code: p.code, fullName: p.fullName })),
      styleCode: q.style,
      styleLabel: rows[0].StyleLabel,
      canEdit: reason === null,
      readOnlyReason: reason,
      // Không có quyền tra danh bạ: ô Tên cụm trưởng nói lý do thay vì "không tìm thấy"
      canSearch: this.directory.canSearch(v.scope),
      items: rows.map((r) => {
        const p = r.LeaderEmployeeId != null ? people.get(r.LeaderEmployeeId) : undefined;
        return {
          id: r.Id,
          code: r.Code,
          name: r.Name,
          sortOrder: r.SortOrder,
          leaderEmployeeId: r.LeaderEmployeeId,
          // Tên, mã, phòng ban suy ra cụm trưởng: cột Tên cụm trưởng bị Ẩn, Che thì không trả (chính sách cột chỉ áp cho chính cột đó)
          ...(blind
            ? {}
            : {
                leaderCode: p?.code ?? r.LeaderEmployeeCode,
                leaderName: p?.fullName ?? null,
                leaderDepartment: p?.departmentName ?? null,
                leaderActive: p ? p.isActive : null,
              }),
        };
      }),
    };
  }

  /** Ô Tên cụm trưởng: nhân viên đang làm khớp mã, tên (không dấu); người của ĐVCS của tổ xếp trước */
  async employees(user: AuthUser, q: ClusterEmployeeQuery) {
    const v = await this.teamOf(user, q.teamId);
    const canSearch = this.directory.canSearch(v.scope);
    const found = canSearch ? await this.directory.search(v.scope, { q: q.q, branchCode: v.team.BranchCode, limit: PICK_LIMIT }) : [];
    return { canSearch, items: found.map((e) => ({ id: e.id, code: e.code, fullName: e.fullName, departmentName: e.departmentName })) };
  }

  /**
   * Lưu cụm trưởng các cụm của một mã hàng ở tổ (một transaction MES_Sewing). Khóa dòng tổ (UPDLOCK): hai lần lưu cùng tổ xếp hàng, nên
   * chỉ đọc cụm của mã hàng đang lưu, không khóa mọi cụm của tổ (review 5.18 M1); bước chép GSD sau này cũng phải khóa dòng tổ trước khi
   * ghi cụm (thứ tự tổ → cụm). Không ghi gì khi: 404 kèm `details.ids` (cụm không còn trong mã hàng của tổ); 409 kèm `details.cells`
   * (người khác vừa đổi cụm trưởng của cụm, khác `previous`); 422 (người chọn không có, đã nghỉ việc; gửi trùng cụm); 403 (A00, chưa gắn
   * nhân viên, không phải tổ trưởng của tổ, thiếu quyền tra danh bạ). Cụm gửi lên trùng cụm trưởng đang lưu thì bỏ qua. Nhật ký mỗi cụm
   * đổi một dòng, ghi sau khi commit.
   */
  async save(user: AuthUser, dto: ClusterLeaderSaveDto) {
    const scope = scopeOf(user);
    await this.teams.assertWritable(scope);
    if (new Set(dto.items.map((i) => i.id)).size !== dto.items.length) throw invalid('Một cụm chỉ được gửi một lần.');
    const employeeId = await this.users.employeeIdOf(user.userId);
    if (employeeId == null) throw denied(NOT_LINKED);
    // Như lúc đọc (teamOf): tổ trưởng chỉ thấy tổ mình, tổ khác là 404 như không có (review 5.18 L6)
    const v = await this.view(user);
    if (v.mine.size && !v.mine.has(dto.teamId)) throw Errors.notFound('Không thấy tổ này, hoặc tổ nằm ngoài phạm vi của bạn.');
    const wanted = [...new Set(dto.items.map((i) => i.leaderEmployeeId).filter((x): x is number => x != null))];
    if (wanted.length && !this.directory.canSearch(scope)) throw denied('Chọn cụm trưởng cần quyền xem Danh bạ nhân viên. Nhờ quản trị viên cấp quyền.');
    const people = await this.people(scope, wanted);
    const audits: AuditEntry[] = [];
    const result = await inTransaction(this.db, async (trx) => {
      // Ngoài phạm vi sửa (ĐVCS, chuyền) thì 404 như không có
      await this.teams.lock(scope, dto.teamId, 'update', trx);
      const team = await this.teams.getById(scope, dto.teamId, 'update', trx);
      const leaders = await this.leaders.listByParents(scope, [team.Id], 'view', trx);
      if (!leaders.some((l) => l.EmployeeId === employeeId)) throw denied(NOT_LEADER);
      const rows = await this.clusters.ofStyle(scope, team.Id, dto.style, 'update', trx);
      const byId = new Map(rows.map((r) => [r.Id, r]));
      const missing = dto.items.filter((i) => !byId.has(i.id)).map((i) => i.id);
      if (missing.length) {
        throw new AppException('NOT_FOUND', `${missing.length} cụm không còn trong mã hàng của tổ (dữ liệu Phân cụm vừa đổi) nên chưa lưu gì. Tải lại rồi chọn lại.`, 404, { ids: missing.sort((a, b) => a - b) });
      }
      const conflicts = dto.items
        .filter((i) => {
          const cur = byId.get(i.id)!.LeaderEmployeeId;
          return cur !== i.leaderEmployeeId && cur !== i.previous;
        })
        .map((i) => ({ id: i.id, leaderEmployeeId: byId.get(i.id)!.LeaderEmployeeId }));
      if (conflicts.length) {
        throw new AppException('CONFLICT', `${conflicts.length} cụm vừa được người khác đổi cụm trưởng nên chưa lưu gì. Màn đã hiện người mới, kiểm tra rồi lưu lại.`, 409, { cells: conflicts });
      }
      const changed = dto.items.filter((i) => byId.get(i.id)!.LeaderEmployeeId !== i.leaderEmployeeId);
      const bad = changed.filter((i) => i.leaderEmployeeId != null && !people.get(i.leaderEmployeeId)?.isActive);
      if (bad.length) {
        const names = bad.slice(0, 3).map((i) => byId.get(i.id)!.Name);
        throw invalid(`Cụm trưởng phải là nhân viên đang làm việc: ${names.join(', ')}${bad.length > 3 ? ` và ${bad.length - 3} cụm khác` : ''}.`, { ids: bad.map((i) => i.id) });
      }
      for (const i of changed) {
        const r = byId.get(i.id)!;
        const p = i.leaderEmployeeId != null ? people.get(i.leaderEmployeeId)! : null;
        await this.clusters.updateRow(scope, r.Id, { LeaderEmployeeId: p?.id ?? null, LeaderEmployeeCode: p?.code ?? null }, trx);
        const at = { lineCode: team.LineCode, styleCode: r.StyleCode, cluster: r.Code };
        audits.push(this.entry(user, r.Id, { ...at, leaderEmployeeId: r.LeaderEmployeeId, leaderCode: r.LeaderEmployeeCode }, { ...at, leaderEmployeeId: p?.id ?? null, leaderCode: p?.code ?? null }));
      }
      return { saved: changed.length };
    });
    await this.audit.logMany(await Promise.all(audits.map(async (a) => ({ ...a, oldValue: await this.fields.redact(RESOURCE, a.oldValue), newValue: await this.fields.redact(RESOURCE, a.newValue) }))));
    return result;
  }

  /** Cột Tên cụm trưởng có bị Ẩn, Che với người xem không */
  private async blind(user: AuthUser) {
    return (await this.fields.unreadable(user, RESOURCE, ['leaderEmployeeId'])).has('leaderEmployeeId');
  }

  /** Nhân viên theo Id qua danh bạ (theo quyền của người hỏi); không có quyền tra danh bạ thì rỗng */
  private async people(scope: Scope, ids: number[]): Promise<Map<number, EmployeeInfo>> {
    if (!ids.length || !this.directory.canSearch(scope)) return new Map();
    return new Map((await this.directory.byIds(scope, ids)).map((e) => [e.id, e]));
  }

  private entry(user: AuthUser, id: number, oldValue: unknown, newValue: unknown): AuditEntry {
    return { userId: user.userId, username: user.username, branchCode: user.branchCode, entityType: 'SewingTeamCluster', entityId: id, actionCode: 'UPDATE', oldValue, newValue, ip: user.ip };
  }
}
