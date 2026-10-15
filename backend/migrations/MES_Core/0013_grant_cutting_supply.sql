-- MES_Core 0013 (phase 5.15, task 5.15.1, quyết định 13.10): màn Xác nhận cấp BTP có dữ liệu ở MES_Cutting. Seed chỉ cấp quyền cho
-- vai trò mới, quyền mới; các quyền của cutting.supply đã có từ trước (trang giữ chỗ, seed tạo đủ 5 hành động cho mỗi tài nguyên) nên
-- máy đã cài không tự nhận ma trận mới: cấp ở đây Thêm, Sửa, Xóa, Xuất cho vai trò hệ thống Kế hoạch (PLANNER), như 0012.
-- - Chỉ cấp khi Kế hoạch còn quyền Xem màn này: quản trị đã gỡ Xem thì coi là cố ý, không sinh quyền mồ côi.
-- - Không cấp cho Toàn quyền: vai trò này đã có mọi hành động từ seed; quyền nào bị gỡ là do quản trị gỡ.
-- - Không gỡ quyền nào, không đụng vai trò khác.
-- Bảng nguồn CuttingSupply do seed đặt (npm run migrate chạy seed dữ liệu hệ thống ngay sau migration).
-- Database mới (chưa seed) không có tài nguyên, vai trò: không làm gì, seed tạo theo seed-data.ts.
DECLARE @rid INT = (SELECT Id FROM dbo.SysResource WHERE Code = 'cutting.supply');
IF @rid IS NOT NULL
BEGIN
    DECLARE @granted TABLE (RoleId INT NOT NULL, PermissionId INT NOT NULL);
    INSERT INTO dbo.SysRolePermission (RoleId, PermissionId)
    OUTPUT inserted.RoleId, inserted.PermissionId INTO @granted (RoleId, PermissionId)
    SELECT r.Id, p.Id
    FROM dbo.SysRole r
    JOIN dbo.SysPermission p ON p.ResourceId = @rid AND p.ActionCode IN ('create', 'update', 'delete', 'export')
    WHERE r.Code = 'PLANNER' AND r.IsSystem = 1
      AND EXISTS (SELECT 1 FROM dbo.SysRolePermission rv JOIN dbo.SysPermission pv ON pv.Id = rv.PermissionId
                  WHERE rv.RoleId = r.Id AND pv.ResourceId = @rid AND pv.ActionCode = 'view')
      AND NOT EXISTS (SELECT 1 FROM dbo.SysRolePermission rp WHERE rp.RoleId = r.Id AND rp.PermissionId = p.Id);

    -- Cấp quyền là thay đổi phân quyền: ghi nhật ký cùng dạng màn Vai trò (ROLE_PERMISSIONS: cũ {"removed":[]}, mới {role, added})
    INSERT INTO dbo.SysAuditLog (Username, EntityType, EntityId, ActionCode, OldValue, NewValue)
    SELECT 'migrate', 'SysRole', CAST(r.Id AS VARCHAR(40)), 'ROLE_PERMISSIONS', N'{"removed":[]}',
           N'{"role":"' + STRING_ESCAPE(r.Code, 'json') + N'","added":['
             + STRING_AGG(N'"' + STRING_ESCAPE(p.Code, 'json') + N'"', N',') WITHIN GROUP (ORDER BY p.Code)
             + N'],"by":"MES_Core/0013_grant_cutting_supply.sql"}'
    FROM @granted g
    JOIN dbo.SysRole r ON r.Id = g.RoleId
    JOIN dbo.SysPermission p ON p.Id = g.PermissionId
    GROUP BY r.Id, r.Code;

    -- Quyền đổi: phiên đang mở tải lại quyền
    IF EXISTS (SELECT 1 FROM @granted)
        UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1;
END;
GO
