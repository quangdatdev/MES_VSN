-- MES_Order 0009: bảng Phân bổ PO (Phase 5.10, task 5.10.1). Nhà máy SX nhập tay ở màn Phân bổ PO phải giữ được qua các lần
-- đồng bộ OSM, nhưng bảng chép MES_Sync.osm.OSMData bị xóa rồi chép lại toàn bộ mỗi lần (SyncRowId đổi, có dòng trùng nguyên
-- dòng): không gắn dấu "Nhập tay" vào đó được. Bảng này là bản làm việc của MES: mỗi dòng khác nhau của OSM một dòng, bước làm
-- mới sau mỗi đợt đồng bộ nguồn OSM.OSMData (po-allocation-refresh.service.ts) chép vào, màn hình đọc, sửa qua BaseRepository.
-- Tài nguyên order.poallocation dùng chung (SHARED): không có cột BranchCode, ĐVCS suy từ Nhà máy SX theo danh mục Nhà máy SX
-- (MES_Core.SysProductionFactory, khóa ngầm), vì danh mục đổi ĐVCS của nhà máy thì dòng phải theo ngay.
-- OPENJSON (bước làm mới gửi nguồn một tham số JSON) cần compatibility level 130: đã kiểm ở 0007.
-- Không có cột thời điểm chép theo dòng: giữ nó là ghi lại mọi dòng mỗi lần làm mới (khóa cả bảng); thời điểm chép là thông tin
-- của cả bảng, ở PoAllocationRefresh.
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

-- Trạng thái lần làm mới gần nhất (một dòng, Id = 1): màn Phân bổ PO đọc thời điểm chép OSM của dữ liệu và cảnh báo khi lần làm
-- mới bị bỏ qua hoặc phải giữ dòng không còn trong OSM (chốt nguồn giảm bất thường). Chỉ bước làm mới của hệ thống ghi.
CREATE TABLE dbo.PoAllocationRefresh (
    Id                  INT           NOT NULL CONSTRAINT PK_PoAllocationRefresh PRIMARY KEY,
    -- Lần làm mới gần nhất, kể cả lần bị bỏ qua; NULL: chưa làm mới lần nào
    RefreshedAt         DATETIME2(3)  NULL,
    -- Lần chép OSM (SyncedAt của bảng chép) của dữ liệu đang có trong PoAllocation: lần bị bỏ qua không đổi cột này
    SourceSyncedAt      DATETIME2(3)  NULL,
    -- Số dòng khác nhau của nguồn ở lần làm mới gần nhất
    SourceRows          INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_SourceRows DEFAULT 0,
    -- Mốc đã dùng để so với nguồn ở lần làm mới đó (BaselineRows lúc đó, chưa có thì số dòng đang có trong OSM)
    PreviousRows        INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_PreviousRows DEFAULT 0,
    -- Mốc so cho chốt giảm: số dòng nguồn của lần làm mới đủ gần nhất (SkippedReason NULL). Không lấy số dòng IsInOsm = 1 của bảng: ở
    -- lần giữ dòng vắng (SHRINK) dòng cũ còn nguyên mà dòng đổi ETD, FtyName vẫn được thêm, số đó phình dần và chốt không nhả.
    -- NULL: chưa có lần làm mới đủ nào (dùng số dòng đang có trong OSM)
    BaselineRows        INT           NULL,
    InsertedRows        INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_InsertedRows DEFAULT 0,
    UpdatedRows         INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_UpdatedRows DEFAULT 0,
    RemovedRows         INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_RemovedRows DEFAULT 0,
    -- Dòng nhập tay mà OSM không còn dòng nào cùng khóa: giữ, IsInOsm = 0
    MissingManualRows   INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_MissingManualRows DEFAULT 0,
    -- Dòng không còn trong OSM mà không xóa (cũng không đánh dấu) vì nguồn giảm quá MaxShrinkPercent
    KeptAbsentRows      INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_KeptAbsentRows DEFAULT 0,
    -- Số tên nhà máy (FtyName) của nguồn không có trong danh mục Nhà máy SX: luật ĐVCS theo nhà máy không bảo vệ các dòng đó
    UnknownFactories    INT           NOT NULL CONSTRAINT DF_PoAllocationRefresh_UnknownFactories DEFAULT 0,
    -- Ngưỡng giảm (%) áp ở lần làm mới đó (PO_ALLOCATION_MAX_SHRINK_PERCENT)
    MaxShrinkPercent    TINYINT       NOT NULL CONSTRAINT DF_PoAllocationRefresh_MaxShrinkPercent DEFAULT 20,
    -- NULL: làm đủ; EMPTY: nguồn rỗng, không làm gì; SHRINK: nguồn giảm quá ngưỡng, không xóa dòng vắng (KeptAbsentRows)
    SkippedReason       VARCHAR(10)   NULL CONSTRAINT CK_PoAllocationRefresh_SkippedReason CHECK (SkippedReason IN ('EMPTY', 'SHRINK')),
    CONSTRAINT CK_PoAllocationRefresh_Single CHECK (Id = 1),
    CONSTRAINT CK_PoAllocationRefresh_Percent CHECK (MaxShrinkPercent <= 100)
);
INSERT INTO dbo.PoAllocationRefresh (Id) VALUES (1);
GO
