-- MES_Core 0001: bảng lõi cho Demo (xem docs/thiet-ke/db-core.md)
-- Quy ước: PascalCase, tiền tố Sys, thời điểm DATETIME2(3) UTC, FK vật lý chỉ trong cùng database.

CREATE TABLE dbo.SysBranch (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysBranch PRIMARY KEY,
    Code        VARCHAR(10)   NOT NULL,
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    IsAggregate BIT           NOT NULL CONSTRAINT DF_SysBranch_IsAggregate DEFAULT 0,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysBranch_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysBranch_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysBranch_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysBranch_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysBranch_Code UNIQUE (Code)
);
GO

-- BranchCode cấm sửa sau khi tạo (ADR 0002)
CREATE TRIGGER dbo.TR_SysBranch_CodeImmutable ON dbo.SysBranch AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id WHERE i.Code <> d.Code)
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã nhà máy không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

CREATE TABLE dbo.SysUser (
    Id               INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysUser PRIMARY KEY,
    Username         VARCHAR(50)   NOT NULL,
    PasswordHash     VARCHAR(255)  NOT NULL,
    FullName         NVARCHAR(100) NOT NULL,
    Email            VARCHAR(150)  NULL,
    EmployeeCode     VARCHAR(30)   NULL,
    FailedLoginCount INT           NOT NULL CONSTRAINT DF_SysUser_Failed DEFAULT 0,
    LockedUntilAt    DATETIME2(3)  NULL,
    LastLoginAt      DATETIME2(3)  NULL,
    IsActive         BIT           NOT NULL CONSTRAINT DF_SysUser_IsActive DEFAULT 1,
    CreatedAt        DATETIME2(3)  NOT NULL CONSTRAINT DF_SysUser_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy        INT           NULL,
    ModifiedAt       DATETIME2(3)  NULL,
    ModifiedBy       INT           NULL,
    CONSTRAINT UQ_SysUser_Username UNIQUE (Username)
);
GO

CREATE TABLE dbo.SysUserBranch (
    Id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysUserBranch PRIMARY KEY,
    UserId    INT NOT NULL CONSTRAINT FK_SysUserBranch_User   FOREIGN KEY REFERENCES dbo.SysUser(Id),
    BranchId  INT NOT NULL CONSTRAINT FK_SysUserBranch_Branch FOREIGN KEY REFERENCES dbo.SysBranch(Id),
    IsDefault BIT NOT NULL CONSTRAINT DF_SysUserBranch_IsDefault DEFAULT 0,
    CreatedAt DATETIME2(3) NOT NULL CONSTRAINT DF_SysUserBranch_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy INT NULL,
    CONSTRAINT UQ_SysUserBranch UNIQUE (UserId, BranchId)
);
CREATE INDEX IX_SysUserBranch_UserId   ON dbo.SysUserBranch (UserId);
CREATE INDEX IX_SysUserBranch_BranchId ON dbo.SysUserBranch (BranchId);
GO

CREATE TABLE dbo.SysRole (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysRole PRIMARY KEY,
    Code        VARCHAR(30)   NOT NULL,
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(255) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysRole_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysRole_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysRole_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysRole_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysRole_Code UNIQUE (Code)
);
GO

CREATE TABLE dbo.SysUserRole (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysUserRole PRIMARY KEY,
    UserId      INT NOT NULL CONSTRAINT FK_SysUserRole_User FOREIGN KEY REFERENCES dbo.SysUser(Id),
    RoleId      INT NOT NULL CONSTRAINT FK_SysUserRole_Role FOREIGN KEY REFERENCES dbo.SysRole(Id),
    ValidFromAt DATETIME2(3) NULL,
    ValidToAt   DATETIME2(3) NULL,
    CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_SysUserRole_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT NULL,
    CONSTRAINT UQ_SysUserRole UNIQUE (UserId, RoleId)
);
CREATE INDEX IX_SysUserRole_UserId ON dbo.SysUserRole (UserId);
CREATE INDEX IX_SysUserRole_RoleId ON dbo.SysUserRole (RoleId);
GO

