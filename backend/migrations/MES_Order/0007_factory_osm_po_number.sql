-- MES_Order 0007: Nhà máy SX theo OSM, số PO dài và có dấu (người dùng yêu cầu 12/10/2026, ADR 0013 mục 9).
-- Lọc đơn theo nhà máy được tích tách danh sách bằng STRING_SPLIT: cần mức tương thích 130 trở lên (SQL Server 2016+)
IF (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) < 130
    THROW 50000, N'MES_Order cần compatibility level 130 trở lên (STRING_SPLIT). Nhờ quản trị CSDL nâng rồi chạy lại migrate.', 1;
GO

-- SalesOrder.ProductionFactoryCode: một hoặc nhiều mã nhà máy SX (MES_Core.SysProductionFactory.Code, khóa ngầm) cách nhau dấu
-- phẩy, như cột FtyName của view OSM vOSMDataFty ("VIET DUC,VSN-DN"). Mã nhà máy là tên theo OSM, có dấu: NVARCHAR.
-- Không giữ chỉ mục trên cột này: lọc theo nhà máy được tích tách danh sách (STRING_SPLIT), không tìm theo chỉ mục được.
DROP INDEX IX_SalesOrder_ProductionFactory ON dbo.SalesOrder;
ALTER TABLE dbo.SalesOrder ALTER COLUMN ProductionFactoryCode NVARCHAR(400) NULL;
-- 1: Nhà máy SX lấy theo OSM, người dùng không sửa tay; 0: người dùng chọn (đơn chưa có trong OSM)
ALTER TABLE dbo.SalesOrder ADD IsFactoryFromOsm BIT NOT NULL CONSTRAINT DF_SalesOrder_IsFactoryFromOsm DEFAULT 0;
GO

-- Bỏ giá trị đoán của cách nạp cũ (nhà máy SX cùng mã chi nhánh nhận đơn) ở đơn nạp từ BRAVO chưa ai sửa: từ nay Nhà máy SX
-- theo OSM, đơn chưa có trong OSM do người dùng chọn (review OSM M2). Đơn có trong OSM nhận lại nhà máy ở lần cập nhật theo OSM
UPDATE dbo.SalesOrder SET ProductionFactoryCode = NULL
WHERE SourceProductId IS NOT NULL AND ModifiedBy IS NULL AND ProductionFactoryCode = BranchCode;
GO

-- Số PO có lúc dài, có chữ tiếng Việt
ALTER TABLE dbo.SalesOrderPo ALTER COLUMN PoNumber NVARCHAR(192) NOT NULL;
GO

-- PO không có số nạp từ BRAVO trước 0007: chữ giữ chỗ "(trống)" bị lưu mất dấu ở cột VARCHAR
UPDATE dbo.SalesOrderPo SET PoNumber = N'(trống)' WHERE PoNumber = '(tr?ng)' AND CreatedBy IS NULL;
GO
