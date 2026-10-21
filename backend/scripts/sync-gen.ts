// Sinh migration MES_Sync cho các view nguồn: bảng chép (schema theo hệ thống: bravo, osm), thủ tục chép tăng dần, dòng SyncSource.
// Đọc cấu trúc cột thật của view trong database nguồn (scripts/source-databases.ts: BRAVO ở DB_TRUNGGIAN_NAME; OSM ở DB_OSM_NAME,
// v_OSMData ở DB_OSM_APP_NAME), qua linked server khi database ở máy khác; chỉ đọc danh mục hệ thống.
// Dùng: npx tsx scripts/sync-gen.ts --out migrations/MES_Sync/NNNN_ten.sql   (mọi nguồn trong SOURCES)
//       npx tsx scripts/sync-gen.ts DM_MauSac DM_Size --out ...             (chỉ một số nguồn, khi thêm nguồn mới)
//       npx tsx scripts/sync-gen.ts --procs-only --out ...                  (chỉ sinh lại thủ tục chép, CREATE OR ALTER: sửa thủ tục
//                                                                          đã chạy mà không đụng bảng và SyncSource)
// Dùng --out thay cho "> file": PowerShell 5.1 ghi "> file" thành UTF-16 và làm hỏng chữ tiếng Việt.
// Thêm nguồn: khai báo trong SOURCES, sinh migration MỚI chỉ cho nguồn đó (không sửa migration đã chạy).
import { writeFileSync } from 'fs';
import { sql } from 'kysely';
import { createDb } from '../src/platform/database/db';
import { assertSourceNames, sourceDatabaseOf } from './source-databases';

export type SourceSystem = 'BRAVO' | 'OSM';

export interface SourceDef {
  /** Hệ thống nguồn; mặc định BRAVO */
  system?: SourceSystem;
  /** View trong database nguồn */
  view: string;
  name: string;
  group: 'CATALOG' | 'ORDER';
  /** KEY: khóa duy nhất, cập nhật từng dòng. PARTITION: không có khóa tin được, thay cả nhóm dòng có thay đổi. */
  match: 'KEY' | 'PARTITION';
  columns: string[];
  /** FULL khi view không có cột thời gian dùng được làm mốc */
  mode: 'INCREMENTAL' | 'FULL';
  description?: string;
}

