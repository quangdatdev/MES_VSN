-- MES_Hr 0001: module Nhân sự, màn Sơ đồ tổ chức và Thông tin nhân sự (Phase 5.8, ADR 0012).
-- Database MES_Hr do quản trị CSDL tạo trước, cấp db_owner cho tài khoản ứng dụng (tài khoản ứng dụng không có quyền CREATE DATABASE).
-- Quy ước như các database khác: PascalCase, số ít, DATETIME2(3) UTC. CHECK mã có DATALENGTH = LEN: LIKE trên VARCHAR bỏ qua khoảng
-- trắng cuối nên 'NV1 ' lọt qua mẫu ký tự (review 5.8 L1). Dữ liệu dùng chung toàn công ty (SHARED), không có BranchCode
-- bắt buộc; phòng ban thuộc một nhà máy thì gắn BranchCode (khóa ngầm tới MES_Core.SysBranch.Code, khai ở softkeys.json).
-- Bảng có trigger thì không INSERT ... OUTPUT được: ứng dụng thêm rồi đọc lại theo mã.

-- Loại phòng ban (Công ty, Khối, Phòng, Bộ phận...). LevelOrder để sắp xếp cây; IsFinalLevel: không thêm phòng ban con được.
CREATE TABLE dbo.DepartmentType (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DepartmentType PRIMARY KEY,
    Code         VARCHAR(20)   NOT NULL CONSTRAINT CK_DepartmentType_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9_-]%' AND LEN(Code) > 0 AND DATALENGTH(Code) = LEN(Code)),
    Name         NVARCHAR(100) NOT NULL,
    Description  NVARCHAR(300) NULL,
    LevelOrder   INT           NOT NULL CONSTRAINT DF_DepartmentType_LevelOrder DEFAULT 0 CONSTRAINT CK_DepartmentType_LevelOrder CHECK (LevelOrder BETWEEN 0 AND 99),
    IsFinalLevel BIT           NOT NULL CONSTRAINT DF_DepartmentType_IsFinalLevel DEFAULT 0,
    SortOrder    INT           NOT NULL CONSTRAINT DF_DepartmentType_SortOrder DEFAULT 0,
    IsActive     BIT           NOT NULL CONSTRAINT DF_DepartmentType_IsActive DEFAULT 1,
    IsSystem     BIT           NOT NULL CONSTRAINT DF_DepartmentType_IsSystem DEFAULT 0,
    CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_DepartmentType_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT           NULL,
    ModifiedAt   DATETIME2(3)  NULL,
    ModifiedBy   INT           NULL,
    CONSTRAINT UQ_DepartmentType_Code UNIQUE (Code)
);
GO

CREATE TRIGGER dbo.TR_DepartmentType_CodeImmutable ON dbo.DepartmentType AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id
        WHERE CAST(i.Code AS VARBINARY(20)) <> CAST(d.Code AS VARBINARY(20))
    )
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã loại phòng ban không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Cây phòng ban hành chính (ADR 0012 mục 3). Path = Path của cha + Code + '/' ('/VSN/VSN-OFFICE/HQ/'), lọc cả nhánh bằng
-- LEFT(Path, LEN(@path)) = @path. Mã chỉ chữ hoa ASCII, số, gạch ngang (mã nằm trong Path) và không sửa được.
-- Không xóa vật lý: giải thể là IsActive = 0 kèm DissolvedDate.
CREATE TABLE dbo.Department (
    Id                INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Department PRIMARY KEY,
    Code              VARCHAR(20)   NOT NULL CONSTRAINT CK_Department_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9-]%' AND LEN(Code) > 0 AND DATALENGTH(Code) = LEN(Code)),
    Name              NVARCHAR(255) NOT NULL,
    NameEn            NVARCHAR(255) NULL,
    DepartmentTypeId  INT           NOT NULL CONSTRAINT FK_Department_Type FOREIGN KEY REFERENCES dbo.DepartmentType(Id),
    ParentId          INT           NULL CONSTRAINT FK_Department_Parent FOREIGN KEY REFERENCES dbo.Department(Id),
    Path              VARCHAR(400)  NOT NULL,
    -- Người quản lý: khóa ngoại thêm sau khi tạo bảng Employee
    ManagerEmployeeId INT           NULL,
    -- Phòng ban thuộc một nhà máy (khóa ngầm MES_Core.SysBranch.Code; không gắn đơn vị tổng hợp A00, ứng dụng kiểm)
    BranchCode        VARCHAR(10)   NULL,
    EstablishedDate   DATE          NULL,
    DissolvedDate     DATE          NULL,
    -- Thứ tự giữa các phòng ban cùng cấp
    SortOrder         INT           NOT NULL CONSTRAINT DF_Department_SortOrder DEFAULT 0,
    IsActive          BIT           NOT NULL CONSTRAINT DF_Department_IsActive DEFAULT 1,
    CreatedAt         DATETIME2(3)  NOT NULL CONSTRAINT DF_Department_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy         INT           NULL,
    ModifiedAt        DATETIME2(3)  NULL,
    ModifiedBy        INT           NULL,
    CONSTRAINT UQ_Department_Code UNIQUE (Code),
    CONSTRAINT CK_Department_NotSelf CHECK (ParentId IS NULL OR ParentId <> Id),
    -- Path kết thúc bằng chính mã (LEFT/RIGHT, không dùng LIKE để tránh ký tự đại diện); khớp cây do trigger kiểm
    CONSTRAINT CK_Department_Path CHECK (LEFT(Path, 1) = '/' AND RIGHT(Path, LEN(Code) + 2) = '/' + Code + '/'),
    -- Đang dùng thì chưa có ngày giải thể; đã giải thể thì phải có
    CONSTRAINT CK_Department_Dissolved CHECK ((IsActive = 1 AND DissolvedDate IS NULL) OR (IsActive = 0 AND DissolvedDate IS NOT NULL)),
    CONSTRAINT CK_Department_Dates CHECK (DissolvedDate IS NULL OR EstablishedDate IS NULL OR DissolvedDate >= EstablishedDate)
);
CREATE UNIQUE INDEX UX_Department_Path ON dbo.Department (Path);
CREATE INDEX IX_Department_ParentId ON dbo.Department (ParentId);
CREATE INDEX IX_Department_BranchCode ON dbo.Department (BranchCode);
GO

