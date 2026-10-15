-- MES_Cutting 0003 (phase 5.15, review 5.15): chỉ mục cho khóa ngầm người lập, người cấp của lệnh cấp BTP (CLAUDE.md mục 5), và cho
-- Số lượng đồng bộ của màn Xác nhận cấp BTP (Lũy kế cắt cộng theo ĐVCS, mã hàng của bản chép kế hoạch).
CREATE INDEX IX_CuttingSupply_CreatedBy ON dbo.CuttingSupply (CreatedBy) WHERE CreatedBy IS NOT NULL;
CREATE INDEX IX_CuttingSupply_ConfirmedBy ON dbo.CuttingSupply (ConfirmedBy) WHERE ConfirmedBy IS NOT NULL;
CREATE INDEX IX_CuttingPlan_Branch_Style ON dbo.CuttingPlan (BranchCode, StyleCode);
GO
