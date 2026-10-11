-- MES_Core 0002: phân quyền L3 (phạm vi theo phép gán), L4 (theo cột), L5 (ngoại lệ), nhật ký đọc dữ liệu nhạy cảm.
-- Phase 5.1, ADR 0005. Kèm hai mục hoãn từ review Phase 1–4 (#38): index nhật ký theo người, một đơn vị tổng hợp.
-- Quy ước như 0001: PascalCase, số ít, tiền tố Sys, DATETIME2(3) UTC, FK vật lý chỉ trong cùng database.
-- Trước khi chạy: dừng backend; SELECT COUNT(*) FROM dbo.SysBranch WHERE IsAggregate = 1 phải bằng 1,
-- SELECT COUNT(*) FROM dbo.SysFieldPolicy và dbo.SysUserPermissionOverride phải bằng 0.

-- Cây tổ chức: Nhà máy -> Chuyền. Nút nhà máy có Code trùng SysBranch.Code.
CREATE TABLE dbo.SysOrgUnit (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysOrgUnit PRIMARY KEY,
    -- Chỉ chữ hoa ASCII, số, gạch ngang: Code nằm trong Path và điều kiện LIKE ('/', '_', '%' làm lọc nhầm), và được so sánh
    -- phân biệt hoa thường ở ứng dụng. Collation nhị phân để khoảng A-Z không gồm chữ thường, chữ có dấu.
    Code        VARCHAR(20)   NOT NULL CONSTRAINT CK_SysOrgUnit_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9-]%' AND LEN(Code) > 0),
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    OrgType     VARCHAR(10)   NOT NULL CONSTRAINT CK_SysOrgUnit_OrgType CHECK (OrgType IN ('FACTORY', 'LINE')),
    ParentId    INT           NULL,
    BranchCode  VARCHAR(10)   NOT NULL CONSTRAINT FK_SysOrgUnit_Branch FOREIGN KEY REFERENCES dbo.SysBranch(Code),
    -- '/A01/A01-L03/': lọc cả nhánh bằng LIKE '/A01/%' khi cây có thêm cấp (xưởng)
    Path        VARCHAR(400)  NOT NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysOrgUnit_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysOrgUnit_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysOrgUnit_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysOrgUnit_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysOrgUnit_Code UNIQUE (Code),
    CONSTRAINT UQ_SysOrgUnit_IdBranch UNIQUE (Id, BranchCode),
    -- Nút nhà máy là gốc, mã trùng nhà máy; chuyền luôn có cha
    CONSTRAINT CK_SysOrgUnit_Factory CHECK (OrgType <> 'FACTORY' OR (ParentId IS NULL AND Code = BranchCode)),
    CONSTRAINT CK_SysOrgUnit_Line CHECK (OrgType <> 'LINE' OR ParentId IS NOT NULL),
    CONSTRAINT CK_SysOrgUnit_NotSelf CHECK (ParentId IS NULL OR ParentId <> Id),
    -- Path bắt đầu bằng nhà máy, kết thúc bằng chính mã của nút (dùng LEFT/RIGHT để tránh ký tự đại diện của LIKE).
    -- Path = Path của cha + Code + '/' và chặn vòng lặp dài hơn do service/đồng bộ đảm nhận.
    CONSTRAINT CK_SysOrgUnit_Path CHECK (
        LEFT(Path, LEN(BranchCode) + 2) = '/' + BranchCode + '/' AND RIGHT(Path, LEN(Code) + 2) = '/' + Code + '/'
    )
);
-- Con luôn cùng nhà máy với cha (khóa ngoại ghép tới UQ_SysOrgUnit_IdBranch; nút gốc có ParentId NULL nên không bị kiểm)
ALTER TABLE dbo.SysOrgUnit ADD CONSTRAINT FK_SysOrgUnit_Parent FOREIGN KEY (ParentId, BranchCode) REFERENCES dbo.SysOrgUnit (Id, BranchCode);
CREATE INDEX IX_SysOrgUnit_ParentId   ON dbo.SysOrgUnit (ParentId);
CREATE INDEX IX_SysOrgUnit_BranchCode ON dbo.SysOrgUnit (BranchCode);
CREATE UNIQUE INDEX UX_SysOrgUnit_Path ON dbo.SysOrgUnit (Path);
GO

