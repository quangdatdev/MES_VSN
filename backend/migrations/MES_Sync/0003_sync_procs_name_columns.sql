-- Sinh bởi backend/scripts/sync-gen.ts --procs-only. Sửa thủ tục chép của 0002: biểu thức so theo byte trong bảng dẫn xuất
-- chưa có tên cột (lỗi 8155) làm nguồn PARTITION luôn lỗi. Chỉ CREATE OR ALTER thủ tục, không đụng bảng chép và SyncSource.

-- ===== vDM_CHINHANH → bravo.[DM_CHINHANH]: Chi nhánh (nhà máy) =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_CHINHANH]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [MaChiNhanh] VARCHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TenChiNhanh] NVARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BranchCode] VARCHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TenDayDu] NVARCHAR(128) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TenDayDu_TA] NVARCHAR(128) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DiaChi] NVARCHAR(128) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DiaChi_TA] NVARCHAR(128) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TaxCode] NVARCHAR(18) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Tel] NVARCHAR(48) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Fax] NVARCHAR(48) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  CREATE TABLE #alive (
    [BranchCode] VARCHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  INSERT INTO #src ([MaChiNhanh], [TenChiNhanh], [BranchCode], [TenDayDu], [TenDayDu_TA], [DiaChi], [DiaChi_TA], [TaxCode], [Tel], [Fax])
  SELECT [MaChiNhanh], [TenChiNhanh], [BranchCode], [TenDayDu], [TenDayDu_TA], [DiaChi], [DiaChi_TA], [TaxCode], [Tel], [Fax] FROM bravo.[src_DM_CHINHANH];
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [BranchCode] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (BranchCode). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [BranchCode] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (BranchCode). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_CHINHANH])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SET @MaxStampAt = NULL;
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_CHINHANH] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[BranchCode] = t.[BranchCode]))
     OR (1 = 0 AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[BranchCode] = t.[BranchCode]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[MaChiNhanh] = s.[MaChiNhanh], t.[TenChiNhanh] = s.[TenChiNhanh], t.[TenDayDu] = s.[TenDayDu], t.[TenDayDu_TA] = s.[TenDayDu_TA], t.[DiaChi] = s.[DiaChi], t.[DiaChi_TA] = s.[DiaChi_TA], t.[TaxCode] = s.[TaxCode], t.[Tel] = s.[Tel], t.[Fax] = s.[Fax], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_CHINHANH] t JOIN #src s ON s.[BranchCode] = t.[BranchCode]
  WHERE EXISTS (SELECT CAST(s.[MaChiNhanh] AS VARBINARY(MAX)) AS [MaChiNhanh], CAST(s.[TenChiNhanh] AS VARBINARY(MAX)) AS [TenChiNhanh], CAST(s.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(s.[TenDayDu] AS VARBINARY(MAX)) AS [TenDayDu], CAST(s.[TenDayDu_TA] AS VARBINARY(MAX)) AS [TenDayDu_TA], CAST(s.[DiaChi] AS VARBINARY(MAX)) AS [DiaChi], CAST(s.[DiaChi_TA] AS VARBINARY(MAX)) AS [DiaChi_TA], CAST(s.[TaxCode] AS VARBINARY(MAX)) AS [TaxCode], CAST(s.[Tel] AS VARBINARY(MAX)) AS [Tel], CAST(s.[Fax] AS VARBINARY(MAX)) AS [Fax] EXCEPT SELECT CAST(t.[MaChiNhanh] AS VARBINARY(MAX)) AS [MaChiNhanh], CAST(t.[TenChiNhanh] AS VARBINARY(MAX)) AS [TenChiNhanh], CAST(t.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(t.[TenDayDu] AS VARBINARY(MAX)) AS [TenDayDu], CAST(t.[TenDayDu_TA] AS VARBINARY(MAX)) AS [TenDayDu_TA], CAST(t.[DiaChi] AS VARBINARY(MAX)) AS [DiaChi], CAST(t.[DiaChi_TA] AS VARBINARY(MAX)) AS [DiaChi_TA], CAST(t.[TaxCode] AS VARBINARY(MAX)) AS [TaxCode], CAST(t.[Tel] AS VARBINARY(MAX)) AS [Tel], CAST(t.[Fax] AS VARBINARY(MAX)) AS [Fax]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_CHINHANH] ([MaChiNhanh], [TenChiNhanh], [BranchCode], [TenDayDu], [TenDayDu_TA], [DiaChi], [DiaChi_TA], [TaxCode], [Tel], [Fax], [SyncedAt], [SyncRunId])
  SELECT s.[MaChiNhanh], s.[TenChiNhanh], s.[BranchCode], s.[TenDayDu], s.[TenDayDu_TA], s.[DiaChi], s.[DiaChi_TA], s.[TaxCode], s.[Tel], s.[Fax], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_CHINHANH] t WHERE s.[BranchCode] = t.[BranchCode]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_CHINHANH];
END;
GO

-- ===== vDM_KHACHHANG → bravo.[DM_KHACHHANG]: Khách hàng =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_KHACHHANG]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [MaKhachHang] INT NULL,
    [TenTat] NVARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerId] INT NULL,
    [MaKhachHang_Bravo] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TenTat_OSM] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [NgungSuDung_KD] TINYINT NULL,
    [CustomerTypeList] NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BranchCode_GC] VARCHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [CustomerId] INT NULL
  );
  INSERT INTO #src ([MaKhachHang], [TenTat], [CustomerId], [MaKhachHang_Bravo], [TenTat_OSM], [NgungSuDung_KD], [CustomerTypeList], [BranchCode_GC], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [MaKhachHang], [TenTat], [CustomerId], [MaKhachHang_Bravo], [TenTat_OSM], [NgungSuDung_KD], [CustomerTypeList], [BranchCode_GC], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_KHACHHANG]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([CustomerId]) SELECT [CustomerId] FROM bravo.[src_DM_KHACHHANG];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_KHACHHANG])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([MaKhachHang], [TenTat], [CustomerId], [MaKhachHang_Bravo], [TenTat_OSM], [NgungSuDung_KD], [CustomerTypeList], [BranchCode_GC], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[MaKhachHang], v.[TenTat], v.[CustomerId], v.[MaKhachHang_Bravo], v.[TenTat_OSM], v.[NgungSuDung_KD], v.[CustomerTypeList], v.[BranchCode_GC], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_KHACHHANG] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[CustomerId] = v.[CustomerId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_KHACHHANG] t WHERE t.[CustomerId] = a.[CustomerId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[CustomerId] = v.[CustomerId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [CustomerId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (CustomerId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [CustomerId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (CustomerId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_KHACHHANG])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_KHACHHANG] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[CustomerId] = t.[CustomerId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[CustomerId] = t.[CustomerId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[MaKhachHang] = s.[MaKhachHang], t.[TenTat] = s.[TenTat], t.[MaKhachHang_Bravo] = s.[MaKhachHang_Bravo], t.[TenTat_OSM] = s.[TenTat_OSM], t.[NgungSuDung_KD] = s.[NgungSuDung_KD], t.[CustomerTypeList] = s.[CustomerTypeList], t.[BranchCode_GC] = s.[BranchCode_GC], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_KHACHHANG] t JOIN #src s ON s.[CustomerId] = t.[CustomerId]
  WHERE EXISTS (SELECT s.[MaKhachHang], CAST(s.[TenTat] AS VARBINARY(MAX)) AS [TenTat], s.[CustomerId], CAST(s.[MaKhachHang_Bravo] AS VARBINARY(MAX)) AS [MaKhachHang_Bravo], CAST(s.[TenTat_OSM] AS VARBINARY(MAX)) AS [TenTat_OSM], s.[NgungSuDung_KD], CAST(s.[CustomerTypeList] AS VARBINARY(MAX)) AS [CustomerTypeList], CAST(s.[BranchCode_GC] AS VARBINARY(MAX)) AS [BranchCode_GC], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[MaKhachHang], CAST(t.[TenTat] AS VARBINARY(MAX)) AS [TenTat], t.[CustomerId], CAST(t.[MaKhachHang_Bravo] AS VARBINARY(MAX)) AS [MaKhachHang_Bravo], CAST(t.[TenTat_OSM] AS VARBINARY(MAX)) AS [TenTat_OSM], t.[NgungSuDung_KD], CAST(t.[CustomerTypeList] AS VARBINARY(MAX)) AS [CustomerTypeList], CAST(t.[BranchCode_GC] AS VARBINARY(MAX)) AS [BranchCode_GC], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_KHACHHANG] ([MaKhachHang], [TenTat], [CustomerId], [MaKhachHang_Bravo], [TenTat_OSM], [NgungSuDung_KD], [CustomerTypeList], [BranchCode_GC], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[MaKhachHang], s.[TenTat], s.[CustomerId], s.[MaKhachHang_Bravo], s.[TenTat_OSM], s.[NgungSuDung_KD], s.[CustomerTypeList], s.[BranchCode_GC], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_KHACHHANG] t WHERE s.[CustomerId] = t.[CustomerId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_KHACHHANG];
END;
GO

-- ===== vDM_MuaKinhDoanh → bravo.[DM_MuaKinhDoanh]: Mùa kinh doanh =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_MuaKinhDoanh]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [SalesSeasonId] INT NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] DATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] DATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [SalesSeasonId] INT NULL
  );
  INSERT INTO #src ([SalesSeasonId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [SalesSeasonId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_MuaKinhDoanh]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([SalesSeasonId]) SELECT [SalesSeasonId] FROM bravo.[src_DM_MuaKinhDoanh];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_MuaKinhDoanh])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([SalesSeasonId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[SalesSeasonId], v.[Code], v.[Name], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_MuaKinhDoanh] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[SalesSeasonId] = v.[SalesSeasonId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_MuaKinhDoanh] t WHERE t.[SalesSeasonId] = a.[SalesSeasonId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[SalesSeasonId] = v.[SalesSeasonId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [SalesSeasonId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (SalesSeasonId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [SalesSeasonId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (SalesSeasonId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_MuaKinhDoanh])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_MuaKinhDoanh] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[SalesSeasonId] = t.[SalesSeasonId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[SalesSeasonId] = t.[SalesSeasonId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Code] = s.[Code], t.[Name] = s.[Name], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_MuaKinhDoanh] t JOIN #src s ON s.[SalesSeasonId] = t.[SalesSeasonId]
  WHERE EXISTS (SELECT s.[SalesSeasonId], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[SalesSeasonId], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_MuaKinhDoanh] ([SalesSeasonId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[SalesSeasonId], s.[Code], s.[Name], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_MuaKinhDoanh] t WHERE s.[SalesSeasonId] = t.[SalesSeasonId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_MuaKinhDoanh];
END;
GO

-- ===== vDM_MauSac → bravo.[DM_MauSac]: Màu sắc =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_MauSac]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [ColorId] INT NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [ColorId] INT NULL
  );
  INSERT INTO #src ([ColorId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [ColorId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_MauSac]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([ColorId]) SELECT [ColorId] FROM bravo.[src_DM_MauSac];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_MauSac])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([ColorId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[ColorId], v.[Code], v.[Name], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_MauSac] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[ColorId] = v.[ColorId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_MauSac] t WHERE t.[ColorId] = a.[ColorId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ColorId] = v.[ColorId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [ColorId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (ColorId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [ColorId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (ColorId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_MauSac])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_MauSac] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ColorId] = t.[ColorId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[ColorId] = t.[ColorId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Code] = s.[Code], t.[Name] = s.[Name], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_MauSac] t JOIN #src s ON s.[ColorId] = t.[ColorId]
  WHERE EXISTS (SELECT s.[ColorId], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[ColorId], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_MauSac] ([ColorId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[ColorId], s.[Code], s.[Name], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_MauSac] t WHERE s.[ColorId] = t.[ColorId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_MauSac];
END;
GO

-- ===== vDM_Size → bravo.[DM_Size]: Size =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_Size]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [SizeId] INT NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] DATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] DATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [SizeId] INT NULL
  );
  INSERT INTO #src ([SizeId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [SizeId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_Size];
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [SizeId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (SizeId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [SizeId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (SizeId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_Size])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_Size] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[SizeId] = t.[SizeId]))
     OR (1 = 0 AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[SizeId] = t.[SizeId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Code] = s.[Code], t.[Name] = s.[Name], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_Size] t JOIN #src s ON s.[SizeId] = t.[SizeId]
  WHERE EXISTS (SELECT s.[SizeId], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[SizeId], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_Size] ([SizeId], [Code], [Name], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[SizeId], s.[Code], s.[Name], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_Size] t WHERE s.[SizeId] = t.[SizeId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_Size];
END;
GO

-- ===== vDM_NHANVIEN → bravo.[DM_NHANVIEN]: Nhân viên =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_NHANVIEN]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [EmployeeId] INT NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name2] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ShortName] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DeptId] INT NULL,
    [FileNo] NVARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [EmployeeId] INT NULL
  );
  INSERT INTO #src ([EmployeeId], [Code], [Name], [Name2], [ShortName], [DeptId], [FileNo], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [EmployeeId], [Code], [Name], [Name2], [ShortName], [DeptId], [FileNo], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_NHANVIEN]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([EmployeeId]) SELECT [EmployeeId] FROM bravo.[src_DM_NHANVIEN];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_NHANVIEN])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([EmployeeId], [Code], [Name], [Name2], [ShortName], [DeptId], [FileNo], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[EmployeeId], v.[Code], v.[Name], v.[Name2], v.[ShortName], v.[DeptId], v.[FileNo], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_NHANVIEN] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[EmployeeId] = v.[EmployeeId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_NHANVIEN] t WHERE t.[EmployeeId] = a.[EmployeeId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[EmployeeId] = v.[EmployeeId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [EmployeeId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (EmployeeId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [EmployeeId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (EmployeeId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_NHANVIEN])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_NHANVIEN] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[EmployeeId] = t.[EmployeeId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[EmployeeId] = t.[EmployeeId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Code] = s.[Code], t.[Name] = s.[Name], t.[Name2] = s.[Name2], t.[ShortName] = s.[ShortName], t.[DeptId] = s.[DeptId], t.[FileNo] = s.[FileNo], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_NHANVIEN] t JOIN #src s ON s.[EmployeeId] = t.[EmployeeId]
  WHERE EXISTS (SELECT s.[EmployeeId], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], CAST(s.[Name2] AS VARBINARY(MAX)) AS [Name2], CAST(s.[ShortName] AS VARBINARY(MAX)) AS [ShortName], s.[DeptId], CAST(s.[FileNo] AS VARBINARY(MAX)) AS [FileNo], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[EmployeeId], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], CAST(t.[Name2] AS VARBINARY(MAX)) AS [Name2], CAST(t.[ShortName] AS VARBINARY(MAX)) AS [ShortName], t.[DeptId], CAST(t.[FileNo] AS VARBINARY(MAX)) AS [FileNo], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_NHANVIEN] ([EmployeeId], [Code], [Name], [Name2], [ShortName], [DeptId], [FileNo], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[EmployeeId], s.[Code], s.[Name], s.[Name2], s.[ShortName], s.[DeptId], s.[FileNo], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_NHANVIEN] t WHERE s.[EmployeeId] = t.[EmployeeId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_NHANVIEN];
END;
GO

-- ===== vDM_TEAM → bravo.[DM_TEAM]: Nhóm (team) =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_TEAM]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [TeamId] INT NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name2] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [EmployeeId] INT NULL,
    [TeamType] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerIdList] NVARCHAR(512) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [TeamId] INT NULL
  );
  INSERT INTO #src ([TeamId], [Code], [Name], [Name2], [EmployeeId], [TeamType], [CustomerIdList], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [TeamId], [Code], [Name], [Name2], [EmployeeId], [TeamType], [CustomerIdList], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_TEAM]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([TeamId]) SELECT [TeamId] FROM bravo.[src_DM_TEAM];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_TEAM])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([TeamId], [Code], [Name], [Name2], [EmployeeId], [TeamType], [CustomerIdList], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[TeamId], v.[Code], v.[Name], v.[Name2], v.[EmployeeId], v.[TeamType], v.[CustomerIdList], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_TEAM] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[TeamId] = v.[TeamId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_TEAM] t WHERE t.[TeamId] = a.[TeamId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[TeamId] = v.[TeamId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [TeamId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (TeamId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [TeamId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (TeamId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_TEAM])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_TEAM] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[TeamId] = t.[TeamId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[TeamId] = t.[TeamId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Code] = s.[Code], t.[Name] = s.[Name], t.[Name2] = s.[Name2], t.[EmployeeId] = s.[EmployeeId], t.[TeamType] = s.[TeamType], t.[CustomerIdList] = s.[CustomerIdList], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_TEAM] t JOIN #src s ON s.[TeamId] = t.[TeamId]
  WHERE EXISTS (SELECT s.[TeamId], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], CAST(s.[Name2] AS VARBINARY(MAX)) AS [Name2], s.[EmployeeId], CAST(s.[TeamType] AS VARBINARY(MAX)) AS [TeamType], CAST(s.[CustomerIdList] AS VARBINARY(MAX)) AS [CustomerIdList], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[TeamId], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], CAST(t.[Name2] AS VARBINARY(MAX)) AS [Name2], t.[EmployeeId], CAST(t.[TeamType] AS VARBINARY(MAX)) AS [TeamType], CAST(t.[CustomerIdList] AS VARBINARY(MAX)) AS [CustomerIdList], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_TEAM] ([TeamId], [Code], [Name], [Name2], [EmployeeId], [TeamType], [CustomerIdList], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[TeamId], s.[Code], s.[Name], s.[Name2], s.[EmployeeId], s.[TeamType], s.[CustomerIdList], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_TEAM] t WHERE s.[TeamId] = t.[TeamId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_TEAM];
END;
GO

-- ===== vDM_NGUOISUDUNG → bravo.[DM_NGUOISUDUNG]: Người dùng BRAVO =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_NGUOISUDUNG]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [UserId] INT NULL,
    [UserName] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [FullName] NVARCHAR(48) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [EmployeeId] INT NULL,
    [DeptId] INT NULL,
    [CustomerIdList] NVARCHAR(512) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TeamId] INT NULL,
    [TeamId_List] NVARCHAR(196) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [UserId] INT NULL
  );
  INSERT INTO #src ([UserId], [UserName], [FullName], [EmployeeId], [DeptId], [CustomerIdList], [TeamId], [TeamId_List], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [UserId], [UserName], [FullName], [EmployeeId], [DeptId], [CustomerIdList], [TeamId], [TeamId_List], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_NGUOISUDUNG]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([UserId]) SELECT [UserId] FROM bravo.[src_DM_NGUOISUDUNG];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_NGUOISUDUNG])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([UserId], [UserName], [FullName], [EmployeeId], [DeptId], [CustomerIdList], [TeamId], [TeamId_List], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[UserId], v.[UserName], v.[FullName], v.[EmployeeId], v.[DeptId], v.[CustomerIdList], v.[TeamId], v.[TeamId_List], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_NGUOISUDUNG] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[UserId] = v.[UserId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_NGUOISUDUNG] t WHERE t.[UserId] = a.[UserId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[UserId] = v.[UserId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [UserId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (UserId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [UserId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (UserId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_NGUOISUDUNG])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_NGUOISUDUNG] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[UserId] = t.[UserId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[UserId] = t.[UserId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[UserName] = s.[UserName], t.[FullName] = s.[FullName], t.[EmployeeId] = s.[EmployeeId], t.[DeptId] = s.[DeptId], t.[CustomerIdList] = s.[CustomerIdList], t.[TeamId] = s.[TeamId], t.[TeamId_List] = s.[TeamId_List], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_NGUOISUDUNG] t JOIN #src s ON s.[UserId] = t.[UserId]
  WHERE EXISTS (SELECT s.[UserId], CAST(s.[UserName] AS VARBINARY(MAX)) AS [UserName], CAST(s.[FullName] AS VARBINARY(MAX)) AS [FullName], s.[EmployeeId], s.[DeptId], CAST(s.[CustomerIdList] AS VARBINARY(MAX)) AS [CustomerIdList], s.[TeamId], CAST(s.[TeamId_List] AS VARBINARY(MAX)) AS [TeamId_List], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[UserId], CAST(t.[UserName] AS VARBINARY(MAX)) AS [UserName], CAST(t.[FullName] AS VARBINARY(MAX)) AS [FullName], t.[EmployeeId], t.[DeptId], CAST(t.[CustomerIdList] AS VARBINARY(MAX)) AS [CustomerIdList], t.[TeamId], CAST(t.[TeamId_List] AS VARBINARY(MAX)) AS [TeamId_List], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_NGUOISUDUNG] ([UserId], [UserName], [FullName], [EmployeeId], [DeptId], [CustomerIdList], [TeamId], [TeamId_List], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[UserId], s.[UserName], s.[FullName], s.[EmployeeId], s.[DeptId], s.[CustomerIdList], s.[TeamId], s.[TeamId_List], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_NGUOISUDUNG] t WHERE s.[UserId] = t.[UserId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_NGUOISUDUNG];
END;
GO

-- ===== vDM_LOOKUP → bravo.[DM_LOOKUP]: Mã tra cứu =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_LOOKUP]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(128) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ParentCode] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ParentLinkCode] NVARCHAR(1024) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [ParentCode] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  INSERT INTO #src ([Code], [Name], [ParentCode], [ParentLinkCode], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [Code], [Name], [ParentCode], [ParentLinkCode], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_LOOKUP]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([ParentCode], [Code]) SELECT [ParentCode], [Code] FROM bravo.[src_DM_LOOKUP];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_LOOKUP])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([Code], [Name], [ParentCode], [ParentLinkCode], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[Code], v.[Name], v.[ParentCode], v.[ParentLinkCode], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_LOOKUP] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[ParentCode] = v.[ParentCode] AND a.[Code] = v.[Code] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_LOOKUP] t WHERE t.[ParentCode] = a.[ParentCode] AND t.[Code] = a.[Code]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ParentCode] = v.[ParentCode] AND s.[Code] = v.[Code]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [ParentCode], [Code] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (ParentCode, Code). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [ParentCode] IS NULL OR [Code] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (ParentCode, Code). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_LOOKUP])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_LOOKUP] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ParentCode] = t.[ParentCode] AND s.[Code] = t.[Code]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[ParentCode] = t.[ParentCode] AND a.[Code] = t.[Code]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Name] = s.[Name], t.[ParentLinkCode] = s.[ParentLinkCode], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_LOOKUP] t JOIN #src s ON s.[ParentCode] = t.[ParentCode] AND s.[Code] = t.[Code]
  WHERE EXISTS (SELECT CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], CAST(s.[ParentCode] AS VARBINARY(MAX)) AS [ParentCode], CAST(s.[ParentLinkCode] AS VARBINARY(MAX)) AS [ParentLinkCode], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], CAST(t.[ParentCode] AS VARBINARY(MAX)) AS [ParentCode], CAST(t.[ParentLinkCode] AS VARBINARY(MAX)) AS [ParentLinkCode], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_LOOKUP] ([Code], [Name], [ParentCode], [ParentLinkCode], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[Code], s.[Name], s.[ParentCode], s.[ParentLinkCode], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_LOOKUP] t WHERE s.[ParentCode] = t.[ParentCode] AND s.[Code] = t.[Code]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_LOOKUP];
END;
GO

-- ===== vDM_DiaDiemGiaoHang → bravo.[DM_DiaDiemGiaoHang]: Địa điểm giao hàng =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_DiaDiemGiaoHang]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [DestinationId] INT NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BuyerName] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Address] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BillingAddress] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerId] INT NULL,
    [RowId_Nationality] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [DestinationId] INT NULL
  );
  INSERT INTO #src ([DestinationId], [Code], [Name], [BuyerName], [Address], [BillingAddress], [CustomerId], [RowId_Nationality], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [DestinationId], [Code], [Name], [BuyerName], [Address], [BillingAddress], [CustomerId], [RowId_Nationality], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_DiaDiemGiaoHang]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([DestinationId]) SELECT [DestinationId] FROM bravo.[src_DM_DiaDiemGiaoHang];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_DiaDiemGiaoHang])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([DestinationId], [Code], [Name], [BuyerName], [Address], [BillingAddress], [CustomerId], [RowId_Nationality], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[DestinationId], v.[Code], v.[Name], v.[BuyerName], v.[Address], v.[BillingAddress], v.[CustomerId], v.[RowId_Nationality], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_DiaDiemGiaoHang] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[DestinationId] = v.[DestinationId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_DiaDiemGiaoHang] t WHERE t.[DestinationId] = a.[DestinationId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[DestinationId] = v.[DestinationId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [DestinationId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (DestinationId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [DestinationId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (DestinationId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_DiaDiemGiaoHang])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_DiaDiemGiaoHang] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[DestinationId] = t.[DestinationId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[DestinationId] = t.[DestinationId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Code] = s.[Code], t.[Name] = s.[Name], t.[BuyerName] = s.[BuyerName], t.[Address] = s.[Address], t.[BillingAddress] = s.[BillingAddress], t.[CustomerId] = s.[CustomerId], t.[RowId_Nationality] = s.[RowId_Nationality], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_DiaDiemGiaoHang] t JOIN #src s ON s.[DestinationId] = t.[DestinationId]
  WHERE EXISTS (SELECT s.[DestinationId], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], CAST(s.[BuyerName] AS VARBINARY(MAX)) AS [BuyerName], CAST(s.[Address] AS VARBINARY(MAX)) AS [Address], CAST(s.[BillingAddress] AS VARBINARY(MAX)) AS [BillingAddress], s.[CustomerId], CAST(s.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[DestinationId], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], CAST(t.[BuyerName] AS VARBINARY(MAX)) AS [BuyerName], CAST(t.[Address] AS VARBINARY(MAX)) AS [Address], CAST(t.[BillingAddress] AS VARBINARY(MAX)) AS [BillingAddress], t.[CustomerId], CAST(t.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_DiaDiemGiaoHang] ([DestinationId], [Code], [Name], [BuyerName], [Address], [BillingAddress], [CustomerId], [RowId_Nationality], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[DestinationId], s.[Code], s.[Name], s.[BuyerName], s.[Address], s.[BillingAddress], s.[CustomerId], s.[RowId_Nationality], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_DiaDiemGiaoHang] t WHERE s.[DestinationId] = t.[DestinationId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_DiaDiemGiaoHang];
END;
GO

-- ===== vDM_QuocGia → bravo.[DM_QuocGia]: Quốc gia =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_QuocGia]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [RowId_Nationality] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Code] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(196) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name2] NVARCHAR(196) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [RowId_Nationality] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  INSERT INTO #src ([RowId_Nationality], [Code], [Name], [Name2], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [RowId_Nationality], [Code], [Name], [Name2], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_QuocGia]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([RowId_Nationality]) SELECT [RowId_Nationality] FROM bravo.[src_DM_QuocGia];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_QuocGia])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([RowId_Nationality], [Code], [Name], [Name2], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[RowId_Nationality], v.[Code], v.[Name], v.[Name2], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_QuocGia] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[RowId_Nationality] = v.[RowId_Nationality] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_QuocGia] t WHERE t.[RowId_Nationality] = a.[RowId_Nationality]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[RowId_Nationality] = v.[RowId_Nationality]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [RowId_Nationality] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (RowId_Nationality). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [RowId_Nationality] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (RowId_Nationality). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_QuocGia])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_QuocGia] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[RowId_Nationality] = t.[RowId_Nationality]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[RowId_Nationality] = t.[RowId_Nationality]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[Code] = s.[Code], t.[Name] = s.[Name], t.[Name2] = s.[Name2], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_QuocGia] t JOIN #src s ON s.[RowId_Nationality] = t.[RowId_Nationality]
  WHERE EXISTS (SELECT CAST(s.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], CAST(s.[Name2] AS VARBINARY(MAX)) AS [Name2], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT CAST(t.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], CAST(t.[Name2] AS VARBINARY(MAX)) AS [Name2], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_QuocGia] ([RowId_Nationality], [Code], [Name], [Name2], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[RowId_Nationality], s.[Code], s.[Name], s.[Name2], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_QuocGia] t WHERE s.[RowId_Nationality] = t.[RowId_Nationality]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_QuocGia];
END;
GO

