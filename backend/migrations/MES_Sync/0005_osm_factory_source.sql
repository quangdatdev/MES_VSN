-- Sinh bởi backend/scripts/sync-gen.ts từ cấu trúc view của database nguồn. Không sửa tay:
-- muốn đổi thì sửa SOURCES trong script rồi sinh migration mới. ADR 0007.

IF SCHEMA_ID(N'osm') IS NULL EXEC(N'CREATE SCHEMA osm');
GO

-- ===== vOSMDataFty → osm.[OSMDataFty]: Nhà máy sản xuất của đơn hàng (OSM) =====
CREATE TABLE osm.[OSMDataFty] (
  [SyncRowId] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OSMDataFty] PRIMARY KEY,
  [Brand] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [StyleName] NVARCHAR(59) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [StyleNo] NVARCHAR(61) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [SO] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [FtyName] NVARCHAR(4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [SyncedAt] DATETIME2(3) NOT NULL,
  [SyncRunId] BIGINT NULL
);
CREATE INDEX [IX_OSMDataFty_Partition] ON osm.[OSMDataFty] ([SO]);
GO

CREATE OR ALTER PROCEDURE osm.[usp_Sync_OSMDataFty]
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
    [Brand] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [StyleName] NVARCHAR(59) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [StyleNo] NVARCHAR(61) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [SO] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [FtyName] NVARCHAR(4000) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  INSERT INTO #src ([Brand], [StyleName], [StyleNo], [SO], [FtyName]) SELECT [Brand], [StyleName], [StyleNo], [SO], [FtyName] FROM osm.[src_OSMDataFty];
  IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM osm.[OSMDataFty])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database OSM.', 1;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  SET @MaxStampAt = NULL;
  -- Số liệu báo cáo (gần đúng, nhóm không có khóa dòng): dòng của nhóm mới; dòng mới hoặc đổi trong nhóm đã có; dòng cũ không còn
  SELECT @InsertedCount = COUNT(*) FROM #src s WHERE NOT EXISTS (SELECT 1 FROM osm.[OSMDataFty] t WHERE EXISTS (SELECT s.[SO] INTERSECT SELECT t.[SO]));
  SELECT @UpdatedCount = COUNT(*) FROM (
    SELECT CAST(s.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(s.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(s.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(s.[SO] AS VARBINARY(MAX)) AS [SO], CAST(s.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM #src s WHERE EXISTS (SELECT 1 FROM osm.[OSMDataFty] t WHERE EXISTS (SELECT s.[SO] INTERSECT SELECT t.[SO]))
    EXCEPT SELECT CAST(t.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(t.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(t.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(t.[SO] AS VARBINARY(MAX)) AS [SO], CAST(t.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM osm.[OSMDataFty] t WHERE 1 = 1
  ) d;
  SELECT @DeletedCount = COUNT(*) FROM (
    SELECT CAST(t.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(t.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(t.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(t.[SO] AS VARBINARY(MAX)) AS [SO], CAST(t.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM osm.[OSMDataFty] t WHERE 1 = 1
    EXCEPT SELECT CAST(s.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(s.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(s.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(s.[SO] AS VARBINARY(MAX)) AS [SO], CAST(s.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM #src s
  ) d;
  SET @DeletedCount = CASE WHEN @DeletedCount > @UpdatedCount THEN @DeletedCount - @UpdatedCount ELSE 0 END;
  BEGIN TRANSACTION;
  DELETE t FROM osm.[OSMDataFty] t WHERE 1 = 1;
  INSERT INTO osm.[OSMDataFty] ([Brand], [StyleName], [StyleNo], [SO], [FtyName], [SyncedAt], [SyncRunId])
  SELECT s.[Brand], s.[StyleName], s.[StyleNo], s.[SO], s.[FtyName], @Now, @RunId FROM #src s;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM osm.[OSMDataFty];
END;
GO

INSERT INTO dbo.SyncSource (Code, Name, Description, SystemCode, GroupCode, SourceObject, SourceSynonym, TargetTable, ProcName, SyncModeCode, KeyColumns, SortOrder)
VALUES (N'OSM.OSMDataFty', N'Nhà máy sản xuất của đơn hàng (OSM)', N'View không có cột thời gian, lấy toàn bộ mỗi lần (khoảng 3.500 dòng). FtyName là danh sách nhà máy cách nhau dấu phẩy', N'OSM', 'ORDER', N'vOSMDataFty', N'osm.src_OSMDataFty', N'osm.OSMDataFty', N'osm.usp_Sync_OSMDataFty', 'FULL', N'SO', 190);
GO
