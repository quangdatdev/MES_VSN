-- MES_Sync: bảng chép dữ liệu từ hệ thống ngoài và nhật ký đồng bộ (ADR 0007, Phase 5.2).
-- Bảng chép nằm ở schema theo hệ thống nguồn (bravo), bảng điều khiển và thủ tục điều phối ở dbo.
-- Bảng ở đây là dữ liệu hệ thống, dùng chung toàn công ty: không có BranchCode, không đi qua BaseRepository.

IF SCHEMA_ID(N'bravo') IS NULL EXEC(N'CREATE SCHEMA bravo');
GO

-- Mỗi dòng là một view nguồn được chép sang một bảng trong MES_Sync.
CREATE TABLE dbo.SyncSource (
  Id              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SyncSource PRIMARY KEY,
  Code            VARCHAR(60)    NOT NULL,
  Name            NVARCHAR(200)  NOT NULL,
  Description     NVARCHAR(500)  NULL,
  SystemCode      VARCHAR(20)    NOT NULL,
  GroupCode       VARCHAR(20)    NOT NULL,
  -- View trong database trung gian; SourceSynonym trỏ tới view đó (scripts/migrate.ts tạo lại theo DB_TRUNGGIAN_NAME)
  SourceObject    NVARCHAR(128)  NOT NULL,
  SourceSynonym   NVARCHAR(128)  NOT NULL,
  TargetTable     NVARCHAR(128)  NOT NULL,
  ProcName        NVARCHAR(128)  NOT NULL,
  -- INCREMENTAL: chỉ lấy dòng có ModifiedAt/CreatedAt từ mốc trừ OverlapMinutes; FULL: view không có cột thời gian dùng được, lấy toàn bộ mỗi lần
  SyncModeCode    VARCHAR(20)    NOT NULL,
  KeyColumns      NVARCHAR(200)  NOT NULL,
  OverlapMinutes  INT            NOT NULL CONSTRAINT DF_SyncSource_Overlap DEFAULT 10,
  -- Mốc dữ liệu: ModifiedAt/CreatedAt lớn nhất đã nhận, theo giờ của nguồn (không phải UTC)
  WatermarkAt     DATETIME2(0)   NULL,
  LastRunId       BIGINT         NULL,
  SortOrder       INT            NOT NULL CONSTRAINT DF_SyncSource_Sort DEFAULT 0,
  IsActive        BIT            NOT NULL CONSTRAINT DF_SyncSource_Active DEFAULT 1,
  IsSystem        BIT            NOT NULL CONSTRAINT DF_SyncSource_System DEFAULT 1,
  CreatedAt       DATETIME2(3)   NOT NULL CONSTRAINT DF_SyncSource_CreatedAt DEFAULT SYSUTCDATETIME(),
  CreatedBy       INT            NULL,
  ModifiedAt      DATETIME2(3)   NULL,
  ModifiedBy      INT            NULL,
  CONSTRAINT UQ_SyncSource_Code UNIQUE (Code),
  CONSTRAINT CK_SyncSource_Mode CHECK (SyncModeCode IN ('INCREMENTAL', 'FULL')),
  -- Tối thiểu 1 phút: mốc DATETIME2(0) làm tròn lên giây, lùi 0 phút có thể bỏ sót dòng cùng giây ghi trễ
  CONSTRAINT CK_SyncSource_Overlap CHECK (OverlapMinutes BETWEEN 1 AND 1440)
);
GO

