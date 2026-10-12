-- MES_Core 0007: Đơn vị cơ sở và Nhà máy SX (ADR 0013, Phase 5.9, người dùng yêu cầu 11/10/2026).
-- SysBranch giữ nguyên bảng, đổi nghĩa thành Đơn vị cơ sở (ĐVCS): danh sách theo danh mục chi nhánh BRAVO
-- (MES_Sync.bravo.DM_CHINHANH), cộng đơn vị tổng hợp A00 của MES. Chép ĐVCS từ BRAVO do ứng dụng làm (khác database),
-- không ở migration này.
-- Nhà máy SX: danh mục riêng, mỗi nhà máy thuộc một ĐVCS, thay danh mục mã-tên PROD_FACTORY. Người dùng được tích thêm
-- nhà máy SX (SysUserProductionFactory): khi lập kế hoạch xuất hàng chỉ chọn được đơn hàng của các nhà máy này.

CREATE TABLE dbo.SysProductionFactory (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysProductionFactory PRIMARY KEY,
    -- Mã lưu vào dữ liệu nghiệp vụ (SalesOrder.ProductionFactoryCode) nên chữ hoa và không sửa được, như mã danh mục cũ
    Code        VARCHAR(30)   NOT NULL CONSTRAINT CK_SysProductionFactory_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9._-]%' AND LEN(Code) > 0),
    Name        NVARCHAR(100) NOT NULL,
    -- ĐVCS quản lý nhà máy. NULL: chưa gắn (mục chép từ PROD_FACTORY không trùng mã ĐVCS nào); màn hình bắt chọn khi sửa.
    -- Không gắn vào đơn vị tổng hợp: service kiểm (CHECK không đọc được bảng khác)
    BranchCode  VARCHAR(10)   NULL CONSTRAINT FK_SysProductionFactory_Branch FOREIGN KEY REFERENCES dbo.SysBranch(Code),
    Description NVARCHAR(300) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysProductionFactory_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysProductionFactory_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysProductionFactory_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysProductionFactory_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysProductionFactory_Code UNIQUE (Code)
);
CREATE INDEX IX_SysProductionFactory_Branch ON dbo.SysProductionFactory (BranchCode);
GO

CREATE TRIGGER dbo.TR_SysProductionFactory_CodeImmutable ON dbo.SysProductionFactory AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id WHERE i.Code <> d.Code)
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã nhà máy SX không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Bảng gán như SysUserBranch: xóa, thêm lại khi đổi (có SysAuditLog), không sửa tại chỗ
CREATE TABLE dbo.SysUserProductionFactory (
    Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysUserProductionFactory PRIMARY KEY,
    UserId              INT NOT NULL CONSTRAINT FK_SysUserProductionFactory_User    FOREIGN KEY REFERENCES dbo.SysUser(Id),
    ProductionFactoryId INT NOT NULL CONSTRAINT FK_SysUserProductionFactory_Factory FOREIGN KEY REFERENCES dbo.SysProductionFactory(Id),
    CreatedAt           DATETIME2(3) NOT NULL CONSTRAINT DF_SysUserProductionFactory_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy           INT NULL,
    CONSTRAINT UQ_SysUserProductionFactory UNIQUE (UserId, ProductionFactoryId)
);
CREATE INDEX IX_SysUserProductionFactory_Factory ON dbo.SysUserProductionFactory (ProductionFactoryId);
GO

-- Chép mục của danh mục PROD_FACTORY sang bảng mới, giữ mã (đơn hàng đã chọn nhà máy SX vẫn trỏ đúng). Mục trùng mã một
-- ĐVCS (seed tạo mỗi nhà máy cũ một mục) gắn luôn vào ĐVCS đó; mục khác (xưởng gia công ngoài) để NULL chờ người chọn.
INSERT INTO dbo.SysProductionFactory (Code, Name, BranchCode, Description, SortOrder, IsActive, IsSystem, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy)
SELECT i.Code, i.Name, b.Code, i.Description, i.SortOrder, i.IsActive, i.IsSystem, i.CreatedAt, i.CreatedBy, i.ModifiedAt, i.ModifiedBy
FROM dbo.SysCatalogItem i
JOIN dbo.SysCatalog c ON c.Id = i.CatalogId AND c.Code = 'PROD_FACTORY'
LEFT JOIN dbo.SysBranch b ON b.Code = i.Code AND b.IsAggregate = 0;

-- Danh mục cũ ngừng dùng (không xóa vật lý): màn Danh mục hệ thống không còn hiện, mục cũ giữ lại để đối chiếu
UPDATE dbo.SysCatalog SET IsActive = 0, ModifiedAt = SYSUTCDATETIME() WHERE Code = 'PROD_FACTORY';

-- Chiều phạm vi FACTORY lọc theo BranchCode, nay gọi là Đơn vị cơ sở
UPDATE dbo.SysScopeDimension SET Name = N'Đơn vị cơ sở', ModifiedAt = SYSUTCDATETIME() WHERE Code = 'FACTORY';

-- Gán nhà máy SX là phân quyền: giao diện đang mở tải lại quyền
UPDATE dbo.SysPermissionVersion SET Version = Version + 1, ModifiedAt = SYSUTCDATETIME() WHERE Id = 1;
GO
