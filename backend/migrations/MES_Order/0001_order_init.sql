-- MES_Order 0001: module Đơn hàng (Phase 5.3, ADR 0006). Nguồn màn hình: docs/nguon/BẢNG MÔ TẢ GIAO DIỆN MES - ĐƠN HÀNG.docx.
-- Quy ước như MES_Core: PascalCase, số ít, DATETIME2(3) UTC, bảng giao dịch có BranchCode (khóa ngầm tới MES_Core.SysBranch.Code).
-- Bảng con mang BranchCode của cha và có khóa ngoại ghép (ParentId, BranchCode) tới UNIQUE (Id, BranchCode) của cha:
-- dòng con không bao giờ nằm khác nhà máy với dòng cha, kể cả khi service viết sai.
-- Chưa đồng bộ BRAVO (người dùng quyết định 09/10/2026): dữ liệu do seed tạo và nhập tay trên màn hình.

-- Đơn hàng theo mã hàng (màn "Thông tin đơn hàng", tài nguyên order.allocation)
CREATE TABLE dbo.SalesOrder (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalesOrder PRIMARY KEY,
    OrderNo      VARCHAR(30)   NOT NULL,
    CustomerName NVARCHAR(100) NOT NULL,
    StyleCode    VARCHAR(30)   NOT NULL,
    Season       VARCHAR(20)   NULL,
    OrderType    NVARCHAR(30)  NULL,
    ProductName  NVARCHAR(150) NOT NULL,
    -- Người lập đơn bên hệ thống nguồn (BRAVO), không phải tài khoản MES
    StaffName    NVARCHAR(100) NULL,
    Qty          INT           NOT NULL CONSTRAINT CK_SalesOrder_Qty CHECK (Qty >= 0),
    UnitName     NVARCHAR(20)  NOT NULL CONSTRAINT DF_SalesOrder_UnitName DEFAULT N'Chiếc',
    UnitPrice    DECIMAL(18,4) NULL CONSTRAINT CK_SalesOrder_UnitPrice CHECK (UnitPrice >= 0),
    -- Thành tiền luôn tính từ số lượng và đơn giá; DECIMAL(29,2) chứa đủ INT × DECIMAL(18,4)
    Amount       AS (CAST(Qty * UnitPrice AS DECIMAL(29,2))) PERSISTED,
    CmPrice      DECIMAL(18,4) NULL CONSTRAINT CK_SalesOrder_CmPrice CHECK (CmPrice >= 0),
    SyncedAt     DATETIME2(3)  NULL,
    ShipDate     DATE          NOT NULL,
    StatusCode   VARCHAR(20)   NOT NULL CONSTRAINT DF_SalesOrder_Status DEFAULT 'NEW'
                 CONSTRAINT CK_SalesOrder_Status CHECK (StatusCode IN ('NEW', 'PLANNING', 'IN_PRODUCTION', 'DONE', 'CANCELLED')),
    BranchCode   VARCHAR(10)   NOT NULL,
    CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_SalesOrder_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT           NULL,
    ModifiedAt   DATETIME2(3)  NULL,
    ModifiedBy   INT           NULL,
    CONSTRAINT UQ_SalesOrder_IdBranch UNIQUE (Id, BranchCode)
);
CREATE UNIQUE INDEX UX_SalesOrder_Branch_OrderNo ON dbo.SalesOrder (BranchCode, OrderNo);
CREATE INDEX IX_SalesOrder_Branch_ShipDate ON dbo.SalesOrder (BranchCode, ShipDate DESC, Id DESC);
CREATE INDEX IX_SalesOrder_Branch_Style ON dbo.SalesOrder (BranchCode, StyleCode);
GO