-- Code của đơn vị tổ chức là khóa ngầm của dữ liệu nghiệp vụ (ví dụ DemoPo.LineCode): cấm sửa.
-- So sánh nhị phân để đổi hoa/thường hay thêm khoảng trắng cuối cũng bị chặn (collation mặc định không phân biệt).
CREATE TRIGGER dbo.TR_SysOrgUnit_CodeImmutable ON dbo.SysOrgUnit AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id
        WHERE CAST(i.Code AS VARBINARY(20)) <> CAST(d.Code AS VARBINARY(20))
    )
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã đơn vị tổ chức không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Danh mục chiều phạm vi. OrgType có giá trị: giá trị của chiều lấy từ SysOrgUnit (OrgUnitId);
-- OrgType NULL: giá trị tự do (ScopeValue), ví dụ chiều khách hàng sau này. Thêm chiều mới chỉ là thêm dòng.
CREATE TABLE dbo.SysScopeDimension (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysScopeDimension PRIMARY KEY,
    Code        VARCHAR(20)   NOT NULL,
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    OrgType     VARCHAR(10)   NULL CONSTRAINT CK_SysScopeDimension_OrgType CHECK (OrgType IS NULL OR OrgType IN ('FACTORY', 'LINE')),
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysScopeDimension_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysScopeDimension_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysScopeDimension_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysScopeDimension_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysScopeDimension_Code UNIQUE (Code)
);
GO

-- Code ứng dụng dựa vào ba chiều này nên tạo cùng cấu trúc, không phụ thuộc dữ liệu giả của seed.
INSERT INTO dbo.SysScopeDimension (Code, Name, Description, OrgType, SortOrder, IsSystem) VALUES
    ('FACTORY', N'Nhà máy', N'Lọc theo nhà máy (cột BranchCode)', 'FACTORY', 10, 1),
    ('LINE',    N'Chuyền',  N'Lọc theo chuyền trong nhà máy',     'LINE',    20, 1),
    ('OWNER',   N'Người tạo', N'Chỉ bản ghi do chính người dùng tạo', NULL,  30, 1);
GO

-- Tài nguyên lọc theo chiều nào, qua cột nào của bảng nguồn (SysResource.SourceTable).
CREATE TABLE dbo.SysResourceScopeBinding (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysResourceScopeBinding PRIMARY KEY,
    ResourceId  INT          NOT NULL CONSTRAINT FK_SysResScopeBinding_Resource  FOREIGN KEY REFERENCES dbo.SysResource(Id),
    DimensionId INT          NOT NULL CONSTRAINT FK_SysResScopeBinding_Dimension FOREIGN KEY REFERENCES dbo.SysScopeDimension(Id),
    -- Tên cột được ghép vào điều kiện WHERE: chỉ cho phép ký tự của định danh
    ColumnName  VARCHAR(128) NOT NULL CONSTRAINT CK_SysResScopeBinding_Column CHECK (ColumnName NOT LIKE '%[^A-Za-z0-9_]%' AND LEN(ColumnName) > 0),
    CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_SysResScopeBinding_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT          NULL,
    CONSTRAINT UQ_SysResourceScopeBinding UNIQUE (ResourceId, DimensionId)
);
CREATE INDEX IX_SysResScopeBinding_DimensionId ON dbo.SysResourceScopeBinding (DimensionId);
GO

