-- MES_Hr 0002: bộ phận tích "Xưởng sản xuất" là chuyền may (phase 5.10, thay danh mục chuyền SysOrgUnit LINE).
-- Ô chọn Chuyền may liệt kê bộ phận được tích có ĐVCS bằng ĐVCS đăng nhập, nên bộ phận được tích bắt buộc có ĐVCS.
-- Dữ liệu nghiệp vụ (MES_Order.ShipmentPlanLine.LineCode, MES_Sewing.SewingPrep.LineCode) giữ mã chuyền = Department.Code.
ALTER TABLE dbo.Department ADD IsProductionWorkshop BIT NOT NULL CONSTRAINT DF_Department_IsProductionWorkshop DEFAULT 0;
GO

ALTER TABLE dbo.Department ADD CONSTRAINT CK_Department_ProductionWorkshopBranch CHECK (IsProductionWorkshop = 0 OR BranchCode IS NOT NULL);
CREATE INDEX IX_Department_ProductionWorkshop ON dbo.Department (BranchCode, Code) INCLUDE (Name, ParentId, IsActive, SortOrder) WHERE IsProductionWorkshop = 1;
GO
