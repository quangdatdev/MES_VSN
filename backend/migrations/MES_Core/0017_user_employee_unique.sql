-- MES_Core 0017 (phase 5.18, review M4): một nhân viên gắn tối đa một tài khoản. Hai tài khoản cùng nhân viên tổ trưởng thì cả hai lưu
-- được như tổ trưởng ở Phân cụm trưởng, nhật ký ghi theo tài khoản nên không biết người thật là ai. Thay chỉ mục thường của 0016 bằng chỉ
-- mục duy nhất có lọc (tài khoản chưa gắn nhân viên thì NULL, không tính). Ứng dụng kiểm trước khi ghi và báo tài khoản đang giữ nhân
-- viên (409); chỉ mục chặn hai lần gắn chạy cùng lúc. Bản cũ còn chạy không đọc cột này: chạy được trước khi deploy.

DROP INDEX IX_SysUser_EmployeeId ON dbo.SysUser;
GO

CREATE UNIQUE INDEX UX_SysUser_EmployeeId ON dbo.SysUser (EmployeeId) WHERE EmployeeId IS NOT NULL;
GO
