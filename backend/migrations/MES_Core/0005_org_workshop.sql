-- MES_Core 0005 (Phase 5.4, ADR 0010): cây tổ chức thêm cấp Xưởng: Nhà máy -> Xưởng -> Chuyền.
-- Xưởng chỉ để gom chuyền (ô chọn chuyền, báo cáo, phạm vi phân quyền theo cả nhánh); dữ liệu nghiệp vụ vẫn gắn vào chuyền (LineCode).
-- Chuyền nằm dưới xưởng hoặc thẳng dưới nhà máy (mọi chuyền trước 0005); xưởng chỉ nằm dưới nhà máy, không lồng nhau.
-- Database tự giữ quy tắc cấp: ParentOrgType chép loại của nút cha, khóa ngoại ghép (ParentId, BranchCode, ParentOrgType)
-- buộc bản chép đúng với cha, CHECK giới hạn cặp (loại, loại cha). Nhờ vậy chuyền không làm cha được, cây không có vòng lặp,
-- và không đổi được loại của một nút đang có con.
-- Trước khi chạy: dừng backend. Chạy được trên dữ liệu đã có (chỉ có nhà máy và chuyền).

ALTER TABLE dbo.SysOrgUnit DROP CONSTRAINT CK_SysOrgUnit_OrgType;
ALTER TABLE dbo.SysOrgUnit ADD CONSTRAINT CK_SysOrgUnit_OrgType CHECK (OrgType IN ('FACTORY', 'WORKSHOP', 'LINE'));
ALTER TABLE dbo.SysOrgUnit ADD ParentOrgType VARCHAR(10) NULL;
GO

UPDATE c SET ParentOrgType = p.OrgType
  FROM dbo.SysOrgUnit c
  JOIN dbo.SysOrgUnit p ON p.Id = c.ParentId;
GO

ALTER TABLE dbo.SysOrgUnit ADD CONSTRAINT UQ_SysOrgUnit_IdBranchType UNIQUE (Id, BranchCode, OrgType);
ALTER TABLE dbo.SysOrgUnit DROP CONSTRAINT FK_SysOrgUnit_Parent;
-- Con cùng nhà máy với cha và ParentOrgType đúng loại của cha (nút gốc có ParentId NULL nên không bị kiểm)
ALTER TABLE dbo.SysOrgUnit ADD CONSTRAINT FK_SysOrgUnit_Parent FOREIGN KEY (ParentId, BranchCode, ParentOrgType) REFERENCES dbo.SysOrgUnit (Id, BranchCode, OrgType);
-- Khóa ngoại cũ trỏ tới UQ này; khóa mới đã gồm (Id, BranchCode)
ALTER TABLE dbo.SysOrgUnit DROP CONSTRAINT UQ_SysOrgUnit_IdBranch;
-- Thay CK_SysOrgUnit_Line (chuyền luôn có cha): ParentOrgType bắt buộc khi có cha, nếu không khóa ngoại ghép bỏ qua dòng đó.
-- Viết rõ ParentOrgType IS NOT NULL: NULL = 'FACTORY' hay NULL IN (...) cho UNKNOWN và CHECK coi UNKNOWN là đạt.
ALTER TABLE dbo.SysOrgUnit DROP CONSTRAINT CK_SysOrgUnit_Line;
ALTER TABLE dbo.SysOrgUnit ADD CONSTRAINT CK_SysOrgUnit_Level CHECK (
    (OrgType = 'FACTORY' AND ParentId IS NULL AND ParentOrgType IS NULL)
    OR (OrgType = 'WORKSHOP' AND ParentId IS NOT NULL AND ParentOrgType IS NOT NULL AND ParentOrgType = 'FACTORY')
    OR (OrgType = 'LINE' AND ParentId IS NOT NULL AND ParentOrgType IS NOT NULL AND ParentOrgType IN ('FACTORY', 'WORKSHOP'))
);
GO
