// Nạp lại toàn bộ đơn hàng vào MES_Order từ bảng chép BRAVO trong MES_Sync, thay cho đơn hàng giả của seed.
// Chỉ đọc bảng chép của MES (schema bravo trong MES_Sync), không đọc database trung gian hay database BRAVO (quyết định 8.1).
// Ánh xạ dùng chung với bước nạp tăng dần sau mỗi lần đồng bộ (src/modules/order/bravo-order.mapping.ts); điểm BA chưa chốt
// dùng giả định ghi ở docs/update_docs/06-don-hang.md mục 8.2. Máy dùng thật không chạy lệnh này: backend tự nạp tăng
// dần sau mỗi đợt đồng bộ, không xóa kế hoạch (quyết định 7.7, bổ sung 12/10/2026).
//
// Kế hoạch xuất hàng, dàn chuyền, phân màu cỡ là dữ liệu MES tự lập, BRAVO không có: script sinh mô phỏng xếp kín các chuyền
// quanh hôm nay (simulate-board.ts, người lập "Lập tự động (mô phỏng)"). Bỏ phần này bằng --no-plans.
//
// Dùng: npm run load:bravo -- --yes [--no-plans]
// Chỉ SQL Server trên máy này. Xóa mọi dữ liệu đơn hàng trong MES_Order (kể cả đơn nhập tay) rồi nạp lại.
import { sql, type Kysely } from 'kysely';
import { env } from '../src/config/env';
import { lockBravoImport } from '../src/modules/order/bravo-order-import.repository';
import { buildOrders, orderNumber } from '../src/modules/order/bravo-order.mapping';
import type { OrderDatabase } from '../src/modules/order/order.types';
import { MAX_COLOR_SIZE_ROWS, SIZE_NAME } from '../src/modules/order/order.rules';
import type { CoreDatabase } from '../src/platform/database/core.types';
import { createDb } from '../src/platform/database/db';
import { factoryListFor } from '../src/platform/catalog/factory-list';
import { readBravoOrderSource, readOsmFactories } from '../src/platform/sync/bravo-order-source';
import { syncBranchesFromBravo } from './bravo-branches';
import { clearCutting } from './cutting-data';
import { clearSewingDayPlan, clearSewingPrep } from './sewing-data';
import { assertDemoMachine } from './local-db';
import { docNoSql, insertAll, localToday, readLines } from './script-db';
import { simulateBranch } from './simulate-board';
import { DEFAULT_WORK_CALENDAR, readWorkCalendars } from '../src/platform/catalog/work-calendar';

/** Con trước cha: không có xóa dây chuyền ở DB */
const ORDER_TABLES = [
  'ShipmentPlanLineColorSize',
  'ShipmentPlanLine',
  'ShipmentPlanColorSize',
  'ShipmentPlanPo',
  'ShipmentPlan',
  'SalesOrderPoColorSize',
  'SalesOrderPo',
  'SalesOrder',
] as const;

export async function clearOrderData(trx: Kysely<OrderDatabase>) {
  for (const table of ORDER_TABLES) {
    await trx.deleteFrom(table).execute();
    // Bảng chưa từng có dòng nào thì RESEED 0 làm dòng đầu mang Id 0: chỉ đặt lại khi bảng đã dùng
    await sql`IF (SELECT last_value FROM sys.identity_columns WHERE object_id = OBJECT_ID(${`dbo.${table}`})) IS NOT NULL
              DBCC CHECKIDENT (${sql.lit(`dbo.${table}`)}, RESEED, 0) WITH NO_INFOMSGS`.execute(trx);
  }
}

