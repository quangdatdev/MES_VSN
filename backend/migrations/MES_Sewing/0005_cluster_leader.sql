-- MES_Sewing 0005: màn "Phân cụm trưởng" (phase 5.18, tài nguyên sewing.cluster).
-- Đầu vào lấy từ GSD (Phân tổ trưởng; Cập nhật cụm, Phân cụm theo mã hàng + chuyền). Tới khi nối GSD, npm run seed sinh dữ liệu giả lập
-- (SourceSystem = 'DEMO'); khi nối thì đồng bộ GSD vào MES_Sync rồi chép vào các bảng này, các cột Source* nhận diện dòng nguồn.
-- Đầu ra: cụm trưởng của từng cụm (cột Leader* của SewingTeamCluster, tổ trưởng nhập), cho màn Nhập năng suất cụm sau này.
-- Quy ước như 0001: PascalCase, số ít, DATETIME2(3) UTC; bảng con mang BranchCode của cha, khóa ngoại ghép (ParentId, BranchCode).
-- Bản cũ còn chạy không đọc các bảng này: chạy được trước khi deploy.

-- Tổ: một chuyền may (mã bộ phận MES_Hr.Department.Code, khóa ngầm, như SewingPrep.LineCode). Bảng nguồn của sewing.cluster: phạm vi
-- FACTORY → BranchCode, LINE → LineCode. Dòng do hệ thống chép (CreatedBy NULL); chuyền đổi ĐVCS thì lần chép sau tạo dòng ở ĐVCS mới
-- (BranchCode không sửa, CLAUDE.md mục 5).
CREATE TABLE dbo.SewingTeam (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SewingTeam PRIMARY KEY,
    LineCode       VARCHAR(20)   NOT NULL CONSTRAINT CK_SewingTeam_Line CHECK (LEN(LineCode) > 0),
    -- Nguồn của dòng: DEMO (seed giả lập), GSD (đồng bộ). Thêm nguồn mới thì thêm migration
    SourceSystem   VARCHAR(10)   NOT NULL CONSTRAINT CK_SewingTeam_Source CHECK (SourceSystem IN ('DEMO', 'GSD')),
    -- Khóa của dòng ở hệ thống nguồn (Id phòng ban của GSD); NULL với dữ liệu giả lập
    SourceKey      NVARCHAR(100) NULL,
    SourceSyncedAt DATETIME2(3)  NOT NULL,
    BranchCode     VARCHAR(10)   NOT NULL,
    CreatedAt      DATETIME2(3)  NOT NULL CONSTRAINT DF_SewingTeam_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy      INT           NULL,
    ModifiedAt     DATETIME2(3)  NULL,
    ModifiedBy     INT           NULL,
    CONSTRAINT UQ_SewingTeam_IdBranch UNIQUE (Id, BranchCode),
    -- Phạm vi chuyền (Trưởng chuyền) và khóa ngầm LineCode, BranchCode có index (CLAUDE.md mục 5)
    CONSTRAINT UQ_SewingTeam_Line UNIQUE (BranchCode, LineCode)
);
GO

-- Tổ trưởng của tổ (Phân tổ trưởng của GSD: Id phòng + Id nhân viên). Nhân viên là MES_Hr.Employee.Id (khóa ngầm, quyết định 10.3): khi
-- nối GSD, bước chép đối chiếu nhân viên GSD sang Id của MES. Một tổ có thể có nhiều tổ trưởng (tổ trưởng, tổ phó).
CREATE TABLE dbo.SewingTeamLeader (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SewingTeamLeader PRIMARY KEY,
    SewingTeamId   INT           NOT NULL,
    EmployeeId     INT           NOT NULL,
    SourceKey      NVARCHAR(100) NULL,
    SourceSyncedAt DATETIME2(3)  NOT NULL,
    BranchCode     VARCHAR(10)   NOT NULL,
    CreatedAt      DATETIME2(3)  NOT NULL CONSTRAINT DF_SewingTeamLeader_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy      INT           NULL,
    ModifiedAt     DATETIME2(3)  NULL,
    ModifiedBy     INT           NULL,
    CONSTRAINT FK_SewingTeamLeader_Team FOREIGN KEY (SewingTeamId, BranchCode) REFERENCES dbo.SewingTeam (Id, BranchCode) ON DELETE CASCADE,
    CONSTRAINT UQ_SewingTeamLeader UNIQUE (SewingTeamId, EmployeeId)
);
-- Tổ của người đăng nhập (theo nhân viên của tài khoản) và khóa ngầm EmployeeId
CREATE INDEX IX_SewingTeamLeader_Employee ON dbo.SewingTeamLeader (EmployeeId) INCLUDE (SewingTeamId, BranchCode);
CREATE INDEX IX_SewingTeamLeader_Branch ON dbo.SewingTeamLeader (BranchCode, SewingTeamId);
GO