-- Phạm vi của một phép gán Role. Không có dòng nào cho một chiều = không giới hạn ở chiều đó (ADR 0005).
-- Không ON DELETE CASCADE: xóa phép gán phải do service xóa phạm vi trước và ghi audit, để phạm vi không mất âm thầm.
CREATE TABLE dbo.SysUserRoleScope (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysUserRoleScope PRIMARY KEY,
    UserRoleId  INT          NOT NULL CONSTRAINT FK_SysUserRoleScope_UserRole  FOREIGN KEY REFERENCES dbo.SysUserRole(Id),
    DimensionId INT          NOT NULL CONSTRAINT FK_SysUserRoleScope_Dimension FOREIGN KEY REFERENCES dbo.SysScopeDimension(Id),
    ScopeMode   VARCHAR(15)  NOT NULL,
    OrgUnitId   INT          NULL CONSTRAINT FK_SysUserRoleScope_OrgUnit FOREIGN KEY REFERENCES dbo.SysOrgUnit(Id),
    ScopeValue  VARCHAR(60)  NULL,
    CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_SysUserRoleScope_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT          NULL,
    CONSTRAINT CK_SysUserRoleScope_Mode CHECK (ScopeMode IN ('ALL', 'ORG_SUBTREE', 'LIST', 'OWN')),
    -- ORG_SUBTREE cần một đơn vị tổ chức; LIST cần đúng một trong (đơn vị tổ chức, giá trị tự do); ALL và OWN không cần gì
    CONSTRAINT CK_SysUserRoleScope_Value CHECK (
        (ScopeMode = 'ORG_SUBTREE' AND OrgUnitId IS NOT NULL AND ScopeValue IS NULL)
        OR (ScopeMode = 'LIST' AND ((OrgUnitId IS NOT NULL AND ScopeValue IS NULL) OR (OrgUnitId IS NULL AND ScopeValue IS NOT NULL AND LEN(ScopeValue) > 0)))
        OR (ScopeMode IN ('ALL', 'OWN') AND OrgUnitId IS NULL AND ScopeValue IS NULL)
    ),
    CONSTRAINT UQ_SysUserRoleScope UNIQUE (UserRoleId, DimensionId, ScopeMode, OrgUnitId, ScopeValue)
);
CREATE INDEX IX_SysUserRoleScope_DimensionId ON dbo.SysUserRoleScope (DimensionId);
CREATE INDEX IX_SysUserRoleScope_OrgUnitId   ON dbo.SysUserRoleScope (OrgUnitId);
GO

-- Cột của tài nguyên (Resource Registry mức cột). Code trùng tên trường JSON mà API trả về.
-- Che cột luôn trả "***" (ADR 0005); cần kiểu che khác thì thêm cột ở migration sau.
CREATE TABLE dbo.SysResourceField (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysResourceField PRIMARY KEY,
    ResourceId  INT           NOT NULL CONSTRAINT FK_SysResourceField_Resource FOREIGN KEY REFERENCES dbo.SysResource(Id),
    Code        VARCHAR(60)   NOT NULL,
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    -- Cột nhạy cảm (đơn giá, doanh thu...) mặc định Ẩn với Role không khai báo chính sách
    IsSensitive BIT           NOT NULL CONSTRAINT DF_SysResourceField_IsSensitive DEFAULT 0,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysResourceField_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysResourceField_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysResourceField_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysResourceField_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysResourceField UNIQUE (ResourceId, Code)
);
GO

-- SysFieldPolicy (tạo ở 0001, đang rỗng): chỉ trỏ tới cột đã đăng ký; chính sách theo người có hạn dùng và lý do,
-- ví dụ "riêng anh X được xem đơn giá đến 31/12".
ALTER TABLE dbo.SysFieldPolicy
    ADD CONSTRAINT FK_SysFieldPolicy_Field FOREIGN KEY (ResourceId, FieldCode) REFERENCES dbo.SysResourceField (ResourceId, Code);
GO
ALTER TABLE dbo.SysFieldPolicy ADD
    ValidFromAt DATETIME2(3)  NULL,
    ValidToAt   DATETIME2(3)  NULL,
    Reason      NVARCHAR(255) NULL;
