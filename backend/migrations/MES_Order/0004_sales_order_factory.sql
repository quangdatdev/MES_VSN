-- MES_Order 0004: cột "Nhà máy SX" của Thông tin đơn hàng (người dùng yêu cầu 10/10/2026).
-- BranchCode là chi nhánh nhận đơn (hiển thị "Chi nhánh FOB"); nhà máy sản xuất thực tế có thể khác chi nhánh nên chọn tay
-- từ danh mục "Nhà máy sản xuất" (MES_Core.SysCatalogItem, danh mục PROD_FACTORY). Khóa ngầm khai báo ở softkeys.json.
-- NULL: chưa chọn.
ALTER TABLE dbo.SalesOrder ADD ProductionFactoryCode VARCHAR(30) NULL;
GO
CREATE INDEX IX_SalesOrder_Branch_ProductionFactory ON dbo.SalesOrder (BranchCode, ProductionFactoryCode);
GO