-- Cụm của một mã hàng ở tổ (Cập nhật cụm, Phân cụm của GSD: Id mã hàng + Id chuyền). Màn hiện tên cụm, lưu mã (Code). Mã hàng cùng kiểu
-- với MES_Order (NVARCHAR(120), mã BRAVO có chữ tiếng Việt); StyleLabel là phần mô tả GSD ghi sau mã (ví dụ độ khó, mùa).
-- LeaderEmployeeId: cụm trưởng do tổ trưởng chọn (MES_Hr.Employee.Id, khóa ngầm); LeaderEmployeeCode là mã nhân viên chụp lúc lưu
-- (mã sửa được, quyết định 10.3; người dùng chốt phase 5.18 Q3). Lần chép sau cập nhật cột chép, giữ cột Leader*.
CREATE TABLE dbo.SewingTeamCluster (
    Id                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SewingTeamCluster PRIMARY KEY,
    SewingTeamId       INT           NOT NULL,
    StyleCode          NVARCHAR(120) NOT NULL CONSTRAINT CK_SewingTeamCluster_Style CHECK (LEN(StyleCode) > 0),
    StyleLabel         NVARCHAR(150) NULL,
    Code               NVARCHAR(50)  NOT NULL CONSTRAINT CK_SewingTeamCluster_Code CHECK (LEN(Code) > 0),
    Name               NVARCHAR(150) NOT NULL,
    SortOrder          INT           NOT NULL CONSTRAINT DF_SewingTeamCluster_SortOrder DEFAULT 0,
    SourceKey          NVARCHAR(100) NULL,
    SourceSyncedAt     DATETIME2(3)  NOT NULL,
    LeaderEmployeeId   INT           NULL,
    LeaderEmployeeCode VARCHAR(30)   NULL,
    BranchCode         VARCHAR(10)   NOT NULL,
    CreatedAt          DATETIME2(3)  NOT NULL CONSTRAINT DF_SewingTeamCluster_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy          INT           NULL,
    ModifiedAt         DATETIME2(3)  NULL,
    ModifiedBy         INT           NULL,
    CONSTRAINT FK_SewingTeamCluster_Team FOREIGN KEY (SewingTeamId, BranchCode) REFERENCES dbo.SewingTeam (Id, BranchCode) ON DELETE CASCADE,
    CONSTRAINT UQ_SewingTeamCluster UNIQUE (SewingTeamId, StyleCode, Code),
    -- Có cụm trưởng thì có mã chụp, bỏ cụm trưởng thì bỏ cả hai
    CONSTRAINT CK_SewingTeamCluster_Leader CHECK ((LeaderEmployeeId IS NULL AND LeaderEmployeeCode IS NULL) OR (LeaderEmployeeId IS NOT NULL AND LeaderEmployeeCode IS NOT NULL))
);
CREATE INDEX IX_SewingTeamCluster_Branch ON dbo.SewingTeamCluster (BranchCode, SewingTeamId, StyleCode);
-- Khóa ngầm tới MES_Hr.Employee.Id; màn Nhập năng suất cụm tìm cụm của cụm trưởng
CREATE INDEX IX_SewingTeamCluster_Leader ON dbo.SewingTeamCluster (LeaderEmployeeId) WHERE LeaderEmployeeId IS NOT NULL;
GO