CREATE TABLE dbo.SysResource (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysResource PRIMARY KEY,
    Code        VARCHAR(60)   NOT NULL,
    Name        NVARCHAR(100) NOT NULL,
    ModuleCode  VARCHAR(30)   NOT NULL,
    ScopeType   VARCHAR(10)   NOT NULL,
    SourceTable VARCHAR(128)  NULL,
    Description NVARCHAR(255) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysResource_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysResource_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysResource_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysResource_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysResource_Code UNIQUE (Code),
    CONSTRAINT CK_SysResource_ScopeType CHECK (ScopeType IN ('BRANCH', 'SHARED'))
);
GO

CREATE TABLE dbo.SysPermission (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysPermission PRIMARY KEY,
    Code        VARCHAR(80)   NOT NULL,
    ResourceId  INT           NOT NULL CONSTRAINT FK_SysPermission_Resource FOREIGN KEY REFERENCES dbo.SysResource(Id),
    ActionCode  VARCHAR(20)   NOT NULL,
    Name        NVARCHAR(150) NOT NULL,
    Description NVARCHAR(255) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysPermission_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysPermission_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysPermission_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysPermission_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysPermission_Code UNIQUE (Code),
    CONSTRAINT UQ_SysPermission_ResourceAction UNIQUE (ResourceId, ActionCode)
);
CREATE INDEX IX_SysPermission_ResourceId ON dbo.SysPermission (ResourceId);
GO

CREATE TABLE dbo.SysRolePermission (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysRolePermission PRIMARY KEY,
    RoleId       INT NOT NULL CONSTRAINT FK_SysRolePermission_Role       FOREIGN KEY REFERENCES dbo.SysRole(Id),
    PermissionId INT NOT NULL CONSTRAINT FK_SysRolePermission_Permission FOREIGN KEY REFERENCES dbo.SysPermission(Id),
    CreatedAt    DATETIME2(3) NOT NULL CONSTRAINT DF_SysRolePermission_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT NULL,
    CONSTRAINT UQ_SysRolePermission UNIQUE (RoleId, PermissionId)
);
CREATE INDEX IX_SysRolePermission_RoleId       ON dbo.SysRolePermission (RoleId);
CREATE INDEX IX_SysRolePermission_PermissionId ON dbo.SysRolePermission (PermissionId);
GO

CREATE TABLE dbo.SysMenu (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysMenu PRIMARY KEY,
    Code        VARCHAR(60)   NOT NULL,
    Name        NVARCHAR(100) NOT NULL,
    ParentId    INT           NULL CONSTRAINT FK_SysMenu_Parent   FOREIGN KEY REFERENCES dbo.SysMenu(Id),
    Path        VARCHAR(150)  NULL,
    Icon        VARCHAR(50)   NULL,
    ResourceId  INT           NULL CONSTRAINT FK_SysMenu_Resource FOREIGN KEY REFERENCES dbo.SysResource(Id),
    IsMobile    BIT           NOT NULL CONSTRAINT DF_SysMenu_IsMobile DEFAULT 0,
    Description NVARCHAR(255) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_SysMenu_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_SysMenu_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_SysMenu_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SysMenu_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SysMenu_Code UNIQUE (Code)
);
CREATE INDEX IX_SysMenu_ParentId   ON dbo.SysMenu (ParentId);
CREATE INDEX IX_SysMenu_ResourceId ON dbo.SysMenu (ResourceId);
GO

CREATE TABLE dbo.SysUserSession (
    Id               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysUserSession PRIMARY KEY,
    UserId           INT          NOT NULL CONSTRAINT FK_SysUserSession_User FOREIGN KEY REFERENCES dbo.SysUser(Id),
    RefreshTokenHash VARCHAR(128) NOT NULL,
    BranchCode       VARCHAR(10)  NULL,
    IssuedAt         DATETIME2(3) NOT NULL CONSTRAINT DF_SysUserSession_IssuedAt DEFAULT SYSUTCDATETIME(),
    ExpiresAt        DATETIME2(3) NOT NULL,
    RevokedAt        DATETIME2(3) NULL,
    IpAddress        VARCHAR(45)  NULL,
    UserAgent        VARCHAR(255) NULL,
    CONSTRAINT UQ_SysUserSession_Token UNIQUE (RefreshTokenHash)
);
CREATE INDEX IX_SysUserSession_UserId ON dbo.SysUserSession (UserId);
GO