-- PO của đơn hàng (màn "Cập nhật tỷ lệ cắt", tài nguyên order.po).
-- CustomerName, StyleCode là bản chụp từ đơn hàng: màn tỷ lệ cắt dựng danh sách mã hàng từ chính bảng này,
-- không phải đọc bảng của tài nguyên khác (người chỉ có quyền order.po vẫn dùng được màn).
CREATE TABLE dbo.SalesOrderPo (
    Id                   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalesOrderPo PRIMARY KEY,
    SalesOrderId         INT           NOT NULL,
    PoCode               VARCHAR(30)   NOT NULL,
    PoNumber             VARCHAR(40)   NOT NULL,
    CustomerName         NVARCHAR(100) NOT NULL,
    StyleCode            VARCHAR(30)   NOT NULL,
    -- Tổng số lượng màu cỡ, service cập nhật cùng transaction khi sửa màu cỡ
    Qty                  INT           NOT NULL CONSTRAINT CK_SalesOrderPo_Qty CHECK (Qty >= 0),
    Destination          NVARCHAR(60)  NULL,
    PackingListCode      VARCHAR(30)   NULL,
    CustomsDeclarationNo VARCHAR(30)   NULL,
    SyncedAt             DATETIME2(3)  NULL,
    ShipDate             DATE          NOT NULL,
    StatusCode           VARCHAR(20)   NOT NULL CONSTRAINT DF_SalesOrderPo_Status DEFAULT 'DRAFT'
                         CONSTRAINT CK_SalesOrderPo_Status CHECK (StatusCode IN ('DRAFT', 'CONFIRMED')),
    ConfirmedAt          DATETIME2(3)  NULL,
    ConfirmedBy          INT           NULL,
    BranchCode           VARCHAR(10)   NOT NULL,
    CreatedAt            DATETIME2(3)  NOT NULL CONSTRAINT DF_SalesOrderPo_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy            INT           NULL,
    ModifiedAt           DATETIME2(3)  NULL,
    ModifiedBy           INT           NULL,
    CONSTRAINT UQ_SalesOrderPo_IdBranch UNIQUE (Id, BranchCode),
    CONSTRAINT FK_SalesOrderPo_SalesOrder FOREIGN KEY (SalesOrderId, BranchCode) REFERENCES dbo.SalesOrder (Id, BranchCode)
);
CREATE UNIQUE INDEX UX_SalesOrderPo_Branch_PoCode ON dbo.SalesOrderPo (BranchCode, PoCode);
CREATE INDEX IX_SalesOrderPo_Branch_Order ON dbo.SalesOrderPo (BranchCode, SalesOrderId);
CREATE INDEX IX_SalesOrderPo_SalesOrderId ON dbo.SalesOrderPo (SalesOrderId);
GO

CREATE TABLE dbo.SalesOrderPoColorSize (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SalesOrderPoColorSize PRIMARY KEY,
    SalesOrderPoId INT           NOT NULL,
    ColorName      NVARCHAR(50)  NOT NULL,
    SizeName       VARCHAR(20)   NOT NULL,
    Qty            INT           NOT NULL CONSTRAINT CK_SalesOrderPoColorSize_Qty CHECK (Qty >= 0),
    SortOrder      INT           NOT NULL CONSTRAINT DF_SalesOrderPoColorSize_SortOrder DEFAULT 0,
    BranchCode     VARCHAR(10)   NOT NULL,
    CreatedAt      DATETIME2(3)  NOT NULL CONSTRAINT DF_SalesOrderPoColorSize_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy      INT           NULL,
    ModifiedAt     DATETIME2(3)  NULL,
    ModifiedBy     INT           NULL,
    CONSTRAINT FK_SalesOrderPoColorSize_Po FOREIGN KEY (SalesOrderPoId, BranchCode) REFERENCES dbo.SalesOrderPo (Id, BranchCode),
    CONSTRAINT UQ_SalesOrderPoColorSize UNIQUE (SalesOrderPoId, ColorName, SizeName)
);
CREATE INDEX IX_SalesOrderPoColorSize_Branch ON dbo.SalesOrderPoColorSize (BranchCode, SalesOrderPoId);
GO

