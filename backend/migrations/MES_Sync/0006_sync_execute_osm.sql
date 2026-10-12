-- MES_Sync 0006: thủ tục điều phối chạy được thủ tục chép của nguồn OSM (schema osm, MES_Sync/0005; ADR 0013 mục 9, 12/10/2026).
-- Giữ nguyên usp_SyncRun_Execute của 0001, chỉ thêm schema osm vào danh sách schema nguồn được chạy.

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
      IF PARSENAME(@Proc, 3) IS NOT NULL OR ISNULL(PARSENAME(@Proc, 2), N'') NOT IN (N'bravo', N'osm') OR OBJECT_ID(@Proc, N'P') IS NULL
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
