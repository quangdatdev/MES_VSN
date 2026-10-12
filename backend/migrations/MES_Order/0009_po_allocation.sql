-- MES_Order 0009: bảng Phân bổ PO (Phase 5.10, task 5.10.1). Nhà máy SX nhập tay ở màn Phân bổ PO phải giữ được qua các lần
-- đồng bộ OSM, nhưng bảng chép MES_Sync.osm.OSMData bị xóa rồi chép lại toàn bộ mỗi lần (SyncRowId đổi, có dòng trùng nguyên
-- dòng): không gắn dấu "Nhập tay" vào đó được. Bảng này là bản làm việc của MES: mỗi dòng khác nhau của OSM một dòng, bước làm
-- mới sau mỗi đợt đồng bộ nguồn OSM.OSMData (po-allocation-refresh.service.ts) chép vào, màn hình đọc, sửa qua BaseRepository.
-- Tài nguyên order.poallocation dùng chung (SHARED): không có cột BranchCode, ĐVCS suy từ Nhà máy SX theo danh mục Nhà máy SX
-- (MES_Core.SysProductionFactory, khóa ngầm), vì danh mục đổi ĐVCS của nhà máy thì dòng phải theo ngay.
-- OPENJSON (bước làm mới gửi nguồn một tham số JSON) cần compatibility level 130: đã kiểm ở 0007.
CREATE TABLE dbo.PoAllocation (
    Id                    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PoAllocation PRIMARY KEY,
    -- SHA-256 của 11 cột OSM (bỏ khoảng trắng cuối như phép so của SQL Server): dòng OSM không đổi thì giữ Id
    RowHash               VARBINARY(32)  NOT NULL,
    -- Các cột của view OSM v_OSMData, độ dài theo bảng chép osm.OSMData (MES_Sync/0007)
    Brand                 NVARCHAR(50)   NULL,
    Season                NVARCHAR(50)   NULL,
    PoNo                  NVARCHAR(51)   NULL,
    SoNo                  NVARCHAR(50)   NULL,
    ShipMode              NVARCHAR(50)   NULL,
    StyleName             NVARCHAR(59)   NULL,
    StyleNo               NVARCHAR(61)   NULL,
    Color                 NVARCHAR(82)   NULL,
    EtdActualDate         DATE           NULL,
    EtdRevisedDate        DATE           NULL,
    -- FtyName của OSM ở lần làm mới gần nhất (màn hiện cạnh giá trị nhập tay)
    OsmFactoryCode        NVARCHAR(255)  NULL,
    -- Nhà máy SX hiện hành: nhập tay (IsFactoryManual = 1, mã của danh mục Nhà máy SX) hoặc theo OSM (= OsmFactoryCode)
    ProductionFactoryCode NVARCHAR(255)  NULL,
    IsFactoryManual       BIT            NOT NULL CONSTRAINT DF_PoAllocation_IsFactoryManual DEFAULT 0,
    -- 0: OSM không còn dòng nào cùng SO, PO, Style No, Màu; giữ lại để nhà máy nhập tay không mất khi OSM tạm thiếu PO
    IsInOsm               BIT            NOT NULL CONSTRAINT DF_PoAllocation_IsInOsm DEFAULT 1,
    -- Lần chép OSM gần nhất có dòng này (SyncedAt của bảng chép)
    SyncedAt              DATETIME2(3)   NULL,
    CreatedAt             DATETIME2(3)   NOT NULL CONSTRAINT DF_PoAllocation_CreatedAt DEFAULT SYSUTCDATETIME(),
    -- Dòng do bước làm mới của hệ thống tạo: để trống
    CreatedBy             INT            NULL,
    -- Người nhập tay hoặc bỏ nhập tay Nhà máy SX gần nhất (bước làm mới không đổi hai cột này)
    ModifiedAt            DATETIME2(3)   NULL,
    ModifiedBy            INT            NULL,
    CONSTRAINT UQ_PoAllocation_RowHash UNIQUE (RowHash),
    -- Dòng không còn trong OSM chỉ được giữ khi đang nhập tay
    CONSTRAINT CK_PoAllocation_Kept CHECK (IsInOsm = 1 OR IsFactoryManual = 1)
);
-- Khóa nhập tay (quyết định 5.10 Q5): một lần sửa áp cho mọi dòng cùng SO, PO, Style No, Màu
CREATE INDEX IX_PoAllocation_Key ON dbo.PoAllocation (PoNo, SoNo, StyleNo, Color);
-- Thứ tự mặc định của màn: ETD-Revised mới nhất lên trước
CREATE INDEX IX_PoAllocation_EtdRevised ON dbo.PoAllocation (EtdRevisedDate DESC, Id DESC);
-- Lọc theo Nhà máy SX, ĐVCS suy từ nhà máy, luật ghi theo ĐVCS của nhà máy
CREATE INDEX IX_PoAllocation_Factory ON dbo.PoAllocation (ProductionFactoryCode);
-- Bước làm mới đọc bản đồ khóa → nhà máy của các dòng nhập tay
CREATE INDEX IX_PoAllocation_Manual ON dbo.PoAllocation (IsFactoryManual) INCLUDE (PoNo, SoNo, StyleNo, Color, ProductionFactoryCode) WHERE IsFactoryManual = 1;
-- Khóa ngầm tới MES_Core.SysUser.Id (softkeys.json); hầu hết dòng để trống nên chỉ mục có lọc
CREATE INDEX IX_PoAllocation_CreatedBy ON dbo.PoAllocation (CreatedBy) WHERE CreatedBy IS NOT NULL;
CREATE INDEX IX_PoAllocation_ModifiedBy ON dbo.PoAllocation (ModifiedBy) WHERE ModifiedBy IS NOT NULL;
GO
