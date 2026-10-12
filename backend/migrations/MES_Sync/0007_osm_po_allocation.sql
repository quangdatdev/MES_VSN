-- Sinh bởi backend/scripts/sync-gen.ts từ cấu trúc view của database nguồn. Không sửa tay:
-- muốn đổi thì sửa SOURCES trong script rồi sinh migration mới. ADR 0007.

IF SCHEMA_ID(N'osm') IS NULL EXEC(N'CREATE SCHEMA osm');
GO

-- ===== v_OSMData → osm.[OSMData]: Phân bổ PO theo nhà máy (OSM) =====
CREATE TABLE osm.[OSMData] (
  [SyncRowId] BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OSMData] PRIMARY KEY,
  [Brand] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [Season] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [PO] NVARCHAR(51) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [SO] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [Ship mode] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [StyleName] NVARCHAR(59) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [StyleNo] NVARCHAR(61) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [Color] NVARCHAR(82) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [ETD-Actual] DATE NULL,
  [ETD-REVISED] DATE NULL,
  [FtyName] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
  [SyncedAt] DATETIME2(3) NOT NULL,
  [SyncRunId] BIGINT NULL
);
CREATE INDEX [IX_OSMData_Partition] ON osm.[OSMData] ([PO]);
GO

CREATE OR ALTER PROCEDURE osm.[usp_Sync_OSMData]
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
    [Season] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [PO] NVARCHAR(51) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [SO] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Ship mode] NVARCHAR(50) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [StyleName] NVARCHAR(59) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [StyleNo] NVARCHAR(61) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [Color] NVARCHAR(82) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [ETD-Actual] DATE NULL,
    [ETD-REVISED] DATE NULL,
    [FtyName] NVARCHAR(255) COLLATE SQL_Latin1_General_CP1_CI_AS NULL
  );
  INSERT INTO #src ([Brand], [Season], [PO], [SO], [Ship mode], [StyleName], [StyleNo], [Color], [ETD-Actual], [ETD-REVISED], [FtyName]) SELECT [Brand], [Season], [PO], [SO], [Ship mode], [StyleName], [StyleNo], [Color], [ETD-Actual], [ETD-REVISED], [FtyName] FROM osm.[src_OSMData];
  IF NOT EXISTS (SELECT 1 FROM #src) AND EXISTS (SELECT 1 FROM osm.[OSMData])
    THROW 50002, N'View nguồn trả về 0 dòng. Dừng lại để không xóa hết dữ liệu đã chép; kiểm tra view ở database OSM.', 1;
  SET @ReadCount = (SELECT COUNT(*) FROM #src);
  SET @MaxStampAt = NULL;
  -- Số liệu báo cáo (gần đúng, nhóm không có khóa dòng): dòng của nhóm mới; dòng mới hoặc đổi trong nhóm đã có; dòng cũ không còn
  SELECT @InsertedCount = COUNT(*) FROM #src s WHERE NOT EXISTS (SELECT 1 FROM osm.[OSMData] t WHERE EXISTS (SELECT s.[PO] INTERSECT SELECT t.[PO]));
  SELECT @UpdatedCount = COUNT(*) FROM (
    SELECT CAST(s.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(s.[Season] AS VARBINARY(MAX)) AS [Season], CAST(s.[PO] AS VARBINARY(MAX)) AS [PO], CAST(s.[SO] AS VARBINARY(MAX)) AS [SO], CAST(s.[Ship mode] AS VARBINARY(MAX)) AS [Ship mode], CAST(s.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(s.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(s.[Color] AS VARBINARY(MAX)) AS [Color], s.[ETD-Actual], s.[ETD-REVISED], CAST(s.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM #src s WHERE EXISTS (SELECT 1 FROM osm.[OSMData] t WHERE EXISTS (SELECT s.[PO] INTERSECT SELECT t.[PO]))
    EXCEPT SELECT CAST(t.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(t.[Season] AS VARBINARY(MAX)) AS [Season], CAST(t.[PO] AS VARBINARY(MAX)) AS [PO], CAST(t.[SO] AS VARBINARY(MAX)) AS [SO], CAST(t.[Ship mode] AS VARBINARY(MAX)) AS [Ship mode], CAST(t.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(t.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(t.[Color] AS VARBINARY(MAX)) AS [Color], t.[ETD-Actual], t.[ETD-REVISED], CAST(t.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM osm.[OSMData] t WHERE 1 = 1
  ) d;
  SELECT @DeletedCount = COUNT(*) FROM (
    SELECT CAST(t.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(t.[Season] AS VARBINARY(MAX)) AS [Season], CAST(t.[PO] AS VARBINARY(MAX)) AS [PO], CAST(t.[SO] AS VARBINARY(MAX)) AS [SO], CAST(t.[Ship mode] AS VARBINARY(MAX)) AS [Ship mode], CAST(t.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(t.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(t.[Color] AS VARBINARY(MAX)) AS [Color], t.[ETD-Actual], t.[ETD-REVISED], CAST(t.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM osm.[OSMData] t WHERE 1 = 1
    EXCEPT SELECT CAST(s.[Brand] AS VARBINARY(MAX)) AS [Brand], CAST(s.[Season] AS VARBINARY(MAX)) AS [Season], CAST(s.[PO] AS VARBINARY(MAX)) AS [PO], CAST(s.[SO] AS VARBINARY(MAX)) AS [SO], CAST(s.[Ship mode] AS VARBINARY(MAX)) AS [Ship mode], CAST(s.[StyleName] AS VARBINARY(MAX)) AS [StyleName], CAST(s.[StyleNo] AS VARBINARY(MAX)) AS [StyleNo], CAST(s.[Color] AS VARBINARY(MAX)) AS [Color], s.[ETD-Actual], s.[ETD-REVISED], CAST(s.[FtyName] AS VARBINARY(MAX)) AS [FtyName] FROM #src s
  ) d;
  SET @DeletedCount = CASE WHEN @DeletedCount > @UpdatedCount THEN @DeletedCount - @UpdatedCount ELSE 0 END;
  BEGIN TRANSACTION;
  DELETE t FROM osm.[OSMData] t WHERE 1 = 1;
  INSERT INTO osm.[OSMData] ([Brand], [Season], [PO], [SO], [Ship mode], [StyleName], [StyleNo], [Color], [ETD-Actual], [ETD-REVISED], [FtyName], [SyncedAt], [SyncRunId])
  SELECT s.[Brand], s.[Season], s.[PO], s.[SO], s.[Ship mode], s.[StyleName], s.[StyleNo], s.[Color], s.[ETD-Actual], s.[ETD-REVISED], s.[FtyName], @Now, @RunId FROM #src s;
  COMMIT TRANSACTION;
  SELECT @TargetCount = COUNT(*) FROM osm.[OSMData];
END;
GO

INSERT INTO dbo.SyncSource (Code, Name, Description, SystemCode, GroupCode, SourceObject, SourceSynonym, TargetTable, ProcName, SyncModeCode, KeyColumns, SortOrder)
VALUES (N'OSM.OSMData', N'Phân bổ PO theo nhà máy (OSM)', N'View không có cột thời gian, lấy toàn bộ mỗi lần (khoảng 30.000 dòng, có dòng trùng nguyên dòng). Màn Quản trị đơn hàng › Phân bổ PO đọc bảng chép này', N'OSM', 'ORDER', N'v_OSMData', N'osm.src_OSMData', N'osm.OSMData', N'osm.usp_Sync_OSMData', 'FULL', N'PO', 200);
GO