-- Mỗi lần chép một nguồn. BatchId gom các nguồn của cùng một lần bấm.
CREATE TABLE dbo.SyncRun (
  Id               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SyncRun PRIMARY KEY,
  SyncSourceId     INT              NOT NULL CONSTRAINT FK_SyncRun_SyncSource REFERENCES dbo.SyncSource (Id),
  BatchId          UNIQUEIDENTIFIER NOT NULL,
  ModeCode         VARCHAR(20)      NOT NULL,
  StatusCode       VARCHAR(20)      NOT NULL,
  -- Mốc đã dùng để lọc (giờ của nguồn); NULL là lấy toàn bộ
  SinceAt          DATETIME2(0)     NULL,
  PrevWatermarkAt  DATETIME2(0)     NULL,
  NewWatermarkAt   DATETIME2(0)     NULL,
  ReadCount        INT              NULL,
  InsertedCount    INT              NULL,
  UpdatedCount     INT              NULL,
  DeletedCount     INT              NULL,
  TargetCount      INT              NULL,
  QueuedAt         DATETIME2(3)     NOT NULL CONSTRAINT DF_SyncRun_QueuedAt DEFAULT SYSUTCDATETIME(),
  StartedAt        DATETIME2(3)     NULL,
  FinishedAt       DATETIME2(3)     NULL,
  ErrorMessage     NVARCHAR(2000)   NULL,
  CreatedAt        DATETIME2(3)     NOT NULL CONSTRAINT DF_SyncRun_CreatedAt DEFAULT SYSUTCDATETIME(),
  -- Người bấm đồng bộ: khóa ngầm tới MES_Core.SysUser.Id (softkeys.json)
  CreatedBy        INT              NULL,
  ModifiedAt       DATETIME2(3)     NULL,
  ModifiedBy       INT              NULL,
  CONSTRAINT CK_SyncRun_Mode CHECK (ModeCode IN ('INCREMENTAL', 'FULL')),
  CONSTRAINT CK_SyncRun_Status CHECK (StatusCode IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'))
);
CREATE INDEX IX_SyncRun_SyncSourceId ON dbo.SyncRun (SyncSourceId, Id DESC);
CREATE INDEX IX_SyncRun_BatchId ON dbo.SyncRun (BatchId);
CREATE INDEX IX_SyncRun_CreatedBy ON dbo.SyncRun (CreatedBy);
-- Mỗi nguồn chỉ có tối đa một lần đang chờ hoặc đang chạy: bấm hai lần không chép chồng
CREATE UNIQUE INDEX UX_SyncRun_Active ON dbo.SyncRun (SyncSourceId) WHERE StatusCode IN ('QUEUED', 'RUNNING');
-- Màn hình hỏi lần thành công gần nhất (và lần chép toàn bộ gần nhất) mỗi vài giây khi đang chạy
CREATE INDEX IX_SyncRun_Succeeded ON dbo.SyncRun (SyncSourceId, Id) INCLUDE (ModeCode, FinishedAt, TargetCount) WHERE StatusCode = 'SUCCEEDED';

ALTER TABLE dbo.SyncSource ADD CONSTRAINT FK_SyncSource_LastRun FOREIGN KEY (LastRunId) REFERENCES dbo.SyncRun (Id);
GO

-- Chạy một lần đã xếp hàng. Gọi nhiều lần hoặc từ nhiều nơi cũng chỉ một nơi chạy được (nhận việc bằng UPDATE có điều kiện).
-- Khóa ứng dụng theo nguồn giữ suốt lần chạy: tiến trình MES chết giữa chừng thì phiên SQL đóng, khóa nhả,
-- usp_SyncRun_RecoverStale nhờ đó biết lần chạy đã mồ côi.
CREATE OR ALTER PROCEDURE dbo.usp_SyncRun_Execute
  @RunId BIGINT
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  DECLARE @SourceId INT, @Code VARCHAR(60), @Proc NVARCHAR(128), @SourceMode VARCHAR(20), @RunMode VARCHAR(20),
          @Watermark DATETIME2(0), @Overlap INT, @Since DATETIME2(0), @Resource NVARCHAR(255), @Lock INT,
          @Read INT, @Inserted INT, @Updated INT, @Deleted INT, @MaxStamp DATETIME2(0), @Target INT,
          @NewMark DATETIME2(0), @Now DATETIME2(0) = CAST(SYSDATETIME() AS DATETIME2(0));

  SELECT @SourceId = s.Id, @Code = s.Code, @Proc = s.ProcName, @SourceMode = s.SyncModeCode, @RunMode = r.ModeCode
  FROM dbo.SyncRun r JOIN dbo.SyncSource s ON s.Id = r.SyncSourceId
  WHERE r.Id = @RunId AND r.StatusCode = 'QUEUED';
  IF @SourceId IS NULL RETURN;

  SET @Resource = N'MES_Sync:' + @Code;
  -- Chờ ngắn (5 giây) thay vì 0: lúc RecoverStale vừa giữ khóa của nguồn này để kiểm, lần chạy mới không bị đánh lỗi oan
  EXEC @Lock = sys.sp_getapplock @Resource = @Resource, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 5000;
  IF @Lock < 0
  BEGIN
    UPDATE dbo.SyncRun
    SET StatusCode = 'FAILED', FinishedAt = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME(),
        ErrorMessage = N'Nguồn này đang được đồng bộ ở nơi khác. Chờ lần đó xong rồi chạy lại.'
    WHERE Id = @RunId AND StatusCode = 'QUEUED';
    RETURN;
  END;

  BEGIN TRY
    UPDATE dbo.SyncRun SET StatusCode = 'RUNNING', StartedAt = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
    WHERE Id = @RunId AND StatusCode = 'QUEUED';
    IF @@ROWCOUNT = 1
    BEGIN
      -- Đọc mốc sau khi đã giữ khóa: lần chạy trước của nguồn này chắc chắn đã ghi xong mốc
      SELECT @Watermark = WatermarkAt, @Overlap = OverlapMinutes FROM dbo.SyncSource WHERE Id = @SourceId;
      SET @Since = CASE WHEN @RunMode = 'FULL' OR @SourceMode = 'FULL' OR @Watermark IS NULL THEN NULL
                        ELSE DATEADD(MINUTE, -@Overlap, @Watermark) END;
      UPDATE dbo.SyncRun
      SET SinceAt = @Since, PrevWatermarkAt = @Watermark, ModeCode = CASE WHEN @Since IS NULL THEN 'FULL' ELSE 'INCREMENTAL' END
      WHERE Id = @RunId;

      -- Chỉ chạy thủ tục chép của schema nguồn đã biết (tên lấy từ bảng do migration ghi)
      IF PARSENAME(@Proc, 3) IS NOT NULL OR ISNULL(PARSENAME(@Proc, 2), N'') NOT IN (N'bravo') OR OBJECT_ID(@Proc, N'P') IS NULL
        THROW 50010, N'Không tìm thấy thủ tục chép của nguồn này. Chạy npm run migrate.', 1;

      EXEC @Proc @SinceAt = @Since, @RunId = @RunId,
           @ReadCount = @Read OUTPUT, @InsertedCount = @Inserted OUTPUT, @UpdatedCount = @Updated OUTPUT,
           @DeletedCount = @Deleted OUTPUT, @MaxStampAt = @MaxStamp OUTPUT, @TargetCount = @Target OUTPUT;

      -- Mốc mới: chép toàn bộ thì lấy dòng mới nhất; chép tăng dần thì không lùi mốc. Không vượt giờ hiện tại của
      -- máy chủ, để một dòng ghi nhầm ngày tương lai không làm các lần sau bỏ sót dữ liệu.
      SET @NewMark = CASE WHEN @SourceMode = 'FULL' THEN NULL
                          WHEN @Since IS NULL THEN @MaxStamp
                          WHEN @MaxStamp IS NULL OR @MaxStamp < @Watermark THEN @Watermark
                          ELSE @MaxStamp END;
      IF @NewMark > @Now SET @NewMark = @Now;

      -- Mốc và trạng thái ghi cùng lúc: không có lúc mốc đã tiến mà lần chạy chưa ghi thành công
      BEGIN TRANSACTION;
      UPDATE dbo.SyncSource SET WatermarkAt = @NewMark WHERE Id = @SourceId;
      UPDATE dbo.SyncRun
      SET StatusCode = 'SUCCEEDED', NewWatermarkAt = @NewMark, ReadCount = @Read, InsertedCount = @Inserted,
          UpdatedCount = @Updated, DeletedCount = @Deleted, TargetCount = @Target,
          FinishedAt = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME()
      WHERE Id = @RunId;
      COMMIT TRANSACTION;
    END;
  END TRY
  BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    -- Lỗi thì giữ nguyên mốc: lần sau lấy lại từ mốc cũ, không mất dòng nào. Kèm mã lỗi và vị trí để dễ tra.
    UPDATE dbo.SyncRun
    SET StatusCode = 'FAILED', FinishedAt = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME(),
        ErrorMessage = LEFT(CONCAT(ERROR_MESSAGE(), N' [lỗi ', ERROR_NUMBER(),
                         CASE WHEN ERROR_PROCEDURE() IS NOT NULL THEN CONCAT(N', ', ERROR_PROCEDURE(), N' dòng ', ERROR_LINE()) ELSE N'' END, N']'), 2000)
    WHERE Id = @RunId AND StatusCode IN ('QUEUED', 'RUNNING');
  END CATCH;

  EXEC sys.sp_releaseapplock @Resource = @Resource, @LockOwner = 'Session';
END;
GO

-- Đánh dấu lỗi các lần "đang chạy" mà không còn ai giữ khóa (tiến trình MES đã dừng giữa chừng).
-- Chạy khi MES khởi động và trước mỗi lần xếp hàng; lần đang chạy thật vẫn giữ khóa nên không bị đụng tới.
CREATE OR ALTER PROCEDURE dbo.usp_SyncRun_RecoverStale
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @Id BIGINT, @Code VARCHAR(60), @Resource NVARCHAR(255), @Lock INT;
  DECLARE stale CURSOR LOCAL FAST_FORWARD FOR
    SELECT r.Id, s.Code FROM dbo.SyncRun r JOIN dbo.SyncSource s ON s.Id = r.SyncSourceId WHERE r.StatusCode = 'RUNNING';
  OPEN stale;
  FETCH NEXT FROM stale INTO @Id, @Code;
  WHILE @@FETCH_STATUS = 0
  BEGIN
    SET @Resource = N'MES_Sync:' + @Code;
    EXEC @Lock = sys.sp_getapplock @Resource = @Resource, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 0;
    IF @Lock >= 0
    BEGIN
      UPDATE dbo.SyncRun
      SET StatusCode = 'FAILED', FinishedAt = SYSUTCDATETIME(), ModifiedAt = SYSUTCDATETIME(),
          ErrorMessage = N'Lần đồng bộ bị ngắt giữa chừng (máy chủ MES dừng, mất kết nối hoặc chạy quá giờ). Phần chưa ghi xong đã được hủy, mốc giữ nguyên; chạy lại để tiếp tục.'
      WHERE Id = @Id AND StatusCode = 'RUNNING';
      EXEC sys.sp_releaseapplock @Resource = @Resource, @LockOwner = 'Session';
    END;
    FETCH NEXT FROM stale INTO @Id, @Code;
  END;
  CLOSE stale;
  DEALLOCATE stale;
END;
GO
