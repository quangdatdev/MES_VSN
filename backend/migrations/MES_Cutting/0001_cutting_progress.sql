-- MES_Cutting 0001: module Cắt, màn "Đồng bộ tiến độ cắt" (phase 5.14, quyết định 13.1–13.4).
-- npm run migrate tạo database nếu tài khoản có quyền CREATE DATABASE; không có thì quản trị CSDL tạo trước, cấp db_owner.
-- Database phải cùng collation với MES_Order: tên màu, cỡ chép từ đó và so khớp theo collation (migrate tạo database mới theo
-- collation của MES_Core, cảnh báo khi lệch).
-- Quy ước như MES_Sewing: PascalCase, số ít, DATETIME2(3) UTC; bảng con mang BranchCode của cha và khóa ngoại ghép
-- (ParentId, BranchCode) tới UNIQUE (Id, BranchCode) của cha.

-- Bản chép đầu kế hoạch xuất hàng (MES_Order.ShipmentPlan, khóa ngầm), cập nhật mỗi lần mở màn khi kế hoạch đổi, để lọc
-- ĐVCS, phân trang, sắp xếp theo lũy kế cắt ngay trong database này. Kiểu cột theo MES_Order.ShipmentPlan.
-- Kế hoạch nguồn bị xóa mà đã có số cắt: giữ dòng để không mất số đã nhập, ShipmentPlanId = NULL (không còn trỏ tới đâu,
-- check:softkeys không báo mồ côi), SourceDeletedAt = lúc phát hiện. Chưa có số cắt thì xóa dòng.
CREATE TABLE dbo.CuttingPlan (
    Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CuttingPlan PRIMARY KEY,
    ShipmentPlanId  INT           NULL,
    -- Id kế hoạch có thể được dùng lại sau khi xóa dữ liệu đơn hàng: nhận diện nguồn bằng Id + ĐVCS + thời điểm tạo
    SourceCreatedAt DATETIME2(3)  NOT NULL,
    PlanNo          VARCHAR(30)   NOT NULL,
    CustomerName    NVARCHAR(100) NOT NULL,
    StyleCode       NVARCHAR(120) NOT NULL,
    ProductName     NVARCHAR(150) NOT NULL,
    PoBuyDate       NVARCHAR(40)  NOT NULL,
    ShipDate        DATE          NOT NULL,
    PlanQty         INT           NOT NULL CONSTRAINT CK_CuttingPlan_PlanQty CHECK (PlanQty >= 0),
    SourceDeletedAt DATETIME2(3)  NULL,
    -- Lần chép gần nhất từ kế hoạch nguồn
    SourceSyncedAt  DATETIME2(3)  NOT NULL,
    BranchCode      VARCHAR(10)   NOT NULL,
    CreatedAt       DATETIME2(3)  NOT NULL CONSTRAINT DF_CuttingPlan_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy       INT           NULL,
    ModifiedAt      DATETIME2(3)  NULL,
    ModifiedBy      INT           NULL,
    CONSTRAINT UQ_CuttingPlan_IdBranch UNIQUE (Id, BranchCode),
    -- Còn nguồn thì chưa đánh dấu xóa; mất nguồn thì phải có lúc phát hiện
    CONSTRAINT CK_CuttingPlan_Source CHECK ((ShipmentPlanId IS NOT NULL AND SourceDeletedAt IS NULL) OR (ShipmentPlanId IS NULL AND SourceDeletedAt IS NOT NULL))
);
-- Một kế hoạch nguồn một bản chép; khóa ngầm tới MES_Order.ShipmentPlan.Id có index (CLAUDE.md mục 5)
CREATE UNIQUE INDEX UX_CuttingPlan_ShipmentPlan ON dbo.CuttingPlan (ShipmentPlanId) WHERE ShipmentPlanId IS NOT NULL;
CREATE INDEX IX_CuttingPlan_Branch_ShipDate ON dbo.CuttingPlan (BranchCode, ShipDate DESC, Id DESC);
GO