export async function loadBravoOrders({ plans = !process.argv.includes('--no-plans') }: { plans?: boolean } = {}) {
  assertDemoMachine('load-bravo-orders');
  // Xóa và chèn cả bảng trong một transaction: giới hạn mỗi câu 10 phút thay vì 15 giây mặc định
  const long = { requestTimeoutMs: 10 * 60_000 };
  const core = createDb<CoreDatabase>(env.db.coreName);
  const sync = createDb<any>(env.db.syncName, long);
  const order = createDb<OrderDatabase>(env.db.orderName, long);
  try {
    // Đơn hàng lấy hết theo BRAVO (quyết định 6.1, 7.2): chép đủ ĐVCS của danh mục chi nhánh trước, để không bỏ đơn của ĐVCS MES chưa có
    const imported = await syncBranchesFromBravo(core);
    if (imported?.added.length) console.log(`Đã thêm đơn vị cơ sở theo BRAVO: ${imported.added.map((b) => b.code).join(', ')}.`);
    // Chuyền của dàn chuyền mô phỏng: bộ phận tích "Xưởng sản xuất" ở MES_Hr (phase 5.10); reset-demo nạp lại sơ đồ tổ chức trước
    const { branches, linesOf, plannerId } = await readLines(core);
    const calendars = await readWorkCalendars(core);
    if (!branches.length) throw new Error('MES_Core chưa có đơn vị cơ sở nào đang dùng: chạy npm run seed trước.');
    // Đơn vị tính BRAVO (mã không dấu) đổi sang tên theo danh mục Đơn vị tính (Quản trị › Danh mục hệ thống)
    const unitNames = new Map(
      (await core.selectFrom('SysCatalogItem as i').innerJoin('SysCatalog as c', 'c.Id', 'i.CatalogId').select(['i.Code', 'i.Name']).where('c.Code', '=', 'UNIT').execute()).map((u) => [u.Code, u.Name]),
    );

    const ready = await sql<{ N: number }>`SELECT COUNT(*) AS N FROM bravo.DM_SanPhamDonHang`.execute(sync).catch(() => null);
    if (!ready?.rows[0]?.N) {
      throw new Error(`Bảng chép BRAVO trong ${env.db.syncName} chưa có dữ liệu: vào màn Đồng bộ dữ liệu, bấm Đồng bộ (cần ThongTinPO, ThongTinPO_MauCo và các danh mục) rồi chạy lại.`);
    }
    const source = await readBravoOrderSource(sync, branches);
    // Nhà máy SX theo OSM (quyết định 7.6). Máy demo chưa đồng bộ OSM: giữ giả định cũ (nhà máy SX cùng mã chi nhánh nhận đơn, nếu
    // đang dùng) để tài khoản mẫu thấy đơn ở Chọn mã hàng; giá trị này không khóa sửa tay
    const osmFactories = await readOsmFactories(sync);
    const sameCode = osmFactories
      ? null
      : new Set((await core.selectFrom('SysProductionFactory').select('Code').where('IsActive', '=', true).execute()).map((f) => f.Code));
    if (!osmFactories) console.log('Chưa có dữ liệu OSM trong MES_Sync: Nhà máy SX tạm theo mã chi nhánh nhận đơn (máy demo).');
    const factoryOf = (productId: number, branchCode: string) =>
      osmFactories ? factoryListFor(osmFactories.get(productId)).code : sameCode!.has(branchCode) ? branchCode : null;
    const used = new Set<string>();
    const { built, skipped } = buildOrders(source, (o) => orderNumber(o.Name, o.ProductId, o.BranchCode, used), unitNames);
    const today = localToday();
    const stats: Record<string, Record<string, number>> = {};
    const bump = (b: string, k: string, n = 1) => ((stats[b] ??= {})[k] = (stats[b][k] ?? 0) + n);

    await order.transaction().execute(async (trx) => {
      // Backend đang nạp tăng dần thì chờ lần đó xong; lấy khóa trước khi xóa gì (kể cả phần May dưới đây)
      await lockBravoImport(trx);
      // Xóa bản chép Kế hoạch chuẩn bị SX trước khi nạp (Id dòng dàn chuyền sẽ được đánh số lại, quyết định 9.2). Làm trước, không
      // làm sau: lượt mở màn xen giữa thì chép lại dòng cũ, sau khi nạp dấu phiên bản đổi và lượt sau thay hết
      const prep = await clearSewingPrep();
      if (prep) console.log(`Đã xóa ${prep} dòng Kế hoạch chuẩn bị SX cũ trong ${env.db.sewingName} (danh mục bước giữ nguyên).`);
      const dayPlans = await clearSewingDayPlan();
      if (dayPlans) console.log(`Đã xóa ${dayPlans} kế hoạch theo ngày (chuyền × ngày) của Kế hoạch may cũ trong ${env.db.sewingName}.`);
      // Id kế hoạch xuất hàng được đánh số lại: số cắt cũ không còn đúng kế hoạch nào (quyết định 13.4)
      const cuts = await clearCutting();
      if (cuts.plans || cuts.supplies) console.log(`Đã xóa ${cuts.plans} kế hoạch, ${cuts.entries} dòng số cắt, ${cuts.supplies} lệnh cấp BTP cũ trong ${env.db.cuttingName}.`);
      await clearOrderData(trx);

      const orderRows = await insertAll(
        trx,
        'SalesOrder',
        built.map((o) => ({
          OrderNo: o.orderNo,
          ...o.fields,
          UnitPrice: null,
          CmPrice: null,
          SyncedAt: o.syncedAt,
          StatusCode: o.closed ? 'DONE' : 'NEW',
          SourceProductId: o.productId,
          SourceHash: o.hash,
          BranchCode: o.branchCode,
          ProductionFactoryCode: factoryOf(o.productId, o.branchCode),
          IsFactoryFromOsm: osmFactories != null && factoryOf(o.productId, o.branchCode) != null,
          CreatedBy: null,
        })),
        ['Id', 'SourceProductId'],
      );
      const orderId = new Map(orderRows.map((r) => [r.SourceProductId as number, r.Id as number]));
      for (const o of built) {
        bump(o.branchCode, 'đơn hàng');
        if (factoryOf(o.productId, o.branchCode) == null) bump(o.branchCode, 'chưa có Nhà máy SX (chọn ở Thông tin đơn hàng)');
        if (o.closed) bump(o.branchCode, 'đã đóng lệnh');
      }

      const poList = built.flatMap((o) => o.pos.map((p) => ({ o, p })));
      const poRows = await insertAll(
        trx,
        'SalesOrderPo',
        poList.map(({ o, p }, i) => ({
          SalesOrderId: orderId.get(o.productId),
          PoCode: `~${i}`,
          PoNumber: p.poNumber,
          CustomerName: o.fields.CustomerName,
          StyleCode: o.fields.StyleCode,
          Qty: p.qty,
          Destination: p.destination,
          PackingListCode: null,
          CustomsDeclarationNo: null,
          SyncedAt: p.syncedAt,
          ShipDate: p.shipDate,
          // Đơn đã đóng lệnh bên BRAVO: PO coi như đã xác nhận (khóa sửa màu cỡ)
          StatusCode: o.closed ? 'CONFIRMED' : 'DRAFT',
          ConfirmedAt: o.closed ? p.syncedAt : null,
          ConfirmedBy: null,
          BranchCode: o.branchCode,
          CreatedBy: null,
        })),
        ['Id', 'PoCode'],
      );
      const poId = new Map(poRows.map((r) => [r.PoCode as string, r.Id as number]));
      for (const { o } of poList) bump(o.branchCode, 'PO');

      const cellRows = poList.flatMap(({ o, p }, i) =>
        p.cells.map((c, k) => ({ SalesOrderPoId: poId.get(`~${i}`), ColorName: c.color, SizeName: c.size, Qty: c.qty, SortOrder: k, BranchCode: o.branchCode, CreatedBy: null })),
      );
      await insertAll(trx, 'SalesOrderPoColorSize', cellRows);
      for (const r of cellRows) bump(r.BranchCode, 'ô màu cỡ');
      // Dữ liệu nguồn mà màn hình không lưu lại được theo quy tắc nhập tay (order.dto.ts): báo để biết trước, không chặn nạp
      for (const { o, p } of poList) {
        if (p.cells.length > MAX_COLOR_SIZE_ROWS) bump(o.branchCode, `PO quá ${MAX_COLOR_SIZE_ROWS} ô màu cỡ`);
        const odd = p.cells.filter((c) => !SIZE_NAME.test(c.size)).length;
        if (odd) bump(o.branchCode, 'ô có cỡ ngoài quy tắc nhập tay', odd);
      }

      if (plans) {
        for (const b of branches) {
          const s = await simulateBranch(trx, { branch: b, lines: linesOf(b), today, plannerId, calendar: calendars.get(b) ?? DEFAULT_WORK_CALENDAR });
          if (s.plans) bump(b, 'kế hoạch mô phỏng', s.plans);
          if (s.lines) bump(b, 'dòng dàn chuyền mô phỏng', s.lines);
        }
      }

      // Số PO theo Id như khi tạo trên màn hình (PO-<nhà máy>-<Id 6 số>); số kế hoạch do simulateBranch đặt. Không lọc
      // BranchCode: bảng vừa xóa sạch rồi nạp lại mọi nhà máy, mỗi dòng lấy mã nhà máy của chính nó
      await sql`UPDATE dbo.SalesOrderPo SET PoCode = ${sql.raw(docNoSql('PO'))} WHERE PoCode LIKE '~%'`.execute(trx);
    });

    for (const [b, n] of skipped) bump(b, 'chưa nạp (chưa có PO)', n);
    // ĐVCS có trong đơn hàng BRAVO mà MES chưa có hoặc đang tắt: báo số lượng để biết
    const others = await sql<{ BranchCode: string; N: number }>`
      SELECT LTRIM(RTRIM(BranchCode)) AS BranchCode, COUNT(*) AS N FROM bravo.DM_SanPhamDonHang
      WHERE LTRIM(RTRIM(ISNULL(BranchCode, ''))) NOT IN (${sql.join(branches)}) GROUP BY LTRIM(RTRIM(BranchCode))`.execute(sync);
    for (const r of others.rows) bump(r.BranchCode || '(trống)', 'chưa nạp (MES chưa có hoặc đang tắt đơn vị cơ sở này)', r.N);

    await core
      .insertInto('SysAuditLog')
      .values({ EntityType: 'System', ActionCode: 'BRAVO_LOAD', NewValue: JSON.stringify({ by: 'scripts/load-bravo-orders.ts', plans, stats }) } as any)
      .execute();
    return stats;
  } finally {
    await core.destroy();
    await sync.destroy();
    await order.destroy();
  }
}