// Khóa đã kiểm trên dữ liệu thật ngày 10/10/2026 (đếm distinct = tổng số dòng), trừ 4 view đang lỗi quyền
// (KHACHHANG, DiaDiemGiaoHang, ThongTinPO, ThongTinPO_MauCo): khóa theo mô tả của BRAVO, nhóm theo sản phẩm/PO.
export const SOURCES: SourceDef[] = [
  { view: 'vDM_CHINHANH', name: 'Chi nhánh (nhà máy)', group: 'CATALOG', match: 'KEY', columns: ['BranchCode'], mode: 'FULL', description: 'View không có cột thời gian, lấy toàn bộ mỗi lần (5 dòng)' },
  { view: 'vDM_KHACHHANG', name: 'Khách hàng', group: 'CATALOG', match: 'KEY', columns: ['CustomerId'], mode: 'INCREMENTAL' },
  { view: 'vDM_MuaKinhDoanh', name: 'Mùa kinh doanh', group: 'CATALOG', match: 'KEY', columns: ['SalesSeasonId'], mode: 'INCREMENTAL' },
  { view: 'vDM_MauSac', name: 'Màu sắc', group: 'CATALOG', match: 'KEY', columns: ['ColorId'], mode: 'INCREMENTAL' },
  { view: 'vDM_Size', name: 'Size', group: 'CATALOG', match: 'KEY', columns: ['SizeId'], mode: 'FULL', description: 'CreatedAt/ModifiedAt của view luôn là 01/01/1900, không dùng làm mốc được' },
  { view: 'vDM_NHANVIEN', name: 'Nhân viên', group: 'CATALOG', match: 'KEY', columns: ['EmployeeId'], mode: 'INCREMENTAL' },
  { view: 'vDM_TEAM', name: 'Nhóm (team)', group: 'CATALOG', match: 'KEY', columns: ['TeamId'], mode: 'INCREMENTAL' },
  { view: 'vDM_NGUOISUDUNG', name: 'Người dùng BRAVO', group: 'CATALOG', match: 'KEY', columns: ['UserId'], mode: 'INCREMENTAL' },
  { view: 'vDM_LOOKUP', name: 'Mã tra cứu', group: 'CATALOG', match: 'KEY', columns: ['ParentCode', 'Code'], mode: 'INCREMENTAL' },
  { view: 'vDM_DiaDiemGiaoHang', name: 'Địa điểm giao hàng', group: 'CATALOG', match: 'KEY', columns: ['DestinationId'], mode: 'INCREMENTAL' },
  { view: 'vDM_QuocGia', name: 'Quốc gia', group: 'CATALOG', match: 'KEY', columns: ['RowId_Nationality'], mode: 'INCREMENTAL' },
  { view: 'vDM_PhuongThucGiaoHang', name: 'Phương thức giao hàng', group: 'CATALOG', match: 'KEY', columns: ['Id'], mode: 'FULL', description: 'View không có cột thời gian, lấy toàn bộ mỗi lần (17 dòng)' },
  { view: 'vDM_SanPhamDonHang', name: 'Sản phẩm đơn hàng', group: 'ORDER', match: 'KEY', columns: ['ProductId'], mode: 'INCREMENTAL' },
  { view: 'vDM_POKH', name: 'PO khách hàng', group: 'ORDER', match: 'KEY', columns: ['CustomerPOId'], mode: 'INCREMENTAL' },
  { view: 'vThongTinPO', name: 'Thông tin PO', group: 'ORDER', match: 'PARTITION', columns: ['ProductId'], mode: 'INCREMENTAL', description: 'Thay cả nhóm dòng của sản phẩm có thay đổi' },
  { view: 'vThongTinPO_MauCo', name: 'Màu cỡ theo PO', group: 'ORDER', match: 'PARTITION', columns: ['ProductId', 'CustomerPONo'], mode: 'INCREMENTAL', description: 'Thay cả nhóm dòng của PO có thay đổi' },
  { view: 'vBangCanDoiSanXuat', name: 'Bảng cân đối sản xuất', group: 'ORDER', match: 'KEY', columns: ['ProduceId'], mode: 'INCREMENTAL' },
  { view: 'vBangCanDoiSanXuat_MauCo_Tong', name: 'Màu cỡ bảng cân đối sản xuất', group: 'ORDER', match: 'PARTITION', columns: ['ProduceId'], mode: 'INCREMENTAL', description: 'Thay cả nhóm dòng của bảng cân đối có thay đổi' },
  // OSM (12/10/2026): nhà máy sản xuất của đơn hàng theo SO và mã hàng. View không có cột thời gian; có dòng trùng nguyên dòng
  // nên không dùng khóa (SO, StyleNo) được, chép theo nhóm SO
  {
    system: 'OSM',
    view: 'vOSMDataFty',
    name: 'Nhà máy sản xuất của đơn hàng (OSM)',
    group: 'ORDER',
    match: 'PARTITION',
    columns: ['SO'],
    mode: 'FULL',
    description: 'View không có cột thời gian, lấy toàn bộ mỗi lần (khoảng 3.500 dòng). FtyName là danh sách nhà máy cách nhau dấu phẩy',
  },
  // OSM (12/10/2026, task 5.9.12): phân bổ PO theo nhà máy cho màn Quản trị đơn hàng › Phân bổ PO, view gốc của database ứng dụng
  // OSM (DB_OSM_APP_NAME). Không có cột thời gian, không có khóa (khoảng 1/6 số dòng trùng nguyên dòng): chép theo nhóm PO
  {
    system: 'OSM',
    view: 'v_OSMData',
    name: 'Phân bổ PO theo nhà máy (OSM)',
    group: 'ORDER',
    match: 'PARTITION',
    columns: ['PO'],
    mode: 'FULL',
    description: 'View không có cột thời gian, lấy toàn bộ mỗi lần (khoảng 30.000 dòng, có dòng trùng nguyên dòng). Màn Quản trị đơn hàng › Phân bổ PO đọc bảng chép này',
  },
];

