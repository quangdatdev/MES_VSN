-- MES_Core 0008: mã Nhà máy SX là tên nhà máy theo OSM (người dùng yêu cầu 12/10/2026, ADR 0013 mục 9).
-- Tên OSM có khoảng trắng, chữ tiếng Việt ("VIET DUC", "HÙNG DŨNG", "BM.PYEN"): mã thành NVARCHAR(100). Mã vẫn không sửa được
-- (trigger TR_SysProductionFactory_CodeImmutable giữ nguyên). Không có dấu phẩy: Nhà máy SX của đơn hàng là danh sách mã cách
-- nhau dấu phẩy. Không có khoảng trắng đầu, cuối (so khớp với danh sách đã tách).
ALTER TABLE dbo.SysProductionFactory DROP CONSTRAINT CK_SysProductionFactory_Code;
ALTER TABLE dbo.SysProductionFactory DROP CONSTRAINT UQ_SysProductionFactory_Code;
ALTER TABLE dbo.SysProductionFactory ALTER COLUMN Code NVARCHAR(100) NOT NULL;
ALTER TABLE dbo.SysProductionFactory ADD CONSTRAINT UQ_SysProductionFactory_Code UNIQUE (Code);
ALTER TABLE dbo.SysProductionFactory ADD CONSTRAINT CK_SysProductionFactory_Code
    CHECK (LEN(Code) > 0 AND CHARINDEX(N',', Code) = 0 AND DATALENGTH(Code) = DATALENGTH(LTRIM(RTRIM(Code))));
GO