-- Bản chép SL KHXH theo màu cỡ của kế hoạch (MES_Order.ShipmentPlanColorSize); chép lại thay toàn bộ theo kế hoạch.
CREATE TABLE dbo.CuttingPlanColorSize (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CuttingPlanColorSize PRIMARY KEY,
    CuttingPlanId INT           NOT NULL,
    ColorName     NVARCHAR(100) NOT NULL,
    SizeName      VARCHAR(20)   NOT NULL,
    PlanQty       INT           NOT NULL CONSTRAINT CK_CuttingPlanColorSize_PlanQty CHECK (PlanQty >= 0),
    SortOrder     INT           NOT NULL CONSTRAINT DF_CuttingPlanColorSize_SortOrder DEFAULT 0,
    BranchCode    VARCHAR(10)   NOT NULL,
    CreatedAt     DATETIME2(3)  NOT NULL CONSTRAINT DF_CuttingPlanColorSize_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT           NULL,
    ModifiedAt    DATETIME2(3)  NULL,
    ModifiedBy    INT           NULL,
    CONSTRAINT FK_CuttingPlanColorSize_Plan FOREIGN KEY (CuttingPlanId, BranchCode) REFERENCES dbo.CuttingPlan (Id, BranchCode) ON DELETE CASCADE,
    CONSTRAINT UQ_CuttingPlanColorSize UNIQUE (CuttingPlanId, ColorName, SizeName)
);
CREATE INDEX IX_CuttingPlanColorSize_Branch ON dbo.CuttingPlanColorSize (BranchCode, CuttingPlanId);
GO

-- Số cắt trong một ngày của một màu cỡ. Gắn theo tên màu cỡ, không theo CuttingPlanColorSize.Id, để chép lại màu cỡ không
-- làm mất số đã nhập (màu cỡ bị bỏ khỏi kế hoạch vẫn giữ số). Chỉ lưu số > 0: nhập 0 là xóa dòng.
-- Lũy kế = SUM(Qty) mọi ngày, tính lúc đọc.
-- Khóa ngoại tới CuttingPlan không xóa theo cha: số cắt là dữ liệu người nhập, chỉ mất qua "Xóa số cắt" (xóa dòng ở đây trước,
-- rõ ràng); lỡ xóa CuttingPlan còn số cắt thì database từ chối thay vì mất số âm thầm (quyết định 13.2, 13.4).
CREATE TABLE dbo.CuttingPlanDaily (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CuttingPlanDaily PRIMARY KEY,
    CuttingPlanId INT           NOT NULL,
    ColorName     NVARCHAR(100) NOT NULL,
    SizeName      VARCHAR(20)   NOT NULL,
    EntryDate     DATE          NOT NULL,
    Qty           INT           NOT NULL CONSTRAINT CK_CuttingPlanDaily_Qty CHECK (Qty > 0),
    BranchCode    VARCHAR(10)   NOT NULL,
    CreatedAt     DATETIME2(3)  NOT NULL CONSTRAINT DF_CuttingPlanDaily_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT           NULL,
    ModifiedAt    DATETIME2(3)  NULL,
    ModifiedBy    INT           NULL,
    CONSTRAINT FK_CuttingPlanDaily_Plan FOREIGN KEY (CuttingPlanId, BranchCode) REFERENCES dbo.CuttingPlan (Id, BranchCode),
    CONSTRAINT UQ_CuttingPlanDaily UNIQUE (CuttingPlanId, ColorName, SizeName, EntryDate)
);
-- Danh sách cộng Lũy kế, ngày cắt gần nhất theo kế hoạch: INCLUDE để không phải tra từng dòng về bảng gốc
CREATE INDEX IX_CuttingPlanDaily_Branch ON dbo.CuttingPlanDaily (BranchCode, CuttingPlanId) INCLUDE (Qty, EntryDate);
GO
