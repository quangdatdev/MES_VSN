-- MES_Core 0011 (Phase 5.12, người dùng yêu cầu 13/10/2026): Lịch làm việc theo đơn vị cơ sở.
-- Màn Chi tiết dàn chuyền tự tính Số ngày nghỉ, Kết thúc vào chuyền, ngày ra chuyền, nhập kho theo lịch của ĐVCS kế hoạch.
-- Danh mục sửa ở Quản trị › Danh mục hệ thống (quyền admin.catalog); có cột BranchCode như Nhà máy SX, không qua BaseRepository.
-- ĐVCS chưa có dòng lịch dùng lịch mặc định trong code (nghỉ Chủ nhật, lệch 3/3/2/5): không chèn dòng đại diện.

CREATE TABLE dbo.SysWorkCalendar (
    Id                       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysWorkCalendar PRIMARY KEY,
    -- Không cho đơn vị tổng hợp: service kiểm (CHECK không đọc được bảng khác)
    BranchCode               VARCHAR(10)  NOT NULL CONSTRAINT FK_SysWorkCalendar_Branch FOREIGN KEY REFERENCES dbo.SysBranch(Code),
    -- Ngày nghỉ hằng tuần, mỗi thứ một bit: 1 = thứ Hai, 2 = thứ Ba … 32 = thứ Bảy, 64 = Chủ nhật. Nghỉ cả 7 ngày (127) thì
    -- không còn ngày làm việc để tính
    WeeklyOffMask            TINYINT      NOT NULL CONSTRAINT DF_SysWorkCalendar_WeeklyOffMask DEFAULT 64
                             CONSTRAINT CK_SysWorkCalendar_WeeklyOffMask CHECK (WeeklyOffMask < 127),
    -- Số ngày làm việc cộng thêm: Bắt đầu ra chuyền = Bắt đầu vào chuyền + OutStart; Kết thúc ra chuyền = Kết thúc vào chuyền
    -- + OutEnd; Bắt đầu nhập kho = Bắt đầu ra chuyền + WarehouseStart; Kết thúc nhập kho = Kết thúc ra chuyền + WarehouseEnd
    OutStartOffsetDays       INT          NOT NULL CONSTRAINT DF_SysWorkCalendar_OutStart DEFAULT 3
                             CONSTRAINT CK_SysWorkCalendar_OutStart CHECK (OutStartOffsetDays BETWEEN 0 AND 60),
    OutEndOffsetDays         INT          NOT NULL CONSTRAINT DF_SysWorkCalendar_OutEnd DEFAULT 3
                             CONSTRAINT CK_SysWorkCalendar_OutEnd CHECK (OutEndOffsetDays BETWEEN 0 AND 60),
    WarehouseStartOffsetDays INT          NOT NULL CONSTRAINT DF_SysWorkCalendar_WarehouseStart DEFAULT 2
                             CONSTRAINT CK_SysWorkCalendar_WarehouseStart CHECK (WarehouseStartOffsetDays BETWEEN 0 AND 60),
    WarehouseEndOffsetDays   INT          NOT NULL CONSTRAINT DF_SysWorkCalendar_WarehouseEnd DEFAULT 5
                             CONSTRAINT CK_SysWorkCalendar_WarehouseEnd CHECK (WarehouseEndOffsetDays BETWEEN 0 AND 60),
    CreatedAt                DATETIME2(3) NOT NULL CONSTRAINT DF_SysWorkCalendar_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy                INT          NULL,
    ModifiedAt               DATETIME2(3) NULL,
    ModifiedBy               INT          NULL,
    CONSTRAINT UQ_SysWorkCalendar_Branch UNIQUE (BranchCode),
    -- Ngày bắt đầu ra chuyền, nhập kho không sau ngày kết thúc tương ứng, kể cả khi dòng chỉ may một ngày
    CONSTRAINT CK_SysWorkCalendar_Offsets CHECK (OutStartOffsetDays <= OutEndOffsetDays
        AND OutStartOffsetDays + WarehouseStartOffsetDays <= OutEndOffsetDays + WarehouseEndOffsetDays)
);
GO

-- Ngày đặc biệt của một lịch: OFF = nghỉ (lễ, Tết, nghỉ công ty), WORK = làm việc dù trùng ngày nghỉ hằng tuần (làm bù).
-- Xóa vật lý được (nhập nhầm ngày): dòng không có mã, không bảng nào tham chiếu; mỗi lần đặt, xóa đều ghi SysAuditLog
CREATE TABLE dbo.SysWorkCalendarDay (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SysWorkCalendarDay PRIMARY KEY,
    WorkCalendarId INT           NOT NULL CONSTRAINT FK_SysWorkCalendarDay_Calendar FOREIGN KEY REFERENCES dbo.SysWorkCalendar(Id),
    CalendarDate   DATE          NOT NULL,
    DayType        VARCHAR(10)   NOT NULL CONSTRAINT CK_SysWorkCalendarDay_DayType CHECK (DayType IN ('OFF', 'WORK')),
    Name           NVARCHAR(100) NULL,
    CreatedAt      DATETIME2(3)  NOT NULL CONSTRAINT DF_SysWorkCalendarDay_CreatedAt DEFAULT SYSUTCDATETIME(),
    CreatedBy      INT           NULL,
    ModifiedAt     DATETIME2(3)  NULL,
    ModifiedBy     INT           NULL,
    CONSTRAINT UQ_SysWorkCalendarDay_Date UNIQUE (WorkCalendarId, CalendarDate)
);
GO
