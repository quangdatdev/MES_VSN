-- MES_Core 0016 (phase 5.18, quyết định 10.3): nối tài khoản đăng nhập với hồ sơ nhân viên của MES_Hr.
-- Màn Phân cụm trưởng biết người đăng nhập là tổ trưởng của tổ nào qua nhân viên gắn với tài khoản (dữ liệu Phân tổ trưởng theo
-- nhân viên). Nối theo Employee.Id vì mã nhân viên sửa được; khác database nên là khóa ngầm (softkeys.json), không có khóa ngoại.
-- NULL: tài khoản chưa gắn nhân viên. Cột EmployeeCode của 0001 chưa dùng, giữ nguyên. Bản cũ còn chạy không đọc cột này: chạy được
-- trước khi deploy.

ALTER TABLE dbo.SysUser ADD EmployeeId INT NULL;
GO

-- Khóa ngầm có index (CLAUDE.md mục 5); phần lớn tài khoản chưa gắn nên lọc NULL
CREATE INDEX IX_SysUser_EmployeeId ON dbo.SysUser (EmployeeId) WHERE EmployeeId IS NOT NULL;
GO
