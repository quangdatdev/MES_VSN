-- MES_Order 0008: Cập nhật tỷ lệ cắt theo kế hoạch xuất hàng của ĐVCS (người dùng yêu cầu 12/10/2026, ADR 0013 mục 11).
-- ĐVCS lập kế hoạch cho đơn của ĐVCS khác (nhà máy SX thuộc ĐVCS mình) thì sửa được tỷ lệ cắt của PO trong kế hoạch, và thêm
-- PO tay cho đơn đó. PO tay mang ĐVCS của người nhập, có thể khác ĐVCS của đơn: khóa ngoại PO – đơn hàng chỉ còn theo Id
-- (như kế hoạch – đơn hàng ở 0005). Màu cỡ của PO giữ khóa ngoại ghép với PO (cùng ĐVCS với PO).
ALTER TABLE dbo.SalesOrderPo DROP CONSTRAINT FK_SalesOrderPo_SalesOrder;
ALTER TABLE dbo.SalesOrderPo ADD CONSTRAINT FK_SalesOrderPo_SalesOrder FOREIGN KEY (SalesOrderId) REFERENCES dbo.SalesOrder (Id);
GO

-- "PO nằm trong kế hoạch xuất hàng của ĐVCS này": điều kiện ghi PO và lọc màn Tỷ lệ cắt (EXISTS theo PO và ĐVCS)
CREATE INDEX IX_ShipmentPlanPo_Po_Branch ON dbo.ShipmentPlanPo (SalesOrderPoId, BranchCode);
DROP INDEX IX_ShipmentPlanPo_SalesOrderPoId ON dbo.ShipmentPlanPo;
GO