-- Kế hoạch xuất hàng (tài nguyên order.shipment). Màn "Xếp chuyền" (order.lineplan) đọc cùng bảng này qua repository riêng.
-- Thông tin đơn hàng là bản chụp lúc lập kế hoạch: Trưởng chuyền chỉ có quyền Xếp chuyền vẫn thấy khách hàng, mã hàng.
CREATE TABLE dbo.ShipmentPlan (
    Id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ShipmentPlan PRIMARY KEY,
    PlanNo       VARCHAR(30)   NOT NULL,
    SalesOrderId INT           NOT NULL,
    CustomerName NVARCHAR(100) NOT NULL,
    StyleCode    VARCHAR(30)   NOT NULL,
    ProductName  NVARCHAR(150) NOT NULL,
    OrderType    NVARCHAR(30)  NULL,
    PoBuyDate    NVARCHAR(40)  NOT NULL,
    PlanQty      INT           NOT NULL CONSTRAINT CK_ShipmentPlan_PlanQty CHECK (PlanQty >= 0),
    CmPrice      DECIMAL(18,4) NULL CONSTRAINT CK_ShipmentPlan_CmPrice CHECK (CmPrice >= 0),
    -- Doanh số = số lượng kế hoạch × giá CM
    Revenue      AS (CAST(PlanQty * CmPrice AS DECIMAL(29,2))) PERSISTED,
    SyncedAt     DATETIME2(3)  NULL,
    ShipDate     DATE          NOT NULL,
    PlannerName  NVARCHAR(150) NOT NULL,
    -- Lũy kế từ các công đoạn sau; giai đoạn này là số giả do seed điền, sau lấy từ module Cắt, May, QMS, Hoàn thiện
    CutQty       INT           NOT NULL CONSTRAINT DF_ShipmentPlan_CutQty DEFAULT 0,
    SewnQty      INT           NOT NULL CONSTRAINT DF_ShipmentPlan_SewnQty DEFAULT 0,
    EndlineQty   INT           NOT NULL CONSTRAINT DF_ShipmentPlan_EndlineQty DEFAULT 0,
    FinishedQty  INT           NOT NULL CONSTRAINT DF_ShipmentPlan_FinishedQty DEFAULT 0,
    StatusCode   VARCHAR(20)   NOT NULL CONSTRAINT DF_ShipmentPlan_Status DEFAULT 'PLANNED'
                 CONSTRAINT CK_ShipmentPlan_Status CHECK (StatusCode IN ('PLANNED', 'SCHEDULED', 'IN_PRODUCTION', 'DONE')),
    BranchCode   VARCHAR(10)   NOT NULL,
    CreatedAt    DATETIME2(3)  NOT NULL CONSTRAINT DF_ShipmentPlan_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy    INT           NULL,
    ModifiedAt   DATETIME2(3)  NULL,
    ModifiedBy   INT           NULL,
    CONSTRAINT UQ_ShipmentPlan_IdBranch UNIQUE (Id, BranchCode),
    CONSTRAINT FK_ShipmentPlan_SalesOrder FOREIGN KEY (SalesOrderId, BranchCode) REFERENCES dbo.SalesOrder (Id, BranchCode)
);
CREATE UNIQUE INDEX UX_ShipmentPlan_Branch_PlanNo ON dbo.ShipmentPlan (BranchCode, PlanNo);
CREATE INDEX IX_ShipmentPlan_Branch_ShipDate ON dbo.ShipmentPlan (BranchCode, ShipDate DESC, Id DESC);
CREATE INDEX IX_ShipmentPlan_SalesOrderId ON dbo.ShipmentPlan (SalesOrderId);
GO

