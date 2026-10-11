-- MES_Sewing 0001: module May, màn "Kế hoạch chuẩn bị SX" (Phase 5.5, ADR 0009).
-- Database MES_Sewing do quản trị CSDL tạo trước (tài khoản ứng dụng không có quyền CREATE DATABASE).
-- Quy ước như MES_Order: PascalCase, số ít, DATETIME2(3) UTC; bảng giao dịch có BranchCode, bảng con mang BranchCode
-- của cha và khóa ngoại ghép (ParentId, BranchCode) tới UNIQUE (Id, BranchCode) của cha.

-- Danh mục "Cấu hình chuẩn bị SX": các bước chuẩn bị trước ngày vào chuyền, dùng chung toàn công ty.
-- Thứ tự (SortOrder) là thứ tự cột trên màn hình. Không xóa vật lý (IsActive), mã không sửa được sau khi tạo.
CREATE TABLE dbo.PrepStep (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PrepStep PRIMARY KEY,
    Code        VARCHAR(30)   NOT NULL CONSTRAINT CK_PrepStep_Code CHECK (Code COLLATE Latin1_General_BIN NOT LIKE '%[^A-Z0-9._-]%' AND LEN(Code) > 0),
    Name        NVARCHAR(150) NOT NULL,
    Description NVARCHAR(300) NULL,
    -- Số ngày kế hoạch mặc định: KH của bước = Ngày vào chuyền - PlanDays
    PlanDays    INT           NOT NULL CONSTRAINT DF_PrepStep_PlanDays DEFAULT 0 CONSTRAINT CK_PrepStep_PlanDays CHECK (PlanDays BETWEEN 0 AND 365),
    -- Bộ phận, người thực hiện (chỉ hiển thị, chưa dùng để phân quyền)
    Performer   NVARCHAR(100) NULL,
    -- Nguồn dữ liệu đầu vào: chỉ dẫn lấy ngày thực hiện từ đâu
    DataSource  NVARCHAR(500) NULL,
    SortOrder   INT           NOT NULL CONSTRAINT DF_PrepStep_SortOrder DEFAULT 0,
    IsActive    BIT           NOT NULL CONSTRAINT DF_PrepStep_IsActive DEFAULT 1,
    IsSystem    BIT           NOT NULL CONSTRAINT DF_PrepStep_IsSystem DEFAULT 0,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_PrepStep_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_PrepStep_Code UNIQUE (Code)
);
CREATE INDEX IX_PrepStep_Sort ON dbo.PrepStep (SortOrder, Id);
GO

CREATE TRIGGER dbo.TR_PrepStep_CodeImmutable ON dbo.PrepStep AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(Code) AND EXISTS (SELECT 1 FROM inserted i JOIN deleted d ON d.Id = i.Id WHERE i.Code <> d.Code)
    BEGIN
        RAISERROR(N'CODE_IMMUTABLE: Mã bước chuẩn bị không được sửa.', 16, 1);
        ROLLBACK TRANSACTION;
    END
END;
GO

-- Dòng kế hoạch chuẩn bị: một dòng dàn chuyền (MES_Order.ShipmentPlanLine, khóa ngầm). Mã hàng, chuyền, ngày vào chuyền
-- là bản chép, cập nhật mỗi lần mở màn (ADR 0009), để lọc nhà máy, chuyền và phân trang ngay trong database này.
-- Loại mã, Số lượng chốt UD, HS ưu đãi VC nhập tay (chờ BA chỉ nguồn).
CREATE TABLE dbo.SewingPrep (
    Id                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SewingPrep PRIMARY KEY,
    ShipmentPlanLineId INT           NOT NULL,
    ShipmentPlanId     INT           NOT NULL,
    PlanNo             VARCHAR(30)   NOT NULL,
    CustomerName       NVARCHAR(100) NOT NULL,
    -- Cùng kiểu với MES_Order.ShipmentPlan (mã hàng BRAVO có chữ tiếng Việt, dài tới 120)
    StyleCode          NVARCHAR(120) NOT NULL,
    ProductName        NVARCHAR(150) NOT NULL,
    LineCode           VARCHAR(20)   NOT NULL,
    LineQty            INT           NOT NULL,
    StartDate          DATE          NOT NULL,
    StyleType          NVARCHAR(50)  NULL,
    ConfirmedQty       INT           NULL CONSTRAINT CK_SewingPrep_ConfirmedQty CHECK (ConfirmedQty >= 0),
    PriorityFactor     DECIMAL(9,2)  NULL CONSTRAINT CK_SewingPrep_PriorityFactor CHECK (PriorityFactor >= 0),
    -- Lần chép gần nhất từ dàn chuyền
    SourceSyncedAt     DATETIME2(3)  NOT NULL,
    BranchCode         VARCHAR(10)   NOT NULL,
    CreatedAt          DATETIME2(3)  NOT NULL CONSTRAINT DF_SewingPrep_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy          INT           NULL,
    ModifiedAt         DATETIME2(3)  NULL,
    ModifiedBy         INT           NULL,
    CONSTRAINT UQ_SewingPrep_IdBranch UNIQUE (Id, BranchCode)
);
CREATE UNIQUE INDEX UX_SewingPrep_Line ON dbo.SewingPrep (ShipmentPlanLineId);
CREATE INDEX IX_SewingPrep_Branch_Start ON dbo.SewingPrep (BranchCode, StartDate, Id);
CREATE INDEX IX_SewingPrep_Branch_Line ON dbo.SewingPrep (BranchCode, LineCode);
GO

-- Ngày theo bước của một dòng: số ngày KH chỉnh riêng (NULL: theo danh mục) và ngày thực hiện (TH).
-- Chỉ có dòng khi người dùng đã nhập; bước chưa có dòng ở đây là theo danh mục, chưa thực hiện.
CREATE TABLE dbo.SewingPrepStep (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SewingPrepStep PRIMARY KEY,
    SewingPrepId INT          NOT NULL,
    PrepStepId   INT          NOT NULL CONSTRAINT FK_SewingPrepStep_Step FOREIGN KEY REFERENCES dbo.PrepStep(Id),
    PlanDays     INT          NULL CONSTRAINT CK_SewingPrepStep_PlanDays CHECK (PlanDays BETWEEN 0 AND 365),
    DoneDate     DATE         NULL,
    BranchCode   VARCHAR(10)  NOT NULL,
    CreatedAt    DATETIME2(3) NOT NULL CONSTRAINT DF_SewingPrepStep_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT          NULL,
    ModifiedAt   DATETIME2(3) NULL,
    ModifiedBy   INT          NULL,
    CONSTRAINT FK_SewingPrepStep_Prep FOREIGN KEY (SewingPrepId, BranchCode) REFERENCES dbo.SewingPrep (Id, BranchCode) ON DELETE CASCADE,
    CONSTRAINT UQ_SewingPrepStep UNIQUE (SewingPrepId, PrepStepId)
);
CREATE INDEX IX_SewingPrepStep_Branch ON dbo.SewingPrepStep (BranchCode, SewingPrepId);
GO