GO
ALTER TABLE dbo.SysFieldPolicy ADD
    -- Viết rõ IS NOT NULL: LEN(NULL) cho UNKNOWN và CHECK coi UNKNOWN là đạt
    CONSTRAINT CK_SysFieldPolicy_UserReason CHECK (SubjectType <> 'USER' OR (Reason IS NOT NULL AND LEN(Reason) > 0)),
    CONSTRAINT CK_SysFieldPolicy_Valid CHECK (ValidFromAt IS NULL OR ValidToAt IS NULL OR ValidFromAt < ValidToAt),
    -- Chỉ chính sách theo người có hạn dùng (ADR 0005); chính sách theo Role là cấu hình lâu dài
    CONSTRAINT CK_SysFieldPolicy_ValidUserOnly CHECK (SubjectType = 'USER' OR (ValidFromAt IS NULL AND ValidToAt IS NULL));
GO

-- SysUserPermissionOverride (tạo ở 0001, chưa dùng, đang rỗng): ngoại lệ bắt buộc có lý do (ADR 0005).
ALTER TABLE dbo.SysUserPermissionOverride ALTER COLUMN Reason NVARCHAR(255) NOT NULL;
GO
ALTER TABLE dbo.SysUserPermissionOverride ADD
    CONSTRAINT CK_SysUserPermOverride_Reason CHECK (LEN(Reason) > 0),
    CONSTRAINT CK_SysUserPermOverride_Valid CHECK (ValidFromAt IS NULL OR ValidToAt IS NULL OR ValidFromAt < ValidToAt);
GO

-- Nhật ký đọc dữ liệu nhạy cảm: mỗi lần trả cột nhạy cảm không bị che. Chỉ ghi thêm.
CREATE TABLE dbo.SysSensitiveReadLog (
    Id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysSensitiveReadLog PRIMARY KEY,
    ReadAt       DATETIME2(3)  NOT NULL CONSTRAINT DF_SysSensitiveReadLog_ReadAt DEFAULT SYSUTCDATETIME(),
    UserId       INT           NULL,
    Username     VARCHAR(50)   NULL,
    BranchCode   VARCHAR(10)   NULL,
    ResourceCode VARCHAR(60)   NOT NULL,
    FieldCodes   VARCHAR(2000) NOT NULL,
    RecordCount  INT           NOT NULL,
    ActionCode   VARCHAR(10)   NOT NULL CONSTRAINT CK_SysSensitiveReadLog_Action CHECK (ActionCode IN ('VIEW', 'EXPORT')),
    IpAddress    VARCHAR(45)   NULL
);
CREATE INDEX IX_SysSensitiveReadLog_ReadAt ON dbo.SysSensitiveReadLog (ReadAt DESC);
CREATE INDEX IX_SysSensitiveReadLog_UserId ON dbo.SysSensitiveReadLog (UserId, ReadAt DESC);
GO

CREATE TRIGGER dbo.TR_SysSensitiveReadLog_AppendOnly ON dbo.SysSensitiveReadLog INSTEAD OF UPDATE, DELETE AS
BEGIN
    RAISERROR(N'SysSensitiveReadLog chỉ cho phép ghi thêm.', 16, 1);
END;
GO

-- Hoãn từ review Phase 1–4 (#38): lọc nhật ký theo người dùng; chỉ một đơn vị tổng hợp (A00).
-- Sau index có lọc này, lệnh sửa SysBranch phải chạy với QUOTED_IDENTIFIER ON (tedious mặc định ON; sqlcmd thì thêm -I).
CREATE INDEX IX_SysAuditLog_UserId ON dbo.SysAuditLog (UserId, EventAt DESC);
GO
CREATE UNIQUE INDEX UX_SysBranch_Aggregate ON dbo.SysBranch (IsAggregate) WHERE IsAggregate = 1;
GO
