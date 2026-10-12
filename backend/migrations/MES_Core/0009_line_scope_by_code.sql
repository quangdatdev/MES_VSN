-- MES_Core 0009 (Phase 5.10, task 5.10.9, chốt Q3, Q4 ngày 12/10/2026): phạm vi chiều Chuyền (LINE) lưu theo mã chuyền
-- (ScopeValue = mã bộ phận tích "Xưởng sản xuất" của module Nhân sự, MES_Hr.Department.Code), không theo nút cây tổ chức nữa.
-- Nút Xưởng, Chuyền của SysOrgUnit ngừng dùng (không xóa vật lý); nút gốc FACTORY giữ nguyên vì phạm vi ĐVCS dùng.
--
-- Không xóa phạm vi nào khỏi phép gán: phép gán không có dòng ở một chiều là KHÔNG GIỚI HẠN chiều đó, mất dòng là nới quyền.
-- Mã không còn là chuyền đang dùng (Q4: chuyền cũ không chép sang bộ phận) thì PermissionService coi là tập rỗng (đóng an toàn);
-- Nhân sự tạo bộ phận chuyền trùng mã chuyền cũ thì phạm vi đó có tác dụng trở lại (như bật lại chuyền cũ trước 0009).
--  1. LIST theo nút chuyền (OrgUnitId, nút đang dùng hay đã ngừng) -> LIST theo mã (ScopeValue = mã chuyền), OrgUnitId = NULL.
--  2. ORG_SUBTREE (cả xưởng, cả ĐVCS) -> mỗi chuyền đang dùng trong nhánh của nút đang dùng một dòng LIST: đúng tập chuyền
--     PermissionService trước 0009 tính cho phép gán.
--     Dòng trước 0009 không có tác dụng và không mô tả được bằng mã chuyền (cả nhánh không còn chuyền đang dùng hay nút đã ngừng;
--     LIST trỏ nút không phải chuyền): một dòng LIST mang mã của nút thêm tiền tố '~'. Mã bộ phận chỉ gồm A-Z, 0-9, '-'
--     (CK_Department_Code) nên giá trị này không bao giờ khớp chuyền nào: phép gán vẫn bị giới hạn chiều chuyền (tập rỗng),
--     không tự có tác dụng khi Nhân sự sau này tạo bộ phận trùng mã xưởng, mã ĐVCS.
--  3. Bỏ trùng theo UQ_SysUserRoleScope (cùng phép gán, cùng mã; kể cả dòng LIST theo giá trị đã có).
--  4. Chiều LINE thành chiều giá trị (OrgType NULL): ORG_SUBTREE, LIST theo nút ở chiều này từ nay là không hợp lệ.
--  5. Ngừng nút LINE rồi WORKSHOP (thứ tự của mục 6.5: chuyền đang dùng không nằm dưới xưởng đã ngừng). Hai trigger của
--     SysOrgUnit chỉ kiểm mã (không đổi) và Path (không đổi) nên không chặn.
--  6. Nhật ký (người system) cho mỗi phép gán bị đổi, cho chiều LINE và cho các nút bị ngừng; tăng phiên bản quyền.
-- Chạy được trên database đang có dữ liệu. Cả file chạy trong một transaction (scripts/migrate.ts): lỗi thì không đổi gì.
-- Trước khi chạy: dừng backend. Chỉ chạy cùng bản build có task 5.10.10 (PermissionService, màn Người dùng theo mã chuyền): bản cũ
-- coi chiều không có OrgType là chiều giá trị chung, nhận mọi mã đã lưu mà không kiểm mã đó còn là chuyền đang dùng.

SET XACT_ABORT ON;

DECLARE @lineDim INT = (SELECT Id FROM dbo.SysScopeDimension WHERE Code = 'LINE');

-- Phép gán đang có phạm vi chuyền theo nút cây tổ chức (LIST theo OrgUnitId, ORG_SUBTREE): chỉ các phép gán này bị đổi
DECLARE @changed TABLE (UserRoleId INT NOT NULL PRIMARY KEY);
INSERT INTO @changed (UserRoleId)
SELECT DISTINCT UserRoleId FROM dbo.SysUserRoleScope WHERE DimensionId = @lineDim AND OrgUnitId IS NOT NULL;

-- Phạm vi trước khi đổi, cùng dạng nhãn với nhật ký USER_ROLE_SCOPE của màn Người dùng (CHIỀU:CHẾ ĐỘ:MÃ)
DECLARE @before TABLE (UserRoleId INT NOT NULL PRIMARY KEY, Scopes NVARCHAR(MAX) NOT NULL);
INSERT INTO @before (UserRoleId, Scopes)
SELECT c.UserRoleId,
       COALESCE((
           SELECT N'[' + STRING_AGG(CAST(N'"' + STRING_ESCAPE(d.Code + ':' + s.ScopeMode + ':' + COALESCE(o.Code, s.ScopeValue, ''), 'json') + N'"' AS NVARCHAR(MAX)), N',')
                         WITHIN GROUP (ORDER BY s.Id) + N']'
           FROM dbo.SysUserRoleScope s
           JOIN dbo.SysScopeDimension d ON d.Id = s.DimensionId
           LEFT JOIN dbo.SysOrgUnit o ON o.Id = s.OrgUnitId
           WHERE s.UserRoleId = c.UserRoleId), N'[]')