-- ===== vDM_PhuongThucGiaoHang → bravo.[DM_PhuongThucGiaoHang]: Phương thức giao hàng =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_PhuongThucGiaoHang]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [PhuongThucGH] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TenTatPhuongThucGH] NVARCHAR(128) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ParentCode] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Id] INT NULL
  );
  CREATE TABLE #alive (
    [Id] INT NULL
  );
  INSERT INTO #src ([PhuongThucGH], [TenTatPhuongThucGH], [ParentCode], [Id])
  SELECT [PhuongThucGH], [TenTatPhuongThucGH], [ParentCode], [Id] FROM bravo.[src_DM_PhuongThucGiaoHang];
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [Id] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (Id). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [Id] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (Id). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_PhuongThucGiaoHang])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SET @MaxStampAt = NULL;
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_PhuongThucGiaoHang] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[Id] = t.[Id]))
     OR (1 = 0 AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[Id] = t.[Id]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[PhuongThucGH] = s.[PhuongThucGH], t.[TenTatPhuongThucGH] = s.[TenTatPhuongThucGH], t.[ParentCode] = s.[ParentCode], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_PhuongThucGiaoHang] t JOIN #src s ON s.[Id] = t.[Id]
  WHERE EXISTS (SELECT CAST(s.[PhuongThucGH] AS VARBINARY(MAX)) AS [PhuongThucGH], CAST(s.[TenTatPhuongThucGH] AS VARBINARY(MAX)) AS [TenTatPhuongThucGH], CAST(s.[ParentCode] AS VARBINARY(MAX)) AS [ParentCode], s.[Id] EXCEPT SELECT CAST(t.[PhuongThucGH] AS VARBINARY(MAX)) AS [PhuongThucGH], CAST(t.[TenTatPhuongThucGH] AS VARBINARY(MAX)) AS [TenTatPhuongThucGH], CAST(t.[ParentCode] AS VARBINARY(MAX)) AS [ParentCode], t.[Id]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_PhuongThucGiaoHang] ([PhuongThucGH], [TenTatPhuongThucGH], [ParentCode], [Id], [SyncedAt], [SyncRunId])
  SELECT s.[PhuongThucGH], s.[TenTatPhuongThucGH], s.[ParentCode], s.[Id], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_PhuongThucGiaoHang] t WHERE s.[Id] = t.[Id]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_PhuongThucGiaoHang];
END;
GO