-- PO được chọn khi lập kế hoạch (popup "Chọn mã hàng")
CREATE TABLE dbo.ShipmentPlanPo (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ShipmentPlanPo PRIMARY KEY,
    ShipmentPlanId INT          NOT NULL,
    SalesOrderPoId INT          NOT NULL,
    BranchCode     VARCHAR(10)  NOT NULL,
    CreatedAt      DATETIME2(3) NOT NULL CONSTRAINT DF_ShipmentPlanPo_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy      INT          NULL,
    ModifiedAt     DATETIME2(3) NULL,
    ModifiedBy     INT          NULL,
    CONSTRAINT FK_ShipmentPlanPo_Plan FOREIGN KEY (ShipmentPlanId, BranchCode) REFERENCES dbo.ShipmentPlan (Id, BranchCode),
    CONSTRAINT FK_ShipmentPlanPo_Po   FOREIGN KEY (SalesOrderPoId, BranchCode) REFERENCES dbo.SalesOrderPo (Id, BranchCode),
    CONSTRAINT UQ_ShipmentPlanPo UNIQUE (ShipmentPlanId, SalesOrderPoId)
);
CREATE INDEX IX_ShipmentPlanPo_Branch ON dbo.ShipmentPlanPo (BranchCode, ShipmentPlanId);
CREATE INDEX IX_ShipmentPlanPo_SalesOrderPoId ON dbo.ShipmentPlanPo (SalesOrderPoId);
GO

-- Số lượng kế hoạch theo màu cỡ. OriginalQty: số lượng gốc của các PO đã chọn tại lúc lập.
CREATE TABLE dbo.ShipmentPlanColorSize (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ShipmentPlanColorSize PRIMARY KEY,
    ShipmentPlanId INT          NOT NULL,
    ColorName      NVARCHAR(50) NOT NULL,
    SizeName       VARCHAR(20)  NOT NULL,
    OriginalQty    INT          NOT NULL CONSTRAINT CK_ShipmentPlanColorSize_OriginalQty CHECK (OriginalQty >= 0),
    PlanQty        INT          NOT NULL CONSTRAINT CK_ShipmentPlanColorSize_PlanQty CHECK (PlanQty >= 0),
    SortOrder      INT          NOT NULL CONSTRAINT DF_ShipmentPlanColorSize_SortOrder DEFAULT 0,
    BranchCode     VARCHAR(10)  NOT NULL,
    CreatedAt      DATETIME2(3) NOT NULL CONSTRAINT DF_ShipmentPlanColorSize_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy      INT          NULL,
    ModifiedAt     DATETIME2(3) NULL,
    ModifiedBy     INT          NULL,
    CONSTRAINT FK_ShipmentPlanColorSize_Plan FOREIGN KEY (ShipmentPlanId, BranchCode) REFERENCES dbo.ShipmentPlan (Id, BranchCode),
    CONSTRAINT UQ_ShipmentPlanColorSize UNIQUE (ShipmentPlanId, ColorName, SizeName)
);
CREATE INDEX IX_ShipmentPlanColorSize_Branch ON dbo.ShipmentPlanColorSize (BranchCode, ShipmentPlanId);
GO

