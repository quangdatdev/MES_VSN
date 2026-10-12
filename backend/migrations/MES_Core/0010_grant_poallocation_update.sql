-- MES_Core 0010 (Phase 5.10, task 5.10.4): màn Phân bổ PO có bảng ở MES_Order (PoAllocation, MES_Order/0009) và sửa được Nhà
-- máy SX. Seed chỉ cấp quyền cho vai trò mới, quyền mới; quyền order.poallocation:update đã có từ trước (seed tạo đủ 5 hành động
-- cho mỗi tài nguyên) nên máy đã cài không tự nhận: cấp ở đây cho vai trò hệ thống Kế hoạch (PLANNER) và Toàn quyền (FULL_ACCESS,
-- nếu chưa có). Database mới (chưa seed) không có tài nguyên, vai trò: không làm gì, seed tạo theo seed-data.ts.
DECLARE @rid INT = (SELECT Id FROM dbo.SysResource WHERE Code = 'order.poallocation');
IF @rid IS NOT NULL
BEGIN
    -- Bảng nguồn cho BaseRepository: backend mới đọc bảng PoAllocation ngay, không chờ lần seed sau (seed cũng đặt theo seed-data)
    IF COL_LENGTH('dbo.SysResource', 'SourceTable') IS NOT NULL
        EXEC sp_executesql N'UPDATE dbo.SysResource SET SourceTable = ''PoAllocation'', ModifiedAt = SYSUTCDATETIME()
                             WHERE Id = @rid AND IsSystem = 1 AND (SourceTable IS NULL OR SourceTable <> ''PoAllocation'')', N'@rid INT', @rid = @rid;

    DECLARE @pid INT = (SELECT Id FROM dbo.SysPermission WHERE ResourceId = @rid AND ActionCode = 'update');
    DECLARE @granted TABLE (RoleId INT NOT NULL);
    IF @pid IS NOT NULL
        INSERT INTO dbo.SysRolePermission (RoleId, PermissionId)
        OUTPUT inserted.RoleId INTO @granted (RoleId)
        SELECT r.Id, @pid FROM dbo.SysRole r
        WHERE r.IsSystem = 1 AND r.Code IN ('PLANNER', 'FULL_ACCESS')
          AND NOT EXISTS (SELECT 1 FROM dbo.SysRolePermission rp WHERE rp.RoleId = r.Id AND rp.PermissionId = @pid);

    -- Cấp quyền là thay đổi phân quyền: ghi nhật ký như màn Vai trò (ROLE_PERMISSIONS)
    INSERT INTO dbo.SysAuditLog (Username, EntityType, EntityId, ActionCode, NewValue)
    SELECT 'migrate', 'SysRole', CAST(r.Id AS VARCHAR(40)), 'ROLE_PERMISSIONS',
           N'{"role":"' + r.Code + N'","added":["order.poallocation:update"],"by":"MES_Core/0010_grant_poallocation_update.sql"}'
    FROM @granted g JOIN dbo.SysRole r ON r.Id = g.RoleId;

    -- Quyền và bảng nguồn đổi: phiên đang mở tải lại quyền
    UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1;
END;
GO
