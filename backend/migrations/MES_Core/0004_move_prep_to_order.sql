-- MES_Core 0004 (Phase 5.5): người dùng chuyển màn "Kế hoạch chuẩn bị SX" từ nhóm Quản trị xưởng may sang Quản trị đơn hàng.
-- Nhóm menu theo tiền tố mã tài nguyên, nên mã đổi từ sewing.prep sang order.prep, đường dẫn /sewing/prep sang /order/prep.
-- Đổi tại chỗ (giữ Id): quyền đã cấp cho vai trò, ngoại lệ, chính sách cột, chiều phạm vi gắn theo Id nên được giữ nguyên.
-- Database chưa có sewing.prep (chưa seed Phase 5.5) thì không làm gì; seed sẽ tạo order.prep.
-- Dữ liệu và code của màn vẫn thuộc module May (MES_Sewing, ADR 0009).
IF EXISTS (SELECT 1 FROM dbo.SysResource WHERE Code = 'sewing.prep') AND NOT EXISTS (SELECT 1 FROM dbo.SysResource WHERE Code = 'order.prep')
BEGIN
    DECLARE @rid INT = (SELECT Id FROM dbo.SysResource WHERE Code = 'sewing.prep');
    UPDATE dbo.SysResource SET Code = 'order.prep', ModuleCode = 'order', ModifiedAt = SYSUTCDATETIME() WHERE Id = @rid;
    UPDATE dbo.SysPermission SET Code = 'order.prep:' + ActionCode, ModifiedAt = SYSUTCDATETIME() WHERE ResourceId = @rid;
    UPDATE dbo.SysMenu
       SET Code = 'menu.order.prep',
           Path = '/order/prep',
           ParentId = (SELECT Id FROM dbo.SysMenu WHERE Code = 'menu.order'),
           ModifiedAt = SYSUTCDATETIME()
     WHERE Code = 'menu.sewing.prep' AND EXISTS (SELECT 1 FROM dbo.SysMenu WHERE Code = 'menu.order');
    -- Menu và quyền đổi: phiên đang mở tải lại quyền
    UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1;
END;
GO
