-- MES_Sewing 0002 (review Phase 5.5 #1, #15).
-- Id dòng dàn chuyền có thể được dùng lại (reset:demo, load:bravo đặt lại Id của MES_Order): nhận diện dòng nguồn bằng
-- Id + nhà máy + kế hoạch + thời điểm tạo, không chỉ Id, để ngày đã nhập không bị gắn sang một dòng khác.
ALTER TABLE dbo.SewingPrep ADD SourceCreatedAt DATETIME2(3) NULL;
GO
-- Khóa ngầm tới MES_Order.ShipmentPlan.Id phải có index (CLAUDE.md mục 5)
CREATE INDEX IX_SewingPrep_Plan ON dbo.SewingPrep (ShipmentPlanId);
GO