-- So sánh nhị phân: đổi hoa thường hay thêm khoảng trắng cuối cũng bị chặn (collation mặc định không phân biệt)
CREATE TRIGGER dbo.TR_Department_CodeImmutable ON dbo.Department AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id
        WHERE CAST(i.Code AS VARBINARY(20)) <> CAST(d.Code AS VARBINARY(20))
    )
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã phòng ban không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Path của dòng vừa ghi khớp cha, và Path của các con trực tiếp khớp dòng vừa ghi: đổi cha mà quên cập nhật cả nhánh thì bị
-- chặn. Path duy nhất và khớp cha nên cây không có vòng lặp.
CREATE TRIGGER dbo.TR_Department_PathMatchesParent ON dbo.Department AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS (
        SELECT 1 FROM inserted i
        LEFT JOIN dbo.Department p ON p.Id = i.ParentId
        WHERE (i.ParentId IS NULL AND i.Path <> '/' + i.Code + '/')
           OR (i.ParentId IS NOT NULL AND (p.Id IS NULL OR i.Path <> p.Path + i.Code + '/'))
    ) OR EXISTS (
        SELECT 1 FROM inserted i
        JOIN dbo.Department c ON c.ParentId = i.Id
        WHERE c.Path <> i.Path + c.Code + '/'
    )
    BEGIN
        RAISERROR(N'DEPARTMENT_PATH_MISMATCH: Path của phòng ban phải bằng Path của cha + mã + "/".', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Chức danh (ADR 0012 mục 7). DepartmentId NULL: dùng chung toàn công ty; có giá trị: dùng cho phòng ban đó và cả nhánh con.
-- Không đặt tên Position (từ khóa dành riêng của ODBC).
CREATE TABLE dbo.JobTitle (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_JobTitle PRIMARY KEY,
    Code         VARCHAR(30)   NOT NULL CONSTRAINT CK_JobTitle_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9._-]%' AND LEN(Code) > 0 AND DATALENGTH(Code) = LEN(Code)),
    Name         NVARCHAR(150) NOT NULL,
    Description  NVARCHAR(300) NULL,
    DepartmentId INT           NULL CONSTRAINT FK_JobTitle_Department FOREIGN KEY REFERENCES dbo.Department(Id),
    SortOrder    INT           NOT NULL CONSTRAINT DF_JobTitle_SortOrder DEFAULT 0,
    IsActive     BIT           NOT NULL CONSTRAINT DF_JobTitle_IsActive DEFAULT 1,
    IsSystem     BIT           NOT NULL CONSTRAINT DF_JobTitle_IsSystem DEFAULT 0,
    CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_JobTitle_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT           NULL,
    ModifiedAt   DATETIME2(3)  NULL,
    ModifiedBy   INT           NULL,
    CONSTRAINT UQ_JobTitle_Code UNIQUE (Code)
);
CREATE INDEX IX_JobTitle_DepartmentId ON dbo.JobTitle (DepartmentId);
GO