-- ===== vDM_SanPhamDonHang → bravo.[DM_SanPhamDonHang]: Sản phẩm đơn hàng =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_SanPhamDonHang]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [ProductId] INT NULL,
    [BranchCode] NVARCHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Code] VARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Name] NVARCHAR(254) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Description_DetailSO] NVARCHAR(256) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Unit] NVARCHAR(8) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TotalQuantity_SO] NUMERIC(18, 4) NULL,
    [BizDocId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ItemId] INT NULL,
    [CustomerId] INT NULL,
    [EmployeeId] INT NULL,
    [TeamId] INT NULL,
    [TeamId_Pattern] INT NULL,
    [DeptId] INT NULL,
    [Description] NVARCHAR(254) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [SalesSeasonId] INT NULL,
    [SalesOrderQuantityTypeCode] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ProductionTypeCode] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [TypeSOCode] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [StyleName] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [StyleName_OSM] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ItemClassCode] NVARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Items_OSMCode] NVARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Gender_OSMCode] NVARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Function_OSMCode] NVARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerPONoList] NVARCHAR(2000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerPOIdList] VARCHAR(4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [EndDatePrice] SMALLDATETIME NULL,
    [ProductId_GC] INT NULL,
    [BizDocId_PO_GC] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BizDocId_SO] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Brand] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [ProductId] INT NULL
  );
  INSERT INTO #src ([ProductId], [BranchCode], [Code], [Name], [Description_DetailSO], [Unit], [TotalQuantity_SO], [BizDocId], [ItemId], [CustomerId], [EmployeeId], [TeamId], [TeamId_Pattern], [DeptId], [Description], [SalesSeasonId], [SalesOrderQuantityTypeCode], [ProductionTypeCode], [TypeSOCode], [StyleName], [StyleName_OSM], [ItemClassCode], [Items_OSMCode], [Gender_OSMCode], [Function_OSMCode], [CustomerPONoList], [CustomerPOIdList], [EndDatePrice], [ProductId_GC], [BizDocId_PO_GC], [BizDocId_SO], [Brand], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [ProductId], [BranchCode], [Code], [Name], [Description_DetailSO], [Unit], [TotalQuantity_SO], [BizDocId], [ItemId], [CustomerId], [EmployeeId], [TeamId], [TeamId_Pattern], [DeptId], [Description], [SalesSeasonId], [SalesOrderQuantityTypeCode], [ProductionTypeCode], [TypeSOCode], [StyleName], [StyleName_OSM], [ItemClassCode], [Items_OSMCode], [Gender_OSMCode], [Function_OSMCode], [CustomerPONoList], [CustomerPOIdList], [EndDatePrice], [ProductId_GC], [BizDocId_PO_GC], [BizDocId_SO], [Brand], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_SanPhamDonHang]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([ProductId]) SELECT [ProductId] FROM bravo.[src_DM_SanPhamDonHang];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_SanPhamDonHang])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([ProductId], [BranchCode], [Code], [Name], [Description_DetailSO], [Unit], [TotalQuantity_SO], [BizDocId], [ItemId], [CustomerId], [EmployeeId], [TeamId], [TeamId_Pattern], [DeptId], [Description], [SalesSeasonId], [SalesOrderQuantityTypeCode], [ProductionTypeCode], [TypeSOCode], [StyleName], [StyleName_OSM], [ItemClassCode], [Items_OSMCode], [Gender_OSMCode], [Function_OSMCode], [CustomerPONoList], [CustomerPOIdList], [EndDatePrice], [ProductId_GC], [BizDocId_PO_GC], [BizDocId_SO], [Brand], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[ProductId], v.[BranchCode], v.[Code], v.[Name], v.[Description_DetailSO], v.[Unit], v.[TotalQuantity_SO], v.[BizDocId], v.[ItemId], v.[CustomerId], v.[EmployeeId], v.[TeamId], v.[TeamId_Pattern], v.[DeptId], v.[Description], v.[SalesSeasonId], v.[SalesOrderQuantityTypeCode], v.[ProductionTypeCode], v.[TypeSOCode], v.[StyleName], v.[StyleName_OSM], v.[ItemClassCode], v.[Items_OSMCode], v.[Gender_OSMCode], v.[Function_OSMCode], v.[CustomerPONoList], v.[CustomerPOIdList], v.[EndDatePrice], v.[ProductId_GC], v.[BizDocId_PO_GC], v.[BizDocId_SO], v.[Brand], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_SanPhamDonHang] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[ProductId] = v.[ProductId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_SanPhamDonHang] t WHERE t.[ProductId] = a.[ProductId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ProductId] = v.[ProductId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [ProductId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (ProductId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [ProductId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (ProductId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_SanPhamDonHang])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_SanPhamDonHang] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ProductId] = t.[ProductId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[ProductId] = t.[ProductId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[BranchCode] = s.[BranchCode], t.[Code] = s.[Code], t.[Name] = s.[Name], t.[Description_DetailSO] = s.[Description_DetailSO], t.[Unit] = s.[Unit], t.[TotalQuantity_SO] = s.[TotalQuantity_SO], t.[BizDocId] = s.[BizDocId], t.[ItemId] = s.[ItemId], t.[CustomerId] = s.[CustomerId], t.[EmployeeId] = s.[EmployeeId], t.[TeamId] = s.[TeamId], t.[TeamId_Pattern] = s.[TeamId_Pattern], t.[DeptId] = s.[DeptId], t.[Description] = s.[Description], t.[SalesSeasonId] = s.[SalesSeasonId], t.[SalesOrderQuantityTypeCode] = s.[SalesOrderQuantityTypeCode], t.[ProductionTypeCode] = s.[ProductionTypeCode], t.[TypeSOCode] = s.[TypeSOCode], t.[StyleName] = s.[StyleName], t.[StyleName_OSM] = s.[StyleName_OSM], t.[ItemClassCode] = s.[ItemClassCode], t.[Items_OSMCode] = s.[Items_OSMCode], t.[Gender_OSMCode] = s.[Gender_OSMCode], t.[Function_OSMCode] = s.[Function_OSMCode], t.[CustomerPONoList] = s.[CustomerPONoList], t.[CustomerPOIdList] = s.[CustomerPOIdList], t.[EndDatePrice] = s.[EndDatePrice], t.[ProductId_GC] = s.[ProductId_GC], t.[BizDocId_PO_GC] = s.[BizDocId_PO_GC], t.[BizDocId_SO] = s.[BizDocId_SO], t.[Brand] = s.[Brand], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_SanPhamDonHang] t JOIN #src s ON s.[ProductId] = t.[ProductId]
  WHERE EXISTS (SELECT s.[ProductId], CAST(s.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(s.[Code] AS VARBINARY(MAX)) AS [Code], CAST(s.[Name] AS VARBINARY(MAX)) AS [Name], CAST(s.[Description_DetailSO] AS VARBINARY(MAX)) AS [Description_DetailSO], CAST(s.[Unit] AS VARBINARY(MAX)) AS [Unit], s.[TotalQuantity_SO], CAST(s.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], s.[ItemId], s.[CustomerId], s.[EmployeeId], s.[TeamId], s.[TeamId_Pattern], s.[DeptId], CAST(s.[Description] AS VARBINARY(MAX)) AS [Description], s.[SalesSeasonId], CAST(s.[SalesOrderQuantityTypeCode] AS VARBINARY(MAX)) AS [SalesOrderQuantityTypeCode], CAST(s.[ProductionTypeCode] AS VARBINARY(MAX)) AS [ProductionTypeCode], CAST(s.[TypeSOCode] AS VARBINARY(MAX)) AS [TypeSOCode], CAST(s.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(s.[StyleName_OSM] AS VARBINARY(MAX)) AS [StyleName_OSM], CAST(s.[ItemClassCode] AS VARBINARY(MAX)) AS [ItemClassCode], CAST(s.[Items_OSMCode] AS VARBINARY(MAX)) AS [Items_OSMCode], CAST(s.[Gender_OSMCode] AS VARBINARY(MAX)) AS [Gender_OSMCode], CAST(s.[Function_OSMCode] AS VARBINARY(MAX)) AS [Function_OSMCode], CAST(s.[CustomerPONoList] AS VARBINARY(MAX)) AS [CustomerPONoList], CAST(s.[CustomerPOIdList] AS VARBINARY(MAX)) AS [CustomerPOIdList], s.[EndDatePrice], s.[ProductId_GC], CAST(s.[BizDocId_PO_GC] AS VARBINARY(MAX)) AS [BizDocId_PO_GC], CAST(s.[BizDocId_SO] AS VARBINARY(MAX)) AS [BizDocId_SO], CAST(s.[Brand] AS VARBINARY(MAX)) AS [Brand], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[ProductId], CAST(t.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(t.[Code] AS VARBINARY(MAX)) AS [Code], CAST(t.[Name] AS VARBINARY(MAX)) AS [Name], CAST(t.[Description_DetailSO] AS VARBINARY(MAX)) AS [Description_DetailSO], CAST(t.[Unit] AS VARBINARY(MAX)) AS [Unit], t.[TotalQuantity_SO], CAST(t.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], t.[ItemId], t.[CustomerId], t.[EmployeeId], t.[TeamId], t.[TeamId_Pattern], t.[DeptId], CAST(t.[Description] AS VARBINARY(MAX)) AS [Description], t.[SalesSeasonId], CAST(t.[SalesOrderQuantityTypeCode] AS VARBINARY(MAX)) AS [SalesOrderQuantityTypeCode], CAST(t.[ProductionTypeCode] AS VARBINARY(MAX)) AS [ProductionTypeCode], CAST(t.[TypeSOCode] AS VARBINARY(MAX)) AS [TypeSOCode], CAST(t.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(t.[StyleName_OSM] AS VARBINARY(MAX)) AS [StyleName_OSM], CAST(t.[ItemClassCode] AS VARBINARY(MAX)) AS [ItemClassCode], CAST(t.[Items_OSMCode] AS VARBINARY(MAX)) AS [Items_OSMCode], CAST(t.[Gender_OSMCode] AS VARBINARY(MAX)) AS [Gender_OSMCode], CAST(t.[Function_OSMCode] AS VARBINARY(MAX)) AS [Function_OSMCode], CAST(t.[CustomerPONoList] AS VARBINARY(MAX)) AS [CustomerPONoList], CAST(t.[CustomerPOIdList] AS VARBINARY(MAX)) AS [CustomerPOIdList], t.[EndDatePrice], t.[ProductId_GC], CAST(t.[BizDocId_PO_GC] AS VARBINARY(MAX)) AS [BizDocId_PO_GC], CAST(t.[BizDocId_SO] AS VARBINARY(MAX)) AS [BizDocId_SO], CAST(t.[Brand] AS VARBINARY(MAX)) AS [Brand], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_SanPhamDonHang] ([ProductId], [BranchCode], [Code], [Name], [Description_DetailSO], [Unit], [TotalQuantity_SO], [BizDocId], [ItemId], [CustomerId], [EmployeeId], [TeamId], [TeamId_Pattern], [DeptId], [Description], [SalesSeasonId], [SalesOrderQuantityTypeCode], [ProductionTypeCode], [TypeSOCode], [StyleName], [StyleName_OSM], [ItemClassCode], [Items_OSMCode], [Gender_OSMCode], [Function_OSMCode], [CustomerPONoList], [CustomerPOIdList], [EndDatePrice], [ProductId_GC], [BizDocId_PO_GC], [BizDocId_SO], [Brand], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[ProductId], s.[BranchCode], s.[Code], s.[Name], s.[Description_DetailSO], s.[Unit], s.[TotalQuantity_SO], s.[BizDocId], s.[ItemId], s.[CustomerId], s.[EmployeeId], s.[TeamId], s.[TeamId_Pattern], s.[DeptId], s.[Description], s.[SalesSeasonId], s.[SalesOrderQuantityTypeCode], s.[ProductionTypeCode], s.[TypeSOCode], s.[StyleName], s.[StyleName_OSM], s.[ItemClassCode], s.[Items_OSMCode], s.[Gender_OSMCode], s.[Function_OSMCode], s.[CustomerPONoList], s.[CustomerPOIdList], s.[EndDatePrice], s.[ProductId_GC], s.[BizDocId_PO_GC], s.[BizDocId_SO], s.[Brand], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_SanPhamDonHang] t WHERE s.[ProductId] = t.[ProductId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_SanPhamDonHang];
END;
GO

-- ===== vDM_POKH → bravo.[DM_POKH]: PO khách hàng =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_DM_POKH]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [CustomerPOId] INT NULL,
    [BranchCode] VARCHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BizDocId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerPONo] VARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DocDate] DATE NULL,
    [Description] NVARCHAR(192) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [OriginalCustomerPONo] NVARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [POType] NVARCHAR(128) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] DATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] DATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [CustomerPOId] INT NULL
  );
  INSERT INTO #src ([CustomerPOId], [BranchCode], [BizDocId], [CustomerPONo], [DocDate], [Description], [OriginalCustomerPONo], [POType], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [CustomerPOId], [BranchCode], [BizDocId], [CustomerPONo], [DocDate], [Description], [OriginalCustomerPONo], [POType], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_DM_POKH]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([CustomerPOId]) SELECT [CustomerPOId] FROM bravo.[src_DM_POKH];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[DM_POKH])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([CustomerPOId], [BranchCode], [BizDocId], [CustomerPONo], [DocDate], [Description], [OriginalCustomerPONo], [POType], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[CustomerPOId], v.[BranchCode], v.[BizDocId], v.[CustomerPONo], v.[DocDate], v.[Description], v.[OriginalCustomerPONo], v.[POType], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_DM_POKH] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[CustomerPOId] = v.[CustomerPOId] AND NOT EXISTS (SELECT 1 FROM bravo.[DM_POKH] t WHERE t.[CustomerPOId] = a.[CustomerPOId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[CustomerPOId] = v.[CustomerPOId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [CustomerPOId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (CustomerPOId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [CustomerPOId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (CustomerPOId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[DM_POKH])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[DM_POKH] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[CustomerPOId] = t.[CustomerPOId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[CustomerPOId] = t.[CustomerPOId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[BranchCode] = s.[BranchCode], t.[BizDocId] = s.[BizDocId], t.[CustomerPONo] = s.[CustomerPONo], t.[DocDate] = s.[DocDate], t.[Description] = s.[Description], t.[OriginalCustomerPONo] = s.[OriginalCustomerPONo], t.[POType] = s.[POType], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[DM_POKH] t JOIN #src s ON s.[CustomerPOId] = t.[CustomerPOId]
  WHERE EXISTS (SELECT s.[CustomerPOId], CAST(s.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(s.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], CAST(s.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], s.[DocDate], CAST(s.[Description] AS VARBINARY(MAX)) AS [Description], CAST(s.[OriginalCustomerPONo] AS VARBINARY(MAX)) AS [OriginalCustomerPONo], CAST(s.[POType] AS VARBINARY(MAX)) AS [POType], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT t.[CustomerPOId], CAST(t.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(t.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], CAST(t.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], t.[DocDate], CAST(t.[Description] AS VARBINARY(MAX)) AS [Description], CAST(t.[OriginalCustomerPONo] AS VARBINARY(MAX)) AS [OriginalCustomerPONo], CAST(t.[POType] AS VARBINARY(MAX)) AS [POType], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[DM_POKH] ([CustomerPOId], [BranchCode], [BizDocId], [CustomerPONo], [DocDate], [Description], [OriginalCustomerPONo], [POType], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[CustomerPOId], s.[BranchCode], s.[BizDocId], s.[CustomerPONo], s.[DocDate], s.[Description], s.[OriginalCustomerPONo], s.[POType], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[DM_POKH] t WHERE s.[CustomerPOId] = t.[CustomerPOId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[DM_POKH];
END;
GO

-- ===== vThongTinPO → bravo.[ThongTinPO]: Thông tin PO =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_ThongTinPO]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [BranchCode] CHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [BizDocId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ItemId] INT NULL,
    [ProductId] INT NULL,
    [CustomerPONo] VARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerPOId] INT NULL,
    [CustomerPOType] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CustomerPONoDate] DATETIME NULL,
    [DestinationId] INT NULL,
    [RowId_Nationality] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ShipViaCode] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [EstSyncMaterialDate] DATETIME NULL,
    [EstimatedTimeDelivery] DATETIME NULL,
    [EstimatedTimeDelivery_Original] DATETIME NULL,
    [RowIdList_SO] NVARCHAR(512) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Quantity9] NUMERIC(38, 4) NULL,
    [Description] NVARCHAR(254) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #keys (
    [ProductId] INT NULL
  );
  CREATE TABLE #alive (
    [ProductId] INT NULL,
    [RowCnt] INT NOT NULL
  );
  IF @SinceAt IS NULL
  BEGIN
    INSERT INTO #src ([BranchCode], [BizDocId], [ItemId], [ProductId], [CustomerPONo], [CustomerPOId], [CustomerPOType], [CustomerPONoDate], [DestinationId], [RowId_Nationality], [ShipViaCode], [EstSyncMaterialDate], [EstimatedTimeDelivery], [EstimatedTimeDelivery_Original], [RowIdList_SO], [Quantity9], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy]) SELECT [BranchCode], [BizDocId], [ItemId], [ProductId], [CustomerPONo], [CustomerPOId], [CustomerPOType], [CustomerPONoDate], [DestinationId], [RowId_Nationality], [ShipViaCode], [EstSyncMaterialDate], [EstimatedTimeDelivery], [EstimatedTimeDelivery_Original], [RowIdList_SO], [Quantity9], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_ThongTinPO];
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[ThongTinPO])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  END
  ELSE
  BEGIN
    -- Nhóm có dòng đổi thì đọc lại cả nhóm
    INSERT INTO #keys ([ProductId]) SELECT DISTINCT [ProductId] FROM bravo.[src_ThongTinPO] WHERE [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
    -- Đối soát số dòng từng nhóm (chỉ đọc cột nhóm): nhóm mất dòng, dòng đổi sang nhóm khác, nhóm thiếu ngày tháng,
    -- nhóm đã bị xóa bên nguồn đều lệch số dòng với bảng chép, nên cũng được đọc lại hoặc xóa
    INSERT INTO #alive ([ProductId], [RowCnt]) SELECT [ProductId], COUNT(*) FROM bravo.[src_ThongTinPO] GROUP BY [ProductId];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[ThongTinPO])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #keys ([ProductId])
    SELECT [ProductId] FROM (
      SELECT [ProductId], [RowCnt] FROM #alive
      EXCEPT SELECT [ProductId], COUNT(*) FROM bravo.[ThongTinPO] GROUP BY [ProductId]
    ) d;
    INSERT INTO #keys ([ProductId])
    SELECT [ProductId] FROM (SELECT [ProductId] FROM bravo.[ThongTinPO] EXCEPT SELECT [ProductId] FROM #alive) d;
    INSERT INTO #src ([BranchCode], [BizDocId], [ItemId], [ProductId], [CustomerPONo], [CustomerPOId], [CustomerPOType], [CustomerPONoDate], [DestinationId], [RowId_Nationality], [ShipViaCode], [EstSyncMaterialDate], [EstimatedTimeDelivery], [EstimatedTimeDelivery_Original], [RowIdList_SO], [Quantity9], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[BranchCode], v.[BizDocId], v.[ItemId], v.[ProductId], v.[CustomerPONo], v.[CustomerPOId], v.[CustomerPOType], v.[CustomerPONoDate], v.[DestinationId], v.[RowId_Nationality], v.[ShipViaCode], v.[EstSyncMaterialDate], v.[EstimatedTimeDelivery], v.[EstimatedTimeDelivery_Original], v.[RowIdList_SO], v.[Quantity9], v.[Description], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_ThongTinPO] v WHERE EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId] INTERSECT SELECT v.[ProductId]));
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  -- Số liệu báo cáo (gần đúng, nhóm không có khóa dòng): dòng của nhóm mới; dòng mới hoặc đổi trong nhóm đã có; dòng cũ không còn
  SELECT @InsertedCount = COUNT(*) FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[ThongTinPO] t WHERE EXISTS (SELECT s.[ProductId] INTERSECT SELECT t.[ProductId]));
  SELECT @UpdatedCount = COUNT(*) FROM (
    SELECT CAST(s.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(s.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], s.[ItemId], s.[ProductId], CAST(s.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], s.[CustomerPOId], CAST(s.[CustomerPOType] AS VARBINARY(MAX)) AS [CustomerPOType], s.[CustomerPONoDate], s.[DestinationId], CAST(s.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], CAST(s.[ShipViaCode] AS VARBINARY(MAX)) AS [ShipViaCode], s.[EstSyncMaterialDate], s.[EstimatedTimeDelivery], s.[EstimatedTimeDelivery_Original], CAST(s.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], s.[Quantity9], CAST(s.[Description] AS VARBINARY(MAX)) AS [Description], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] FROM #src s WHERE EXISTS (SELECT 1 FROM bravo.[ThongTinPO] t WHERE EXISTS (SELECT s.[ProductId] INTERSECT SELECT t.[ProductId]))
    EXCEPT SELECT CAST(t.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(t.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], t.[ItemId], t.[ProductId], CAST(t.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], t.[CustomerPOId], CAST(t.[CustomerPOType] AS VARBINARY(MAX)) AS [CustomerPOType], t.[CustomerPONoDate], t.[DestinationId], CAST(t.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], CAST(t.[ShipViaCode] AS VARBINARY(MAX)) AS [ShipViaCode], t.[EstSyncMaterialDate], t.[EstimatedTimeDelivery], t.[EstimatedTimeDelivery_Original], CAST(t.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], t.[Quantity9], CAST(t.[Description] AS VARBINARY(MAX)) AS [Description], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy] FROM bravo.[ThongTinPO] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId] INTERSECT SELECT t.[ProductId])))
  ) d;
  SELECT @DeletedCount = COUNT(*) FROM (
    SELECT CAST(t.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(t.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], t.[ItemId], t.[ProductId], CAST(t.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], t.[CustomerPOId], CAST(t.[CustomerPOType] AS VARBINARY(MAX)) AS [CustomerPOType], t.[CustomerPONoDate], t.[DestinationId], CAST(t.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], CAST(t.[ShipViaCode] AS VARBINARY(MAX)) AS [ShipViaCode], t.[EstSyncMaterialDate], t.[EstimatedTimeDelivery], t.[EstimatedTimeDelivery_Original], CAST(t.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], t.[Quantity9], CAST(t.[Description] AS VARBINARY(MAX)) AS [Description], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy] FROM bravo.[ThongTinPO] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId] INTERSECT SELECT t.[ProductId])))
    EXCEPT SELECT CAST(s.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(s.[BizDocId] AS VARBINARY(MAX)) AS [BizDocId], s.[ItemId], s.[ProductId], CAST(s.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], s.[CustomerPOId], CAST(s.[CustomerPOType] AS VARBINARY(MAX)) AS [CustomerPOType], s.[CustomerPONoDate], s.[DestinationId], CAST(s.[RowId_Nationality] AS VARBINARY(MAX)) AS [RowId_Nationality], CAST(s.[ShipViaCode] AS VARBINARY(MAX)) AS [ShipViaCode], s.[EstSyncMaterialDate], s.[EstimatedTimeDelivery], s.[EstimatedTimeDelivery_Original], CAST(s.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], s.[Quantity9], CAST(s.[Description] AS VARBINARY(MAX)) AS [Description], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] FROM #src s
  ) d;
  SET @DeletedCount = CASE WHEN @DeletedCount > @UpdatedCount THEN @DeletedCount - @UpdatedCount ELSE 0 END;
  BEGIN TRANSACTION;
  DELETE t FROM bravo.[ThongTinPO] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId] INTERSECT SELECT t.[ProductId])));
  INSERT INTO bravo.[ThongTinPO] ([BranchCode], [BizDocId], [ItemId], [ProductId], [CustomerPONo], [CustomerPOId], [CustomerPOType], [CustomerPONoDate], [DestinationId], [RowId_Nationality], [ShipViaCode], [EstSyncMaterialDate], [EstimatedTimeDelivery], [EstimatedTimeDelivery_Original], [RowIdList_SO], [Quantity9], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[BranchCode], s.[BizDocId], s.[ItemId], s.[ProductId], s.[CustomerPONo], s.[CustomerPOId], s.[CustomerPOType], s.[CustomerPONoDate], s.[DestinationId], s.[RowId_Nationality], s.[ShipViaCode], s.[EstSyncMaterialDate], s.[EstimatedTimeDelivery], s.[EstimatedTimeDelivery_Original], s.[RowIdList_SO], s.[Quantity9], s.[Description], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[ThongTinPO];
END;
GO

-- ===== vThongTinPO_MauCo → bravo.[ThongTinPO_MauCo]: Màu cỡ theo PO =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_ThongTinPO_MauCo]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [ProductId] INT NULL,
    [CustomerPONo] VARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [RowIdList_SO] NVARCHAR(512) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ColorId] INT NULL,
    [SizeIndex] VARCHAR(6) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [SizeCode] VARCHAR(24) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [SizeType] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Color_Stt] SMALLINT NULL,
    [Size_Stt] INT NULL,
    [Quantity] NUMERIC(38, 4) NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #keys (
    [ProductId] INT NULL,
    [CustomerPONo] VARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  CREATE TABLE #alive (
    [ProductId] INT NULL,
    [CustomerPONo] VARCHAR(32) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [RowCnt] INT NOT NULL
  );
  IF @SinceAt IS NULL
  BEGIN
    INSERT INTO #src ([ProductId], [CustomerPONo], [RowIdList_SO], [ColorId], [SizeIndex], [SizeCode], [SizeType], [Color_Stt], [Size_Stt], [Quantity], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy]) SELECT [ProductId], [CustomerPONo], [RowIdList_SO], [ColorId], [SizeIndex], [SizeCode], [SizeType], [Color_Stt], [Size_Stt], [Quantity], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_ThongTinPO_MauCo];
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[ThongTinPO_MauCo])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  END
  ELSE
  BEGIN
    -- Nhóm có dòng đổi thì đọc lại cả nhóm
    INSERT INTO #keys ([ProductId], [CustomerPONo]) SELECT DISTINCT [ProductId], [CustomerPONo] FROM bravo.[src_ThongTinPO_MauCo] WHERE [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
    -- Đối soát số dòng từng nhóm (chỉ đọc cột nhóm): nhóm mất dòng, dòng đổi sang nhóm khác, nhóm thiếu ngày tháng,
    -- nhóm đã bị xóa bên nguồn đều lệch số dòng với bảng chép, nên cũng được đọc lại hoặc xóa
    INSERT INTO #alive ([ProductId], [CustomerPONo], [RowCnt]) SELECT [ProductId], [CustomerPONo], COUNT(*) FROM bravo.[src_ThongTinPO_MauCo] GROUP BY [ProductId], [CustomerPONo];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[ThongTinPO_MauCo])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #keys ([ProductId], [CustomerPONo])
    SELECT [ProductId], [CustomerPONo] FROM (
      SELECT [ProductId], [CustomerPONo], [RowCnt] FROM #alive
      EXCEPT SELECT [ProductId], [CustomerPONo], COUNT(*) FROM bravo.[ThongTinPO_MauCo] GROUP BY [ProductId], [CustomerPONo]
    ) d;
    INSERT INTO #keys ([ProductId], [CustomerPONo])
    SELECT [ProductId], [CustomerPONo] FROM (SELECT [ProductId], [CustomerPONo] FROM bravo.[ThongTinPO_MauCo] EXCEPT SELECT [ProductId], [CustomerPONo] FROM #alive) d;
    INSERT INTO #src ([ProductId], [CustomerPONo], [RowIdList_SO], [ColorId], [SizeIndex], [SizeCode], [SizeType], [Color_Stt], [Size_Stt], [Quantity], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[ProductId], v.[CustomerPONo], v.[RowIdList_SO], v.[ColorId], v.[SizeIndex], v.[SizeCode], v.[SizeType], v.[Color_Stt], v.[Size_Stt], v.[Quantity], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_ThongTinPO_MauCo] v WHERE EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId], k.[CustomerPONo] INTERSECT SELECT v.[ProductId], v.[CustomerPONo]));
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  -- Số liệu báo cáo (gần đúng, nhóm không có khóa dòng): dòng của nhóm mới; dòng mới hoặc đổi trong nhóm đã có; dòng cũ không còn
  SELECT @InsertedCount = COUNT(*) FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[ThongTinPO_MauCo] t WHERE EXISTS (SELECT s.[ProductId], s.[CustomerPONo] INTERSECT SELECT t.[ProductId], t.[CustomerPONo]));
  SELECT @UpdatedCount = COUNT(*) FROM (
    SELECT s.[ProductId], CAST(s.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], CAST(s.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], s.[ColorId], CAST(s.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], CAST(s.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(s.[SizeType] AS VARBINARY(MAX)) AS [SizeType], s.[Color_Stt], s.[Size_Stt], s.[Quantity], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] FROM #src s WHERE EXISTS (SELECT 1 FROM bravo.[ThongTinPO_MauCo] t WHERE EXISTS (SELECT s.[ProductId], s.[CustomerPONo] INTERSECT SELECT t.[ProductId], t.[CustomerPONo]))
    EXCEPT SELECT t.[ProductId], CAST(t.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], CAST(t.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], t.[ColorId], CAST(t.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], CAST(t.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(t.[SizeType] AS VARBINARY(MAX)) AS [SizeType], t.[Color_Stt], t.[Size_Stt], t.[Quantity], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy] FROM bravo.[ThongTinPO_MauCo] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId], k.[CustomerPONo] INTERSECT SELECT t.[ProductId], t.[CustomerPONo])))
  ) d;
  SELECT @DeletedCount = COUNT(*) FROM (
    SELECT t.[ProductId], CAST(t.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], CAST(t.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], t.[ColorId], CAST(t.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], CAST(t.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(t.[SizeType] AS VARBINARY(MAX)) AS [SizeType], t.[Color_Stt], t.[Size_Stt], t.[Quantity], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy] FROM bravo.[ThongTinPO_MauCo] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId], k.[CustomerPONo] INTERSECT SELECT t.[ProductId], t.[CustomerPONo])))
    EXCEPT SELECT s.[ProductId], CAST(s.[CustomerPONo] AS VARBINARY(MAX)) AS [CustomerPONo], CAST(s.[RowIdList_SO] AS VARBINARY(MAX)) AS [RowIdList_SO], s.[ColorId], CAST(s.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], CAST(s.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(s.[SizeType] AS VARBINARY(MAX)) AS [SizeType], s.[Color_Stt], s.[Size_Stt], s.[Quantity], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] FROM #src s
  ) d;
  SET @DeletedCount = CASE WHEN @DeletedCount > @UpdatedCount THEN @DeletedCount - @UpdatedCount ELSE 0 END;
  BEGIN TRANSACTION;
  DELETE t FROM bravo.[ThongTinPO_MauCo] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProductId], k.[CustomerPONo] INTERSECT SELECT t.[ProductId], t.[CustomerPONo])));
  INSERT INTO bravo.[ThongTinPO_MauCo] ([ProductId], [CustomerPONo], [RowIdList_SO], [ColorId], [SizeIndex], [SizeCode], [SizeType], [Color_Stt], [Size_Stt], [Quantity], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[ProductId], s.[CustomerPONo], s.[RowIdList_SO], s.[ColorId], s.[SizeIndex], s.[SizeCode], s.[SizeType], s.[Color_Stt], s.[Size_Stt], s.[Quantity], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[ThongTinPO_MauCo];
END;
GO

-- ===== vBangCanDoiSanXuat → bravo.[BangCanDoiSanXuat]: Bảng cân đối sản xuất =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_BangCanDoiSanXuat]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [BranchCode] CHAR(3) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ProduceId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DocNo] NVARCHAR(64) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [DocDate] DATE NULL,
    [CustomerId] INT NULL,
    [BizDocId_SO] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [EmployeeId] INT NULL,
    [TeamId] INT NULL,
    [DeptId] INT NULL,
    [Description] NVARCHAR(256) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #alive (
    [ProduceId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  INSERT INTO #src ([BranchCode], [ProduceId], [DocNo], [DocDate], [CustomerId], [BizDocId_SO], [EmployeeId], [TeamId], [DeptId], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
  SELECT [BranchCode], [ProduceId], [DocNo], [DocDate], [CustomerId], [BizDocId_SO], [EmployeeId], [TeamId], [DeptId], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_BangCanDoiSanXuat]
  WHERE @SinceAt IS NULL OR [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
  IF @SinceAt IS NOT NULL
  BEGIN
    -- Đối soát khóa (chỉ đọc cột khóa): biết dòng nào đã bị xóa bên nguồn, và đọc thêm dòng có bên nguồn mà bảng chép
    -- chưa có (ngày tháng NULL, hoặc lần trước bị sót)
    INSERT INTO #alive ([ProduceId]) SELECT [ProduceId] FROM bravo.[src_BangCanDoiSanXuat];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #src ([BranchCode], [ProduceId], [DocNo], [DocDate], [CustomerId], [BizDocId_SO], [EmployeeId], [TeamId], [DeptId], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[BranchCode], v.[ProduceId], v.[DocNo], v.[DocDate], v.[CustomerId], v.[BizDocId_SO], v.[EmployeeId], v.[TeamId], v.[DeptId], v.[Description], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_BangCanDoiSanXuat] v
    WHERE EXISTS (SELECT 1 FROM #alive a WHERE a.[ProduceId] = v.[ProduceId] AND NOT EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat] t WHERE t.[ProduceId] = a.[ProduceId]))
      AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ProduceId] = v.[ProduceId]);
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  IF EXISTS (SELECT 1 FROM #src GROUP BY [ProduceId] HAVING COUNT(*) > 1)
    THROW 50001, N'View nguồn trả về khóa trùng (ProduceId). Không chép để tránh ghi sai dòng; báo bên quản lý database trung gian.', 1;
  IF EXISTS (SELECT 1 FROM #src WHERE [ProduceId] IS NULL)
    THROW 50003, N'View nguồn có dòng thiếu khóa (ProduceId). Không chép để tránh ghi sai dòng.', 1;
  IF @SinceAt IS NULL
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  BEGIN TRANSACTION;
  -- Dòng không còn bên nguồn: chép toàn bộ so với #src, chép tăng dần so với #alive (đối soát khóa)
  DELETE t FROM bravo.[BangCanDoiSanXuat] t
  WHERE (@SinceAt IS NULL AND NOT EXISTS (SELECT 1 FROM #src s WHERE s.[ProduceId] = t.[ProduceId]))
     OR (@SinceAt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM #alive a WHERE a.[ProduceId] = t.[ProduceId]));
  SET @DeletedCount = @@ROWCOUNT;
  -- Chỉ ghi dòng có cột khác (so theo byte); dòng giống hệt giữ nguyên SyncedAt cũ
  UPDATE t SET t.[BranchCode] = s.[BranchCode], t.[DocNo] = s.[DocNo], t.[DocDate] = s.[DocDate], t.[CustomerId] = s.[CustomerId], t.[BizDocId_SO] = s.[BizDocId_SO], t.[EmployeeId] = s.[EmployeeId], t.[TeamId] = s.[TeamId], t.[DeptId] = s.[DeptId], t.[Description] = s.[Description], t.[CreatedAt] = s.[CreatedAt], t.[CreatedBy] = s.[CreatedBy], t.[ModifiedAt] = s.[ModifiedAt], t.[ModifiedBy] = s.[ModifiedBy], t.[SyncedAt] = @Now, t.[SyncRunId] = @RunId
  FROM bravo.[BangCanDoiSanXuat] t JOIN #src s ON s.[ProduceId] = t.[ProduceId]
  WHERE EXISTS (SELECT CAST(s.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(s.[ProduceId] AS VARBINARY(MAX)) AS [ProduceId], CAST(s.[DocNo] AS VARBINARY(MAX)) AS [DocNo], s.[DocDate], s.[CustomerId], CAST(s.[BizDocId_SO] AS VARBINARY(MAX)) AS [BizDocId_SO], s.[EmployeeId], s.[TeamId], s.[DeptId], CAST(s.[Description] AS VARBINARY(MAX)) AS [Description], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] EXCEPT SELECT CAST(t.[BranchCode] AS VARBINARY(MAX)) AS [BranchCode], CAST(t.[ProduceId] AS VARBINARY(MAX)) AS [ProduceId], CAST(t.[DocNo] AS VARBINARY(MAX)) AS [DocNo], t.[DocDate], t.[CustomerId], CAST(t.[BizDocId_SO] AS VARBINARY(MAX)) AS [BizDocId_SO], t.[EmployeeId], t.[TeamId], t.[DeptId], CAST(t.[Description] AS VARBINARY(MAX)) AS [Description], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy]);
  SET @UpdatedCount = @@ROWCOUNT;
  INSERT INTO bravo.[BangCanDoiSanXuat] ([BranchCode], [ProduceId], [DocNo], [DocDate], [CustomerId], [BizDocId_SO], [EmployeeId], [TeamId], [DeptId], [Description], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[BranchCode], s.[ProduceId], s.[DocNo], s.[DocDate], s.[CustomerId], s.[BizDocId_SO], s.[EmployeeId], s.[TeamId], s.[DeptId], s.[Description], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat] t WHERE s.[ProduceId] = t.[ProduceId]);
  SET @InsertedCount = @@ROWCOUNT;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[BangCanDoiSanXuat];
END;
GO

-- ===== vBangCanDoiSanXuat_MauCo_Tong → bravo.[BangCanDoiSanXuat_MauCo_Tong]: Màu cỡ bảng cân đối sản xuất =====
CREATE OR ALTER PROCEDURE bravo.[usp_Sync_BangCanDoiSanXuat_MauCo_Tong]
  @SinceAt DATETIME2(0) = NULL,
  @RunId BIGINT = NULL,
  @ReadCount INT = NULL OUTPUT,
  @InsertedCount INT = NULL OUTPUT,
  @UpdatedCount INT = NULL OUTPUT,
  @DeletedCount INT = NULL OUTPUT,
  @MaxStampAt DATETIME2(0) = NULL OUTPUT,
  @TargetCount INT = NULL OUTPUT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  SET LOCK_TIMEOUT 600000;
  DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();
  CREATE TABLE #src (
    [ProduceId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [SizeIndex] VARCHAR(6) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Size_Stt] INT NULL,
    [Color_Stt] INT NULL,
    [ProductId] INT NULL,
    [ColorId] INT NULL,
    [SizeCode] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [SizeType] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [OriginalQty] NUMERIC(18, 2) NULL,
    [SampleQty] NUMERIC(18, 2) NULL,
    [ToleranceQty] NUMERIC(18, 2) NULL,
    [FinalQty] NUMERIC(18, 2) NULL,
    [CreatedAt] SMALLDATETIME NULL,
    [CreatedBy] INT NULL,
    [ModifiedAt] SMALLDATETIME NULL,
    [ModifiedBy] INT NULL
  );
  CREATE TABLE #keys (
    [ProduceId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  CREATE TABLE #alive (
    [ProduceId] VARCHAR(16) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [RowCnt] INT NOT NULL
  );
  IF @SinceAt IS NULL
  BEGIN
    INSERT INTO #src ([ProduceId], [SizeIndex], [Size_Stt], [Color_Stt], [ProductId], [ColorId], [SizeCode], [SizeType], [OriginalQty], [SampleQty], [ToleranceQty], [FinalQty], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy]) SELECT [ProduceId], [SizeIndex], [Size_Stt], [Color_Stt], [ProductId], [ColorId], [SizeCode], [SizeType], [OriginalQty], [SampleQty], [ToleranceQty], [FinalQty], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy] FROM bravo.[src_BangCanDoiSanXuat_MauCo_Tong];
    IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat_MauCo_Tong])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
  END
  ELSE
  BEGIN
    -- Nhóm có dòng đổi thì đọc lại cả nhóm
    INSERT INTO #keys ([ProduceId]) SELECT DISTINCT [ProduceId] FROM bravo.[src_BangCanDoiSanXuat_MauCo_Tong] WHERE [ModifiedAt] >= @SinceAt OR [CreatedAt] >= @SinceAt;
    -- Đối soát số dòng từng nhóm (chỉ đọc cột nhóm): nhóm mất dòng, dòng đổi sang nhóm khác, nhóm thiếu ngày tháng,
    -- nhóm đã bị xóa bên nguồn đều lệch số dòng với bảng chép, nên cũng được đọc lại hoặc xóa
    INSERT INTO #alive ([ProduceId], [RowCnt]) SELECT [ProduceId], COUNT(*) FROM bravo.[src_BangCanDoiSanXuat_MauCo_Tong] GROUP BY [ProduceId];
    IF NOT EXISTS (SELECT 1 FROM #alive) AND EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat_MauCo_Tong])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database trung gian.', 1;
    INSERT INTO #keys ([ProduceId])
    SELECT [ProduceId] FROM (
      SELECT [ProduceId], [RowCnt] FROM #alive
      EXCEPT SELECT [ProduceId], COUNT(*) FROM bravo.[BangCanDoiSanXuat_MauCo_Tong] GROUP BY [ProduceId]
    ) d;
    INSERT INTO #keys ([ProduceId])
    SELECT [ProduceId] FROM (SELECT [ProduceId] FROM bravo.[BangCanDoiSanXuat_MauCo_Tong] EXCEPT SELECT [ProduceId] FROM #alive) d;
    INSERT INTO #src ([ProduceId], [SizeIndex], [Size_Stt], [Color_Stt], [ProductId], [ColorId], [SizeCode], [SizeType], [OriginalQty], [SampleQty], [ToleranceQty], [FinalQty], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy])
    SELECT v.[ProduceId], v.[SizeIndex], v.[Size_Stt], v.[Color_Stt], v.[ProductId], v.[ColorId], v.[SizeCode], v.[SizeType], v.[OriginalQty], v.[SampleQty], v.[ToleranceQty], v.[FinalQty], v.[CreatedAt], v.[CreatedBy], v.[ModifiedAt], v.[ModifiedBy] FROM bravo.[src_BangCanDoiSanXuat_MauCo_Tong] v WHERE EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProduceId] INTERSECT SELECT v.[ProduceId]));
  END;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  SELECT @MaxStampAt = MAX(x.v) FROM #src CROSS APPLY (VALUES (CAST([ModifiedAt] AS DATETIME2(0))), (CAST([CreatedAt] AS DATETIME2(0)))) x(v);
  -- Số liệu báo cáo (gần đúng, nhóm không có khóa dòng): dòng của nhóm mới; dòng mới hoặc đổi trong nhóm đã có; dòng cũ không còn
  SELECT @InsertedCount = COUNT(*) FROM #src s WHERE NOT EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat_MauCo_Tong] t WHERE EXISTS (SELECT s.[ProduceId] INTERSECT SELECT t.[ProduceId]));
  SELECT @UpdatedCount = COUNT(*) FROM (
    SELECT CAST(s.[ProduceId] AS VARBINARY(MAX)) AS [ProduceId], CAST(s.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], s.[Size_Stt], s.[Color_Stt], s.[ProductId], s.[ColorId], CAST(s.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(s.[SizeType] AS VARBINARY(MAX)) AS [SizeType], s.[OriginalQty], s.[SampleQty], s.[ToleranceQty], s.[FinalQty], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] FROM #src s WHERE EXISTS (SELECT 1 FROM bravo.[BangCanDoiSanXuat_MauCo_Tong] t WHERE EXISTS (SELECT s.[ProduceId] INTERSECT SELECT t.[ProduceId]))
    EXCEPT SELECT CAST(t.[ProduceId] AS VARBINARY(MAX)) AS [ProduceId], CAST(t.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], t.[Size_Stt], t.[Color_Stt], t.[ProductId], t.[ColorId], CAST(t.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(t.[SizeType] AS VARBINARY(MAX)) AS [SizeType], t.[OriginalQty], t.[SampleQty], t.[ToleranceQty], t.[FinalQty], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy] FROM bravo.[BangCanDoiSanXuat_MauCo_Tong] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProduceId] INTERSECT SELECT t.[ProduceId])))
  ) d;
  SELECT @DeletedCount = COUNT(*) FROM (
    SELECT CAST(t.[ProduceId] AS VARBINARY(MAX)) AS [ProduceId], CAST(t.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], t.[Size_Stt], t.[Color_Stt], t.[ProductId], t.[ColorId], CAST(t.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(t.[SizeType] AS VARBINARY(MAX)) AS [SizeType], t.[OriginalQty], t.[SampleQty], t.[ToleranceQty], t.[FinalQty], t.[CreatedAt], t.[CreatedBy], t.[ModifiedAt], t.[ModifiedBy] FROM bravo.[BangCanDoiSanXuat_MauCo_Tong] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProduceId] INTERSECT SELECT t.[ProduceId])))
    EXCEPT SELECT CAST(s.[ProduceId] AS VARBINARY(MAX)) AS [ProduceId], CAST(s.[SizeIndex] AS VARBINARY(MAX)) AS [SizeIndex], s.[Size_Stt], s.[Color_Stt], s.[ProductId], s.[ColorId], CAST(s.[SizeCode] AS VARBINARY(MAX)) AS [SizeCode], CAST(s.[SizeType] AS VARBINARY(MAX)) AS [SizeType], s.[OriginalQty], s.[SampleQty], s.[ToleranceQty], s.[FinalQty], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy] FROM #src s
  ) d;
  SET @DeletedCount = CASE WHEN @DeletedCount > @UpdatedCount THEN @DeletedCount - @UpdatedCount ELSE 0 END;
  BEGIN TRANSACTION;
  DELETE t FROM bravo.[BangCanDoiSanXuat_MauCo_Tong] t WHERE (@SinceAt IS NULL OR EXISTS (SELECT 1 FROM #keys k WHERE EXISTS (SELECT k.[ProduceId] INTERSECT SELECT t.[ProduceId])));
  INSERT INTO bravo.[BangCanDoiSanXuat_MauCo_Tong] ([ProduceId], [SizeIndex], [Size_Stt], [Color_Stt], [ProductId], [ColorId], [SizeCode], [SizeType], [OriginalQty], [SampleQty], [ToleranceQty], [FinalQty], [CreatedAt], [CreatedBy], [ModifiedAt], [ModifiedBy], [SyncedAt], [SyncRunId])
  SELECT s.[ProduceId], s.[SizeIndex], s.[Size_Stt], s.[Color_Stt], s.[ProductId], s.[ColorId], s.[SizeCode], s.[SizeType], s.[OriginalQty], s.[SampleQty], s.[ToleranceQty], s.[FinalQty], s.[CreatedAt], s.[CreatedBy], s.[ModifiedAt], s.[ModifiedBy], @Now, @RunId FROM #src s;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM bravo.[BangCanDoiSanXuat_MauCo_Tong];
END;
GO
