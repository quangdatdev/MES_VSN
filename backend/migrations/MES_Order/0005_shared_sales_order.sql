-- MES_Order 0005: Thông tin đơn hàng dùng chung toàn công ty (ADR 0013, Phase 5.9, người dùng yêu cầu 11/10/2026).
-- Đơn hàng và PO (SalesOrder, SalesOrderPo, SalesOrderPoColorSize) lấy hết từ BRAVO, không lọc theo Đơn vị cơ sở (ĐVCS):
-- BranchCode của chúng chỉ còn là Chi nhánh FOB (ĐVCS nhận đơn, hoặc ĐVCS của người nhập tay).
-- Kế hoạch xuất hàng vẫn theo ĐVCS của phiên lập, và lập được cho đơn hàng của ĐVCS khác (nhà máy SX được tích thuộc
-- ĐVCS khác): khóa ngoại ghép (…, BranchCode) giữa kế hoạch và đơn hàng, giữa PO được chọn và PO đổi thành khóa ngoại theo Id.
-- Giữ khóa ngoại ghép giữa PO và đơn hàng (PO chỉ thêm ở ĐVCS của đơn), giữa các bảng con với cha của chính nó.

ALTER TABLE dbo.ShipmentPlan DROP CONSTRAINT FK_ShipmentPlan_SalesOrder;
ALTER TABLE dbo.ShipmentPlan ADD CONSTRAINT FK_ShipmentPlan_SalesOrder FOREIGN KEY (SalesOrderId) REFERENCES dbo.SalesOrder (Id);

ALTER TABLE dbo.ShipmentPlanPo DROP CONSTRAINT FK_ShipmentPlanPo_Po;
ALTER TABLE dbo.ShipmentPlanPo ADD CONSTRAINT FK_ShipmentPlanPo_Po FOREIGN KEY (SalesOrderPoId) REFERENCES dbo.SalesOrderPo (Id);
GO

-- Danh sách đơn hàng, PO không còn lọc theo BranchCode trước: chỉ mục cho thứ tự mặc định (mới tạo lên đầu) và cho popup
-- Chọn mã hàng (lọc theo nhà máy SX được giao, sắp theo ngày xuất)
DROP INDEX IX_SalesOrder_Branch_ProductionFactory ON dbo.SalesOrder;
CREATE INDEX IX_SalesOrder_ProductionFactory ON dbo.SalesOrder (ProductionFactoryCode, ShipDate);
CREATE INDEX IX_SalesOrder_CreatedAt ON dbo.SalesOrder (CreatedAt DESC, Id DESC);
CREATE INDEX IX_SalesOrderPo_CreatedAt ON dbo.SalesOrderPo (CreatedAt DESC, Id DESC);
-- Phạm vi "chỉ bản ghi do mình tạo" không còn đi kèm điều kiện BranchCode (chỉ mục (BranchCode, CreatedBy) của 0002 không dùng được)
CREATE INDEX IX_SalesOrder_CreatedBy ON dbo.SalesOrder (CreatedBy);
CREATE INDEX IX_SalesOrderPo_CreatedBy ON dbo.SalesOrderPo (CreatedBy);
GO