CREATE TRIGGER dbo.TR_JobTitle_CodeImmutable ON dbo.JobTitle AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id
        WHERE CAST(i.Code AS VARBINARY(30)) <> CAST(d.Code AS VARBINARY(30))
    )
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã chức danh không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Hồ sơ nhân viên: một bảng (Support-Web tách 2 bảng nối bằng chuỗi mã). Mã nhân viên sửa được, chỉ cấm trùng; mọi liên kết đi
-- theo Id (ADR 0012 mục 4). Không xóa vật lý: nghỉ việc là EmploymentStatus = 2 (kèm EndDate nếu biết).
-- 15 cột cuối lấy theo file xuất của máy chấm công, đều không bắt buộc; không lưu "Mật mã" (PIN máy chấm công).
CREATE TABLE dbo.Employee (
    Id                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Employee PRIMARY KEY,
    -- Chữ hoa, số, dấu chấm, gạch dưới, gạch ngang (ứng dụng tự viết hoa); cùng độ dài SysUser.EmployeeCode
    Code                 VARCHAR(30)   NOT NULL CONSTRAINT CK_Employee_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9._-]%' AND LEN(Code) > 0 AND DATALENGTH(Code) = LEN(Code)),
    -- Mã trên máy chấm công; để trống khi lưu thì ứng dụng lấy theo mã nhân viên
    TimekeepingCode      VARCHAR(30)   NULL CONSTRAINT CK_Employee_TimekeepingCode CHECK (TimekeepingCode COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9._-]%' AND LEN(TimekeepingCode) > 0 AND DATALENGTH(TimekeepingCode) = LEN(TimekeepingCode)),
    FullName             NVARCHAR(255) NOT NULL,
    FullNameEn           NVARCHAR(255) NULL,
    -- Chỉ ký tự ASCII, ứng dụng kiểm (EMAIL ở employee-fields.ts): VARCHAR bảng mã 1252 đổi chữ có dấu trước khi CHECK chạy nên
    -- CHECK ở đây không bắt được
    Email                VARCHAR(150)  NULL,
    -- 1 Nam, 2 Nữ, 3 Khác
    Gender               TINYINT       NOT NULL CONSTRAINT CK_Employee_Gender CHECK (Gender IN (1, 2, 3)),
    DepartmentId         INT           NOT NULL CONSTRAINT FK_Employee_Department FOREIGN KEY REFERENCES dbo.Department(Id),
    JobTitleId           INT           NOT NULL CONSTRAINT FK_Employee_JobTitle FOREIGN KEY REFERENCES dbo.JobTitle(Id),
    -- 1 Đang làm việc, 2 Nghỉ việc
    EmploymentStatus     TINYINT       NOT NULL CONSTRAINT DF_Employee_EmploymentStatus DEFAULT 1 CONSTRAINT CK_Employee_EmploymentStatus CHECK (EmploymentStatus IN (1, 2)),
    StartDate            DATE          NULL,
    -- Ngày nghỉ việc: chỉ có khi đã nghỉ
    EndDate              DATE          NULL,
    TimekeepingName      NVARCHAR(255) NULL,
    CardCode             NVARCHAR(50)  NULL,
    -- Loại nhân viên theo file máy chấm công (Chính thức, Thời vụ...); không đặt EmployeeType (lặp tên bảng)
    StaffType            NVARCHAR(100) NULL,
    IsTimekeepingAllowed BIT           NULL,
    Nickname             NVARCHAR(255) NULL,
    BirthDate            DATE          NULL,
    BirthPlace           NVARCHAR(255) NULL,
    Hometown             NVARCHAR(255) NULL,
    Ethnicity            NVARCHAR(100) NULL,
    Nationality          NVARCHAR(100) NULL,
    IdNumber             NVARCHAR(50)  NULL,
    IdIssuePlace         NVARCHAR(255) NULL,
    ContactPhone         NVARCHAR(50)  NULL,
    ContactPerson        NVARCHAR(255) NULL,
    CurrentAddress       NVARCHAR(500) NULL,
    CreatedAt            DATETIME2(3)  NOT NULL CONSTRAINT DF_Employee_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy            INT           NULL,
    ModifiedAt           DATETIME2(3)  NULL,
    ModifiedBy           INT           NULL,
    CONSTRAINT UQ_Employee_Code UNIQUE (Code),
    CONSTRAINT CK_Employee_EndDate CHECK (EndDate IS NULL OR (EmploymentStatus = 2 AND (StartDate IS NULL OR EndDate >= StartDate)))
);
CREATE UNIQUE INDEX UX_Employee_TimekeepingCode ON dbo.Employee (TimekeepingCode) WHERE TimekeepingCode IS NOT NULL;
-- Lọc theo phòng ban và đếm người đang làm của từng phòng ban (cây, chặn giải thể) dùng chung chỉ mục này
CREATE INDEX IX_Employee_Department_Status ON dbo.Employee (DepartmentId, EmploymentStatus);
CREATE INDEX IX_Employee_JobTitleId ON dbo.Employee (JobTitleId);
GO

ALTER TABLE dbo.Department ADD CONSTRAINT FK_Department_Manager FOREIGN KEY (ManagerEmployeeId) REFERENCES dbo.Employee(Id);
CREATE INDEX IX_Department_ManagerEmployeeId ON dbo.Department (ManagerEmployeeId);
GO
