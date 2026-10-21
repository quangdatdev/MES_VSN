-- MES_Core 0015 (task T16, câu hỏi Q51): Trưởng chuyền thấy nguyên tên khách hàng ở Đồng bộ tiến độ cắt, trong khi các màn Đơn hàng,
-- Chuẩn bị SX cùng dữ liệu đã che. Seed chỉ thêm chính sách cột mẫu cho vai trò mới, cột mới nên máy đã cài không tự nhận: thêm ở
-- đây mức Che cột customerName của cutting.progress cho vai trò hệ thống Trưởng chuyền (LINE_LEADER).
-- - Chỉ thêm khi vai trò chưa có chính sách cho cột này: quản trị đã đặt một mức (kể cả Sửa được) thì coi là cố ý, giữ nguyên.
-- - Không đụng vai trò khác, chính sách theo người.
-- Database mới (chưa seed) không có tài nguyên, cột, vai trò: không làm gì, seed tạo theo seed-data.ts.
DECLARE @rid INT = (SELECT Id FROM dbo.SysResource WHERE Code = 'cutting.progress');
IF @rid IS NOT NULL AND EXISTS (SELECT 1 FROM dbo.SysResourceField WHERE ResourceId = @rid AND Code = 'customerName')
BEGIN
    DECLARE @added TABLE (RoleId INT NOT NULL);
    INSERT INTO dbo.SysFieldPolicy (SubjectType, SubjectId, ResourceId, FieldCode, AccessLevel)
    OUTPUT inserted.SubjectId INTO @added (RoleId)
    SELECT 'ROLE', r.Id, @rid, 'customerName', 'MASKED'
    FROM dbo.SysRole r
    WHERE r.Code = 'LINE_LEADER' AND r.IsSystem = 1
      AND NOT EXISTS (SELECT 1 FROM dbo.SysFieldPolicy fp
                      WHERE fp.SubjectType = 'ROLE' AND fp.SubjectId = r.Id AND fp.ResourceId = @rid AND fp.FieldCode = 'customerName');

    -- Đổi chính sách cột là thay đổi phân quyền: ghi nhật ký cùng dạng màn Vai trò (ROLE_FIELD_POLICY: {role, resourceId, fields})
    INSERT INTO dbo.SysAuditLog (Username, EntityType, EntityId, ActionCode, OldValue, NewValue)
    SELECT 'migrate', 'SysFieldPolicy', CAST(r.Id AS VARCHAR(40)), 'ROLE_FIELD_POLICY',
           N'{"role":"' + STRING_ESCAPE(r.Code, 'json') + N'","resourceId":' + CAST(@rid AS NVARCHAR(20)) + N',"fields":{"customerName":null}}',
           N'{"role":"' + STRING_ESCAPE(r.Code, 'json') + N'","resourceId":' + CAST(@rid AS NVARCHAR(20))
             + N',"fields":{"customerName":"MASKED"},"by":"MES_Core/0015_mask_cutting_progress_customer.sql"}'
    FROM @added a
    JOIN dbo.SysRole r ON r.Id = a.RoleId;

    -- Chính sách cột đổi: phiên đang mở tải lại quyền
    IF EXISTS (SELECT 1 FROM @added)
        UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1;
END;
GO
