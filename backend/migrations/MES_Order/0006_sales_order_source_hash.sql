-- MES_Order 0006: dấu nội dung BRAVO của đơn hàng cho bước nạp tăng dần (ADR 0013 mục 8, review 5.9.10 H1).
-- SourceHash: SHA-256 (hex) của dữ liệu BRAVO chưa ánh xạ của đơn (khách hàng, mã hàng, mùa, loại, tên hàng, nhân viên, SL,
-- mã đơn vị tính, đóng lệnh, ngày xuất sớm nhất), ở lần nạp gần nhất. Lần nạp sau băm lại: khác thì BRAVO đã đổi đơn, ghi đè
-- cả phần người dùng sửa ở MES; giống thì giữ phần người dùng sửa. Không dùng SyncedAt để biết BRAVO đổi: nguồn chép theo
-- nhóm (ThongTinPO, ThongTinPO_MauCo) chép lại cả nhóm với SyncedAt mới dù nội dung không đổi.
-- NULL: đơn nhập tay, hoặc đơn nạp trước 0006. Lần nạp đầu: đơn chưa ai sửa thì ghi lại theo BRAVO kèm dấu, đã sửa thì chỉ ghi
-- dấu làm mốc.

ALTER TABLE dbo.SalesOrder ADD SourceHash CHAR(64) NULL;
GO
