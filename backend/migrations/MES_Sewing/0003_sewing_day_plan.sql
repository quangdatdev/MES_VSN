-- MES_Sewing 0003: màn "Kế hoạch may" (phase 5.16, quyết định 14.1, 14.2).
-- Kế hoạch sản xuất theo ngày cho từng dòng dàn chuyền (chuyền + mã hàng + PO của Xếp chuyền): nhập Kế hoạch theo linemap, Kế
-- hoạch ngày xưởng giao, giờ; Cập nhật, Chốt, Hủy chốt. Đã giao, Còn lại, Doanh số tính lúc đọc, không lưu.
-- Quy ước như 0001: PascalCase, số ít, DATETIME2(3) UTC; bảng con mang BranchCode của cha, khóa ngoại ghép (ParentId, BranchCode).

-- Một chuyền trong một ngày: giữ trạng thái chốt. Chốt ở mức chuyền × ngày để chọn đơn vị là xưởng hay một chuyền cũng thấy cùng
-- trạng thái. LineCode là mã bộ phận chuyền may (MES_Hr.Department.Code VARCHAR(20), khóa ngầm); NVARCHAR(20) theo người dùng chốt
-- (phase 5.16 Q1), cùng độ dài nên không cắt mã. Tên người chốt là bản chụp lúc chốt (như ShipmentPlan.PlannerName).
CREATE TABLE dbo.SewingDayPlan (
    Id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SewingDayPlan PRIMARY KEY,
    PlanDate    DATE          NOT NULL,
    LineCode    NVARCHAR(20)  NOT NULL CONSTRAINT CK_SewingDayPlan_Line CHECK (LEN(LineCode) > 0),
    IsLocked    BIT           NOT NULL CONSTRAINT DF_SewingDayPlan_IsLocked DEFAULT 0,
    LockedAt    DATETIME2(3)  NULL,
    LockedBy    INT           NULL,
    LockerName  NVARCHAR(150) NULL,
    BranchCode  VARCHAR(10)   NOT NULL,
    CreatedAt   DATETIME2(3)  NOT NULL CONSTRAINT DF_SewingDayPlan_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy   INT           NULL,
    ModifiedAt  DATETIME2(3)  NULL,
    ModifiedBy  INT           NULL,
    CONSTRAINT UQ_SewingDayPlan_IdBranch UNIQUE (Id, BranchCode),
    CONSTRAINT UQ_SewingDayPlan_DayLine UNIQUE (BranchCode, PlanDate, LineCode),
    -- Chưa chốt thì chưa có người chốt; đã chốt thì phải có lúc, người chốt
    CONSTRAINT CK_SewingDayPlan_Lock CHECK (
        (IsLocked = 0 AND LockedAt IS NULL AND LockedBy IS NULL AND LockerName IS NULL)
        OR (IsLocked = 1 AND LockedAt IS NOT NULL AND LockerName IS NOT NULL))
);
-- Phạm vi chuyền (Trưởng chuyền) và khóa ngầm LineCode có index (CLAUDE.md mục 5)
CREATE INDEX IX_SewingDayPlan_Branch_Line ON dbo.SewingDayPlan (BranchCode, LineCode, PlanDate);
-- Khóa ngầm tới MES_Core.SysUser
CREATE INDEX IX_SewingDayPlan_LockedBy ON dbo.SewingDayPlan (LockedBy) WHERE LockedBy IS NOT NULL;
CREATE INDEX IX_SewingDayPlan_CreatedBy ON dbo.SewingDayPlan (CreatedBy) WHERE CreatedBy IS NOT NULL;
GO

-- Một dòng dàn chuyền trong ngày của chuyền. Dòng nguồn nhận diện bằng ShipmentPlanLineId + SourceCreatedAt (Id được dùng lại sau
-- reset:demo, load:bravo, như SewingPrep). Các cột chụp từ Xếp chuyền (kế hoạch, mã hàng, PO/Buy date, Giá CM, ngày, Tổng kế hoạch) là
-- bản chụp lúc Cập nhật, Chốt: ngày đã chốt hiện bản chụp. Số lượng DECIMAL(18,2) theo yêu cầu, máy chủ chỉ nhận số nguyên (Q2).
CREATE TABLE dbo.SewingDayPlanItem (
    Id                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SewingDayPlanItem PRIMARY KEY,
    SewingDayPlanId    INT            NOT NULL,
    ShipmentPlanLineId INT            NOT NULL,
    SourceCreatedAt    DATETIME2(3)   NOT NULL,
    ShipmentPlanId     INT            NOT NULL,
    StyleCode          NVARCHAR(120)  NOT NULL,
    ProductName        NVARCHAR(150)  NOT NULL,
    PoBuyDate          NVARCHAR(40)   NOT NULL,
    CmPrice            DECIMAL(18,4)  NULL CONSTRAINT CK_SewingDayPlanItem_CmPrice CHECK (CmPrice >= 0),
    StartDate          DATE           NOT NULL,
    EndDate            DATE           NOT NULL,
    PlanQty            DECIMAL(18,2)  NOT NULL CONSTRAINT CK_SewingDayPlanItem_PlanQty CHECK (PlanQty >= 0),
    LinemapQty         DECIMAL(18,2)  NULL CONSTRAINT CK_SewingDayPlanItem_LinemapQty CHECK (LinemapQty >= 0),
    DayQty             DECIMAL(18,2)  NULL CONSTRAINT CK_SewingDayPlanItem_DayQty CHECK (DayQty >= 0),
    StartTime          TIME(0)        NOT NULL CONSTRAINT DF_SewingDayPlanItem_StartTime DEFAULT '07:30',
    EndTime            TIME(0)        NOT NULL CONSTRAINT DF_SewingDayPlanItem_EndTime DEFAULT '17:10',
    SortOrder          INT            NOT NULL CONSTRAINT DF_SewingDayPlanItem_SortOrder DEFAULT 0,
    BranchCode         VARCHAR(10)    NOT NULL,
    CreatedAt          DATETIME2(3)   NOT NULL CONSTRAINT DF_SewingDayPlanItem_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy          INT            NULL,
    ModifiedAt         DATETIME2(3)   NULL,
    ModifiedBy         INT            NULL,
    CONSTRAINT FK_SewingDayPlanItem_Plan FOREIGN KEY (SewingDayPlanId, BranchCode) REFERENCES dbo.SewingDayPlan (Id, BranchCode) ON DELETE CASCADE,
    CONSTRAINT UQ_SewingDayPlanItem_Line UNIQUE (SewingDayPlanId, ShipmentPlanLineId),
    -- Không có ca qua đêm (Q13)
    CONSTRAINT CK_SewingDayPlanItem_Times CHECK (EndTime > StartTime),
    CONSTRAINT CK_SewingDayPlanItem_Dates CHECK (EndDate >= StartDate)
);
-- Đã giao (cộng mọi ngày của dòng dàn chuyền) và khóa ngầm ShipmentPlanLineId có index
CREATE INDEX IX_SewingDayPlanItem_Branch_Line ON dbo.SewingDayPlanItem (BranchCode, ShipmentPlanLineId) INCLUDE (SourceCreatedAt, SewingDayPlanId, DayQty);
-- Khóa ngầm tới MES_Order.ShipmentPlan.Id
CREATE INDEX IX_SewingDayPlanItem_Plan ON dbo.SewingDayPlanItem (ShipmentPlanId);
GO