/** Schema của bảng chép, synonym, thủ tục theo hệ thống nguồn */
export const schemaOf = (system: string) => (system === 'OSM' ? 'osm' : 'bravo');
/** Tên database nguồn trong câu báo lỗi của thủ tục chép */
const originOf = (system: string) => (system === 'OSM' ? 'database OSM' : 'database trung gian');

export interface Col {
  name: string;
  /** Kiểu hệ thống (TYPE_NAME(system_type_id)), không phải kiểu alias */
  type: string;
  len: number;
  precision: number;
  scale: number;
  /** Collation của cột chuỗi bên nguồn; NULL với cột không phải chuỗi */
  collation: string | null;
}

const q = (n: string) => `[${n.replace(/]/g, ']]')}]`;
const lit = (s: string | null | undefined) => (s == null ? 'NULL' : `N'${s.replace(/'/g, "''")}'`);
/** Tên bảng chép theo tên view: bỏ tiền tố v (vDM_MauSac → DM_MauSac, v_OSMData → OSMData) */
export const tableName = (view: string) => view.replace(/^v_?/, '');
const STRING = new Set(['nvarchar', 'nchar', 'varchar', 'char']);
/** Chốt xóa hàng loạt khi chép tăng dần: dừng nếu định xóa quá số dòng này VÀ quá tỷ lệ này của bảng chép */
const MASS_DELETE_MIN_ROWS = 100;
const MASS_DELETE_PERCENT = 20;
// Không so sánh được bằng EXCEPT/=, hoặc không chèn được giá trị đọc ra
const UNSUPPORTED = new Set(['text', 'ntext', 'image', 'xml', 'geography', 'geometry', 'hierarchyid', 'timestamp', 'sql_variant']);

function typeOf(c: Col): string {
  const t = c.type.toLowerCase();
  if (UNSUPPORTED.has(t)) throw new Error(`Cột ${c.name} kiểu ${t} không chép được; view cần đổi sang kiểu so sánh được (ví dụ (n)varchar(max))`);
  let out: string;
  if (t === 'nvarchar' || t === 'nchar') out = `${t.toUpperCase()}(${c.len === -1 ? 'MAX' : c.len / 2})`;
  else if (t === 'varchar' || t === 'char' || t === 'varbinary' || t === 'binary') out = `${t.toUpperCase()}(${c.len === -1 ? 'MAX' : c.len})`;
  else if (t === 'decimal' || t === 'numeric') out = `${t.toUpperCase()}(${c.precision}, ${c.scale})`;
  else if (t === 'datetime2' || t === 'time' || t === 'datetimeoffset') out = `${t.toUpperCase()}(${c.scale})`;
  else out = t.toUpperCase();
  // Giữ collation của nguồn: không vỡ ký tự VARCHAR khác bảng mã, so khớp giữa bảng tạm và bảng chép không xung đột collation
  if (STRING.has(t) && c.collation) {
    if (!/^[A-Za-z0-9_]+$/.test(c.collation)) throw new Error(`Collation lạ ở cột ${c.name}: ${c.collation}`);
    out += ` COLLATE ${c.collation}`;
  }
  return out;
}

/**
 * Sinh SQL cho một nguồn. `system` đổi mã và hệ thống trong SyncSource (test dùng 'TEST'); schema theo hệ thống (OSM: osm,
 * còn lại: bravo).
 */