-- Dàn chuyền: kế hoạch may trên từng chuyền (popup "Chi tiết dàn chuyền" ở màn Xếp chuyền).
-- Đồng thời là bảng chính của màn "Phân bổ màu cỡ" (order.colorsize), lọc theo chuyền qua LineCode.
CREATE TABLE dbo.ShipmentPlanLine (
    Id                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ShipmentPlanLine PRIMARY KEY,
    ShipmentPlanId     INT          NOT NULL,
    -- Khóa ngầm tới MES_Core.SysOrgUnit.Code (chuyền cùng nhà máy), xem softkeys.json
    LineCode           VARCHAR(20)  NOT NULL,
    Qty                INT          NOT NULL CONSTRAINT CK_ShipmentPlanLine_Qty CHECK (Qty > 0),
    -- Năng suất trung bình, sản phẩm mỗi ngày
    AvgOutput          INT          NOT NULL CONSTRAINT CK_ShipmentPlanLine_AvgOutput CHECK (AvgOutput > 0),
    StartDate          DATE         NOT NULL,
    ProductionDays     INT          NOT NULL CONSTRAINT CK_ShipmentPlanLine_ProductionDays CHECK (ProductionDays > 0),
    OffDays            INT          NOT NULL CONSTRAINT DF_ShipmentPlanLine_OffDays DEFAULT 0 CONSTRAINT CK_ShipmentPlanLine_OffDays CHECK (OffDays >= 0),
    EndDate            DATE         NOT NULL,
    OutStartDate       DATE         NULL,
    OutEndDate         DATE         NULL,
    WarehouseStartDate DATE         NULL,
    WarehouseEndDate   DATE         NULL,
    StatusCode         VARCHAR(20)  NOT NULL CONSTRAINT DF_ShipmentPlanLine_Status DEFAULT 'PLANNED'
                       CONSTRAINT CK_ShipmentPlanLine_Status CHECK (StatusCode IN ('PLANNED', 'ALLOCATED', 'IN_PRODUCTION', 'DONE')),
    SortOrder          INT          NOT NULL CONSTRAINT DF_ShipmentPlanLine_SortOrder DEFAULT 0,
    BranchCode         VARCHAR(10)  NOT NULL,
    CreatedAt          DATETIME2(3) NOT NULL CONSTRAINT DF_ShipmentPlanLine_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy          INT          NULL,
    ModifiedAt         DATETIME2(3) NULL,
    ModifiedBy         INT          NULL,
    CONSTRAINT UQ_ShipmentPlanLine_IdBranch UNIQUE (Id, BranchCode),
    CONSTRAINT FK_ShipmentPlanLine_Plan FOREIGN KEY (ShipmentPlanId, BranchCode) REFERENCES dbo.ShipmentPlan (Id, BranchCode),
    CONSTRAINT CK_ShipmentPlanLine_Dates CHECK (EndDate >= StartDate)
);
CREATE INDEX IX_ShipmentPlanLine_Branch_Line ON dbo.ShipmentPlanLine (BranchCode, LineCode, StartDate);
CREATE INDEX IX_ShipmentPlanLine_ShipmentPlanId ON dbo.ShipmentPlanLine (ShipmentPlanId);
GO

-- Phân màu cỡ cho từng dòng dàn chuyền (popup ở màn Phân bổ màu cỡ)
CREATE TABLE dbo.ShipmentPlanLineColorSize (
    Id                 INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ShipmentPlanLineColorSize PRIMARY KEY,
    ShipmentPlanLineId INT          NOT NULL,
    ColorName          NVARCHAR(50) NOT NULL,
    SizeName           VARCHAR(20)  NOT NULL,
    PlanQty            INT          NOT NULL CONSTRAINT CK_ShipmentPlanLineColorSize_PlanQty CHECK (PlanQty >= 0),
    AssignedQty        INT          NOT NULL CONSTRAINT CK_ShipmentPlanLineColorSize_AssignedQty CHECK (AssignedQty >= 0),
    SortOrder          INT          NOT NULL CONSTRAINT DF_ShipmentPlanLineColorSize_SortOrder DEFAULT 0,
    BranchCode         VARCHAR(10)  NOT NULL,
    CreatedAt          DATETIME2(3) NOT NULL CONSTRAINT DF_ShipmentPlanLineColorSize_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy          INT          NULL,
    ModifiedAt         DATETIME2(3) NULL,
    ModifiedBy         INT          NULL,
    CONSTRAINT FK_ShipmentPlanLineColorSize_Line FOREIGN KEY (ShipmentPlanLineId, BranchCode) REFERENCES dbo.ShipmentPlanLine (Id, BranchCode),
    CONSTRAINT UQ_ShipmentPlanLineColorSize UNIQUE (ShipmentPlanLineId, ColorName, SizeName)
);
CREATE INDEX IX_ShipmentPlanLineColorSize_Branch ON dbo.ShipmentPlanLineColorSize (BranchCode, ShipmentPlanLineId);
GO
