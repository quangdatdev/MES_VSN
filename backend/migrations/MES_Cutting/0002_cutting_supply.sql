-- MES_Cutting 0002: màn "Xác nhận cấp BTP" (phase 5.15, quyết định 13.8, 13.9).
-- Tổ cắt ghi số bán thành phẩm cấp cho chuyền may theo ngày, chuyền, mã hàng, màu, cỡ. Lệnh cấp là đầu phiếu của một nhóm
-- (ĐVCS, Ngày cấp, Mã hàng): các chuyền chung mã hàng cấp cùng ngày vào một lệnh. Số kế hoạch (Phân bổ màu cỡ), số đã cắt (Đồng bộ
-- tiến độ cắt), số đã cấp, còn lại tính lúc đọc, không lưu.
-- Quy ước như 0001: PascalCase, số ít, DATETIME2(3) UTC; bảng con mang BranchCode của cha, khóa ngoại ghép (ParentId, BranchCode).

-- Lệnh cấp. Số lệnh "NNN/ddMMyy/XBTP": NNN chạy tăng theo ĐVCS, về 1 đầu mỗi năm (năm của Ngày cấp), ddMMyy là Ngày cấp (quyết
-- định 13.9). Tên người lập, người cấp là bản chụp lúc ghi (như ShipmentPlan.PlannerName) để lọc, xuất file không phải đọc MES_Core.
-- Trạng thái: PENDING Chưa cấp (chưa xác nhận); PARTIAL Cấp 1 phần, FULL Cấp toàn phần tính lúc bấm Xác nhận cấp rồi giữ nguyên.
CREATE TABLE dbo.CuttingSupply (
    Id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CuttingSupply PRIMARY KEY,
    SupplyNo      VARCHAR(30)   NOT NULL,
    SupplyYear    SMALLINT      NOT NULL,
    SupplySeq     INT           NOT NULL CONSTRAINT CK_CuttingSupply_Seq CHECK (SupplySeq > 0),
    SupplyDate    DATE          NOT NULL,
    StyleCode     NVARCHAR(120) NOT NULL,
    Note          NVARCHAR(500) NULL,
    StatusCode    VARCHAR(20)   NOT NULL CONSTRAINT DF_CuttingSupply_Status DEFAULT 'PENDING'
                  CONSTRAINT CK_CuttingSupply_Status CHECK (StatusCode IN ('PENDING', 'PARTIAL', 'FULL')),
    CreatorName   NVARCHAR(100) NOT NULL,
    ConfirmedAt   DATETIME2(3)  NULL,
    ConfirmedBy   INT           NULL,
    ConfirmerName NVARCHAR(100) NULL,
    BranchCode    VARCHAR(10)   NOT NULL,
    CreatedAt     DATETIME2(3)  NOT NULL CONSTRAINT DF_CuttingSupply_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy     INT           NULL,
    ModifiedAt    DATETIME2(3)  NULL,
    ModifiedBy    INT           NULL,
    CONSTRAINT UQ_CuttingSupply_IdBranch UNIQUE (Id, BranchCode),
    CONSTRAINT UQ_CuttingSupply_No UNIQUE (BranchCode, SupplyNo),
    CONSTRAINT UQ_CuttingSupply_Seq UNIQUE (BranchCode, SupplyYear, SupplySeq),
    -- Một lệnh mỗi ĐVCS, ngày cấp, mã hàng: lưu thêm chuyền cùng ngày cùng mã hàng thì gộp vào lệnh đã có
    CONSTRAINT UQ_CuttingSupply_DayStyle UNIQUE (BranchCode, SupplyDate, StyleCode),
    -- Chưa cấp thì chưa có người cấp; đã xác nhận thì phải có lúc, người cấp
    CONSTRAINT CK_CuttingSupply_Confirm CHECK (
        (StatusCode = 'PENDING' AND ConfirmedAt IS NULL AND ConfirmedBy IS NULL AND ConfirmerName IS NULL)
        OR (StatusCode <> 'PENDING' AND ConfirmedAt IS NOT NULL AND ConfirmerName IS NOT NULL))
);
-- Danh sách mới tạo trước theo ĐVCS
CREATE INDEX IX_CuttingSupply_Branch_Created ON dbo.CuttingSupply (BranchCode, CreatedAt DESC, Id DESC);
-- Số đã cấp theo mã hàng (cộng mọi ngày)
CREATE INDEX IX_CuttingSupply_Branch_Style ON dbo.CuttingSupply (BranchCode, StyleCode) INCLUDE (SupplyDate);
GO

-- Số cấp trong Ngày cấp của lệnh, theo chuyền, màu, cỡ (Qty > 0: nhập 0 là xóa dòng). LineCode là mã bộ phận chuyền may
-- (MES_Hr.Department.Code, khóa ngầm), màu cỡ lưu theo tên như mọi bảng màu cỡ (so theo collation).
CREATE TABLE dbo.CuttingSupplyLine (
    Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CuttingSupplyLine PRIMARY KEY,
    CuttingSupplyId INT           NOT NULL,
    LineCode        VARCHAR(20)   NOT NULL,
    ColorName       NVARCHAR(100) NOT NULL,
    SizeName        VARCHAR(20)   NOT NULL,
    Qty             INT           NOT NULL CONSTRAINT CK_CuttingSupplyLine_Qty CHECK (Qty > 0),
    SortOrder       INT           NOT NULL CONSTRAINT DF_CuttingSupplyLine_SortOrder DEFAULT 0,
    BranchCode      VARCHAR(10)   NOT NULL,
    CreatedAt       DATETIME2(3)  NOT NULL CONSTRAINT DF_CuttingSupplyLine_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy       INT           NULL,
    ModifiedAt      DATETIME2(3)  NULL,
    ModifiedBy      INT           NULL,
    CONSTRAINT FK_CuttingSupplyLine_Supply FOREIGN KEY (CuttingSupplyId, BranchCode) REFERENCES dbo.CuttingSupply (Id, BranchCode) ON DELETE CASCADE,
    CONSTRAINT UQ_CuttingSupplyLine UNIQUE (CuttingSupplyId, LineCode, ColorName, SizeName)
);
-- Số đã cấp của chuyền (cộng mọi lệnh); khóa ngầm LineCode có index (CLAUDE.md mục 5)
CREATE INDEX IX_CuttingSupplyLine_Branch_Line ON dbo.CuttingSupplyLine (BranchCode, LineCode) INCLUDE (CuttingSupplyId, ColorName, SizeName, Qty);
GO