export function render(src: SourceDef, cols: Col[], sortOrder: number, system: string = src.system ?? 'BRAVO', opts: { procsOnly?: boolean } = {}): string {
  const t = tableName(src.view);
  const schema = schemaOf(system);
  const origin = originOf(system);
  const target = `${schema}.${q(t)}`;
  const synonym = `${schema}.${q(`src_${t}`)}`;
  const proc = `${schema}.${q(`usp_Sync_${t}`)}`;
  const names = cols.map((c) => c.name);
  const col = (n: string) => cols.find((c) => c.name === n)!;
  for (const k of src.columns) if (!names.includes(k)) throw new Error(`${src.view} không có cột khóa ${k}`);
  const hasStamp = names.includes('ModifiedAt') && names.includes('CreatedAt');
  if (src.mode === 'INCREMENTAL' && !hasStamp) throw new Error(`${src.view} không có ModifiedAt/CreatedAt để chép tăng dần`);
  const isKey = (n: string) => src.match === 'KEY' && src.columns.includes(n);
  const list = (prefix = '') => names.map((n) => `${prefix}${q(n)}`).join(', ');
  const keyList = src.columns.map(q).join(', ');
  const keyOn = (a: string, b: string) => src.columns.map((k) => `${a}.${q(k)} = ${b}.${q(k)}`).join(' AND ');
  // Khớp nhóm an toàn với NULL: INTERSECT coi NULL bằng NULL
  const partOn = (a: string, b: string) => `EXISTS (SELECT ${src.columns.map((k) => `${a}.${q(k)}`).join(', ')} INTERSECT SELECT ${src.columns.map((k) => `${b}.${q(k)}`).join(', ')})`;
  // So nội dung theo byte: collation CI coi "Nike" = "NIKE" và bỏ khoảng trắng cuối, sẽ bỏ sót thay đổi
  // Đặt tên cột: biểu thức không tên trong bảng dẫn xuất (đếm bằng EXCEPT) bị SQL Server từ chối (lỗi 8155)
  const exact = (prefix: string) => names.map((n) => (STRING.has(col(n).type.toLowerCase()) ? `CAST(${prefix}${q(n)} AS VARBINARY(MAX)) AS ${q(n)}` : `${prefix}${q(n)}`)).join(', ');
  const changed = (a: string, b: string) => `EXISTS (SELECT ${exact(`${a}.`)} EXCEPT SELECT ${exact(`${b}.`)})`;
  const since = src.mode === 'INCREMENTAL' ? `[ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt` : '';
  const defs = (ns: string[], nullable: (n: string) => boolean, indent = '    ') => ns.map((n) => `${indent}${q(n)} ${typeOf(col(n))} ${nullable(n) ? 'NULL' : 'NOT NULL'}`).join(',\n');
  const guardEmpty = (what: string) =>
    `IF NOT EXISTS (SELECT 1 FROM ${what}) AND EXISTS (SELECT 1 FROM ${target})\n    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở ${origin}.', 1;`;
  const guardKeys = (what: string) => [
    `IF EXISTS (SELECT 1 FROM ${what} WHERE ${src.columns.map((k) => `${q(k)} IS NULL`).join(' OR ')})\n    THROW 50003, N'View nguồn có dòng thiếu khóa (${src.columns.join(', ')}). Không chép để tránh ghi sai dòng.', 1;`,
    `IF EXISTS (SELECT 1 FROM ${what} GROUP BY ${keyList} HAVING COUNT(*) > 1)\n    THROW 50001, N'View nguồn trả về khóa trùng (${src.columns.join(', ')}). Không chép để tránh ghi sai dòng; báo bên quản lý ${origin}.', 1;`,
  ];
  // Chép tăng dần là nút bấm thường ngày, không hỏi lại: nếu đối soát định xóa nhiều dòng (view trả thiếu, lỗi bên nguồn)
  // thì dừng; xóa thật thì dùng Chép lại toàn bộ (có xác nhận)
  const guardMassDelete = (gone: string) =>
    `DECLARE @Gone INT = (SELECT COUNT(*) FROM ${target} t WHERE ${gone}), @Have INT = (SELECT COUNT(*) FROM ${target});\n` +
    `    IF @Gone > ${MASS_DELETE_MIN_ROWS} AND @Gone * 100 > @Have * ${MASS_DELETE_PERCENT}\n    BEGIN\n` +
    `      DECLARE @GoneMsg NVARCHAR(400) = CONCAT(N'Lần đồng bộ này sẽ xóa ', @Gone, N'/', @Have, N' dòng vì không còn bên nguồn (quá ${MASS_DELETE_PERCENT}% bảng chép). Dừng lại để kiểm tra view ở ${origin}; nếu bên ${system === 'OSM' ? 'OSM' : 'BRAVO'} xóa thật thì dùng Chép lại toàn bộ.');\n` +
    `      THROW 50004, @GoneMsg, 1;\n    END;`;

  const out: string[] = [];
  out.push(`-- ===== ${src.view} → ${target}: ${src.name} =====`);
  if (opts.procsOnly) {
    // bỏ qua bảng chép
  } else if (src.match === 'KEY') {
    out.push(`CREATE TABLE ${target} (\n${defs(names, (n) => !isKey(n), '  ')},\n  [SyncedAt] DATETIME2(3) NOT NULL,\n  [SyncRunId] BIGINT NULL,\n  CONSTRAINT ${q(`PK_${t}`)} PRIMARY KEY (${keyList})\n);`);
  } else {
    out.push(`CREATE TABLE ${target} (\n  [SyncRowId] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT ${q(`PK_${t}`)} PRIMARY KEY,\n${defs(names, () => true, '  ')},\n  [SyncedAt] DATETIME2(3) NOT NULL,\n  [SyncRunId] BIGINT NULL\n);`);
    out.push(`CREATE INDEX ${q(`IX_${t}_Partition`)} ON ${target} (${keyList});`);
  }
  if (!opts.procsOnly) out.push('GO', '');

  const body: string[] = [];
  body.push(`  CREATE TABLE #src (\n${defs(names, () => true)}\n  );`);
  if (src.match === 'KEY') {
    body.push(
      `  CREATE TABLE #alive (\n${defs(src.columns, () => true)}\n  );`,
      `  INSERT INTO #src (${list()})\n  SELECT ${list()} FROM ${synonym}${since ? `\n  WHERE @SinceAt IS NULL OR ${since}` : ''};`,
    );
    if (src.mode === 'INCREMENTAL') {
      body.push(
        `  IF @SinceAt IS NOT NULL\n  BEGIN\n    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép\n    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót). Khóa NULL hoặc trùng ở đây cũng dừng, không thì xóa nhầm dòng.\n    INSERT INTO #alive (${keyList}) SELECT ${keyList} FROM ${synonym};\n    ${guardKeys('#alive').join('\n    ')}\n    ${guardEmpty('#alive')}\n    ${guardMassDelete(`NOT EXISTS (SELECT 1 FROM #alive a WHERE ${keyOn('a', 't')})`)}\n    INSERT INTO #src (${list()})\n    SELECT ${list('v.')} FROM ${synonym} v\n    WHERE EXISTS (SELECT 1 FROM #alive a WHERE ${keyOn('a', 'v')} AND NOT EXISTS (SELECT 1 FROM ${target} t WHERE ${keyOn('t', 'a')}))\n      AND NOT EXISTS (SELECT 1 FROM #src s WHERE ${keyOn('s', 'v')});\n  END;`,
      );
    }
    body.push(
      '  SET @ReadCount = (SELECT COUNT(*) FROM #src);',
      ...guardKeys('#src').map((g) => `  ${g}`),
      `  IF @SinceAt IS NULL\n    ${guardEmpty('#src')}`,
    );
  } else if (src.mode === 'FULL') {
    // Chép toàn bộ mỗi lần (view không có cột thời gian): không có nhánh chép tăng dần, không cần #keys, #alive
    body.push(
      `  INSERT INTO #src (${list()}) SELECT ${list()} FROM ${synonym};\n  ${guardEmpty('#src')}`,
      '  SET @ReadCount = (SELECT COUNT(*) FROM #src);',
    );
  } else {
    body.push(
      `  CREATE TABLE #keys (\n${defs(src.columns, () => true)}\n  );`,
      `  CREATE TABLE #alive (\n${defs(src.columns, () => true)},\n    [RowCnt] INT NOT NULL\n  );`,
      `  IF @SinceAt IS NULL\n  BEGIN\n    INSERT INTO #src (${list()}) SELECT ${list()} FROM ${synonym};\n    ${guardEmpty('#src')}\n  END\n  ELSE\n  BEGIN\n    -- Nhóm có dòng đổi thì đọc lại cả nhóm\n    INSERT INTO #keys (${keyList}) SELECT DISTINCT ${keyList} FROM ${synonym} WHERE ${since};\n    -- Đối soát số dòng từng nhóm (chỉ đọc cột nhóm): nhóm mất dòng, dòng đổi sang nhóm khác, nhóm thiếu ngày tháng,\n    -- nhóm đã bị xóa bên nguồn đều lệch số dòng với bảng chép, nên cũng được đọc lại hoặc xóa\n    INSERT INTO #alive (${keyList}, [RowCnt]) SELECT ${keyList}, COUNT(*) FROM ${synonym} GROUP BY ${keyList};\n    ${guardEmpty('#alive')}\n    ${guardMassDelete(`NOT EXISTS (SELECT 1 FROM #alive a WHERE ${partOn('a', 't')})`)}\n    INSERT INTO #keys (${keyList})\n    SELECT ${keyList} FROM (\n      SELECT ${keyList}, [RowCnt] FROM #alive\n      EXCEPT SELECT ${keyList}, COUNT(*) FROM ${target} GROUP BY ${keyList}\n    ) d;\n    INSERT INTO #keys (${keyList})\n    SELECT ${keyList} FROM (SELECT ${keyList} FROM ${target} EXCEPT SELECT ${keyList} FROM #alive) d;\n    INSERT INTO #src (${list()})\n    SELECT ${list('v.')} FROM ${synonym} v WHERE EXISTS (SELECT 1 FROM #keys k WHERE ${partOn('k', 'v')});\n  END;`,
      '  SET @ReadCount = (SELECT COUNT(*) FROM #src);',
    );
  }
  body.push(
    hasStamp
      ? `  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);`
      : '  SET @MaxStampAt = NULL;',
  );

  if (src.match === 'KEY') {
    const inSet = src.mode === 'INCREMENTAL' ? '@SinceAt IS NOT NULL' : '1 = 0';
    body.push(
      '  BEGIN TRANSACTION;',
      `  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)\n  DELETE t FROM ${target} t\n  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE ${keyOn('s', 't')}))\n     OR (${inSet} AND NOT EXISTS (SELECT 1 FROM #alive a WHERE ${keyOn('a', 't')}));`,
      '  SET @DeletedCount = @@ROWCOUNT;',
    );
    body.push(
      `  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ. Ghi cả cột khóa: khóa chỉ đổi\n  -- hoa/thường hoặc khoảng trắng cuối vẫn khớp (khóa chính theo collation CI) nên phải ghi lại giá trị mới`,
      `  UPDATE t SET ${names.map((n) => `t.${q(n)} = s.${q(n)}`).join(', ')}, t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId\n  FROM ${target} t JOIN #src s ON ${keyOn('s', 't')}\n  WHERE ${changed('s', 't')};`,
      '  SET @UpdatedCount = @@ROWCOUNT;',
    );
    body.push(
      `  INSERT INTO ${target} (${list()}, [SyncedAt], [SyncRunId])\n  SELECT ${list('s.')}, @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM ${target} t WHERE ${keyOn('s', 't')});`,
      '  SET @InsertedCount = @@ROWCOUNT;',
      '  COMMIT TRANSACTION;',
    );
  } else {
    // Chép toàn bộ: thay cả bảng chép
    const inScope = (a: string) => (src.mode === 'FULL' ? '1 = 1' : `(@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE ${partOn('k', a)}))`);
    body.push(
      `  -- Số liệu báo cáo (gần đúng, nhóm không có khóa dòng): dòng của nhóm mới; dòng mới hoặc đổi trong nhóm đã có; dòng cũ không còn`,
      `  SELECT @InsertedCount = COUNT(*) FROM #src s WHERE NOT EXISTS (SELECT 1 FROM ${target} t WHERE ${partOn('s', 't')});`,
      `  SELECT @UpdatedCount = COUNT(*) FROM (\n    SELECT ${exact('s.')} FROM #src s WHERE EXISTS (SELECT 1 FROM ${target} t WHERE ${partOn('s', 't')})\n    EXCEPT SELECT ${exact('t.')} FROM ${target} t WHERE ${inScope('t')}\n  ) d;`,
      `  SELECT @DeletedCount = COUNT(*) FROM (\n    SELECT ${exact('t.')} FROM ${target} t WHERE ${inScope('t')}\n    EXCEPT SELECT ${exact('s.')} FROM #src s\n  ) d;`,
      '  SET @DeletedCount = CASE WHEN @DeletedCount > @UpdatedCount THEN @DeletedCount - @UpdatedCount ELSE 0 END;',
      '  BEGIN TRANSACTION;',
      `  DELETE t FROM ${target} t WHERE ${inScope('t')};`,
      `  INSERT INTO ${target} (${list()}, [SyncedAt], [SyncRunId])\n  SELECT ${list('s.')}, @Now, @RunId FROM #src s;`,
      '  COMMIT TRANSACTION;',
    );
  }
  body.push(`  SELECT @TargetCount = COUNT(*) FROM ${target};`);

  out.push(
    `CREATE OR ALTER PROCEDURE ${proc}\n  @SinceAt DATETIME2(0) = NULL,\n  @RunId BIGINT = NULL,\n  @ReadCount INT = NULL OUTPUT,\n  @InsertedCount INT = NULL OUTPUT,\n  @UpdatedCount INT = NULL OUTPUT,\n  @DeletedCount INT = NULL OUTPUT,\n  @MaxStampAt DATETIME2(0) = NULL OUTPUT,\n  @TargetCount INT = NULL OUTPUT\nAS\nBEGIN\n  SET NOCOUNT ON;\n  SET XACT_ABORT ON;\n  SET LOCK_TIMEOUT 600000;\n  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();\n${body.join('\n')}\nEND;`,
    'GO',
    '',
  );

  if (opts.procsOnly) return out.join('\n');
  out.push(
    `INSERT INTO dbo.SyncSource (Code, Name, Description, SystemCode, GroupCode, SourceObject, SourceSynonym, TargetTable, ProcName, SyncModeCode, KeyColumns, SortOrder)\nVALUES (${lit(`${system}.${t}`)}, ${lit(src.name)}, ${lit(src.description)}, ${lit(system)}, '${src.group}', ${lit(src.view)}, ${lit(`${schema}.src_${t}`)}, ${lit(`${schema}.${t}`)}, ${lit(`${schema}.usp_Sync_${t}`)}, '${src.mode}', ${lit(src.columns.join(', '))}, ${sortOrder});`,
    'GO',
    '',
  );
  return out.join('\n');
}

/** Cấu trúc cột của một bảng/view, đọc từ danh mục hệ thống của database đang kết nối */
// any: đọc danh mục hệ thống của database bất kỳ, không có kiểu bảng
export async function readColumns(db: ReturnType<typeof createDb<any>>, object: string): Promise<Col[]> {
  const rows = await sql<Col>`
    SELECT c.name, TYPE_NAME(c.system_type_id) AS type, c.max_length AS len, c.precision, c.scale, c.collation_name AS collation
    FROM sys.columns c WHERE c.object_id = OBJECT_ID(${object}) ORDER BY c.column_id`.execute(db);
  return rows.rows;
}

/**
 * Cấu trúc cột của view `dbo.<view>` ở database nằm sau linked server: đọc danh mục hệ thống của database đó qua tên 4 phần
 * (OBJECT_ID không tra được sang máy khác). Mã kiểu hệ thống giống nhau giữa các máy SQL Server nên TYPE_NAME chạy ở máy này.
 */
// any: đọc danh mục hệ thống qua linked server, không có kiểu bảng
export async function readRemoteColumns(db: ReturnType<typeof createDb<any>>, server: string, database: string, view: string): Promise<Col[]> {
  const cat = (t: string) => sql.raw(`${q(server)}.${q(database)}.sys.${t}`);
  const rows = await sql<Col>`
    SELECT c.name, TYPE_NAME(c.system_type_id) AS type, c.max_length AS len, c.precision, c.scale, c.collation_name AS collation
    FROM ${cat('columns')} c
    JOIN ${cat('objects')} o ON o.object_id = c.object_id
    JOIN ${cat('schemas')} s ON s.schema_id = o.schema_id
    WHERE s.name = N'dbo' AND o.name = ${view}
    ORDER BY c.column_id`.execute(db);
  return rows.rows;
}

/** Database nguồn của một view (scripts/source-databases.ts) */
function sourceDatabase(src: SourceDef) {
  const system = src.system ?? 'BRAVO';
  const d = sourceDatabaseOf(system, src.view);
  if (!d) throw new Error(`Chưa khai báo database nguồn cho ${system} (${src.view}) trong scripts/source-databases.ts`);
  const name = d.name();
  if (!name) throw new Error(`Thiếu ${d.nameVar} trong backend/.env (database chứa view ${src.view})`);
  const server = d.server();
  assertSourceNames(d, name, server);
  return { name, server };
}

async function main() {
  const args = process.argv.slice(2);
  const procsOnly = args.includes('--procs-only');
  const outAt = args.indexOf('--out');
  const outFile = outAt >= 0 ? args[outAt + 1] : null;
  if (outAt >= 0 && !outFile) throw new Error('Thiếu tên file sau --out');
  const only = args.filter((a, i) => !a.startsWith('--') && (outAt < 0 || i !== outAt + 1));
  const picked = only.length ? SOURCES.filter((s) => only.includes(tableName(s.view))) : SOURCES;
  if (only.length && picked.length !== only.length) throw new Error(`Không có trong SOURCES: ${only.filter((o) => !SOURCES.some((s) => tableName(s.view) === o)).join(', ')}`);
  // any: chỉ đọc danh mục hệ thống. Database sau linked server đọc từ master của máy này
  const dbs = new Map<string, ReturnType<typeof createDb<any>>>();
  const connect = (name: string) => {
    if (!dbs.has(name)) dbs.set(name, createDb<any>(name));
    return dbs.get(name)!;
  };
  const columnsOf = async (src: SourceDef) => {
    const { name, server } = sourceDatabase(src);
    const cols = server ? await readRemoteColumns(connect('master'), server, name, src.view) : await readColumns(connect(name), `dbo.${src.view}`);
    if (cols.length === 0) throw new Error(`Không thấy view ${src.view} trong ${server ? `${server}.` : ''}${name}`);
    return cols;
  };
  try {
    const parts = [
      `-- Sinh bởi backend/scripts/sync-gen.ts từ cấu trúc view của database nguồn. Không sửa tay:`,
      `-- muốn đổi thì sửa SOURCES trong script rồi sinh migration mới (quyết định 8.5).`,
      '',
    ];
    // Schema của hệ thống mới (không phải bravo) tạo trước bảng chép
    if (!procsOnly) {
      for (const schema of new Set(picked.map((p) => schemaOf(p.system ?? 'BRAVO')).filter((x) => x !== 'bravo'))) {
        parts.push(`IF SCHEMA_ID(N'${schema}') IS NULL EXEC(N'CREATE SCHEMA ${schema}');`, 'GO', '');
      }
    }
    for (const src of picked) {
      const cols = await columnsOf(src);
      parts.push(render(src, cols, (SOURCES.indexOf(src) + 1) * 10, src.system ?? 'BRAVO', { procsOnly }));
    }
    const text = parts.join('\n');
    if (outFile) {
      writeFileSync(outFile, text, 'utf8');
      console.error(`Đã ghi ${outFile} (${picked.length} nguồn${procsOnly ? ', chỉ thủ tục' : ''})`);
    } else process.stdout.write(text);
  } finally {
    for (const db of dbs.values()) await db.destroy();
  }
}

// Chỉ chạy khi gọi trực tiếp; test import render() không kích hoạt
if (require.main === module) {
  main().catch((e) => {
    console.error('Lỗi:', e.message ?? e);
    process.exit(1);
  });
}