FROM @changed c;

-- Mã chuyền mới của từng phép gán. Ghi rõ COLLATE DATABASE_DEFAULT để so, bỏ trùng đúng như UQ_SysUserRoleScope
DECLARE @new TABLE (UserRoleId INT NOT NULL, Code VARCHAR(60) COLLATE DATABASE_DEFAULT NOT NULL, CreatedBy INT NULL);

-- 1. Danh sách theo nút: nút chuyền -> mã chuyền; nút khác (trước 0009 đã không có tác dụng) -> '~' + mã
INSERT INTO @new (UserRoleId, Code, CreatedBy)
SELECT s.UserRoleId, CASE WHEN o.OrgType = 'LINE' THEN o.Code ELSE '~' + o.Code END, s.CreatedBy
FROM dbo.SysUserRoleScope s
JOIN dbo.SysOrgUnit o ON o.Id = s.OrgUnitId
WHERE s.DimensionId = @lineDim AND s.ScopeMode = 'LIST' AND s.OrgUnitId IS NOT NULL;

-- 2. Cả nhánh: các chuyền đang dùng trong nhánh của nút đang dùng (Path bắt đầu bằng Path của nút; LEFT thay LIKE để không dính ký tự đại diện)
INSERT INTO @new (UserRoleId, Code, CreatedBy)
SELECT s.UserRoleId, u.Code, s.CreatedBy
FROM dbo.SysUserRoleScope s
JOIN dbo.SysOrgUnit o ON o.Id = s.OrgUnitId
JOIN dbo.SysOrgUnit u ON u.OrgType = 'LINE' AND u.IsActive = 1 AND LEFT(u.Path, LEN(o.Path)) = o.Path
WHERE s.DimensionId = @lineDim AND s.ScopeMode = 'ORG_SUBTREE' AND o.IsActive = 1;

-- 3. Cả nhánh không còn chuyền đang dùng, hoặc nút đã ngừng: giữ một dòng '~' + mã nút (không khớp chuyền nào -> rỗng)
INSERT INTO @new (UserRoleId, Code, CreatedBy)
SELECT s.UserRoleId, '~' + o.Code, s.CreatedBy
FROM dbo.SysUserRoleScope s
JOIN dbo.SysOrgUnit o ON o.Id = s.OrgUnitId
WHERE s.DimensionId = @lineDim AND s.ScopeMode = 'ORG_SUBTREE'
  AND NOT (o.IsActive = 1 AND EXISTS (
      SELECT 1 FROM dbo.SysOrgUnit u WHERE u.OrgType = 'LINE' AND u.IsActive = 1 AND LEFT(u.Path, LEN(o.Path)) = o.Path));

DELETE FROM dbo.SysUserRoleScope WHERE DimensionId = @lineDim AND OrgUnitId IS NOT NULL;

-- Bỏ trùng: một mã một dòng mỗi phép gán (so như UQ_SysUserRoleScope, theo collation của database)
INSERT INTO dbo.SysUserRoleScope (UserRoleId, DimensionId, ScopeMode, OrgUnitId, ScopeValue, CreatedBy)
SELECT n.UserRoleId, @lineDim, 'LIST', NULL, n.Code, MIN(n.CreatedBy)
FROM @new n
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.SysUserRoleScope x
    WHERE x.UserRoleId = n.UserRoleId AND x.DimensionId = @lineDim AND x.ScopeMode = 'LIST' AND x.OrgUnitId IS NULL AND x.ScopeValue = n.Code)
GROUP BY n.UserRoleId, n.Code;

-- Chốt an toàn: phép gán nào mất hết dòng chuyền (thành không giới hạn) hay còn dòng theo nút thì hủy cả migration
IF EXISTS (SELECT 1 FROM @changed c WHERE NOT EXISTS (SELECT 1 FROM dbo.SysUserRoleScope s WHERE s.UserRoleId = c.UserRoleId AND s.DimensionId = @lineDim))
    THROW 50091, N'MES_Core/0009: có phép gán mất hết phạm vi chuyền (sẽ thành không giới hạn). Không đổi gì.', 1;
IF EXISTS (SELECT 1 FROM dbo.SysUserRoleScope WHERE DimensionId = @lineDim AND OrgUnitId IS NOT NULL)
    THROW 50092, N'MES_Core/0009: còn phạm vi chuyền theo nút cây tổ chức. Không đổi gì.', 1;