async function main() {
  assertDemoMachine('load-bravo-orders');
  if (!process.argv.includes('--yes')) {
    console.log(
      [
        `Lệnh này xóa mọi dữ liệu đơn hàng trong ${env.db.orderName} (máy chủ ${env.db.host}), kể cả đơn nhập tay,`,
        `và Kế hoạch chuẩn bị SX trong ${env.db.sewingName} (ngày đã nhập; danh mục bước giữ nguyên),`,
        `và Đồng bộ tiến độ cắt trong ${env.db.cuttingName} (số cắt đã nhập),`,
        `rồi nạp đơn hàng, PO, màu cỡ thật từ bảng chép BRAVO trong ${env.db.syncName}.`,
        'Kế hoạch xuất hàng và dàn chuyền được sinh mô phỏng, xếp kín các chuyền quanh hôm nay (bỏ bằng --no-plans).',
        'Chạy lại với: npm run load:bravo -- --yes',
      ].join('\n'),
    );
    return;
  }
  const stats = await loadBravoOrders();
  console.log('Đã nạp dữ liệu BRAVO:');
  console.table(stats);
  console.warn(
    [
      'Lưu ý: database giờ chứa dữ liệu thật (khách hàng, PO, số lượng). Backend mặc định nghe trên mọi địa chỉ (HOST=0.0.0.0)',
      'và các tài khoản demo dùng chung DEMO_PASSWORD: ai trong mạng LAN biết mật khẩu demo đều xem được.',
      'Nên đặt HOST=127.0.0.1 trong backend/.env, hoặc đổi DEMO_PASSWORD mạnh rồi chạy npm run seed -- --reset-passwords.',
    ].join('\n'),
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Nạp dữ liệu BRAVO lỗi:', e.message ?? e);
    process.exit(1);
  });
}
