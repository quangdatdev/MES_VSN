-- MES_Core 0014 (phase 5.12.3, người dùng yêu cầu 15/10/2026, quyết định 6.11): ngưỡng làm tròn Số ngày SX theo lịch làm việc
-- của ĐVCS. Số ngày SX = Số lượng / Năng suất TB; phần lẻ từ ngưỡng trở lên thì thêm một ngày, dưới thì bỏ (7,3 → 7; 7,5 → 8).
-- Lịch đã có nhận mặc định 0,50 như lịch mặc định trong code. 0,01: gần như luôn làm tròn lên (cách trước đây); 1,00: luôn bỏ
-- phần lẻ. Bản cũ còn chạy không đọc cột này và chèn lịch mới nhận mặc định: chạy được trước khi deploy.

ALTER TABLE dbo.SysWorkCalendar ADD ProductionRoundUpFrom DECIMAL(3,2) NOT NULL
    CONSTRAINT DF_SysWorkCalendar_ProductionRoundUpFrom DEFAULT 0.50
    CONSTRAINT CK_SysWorkCalendar_ProductionRoundUpFrom CHECK (ProductionRoundUpFrom BETWEEN 0.01 AND 1.00);
GO
