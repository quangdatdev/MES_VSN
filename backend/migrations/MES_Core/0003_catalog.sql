-- MES_Core 0003: danh mục hệ thống (Phase 5.4, màn Quản trị › Danh mục hệ thống).
-- Danh mục chỉ có mã, tên (Đơn vị tính, Loại đơn hàng…) dùng chung SysCatalog + SysCatalogItem: thêm danh mục loại này
-- chỉ cần thêm dòng SysCatalog (seed), không cần bảng mới. Ca làm việc có giờ nên bảng riêng. Chuyền may dùng SysOrgUnit.
-- Danh mục dùng chung toàn công ty (không theo nhà máy), không xóa vật lý (IsActive), mã không sửa được sau khi tạo.

CREATE TABLE dbo.SysCatalog (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysCatalog PRIMARY KEY,
    Code        VARCHAR(30)   NOT NULL CONSTRAINT CK_SysCatalog_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9_]%' AND LEN(Code) > 0),
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(300) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysCatalog_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysCatalog_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysCatalog_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysCatalog_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysCatalog_Code UNIQUE (Code)
);
GO

CREATE TABLE dbo.SysCatalogItem (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysCatalogItem PRIMARY KEY,
    CatalogId   INT           NOT NULL CONSTRAINT FK_SysCatalogItem_Catalog FOREIGN KEY REFERENCES dbo.SysCatalog(Id),
    -- Mã lưu vào dữ liệu nghiệp vụ (ví dụ SalesOrder.OrderType = 'SXXK'), nên chữ hoa và không sửa được
    Code        VARCHAR(30)   NOT NULL CONSTRAINT CK_SysCatalogItem_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9._-]%' AND LEN(Code) > 0),
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(300) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysCatalogItem_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysCatalogItem_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysCatalogItem_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysCatalogItem_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysCatalogItem_Code UNIQUE (CatalogId, Code)
);
CREATE INDEX IX_SysCatalogItem_Catalog ON dbo.SysCatalogItem (CatalogId, SortOrder);
GO

CREATE TRIGGER dbo.TR_SysCatalogItem_CodeImmutable ON dbo.SysCatalogItem AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF (UPDATE(Code) OR UPDATE(CatalogId)) AND EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id WHERE i.Code <> d.Code OR i.CatalogId <> d.CatalogId)
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã danh mục không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Ca làm việc. EndTime nhỏ hơn StartTime là ca qua đêm (22:00 – 06:00).
CREATE TABLE dbo.SysShift (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysShift PRIMARY KEY,
    Code         VARCHAR(20)   NOT NULL CONSTRAINT CK_SysShift_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9._-]%' AND LEN(Code) > 0),
    Name         NVARCHAR(100) NOT NULL,
    Description  NVARCHAR(300) NULL,
    StartTime    TIME(0)       NOT NULL,
    EndTime      TIME(0)       NOT NULL,
    BreakMinutes INT           NOT NULL CONSTRAINT DF_SysShift_BreakMinutes DEFAULT 0
                 CONSTRAINT CK_SysShift_BreakMinutes CHECK (BreakMinutes BETWEEN 0 AND 480),
    SortOrder    INT           NOT NULL CONSTRAINT DF_SysShift_SortOrder DEFAULT 0,
    IsActive     BIT           NOT NULL CONSTRAINT DF_SysShift_IsActive DEFAULT 1,
    IsSystem     BIT           NOT NULL CONSTRAINT DF_SysShift_IsSystem DEFAULT 0,
    CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_SysShift_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT           NULL,
    ModifiedAt   DATETIME2(3)  NULL,
    ModifiedBy   INT           NULL,
    CONSTRAINT UQ_SysShift_Code UNIQUE (Code),
    CONSTRAINT CK_SysShift_Times CHECK (StartTime <> EndTime)
);
GO

CREATE TRIGGER dbo.TR_SysShift_CodeImmutable ON dbo.SysShift AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id WHERE i.Code <> d.Code)
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã ca làm việc không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO
