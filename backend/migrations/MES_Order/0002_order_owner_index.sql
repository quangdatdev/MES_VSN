-- MES_Order 0002: index cho cột người tạo (review 5.1 #23). CreatedBy là cột lọc của chiều phạm vi OWNER
-- ("chỉ bản ghi do mình tạo") ở năm tài nguyên của module Đơn hàng, và là khóa ngầm tới MES_Core.SysUser.Id.
CREATE INDEX IX_SalesOrder_Branch_CreatedBy ON dbo.SalesOrder (BranchCode, CreatedBy);
CREATE INDEX IX_SalesOrderPo_Branch_CreatedBy ON dbo.SalesOrderPo (BranchCode, CreatedBy);
CREATE INDEX IX_ShipmentPlan_Branch_CreatedBy ON dbo.ShipmentPlan (BranchCode, CreatedBy);
CREATE INDEX IX_ShipmentPlanLine_Branch_CreatedBy ON dbo.ShipmentPlanLine (BranchCode, CreatedBy);
GO
