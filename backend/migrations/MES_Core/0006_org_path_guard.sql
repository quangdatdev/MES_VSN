-- MES_Core 0006 (Phase 5.4, ADR 0010, review 5.4.8 M1 và L3): siết cây tổ chức sau 0005.
-- 1. Tạo lại CK_SysOrgUnit_Level với ParentOrgType IS NOT NULL. Bản 0005 đầu tiên thiếu vế này: NULL = 'FACTORY' cho UNKNOWN, CHECK coi
--    UNKNOWN là đạt, khóa ngoại ghép cũng bỏ qua dòng có cột NULL, nên dòng có cha mà bỏ trống loại cha lọt qua. 0005 đã sửa tại chỗ,
--    nhưng database nào đã chạy bản đầu vẫn giữ CHECK cũ (lịch sử migration chỉ lưu tên file); chạy lại trên database đã đúng cũng không sao.
-- 2. Path phải bằng Path của cha + Code + '/' (nhà máy: '/' + Code + '/'). Phân quyền "cả nhánh" lọc theo Path còn màn hình, ô chọn
--    chuyền đi theo ParentId: lệch nhau thì người được giao cả xưởng cũ vẫn thấy dữ liệu của chuyền đã chuyển đi. Chỉ cần kiểm dòng vừa
--    ghi: Path của nhà máy, xưởng không đổi được (mã bất biến, xưởng chỉ nằm dưới nhà máy duy nhất).
-- Trước khi chạy: dừng backend.

ALTER TABLE dbo.SysOrgUnit DROP CONSTRAINT CK_SysOrgUnit_Level;
ALTER TABLE dbo.SysOrgUnit ADD CONSTRAINT CK_SysOrgUnit_Level CHECK (
    (OrgType = 'FACTORY' AND ParentId IS NULL AND ParentOrgType IS NULL)
    OR (OrgType = 'WORKSHOP' AND ParentId IS NOT NULL AND ParentOrgType IS NOT NULL AND ParentOrgType = 'FACTORY')
    OR (OrgType = 'LINE' AND ParentId IS NOT NULL AND ParentOrgType IS NOT NULL AND ParentOrgType IN ('FACTORY', 'WORKSHOP'))
);
GO

-- Trigger chỉ kiểm dòng ghi sau này: dữ liệu đang có phải đúng trước khi tạo
IF EXISTS (
    SELECT 1 FROM dbo.SysOrgUnit u
    LEFT JOIN dbo.SysOrgUnit p ON p.Id = u.ParentId
    WHERE (u.ParentId IS NULL AND u.Path <> '/' + u.Code + '/')
       OR (u.ParentId IS NOT NULL AND u.Path <> p.Path + u.Code + '/')
)
    THROW 50001, N'SysOrgUnit có Path không khớp cây (Path cha + Code + /): sửa dữ liệu trước khi chạy 0006.', 1;
GO

CREATE TRIGGER dbo.TR_SysOrgUnit_PathMatchesParent ON dbo.SysOrgUnit AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i
        LEFT JOIN dbo.SysOrgUnit p ON p.Id = i.ParentId
        WHERE (i.ParentId IS NULL AND i.Path <> '/' + i.Code + '/')
           OR (i.ParentId IS NOT NULL AND (p.Id IS NULL OR i.Path <> p.Path + i.Code + '/'))
    )
    BEGIN
        RAISERROR(N'ORG_PATH_MISMATCH: Path của đơn vị tổ chức phải bằng Path của cha + mã + "/".', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO
