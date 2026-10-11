-- MES_Order 0003: nhận dữ liệu thật từ bảng chép BRAVO trong MES_Sync (ADR 0007), nạp bằng scripts/load-bravo-orders.ts.
-- Khảo sát 10/10/2026 (docs/thiet-ke/anh-xa-bravo-don-hang.html): mã hàng thật dài tới hơn 100 ký tự và có chữ tiếng Việt,
-- tên màu dài tới 64 ký tự, nên nới các cột này. Thêm khóa nguồn để lần nạp sau tìm lại đúng đơn hàng.

-- Mã hàng: NVARCHAR vì có mã hàng là tên tiếng Việt
DROP INDEX IX_SalesOrder_Branch_Style ON dbo.SalesOrder;
ALTER TABLE dbo.SalesOrder ALTER COLUMN StyleCode NVARCHAR(120) NOT NULL;
CREATE INDEX IX_SalesOrder_Branch_Style ON dbo.SalesOrder (BranchCode, StyleCode);
ALTER TABLE dbo.SalesOrderPo ALTER COLUMN StyleCode NVARCHAR(120) NOT NULL;
ALTER TABLE dbo.ShipmentPlan ALTER COLUMN StyleCode NVARCHAR(120) NOT NULL;
GO

-- Tên màu: cột nằm trong ràng buộc duy nhất nên bỏ ràng buộc, nới cột rồi tạo lại đúng như cũ
ALTER TABLE dbo.SalesOrderPoColorSize DROP CONSTRAINT UQ_SalesOrderPoColorSize;
ALTER TABLE dbo.SalesOrderPoColorSize ALTER COLUMN ColorName NVARCHAR(100) NOT NULL;
ALTER TABLE dbo.SalesOrderPoColorSize ADD CONSTRAINT UQ_SalesOrderPoColorSize UNIQUE (SalesOrderPoId, ColorName, SizeName);

ALTER TABLE dbo.ShipmentPlanColorSize DROP CONSTRAINT UQ_ShipmentPlanColorSize;
ALTER TABLE dbo.ShipmentPlanColorSize ALTER COLUMN ColorName NVARCHAR(100) NOT NULL;
ALTER TABLE dbo.ShipmentPlanColorSize ADD CONSTRAINT UQ_ShipmentPlanColorSize UNIQUE (ShipmentPlanId, ColorName, SizeName);

ALTER TABLE dbo.ShipmentPlanLineColorSize DROP CONSTRAINT UQ_ShipmentPlanLineColorSize;
ALTER TABLE dbo.ShipmentPlanLineColorSize ALTER COLUMN ColorName NVARCHAR(100) NOT NULL;
ALTER TABLE dbo.ShipmentPlanLineColorSize ADD CONSTRAINT UQ_ShipmentPlanLineColorSize UNIQUE (ShipmentPlanLineId, ColorName, SizeName);
GO

-- ProductId của BRAVO (bravo.DM_SanPhamDonHang): mỗi sản phẩm của một đơn bán là một đơn hàng MES.
-- NULL: đơn hàng nhập tay trên MES. ProductId duy nhất trên toàn BRAVO nên chỉ mục không cần BranchCode.
ALTER TABLE dbo.SalesOrder ADD SourceProductId INT NULL;
GO
CREATE UNIQUE INDEX UX_SalesOrder_SourceProduct ON dbo.SalesOrder (SourceProductId) WHERE SourceProductId IS NOT NULL;
GO