CREATE TABLE dbo.SysPermissionVersion (
    Id         INT          NOT NULL CONSTRAINT PK_SysPermissionVersion PRIMARY KEY,
    Version    BIGINT       NOT NULL,
    ModifiedAt DATETIME2(3) NOT NULL CONSTRAINT DF_SysPermissionVersion_ModifiedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_SysPermissionVersion_Single CHECK (Id = 1)
);
INSERT INTO dbo.SysPermissionVersion (Id, Version) VALUES (1, 1);
GO

CREATE TABLE dbo.SysAuditLog (
    Id         BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysAuditLog PRIMARY KEY,
    EventAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_SysAuditLog_EventAt DEFAULT SYSUTCDATETIME(),
    UserId     INT           NULL,
    Username   VARCHAR(50)   NULL,
    BranchCode VARCHAR(10)   NULL,
    EntityType VARCHAR(40)   NOT NULL,
    EntityId   VARCHAR(40)   NULL,
    ActionCode VARCHAR(30)   NOT NULL,
    OldValue   NVARCHAR(MAX) NULL,
    NewValue   NVARCHAR(MAX) NULL,
    IpAddress  VARCHAR(45)   NULL
);
CREATE INDEX IX_SysAuditLog_EventAt ON dbo.SysAuditLog (EventAt DESC);
CREATE INDEX IX_SysAuditLog_Entity  ON dbo.SysAuditLog (EntityType, EntityId);
GO

-- Nhật ký chỉ ghi thêm: chặn sửa/xóa
CREATE TRIGGER dbo.TR_SysAuditLog_AppendOnly ON dbo.SysAuditLog INSTEAD OF UPDATE, DELETE AS
BEGIN
    RAISERROR(N'SysAuditLog chỉ cho phép ghi thêm.', 16, 1);
END;
GO

-- Tạo sẵn cho mô hình đích (chưa có giao diện trong Demo)
CREATE TABLE dbo.SysFieldPolicy (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysFieldPolicy PRIMARY KEY,
    SubjectType VARCHAR(10) NOT NULL,
    SubjectId   INT         NOT NULL,
    ResourceId  INT         NOT NULL CONSTRAINT FK_SysFieldPolicy_Resource FOREIGN KEY REFERENCES dbo.SysResource(Id),
    FieldCode   VARCHAR(60) NOT NULL,
    AccessLevel VARCHAR(10) NOT NULL,
    CreatedAt   DATETIME2(3) NOT NULL CONSTRAINT DF_SysFieldPolicy_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT NULL,
    CONSTRAINT CK_SysFieldPolicy_Subject CHECK (SubjectType IN ('ROLE', 'USER')),
    CONSTRAINT CK_SysFieldPolicy_Access  CHECK (AccessLevel IN ('HIDDEN', 'MASKED', 'READONLY', 'EDITABLE')),
    CONSTRAINT UQ_SysFieldPolicy UNIQUE (SubjectType, SubjectId, ResourceId, FieldCode)
);
CREATE INDEX IX_SysFieldPolicy_ResourceId ON dbo.SysFieldPolicy (ResourceId);
GO

CREATE TABLE dbo.SysUserPermissionOverride (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysUserPermissionOverride PRIMARY KEY,
    UserId       INT NOT NULL CONSTRAINT FK_SysUserPermOverride_User       FOREIGN KEY REFERENCES dbo.SysUser(Id),
    PermissionId INT NOT NULL CONSTRAINT FK_SysUserPermOverride_Permission FOREIGN KEY REFERENCES dbo.SysPermission(Id),
    Effect       VARCHAR(5)    NOT NULL,
    ValidFromAt  DATETIME2(3)  NULL,
    ValidToAt    DATETIME2(3)  NULL,
    Reason       NVARCHAR(255) NULL,
    CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_SysUserPermOverride_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT NULL,
    CONSTRAINT CK_SysUserPermOverride_Effect CHECK (Effect IN ('ALLOW', 'DENY')),
    CONSTRAINT UQ_SysUserPermOverride UNIQUE (UserId, PermissionId)
);
CREATE INDEX IX_SysUserPermOverride_UserId       ON dbo.SysUserPermissionOverride (UserId);
CREATE INDEX IX_SysUserPermOverride_PermissionId ON dbo.SysUserPermissionOverride (PermissionId);
GO