INSERT INTO dbo.SysAuditLog (UserId, Username, BranchCode, EntityType, EntityId, ActionCode, OldValue, NewValue)
SELECT NULL, 'system', NULL, 'SysUserRoleScope', CAST(ur.UserId AS VARCHAR(40)), 'USER_ROLE_SCOPE',
       N'{"role":"' + STRING_ESCAPE(r.Code, 'json') + N'","scopes":' + b.Scopes + N'}',
       N'{"role":"' + STRING_ESCAPE(r.Code, 'json') + N'","by":"MES_Core/0009","scopes":' + COALESCE((
           SELECT N'[' + STRING_AGG(CAST(N'"' + STRING_ESCAPE(d.Code + ':' + s.ScopeMode + ':' + COALESCE(o.Code, s.ScopeValue, ''), 'json') + N'"' AS NVARCHAR(MAX)), N',')
                         WITHIN GROUP (ORDER BY d.Code, s.ScopeMode, COALESCE(o.Code, s.ScopeValue)) + N']'
           FROM dbo.SysUserRoleScope s
           JOIN dbo.SysScopeDimension d ON d.Id = s.DimensionId
           LEFT JOIN dbo.SysOrgUnit o ON o.Id = s.OrgUnitId
           WHERE s.UserRoleId = c.UserRoleId), N'[]') + N'}'
FROM @changed c
JOIN @before b ON b.UserRoleId = c.UserRoleId
JOIN dbo.SysUserRole ur ON ur.Id = c.UserRoleId
JOIN dbo.SysRole r ON r.Id = ur.RoleId;

-- 4. Chiều giá trị
IF EXISTS (SELECT 1 FROM dbo.SysScopeDimension WHERE Id = @lineDim AND OrgType IS NOT NULL)
    INSERT INTO dbo.SysAuditLog (UserId, Username, BranchCode, EntityType, EntityId, ActionCode, OldValue, NewValue)
    SELECT NULL, 'system', NULL, 'SysScopeDimension', CAST(Id AS VARCHAR(40)), 'SCOPE_DIMENSION_UPDATE',
           N'{"code":"LINE","orgType":"' + OrgType + N'"}', N'{"code":"LINE","orgType":null,"by":"MES_Core/0009"}'
    FROM dbo.SysScopeDimension WHERE Id = @lineDim;
UPDATE dbo.SysScopeDimension
   SET OrgType = NULL,
       Description = N'Lọc theo chuyền may: mã bộ phận tích "Xưởng sản xuất" ở Sơ đồ tổ chức',
       ModifiedAt = SYSUTCDATETIME()
 WHERE Id = @lineDim;

-- 5. Ngừng nút chuyền rồi nút xưởng
DECLARE @retired TABLE (OrgType VARCHAR(10) COLLATE DATABASE_DEFAULT NOT NULL, Code VARCHAR(20) COLLATE DATABASE_DEFAULT NOT NULL);
UPDATE dbo.SysOrgUnit SET IsActive = 0, ModifiedAt = SYSUTCDATETIME()
OUTPUT inserted.OrgType, inserted.Code INTO @retired (OrgType, Code)
WHERE OrgType = 'LINE' AND IsActive = 1;
UPDATE dbo.SysOrgUnit SET IsActive = 0, ModifiedAt = SYSUTCDATETIME()
OUTPUT inserted.OrgType, inserted.Code INTO @retired (OrgType, Code)
WHERE OrgType = 'WORKSHOP' AND IsActive = 1;

IF EXISTS (SELECT 1 FROM @retired)
    INSERT INTO dbo.SysAuditLog (UserId, Username, BranchCode, EntityType, EntityId, ActionCode, OldValue, NewValue)
    SELECT NULL, 'system', NULL, 'SysOrgUnit', NULL, 'ORG_UNIT_RETIRE', NULL,
           N'{"by":"MES_Core/0009","reason":"Chuyền may theo bộ phận Xưởng sản xuất (phase 5.10)","lines":['
           + COALESCE((SELECT STRING_AGG(CAST(N'"' + Code + N'"' AS NVARCHAR(MAX)), N',') WITHIN GROUP (ORDER BY Code) FROM @retired WHERE OrgType = 'LINE'), N'')
           + N'],"workshops":['
           + COALESCE((SELECT STRING_AGG(CAST(N'"' + Code + N'"' AS NVARCHAR(MAX)), N',') WITHIN GROUP (ORDER BY Code) FROM @retired WHERE OrgType = 'WORKSHOP'), N'')
           + N']}';

-- 6. Phạm vi đổi: giao diện đang mở tải lại quyền, cache quyền của mọi tiến trình tính lại
UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1;

-- Trả lại mặc định của kết nối (tedious: OFF) cho migration chạy sau trên cùng kết nối
SET XACT_ABORT OFF;
