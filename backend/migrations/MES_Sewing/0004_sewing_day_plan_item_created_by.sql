-- MES_Sewing 0004 (review phase 5.16 L8): khóa ngầm SewingDayPlanItem.CreatedBy → MES_Core.SysUser.Id phải có chỉ mục (CLAUDE.md mục 5).
CREATE INDEX IX_SewingDayPlanItem_CreatedBy ON dbo.SewingDayPlanItem (CreatedBy) WHERE CreatedBy IS NOT NULL;
GO
