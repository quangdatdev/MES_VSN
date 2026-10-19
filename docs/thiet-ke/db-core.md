# Thiết kế bảng `MES_Core` cho Demo – Phase 0

> Bản thiết kế để duyệt **trước khi viết migration**. Theo `CLAUDE.md` mục 5 và chuẩn schema: PascalCase không dấu, số ít, tiền tố `Sys`, `Id` là khóa chính, cột thời điểm `…At`, cờ `Is…`. Khóa ngoại vật lý dùng được vì tất cả bảng dưới đây cùng một database.
> Đã đối chiếu từ khóa dành riêng của T-SQL: tránh `User`, `Action` (dùng `ActionCode`), `Access` (dùng `AccessLevel`).

## 1. Cột chuẩn

- **Danh mục** (`SysBranch, SysRole, SysPermission, SysResource, SysMenu`): `Id, Code, Name, Description, SortOrder, IsActive, IsSystem, CreatedAt, CreatedBy, ModifiedAt, ModifiedBy`. Không xóa vật lý, dùng `IsActive`.
- **Bảng gán / giao dịch** (`SysUserRole, SysUserBranch, SysRolePermission…`): `Id` + cột nghiệp vụ + `CreatedAt, CreatedBy` (bảng gán không sửa tại chỗ nên không cần `Modified*`; đổi bằng xóa/thêm và đều có `SysAuditLog`). Bảng gán được xóa vật lý.
- `CreatedBy/ModifiedBy`: `INT NULL` = `SysUser.Id`; dòng do seed để `NULL`.
- Mọi cột thời điểm: `DATETIME2(3)`, lưu UTC.

## 2. Danh sách bảng

### Nhóm làm trong Demo

| Bảng | Mục đích |
|---|---|
| `SysBranch` | Danh mục nhà máy; `Code` chính là `BranchCode` |
| `SysUser` | Tài khoản |
| `SysUserBranch` | User ↔ nhà máy được chọn |
| `SysRole` | Vai trò |
| `SysUserRole` | User ↔ Role |
| `SysResource` | Resource Registry: tài nguyên được bảo vệ, loại phạm vi |
| `SysPermission` | Quyền `module.resource:action` |
| `SysRolePermission` | Role ↔ Permission |
| `SysMenu` | Cây menu, mỗi mục gắn một tài nguyên |
| `SysUserSession` | Refresh token, thu hồi phiên |
| `SysPermissionVersion` | Số phiên bản quyền, tăng khi đổi phân quyền |
| `SysAuditLog` | Nhật ký chỉ-ghi-thêm |

### Tạo sẵn ở Demo, dùng từ Phase 5.1 (theo mô hình đích 5 lớp)

| Bảng | Mục đích |
|---|---|
| `SysFieldPolicy` | Ẩn/che/chỉ đọc theo cột |
| `SysUserPermissionOverride` | Ngoại lệ Allow/Deny theo user |

## 3. Chi tiết cột

Kiểu: `NV` = NVARCHAR, `V` = VARCHAR. `PK` khóa chính, `FK` khóa ngoại vật lý, `UQ` duy nhất.

### `SysBranch` (danh mục)
`Id INT PK` · `Code V(10) UQ` (dạng `A00`, `A01`…; **cấm sửa sau khi tạo**) · `Name NV(100)` (sửa được) · `Description NV(255) NULL` · `IsAggregate BIT` (đơn vị tổng hợp, hiện chỉ `A00`) · `SortOrder INT` · `IsActive BIT` · `IsSystem BIT` · audit.

Quy tắc: bảng nghiệp vụ **không bao giờ** lưu `BranchCode` của đơn vị `IsAggregate = 1`. Chọn đơn vị tổng hợp thì repository bỏ điều kiện lọc nhà máy và chỉ cho đọc.

### `SysUser`
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `Id` | INT PK | |
| `Username` | V(50) UQ | Không phân biệt hoa thường (collation CI) |
| `PasswordHash` | V(255) | argon2id; không lưu mật khẩu thô |
| `FullName` | NV(100) | |
| `Email` | V(150) NULL | |
| `EmployeeCode` | V(30) NULL | Khóa ngầm sang dữ liệu Nhân sự (sau này) |
| `FailedLoginCount` | INT | Mặc định 0 |
| `LockedUntilAt` | DATETIME2 NULL | Khóa tạm |
| `LastLoginAt` | DATETIME2 NULL | |
| `IsActive` | BIT | Vô hiệu hóa tài khoản |
| audit | | |

### `SysUserBranch`
`Id INT PK` · `UserId INT FK→SysUser` · `BranchId INT FK→SysBranch` · `IsDefault BIT` · `CreatedAt/CreatedBy` · `UQ (UserId, BranchId)`.

### `SysRole` (danh mục)
`Id, Code V(30) UQ, Name, Description, SortOrder, IsActive, IsSystem` + audit.

### `SysUserRole`
`Id` · `UserId FK` · `RoleId FK` · `ValidFromAt DATETIME2 NULL` · `ValidToAt DATETIME2 NULL` · `CreatedAt/CreatedBy` · `UQ (UserId, RoleId)`.
`ValidFromAt/ValidToAt` chưa dùng trong Demo, tạo sẵn cho ủy quyền tạm thời.

### `SysResource` (danh mục, Resource Registry)
| Cột | Kiểu | Ghi chú |
|---|---|---|
| `Id` | INT PK | |
| `Code` | V(60) UQ | Ví dụ `order.po` |
| `Name` | NV(100) | |
| `ModuleCode` | V(30) | `order`, `cutting`, … |
| `ScopeType` | V(10) | `BRANCH` (lọc theo `BranchCode`) hoặc `SHARED` (dùng chung toàn công ty). **Không NULL**; repository từ chối tài nguyên chưa khai báo |
| `SourceTable` | V(128) NULL | Tên `database.bảng` mà tài nguyên đọc, để kiểm tra bảng có cột `BranchCode` khi `ScopeType = BRANCH` |
| `SortOrder, IsActive, IsSystem, Description` + audit | | |

### `SysPermission` (danh mục)
`Id` · `Code V(80) UQ` (ví dụ `order.po:view`) · `ResourceId FK→SysResource` · `ActionCode V(20)` (`view, create, update, delete, export`) · `Name NV(150)` · `SortOrder, IsActive, IsSystem` + audit · `UQ (ResourceId, ActionCode)`.

### `SysRolePermission`
`Id` · `RoleId FK` · `PermissionId FK` · `CreatedAt/CreatedBy` · `UQ (RoleId, PermissionId)`.

### `SysMenu` (danh mục)
`Id` · `Code V(60) UQ` · `Name NV(100)` · `ParentId INT NULL FK→SysMenu` (tự tham chiếu, chỉ bảng phân cấp thật) · `Path V(150) NULL` · `Icon V(50) NULL` · `ResourceId INT NULL FK→SysResource` (NULL với nhóm cha) · `IsMobile BIT` · `SortOrder, IsActive, IsSystem, Description` + audit.
Quy tắc hiển thị: mục lá hiện khi user có `<ResourceCode>:view`; nhóm cha hiện khi có ít nhất một con hiện.

### `SysUserSession`
`Id BIGINT PK` · `UserId FK` · `RefreshTokenHash V(128) UQ` · `BranchCode V(10) NULL` · `IssuedAt` · `ExpiresAt` · `RevokedAt NULL` · `IpAddress V(45) NULL` · `UserAgent V(255) NULL`.

### `SysPermissionVersion`
Một dòng duy nhất: `Id = 1` · `Version BIGINT` · `ModifiedAt`. Mọi thay đổi `SysRolePermission / SysUserRole / SysUserBranch / SysMenu` tăng `Version` trong cùng transaction. Backend so sánh với bản đã cache.

### `SysAuditLog` (chỉ ghi thêm, không UPDATE/DELETE)
`Id BIGINT PK` · `EventAt DATETIME2` · `UserId INT NULL` · `Username V(50) NULL` · `BranchCode V(10) NULL` · `EntityType V(40)` · `EntityId V(40) NULL` · `ActionCode V(30)` (`LOGIN, LOGIN_FAILED, SELECT_BRANCH, CREATE, UPDATE, DELETE, GRANT, REVOKE`) · `OldValue NVARCHAR(MAX) NULL` (JSON) · `NewValue NVARCHAR(MAX) NULL` (JSON) · `IpAddress V(45) NULL`.
Không để mật khẩu, hash, hay token vào `OldValue/NewValue`.

### `SysFieldPolicy` (tạo sẵn, bổ sung ở 0002)
`Id` · `SubjectType V(10)` (`ROLE`/`USER`) · `SubjectId INT` · `ResourceId FK→SysResource` · `FieldCode V(60)` · `AccessLevel V(10)` (`HIDDEN, MASKED, READONLY, EDITABLE`) · `ValidFromAt, ValidToAt NULL` (chỉ dòng `USER`) · `Reason NV(255)` (bắt buộc với dòng `USER`) + `CreatedAt/CreatedBy` · `UQ (SubjectType, SubjectId, ResourceId, FieldCode)` · FK `(ResourceId, FieldCode)` → `SysResourceField (ResourceId, Code)`.
`SubjectId` trỏ tới `SysRole` hoặc `SysUser` tùy `SubjectType` nên không đặt FK vật lý, cần kiểm toàn vẹn bằng script.

### `SysUserPermissionOverride` (tạo sẵn)
`Id` · `UserId FK` · `PermissionId FK` · `Effect V(5)` (`ALLOW`/`DENY`) · `ValidFromAt, ValidToAt NULL` · `Reason NV(255) NOT NULL` (từ 0002) · `CreatedAt/CreatedBy` · `UQ (UserId, PermissionId)`.

### Bổ sung ở Phase 5.1 (migration `0002_scope_field_override.sql`, ADR 0005)
| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `SysOrgUnit` (danh mục) | `Code V(20)` (chữ hoa ASCII, số, gạch ngang), `Name`, `OrgType` (`FACTORY`/`LINE`; thêm `WORKSHOP` ở 0005), `ParentId`, `BranchCode` FK→`SysBranch.Code`, `Path V(400)` (duy nhất) | **Mô tả dưới đây là bản 0002–0004; từ 0005, 0006 xem mục 5.4.8 bên dưới (khóa ngoại, CHECK, trigger Path đã thay).** Cây Nhà máy → Chuyền. Nút nhà máy là gốc, `Code` = `BranchCode`; chuyền có cha; FK ghép `(ParentId, BranchCode)` buộc con cùng nhà máy với cha; `Path` bắt đầu bằng nhà máy, kết thúc bằng mã của nút; không tự làm cha của mình. `Code` cấm sửa (trigger so sánh nhị phân) |
| `SysScopeDimension` (danh mục) | `Code`, `Name`, `OrgType NULL` | Chiều phạm vi. Migration tạo sẵn `FACTORY`, `LINE`, `OWNER` (`IsSystem`). `OrgType NULL` = giá trị tự do |
| `SysResourceScopeBinding` | `ResourceId` FK, `DimensionId` FK, `ColumnName V(128)` (chỉ ký tự định danh) · `UQ (ResourceId, DimensionId)` | Tài nguyên lọc theo chiều nào, qua cột nào |
| `SysUserRoleScope` | `UserRoleId` FK (không xóa dây chuyền), `DimensionId` FK, `ScopeMode` (`ALL`/`ORG_SUBTREE`/`LIST`/`OWN`), `OrgUnitId NULL` FK, `ScopeValue V(60) NULL` | Phạm vi của một phép gán. Không có dòng cho một chiều = không giới hạn ở chiều đó. Service xóa phạm vi (kèm audit) trước khi xóa phép gán |
| `SysResourceField` (danh mục) | `ResourceId` FK, `Code V(60)` (tên trường JSON), `Name`, `IsSensitive` · `UQ (ResourceId, Code)` | Cột của tài nguyên; `SysFieldPolicy` trỏ tới bằng FK ghép |
| `SysSensitiveReadLog` | `ReadAt`, `UserId`, `Username`, `BranchCode`, `ResourceCode`, `FieldCodes V(2000)`, `RecordCount`, `ActionCode` (`VIEW`/`EXPORT`), `IpAddress` | Nhật ký đọc dữ liệu nhạy cảm, chỉ ghi thêm (trigger) |

Thêm index `SysAuditLog(UserId, EventAt DESC)` và index duy nhất có lọc `SysBranch(IsAggregate) WHERE IsAggregate = 1` (chỉ một đơn vị tổng hợp).

### Bổ sung ở Phase 5.4 (migration `0003_catalog.sql`, màn Quản trị › Danh mục hệ thống)
| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `SysCatalog` (danh mục) | `Code V(30)` (chữ hoa, số, gạch dưới), `Name`, `Description` | Loại danh mục mã-tên: `UNIT` (Đơn vị tính), `ORDER_TYPE` (Loại đơn hàng), `PROD_FACTORY` (Nhà máy sản xuất: nơi may thực tế của đơn hàng, cột `SalesOrder.ProductionFactoryCode`; mỗi lần chạy seed thêm mục còn thiếu cho các nhà máy đang dùng, lấy tên nhà máy hiện tại, không sửa hay bật lại mục đã có; xưởng gia công ngoài thêm ở màn Danh mục hệ thống). Thêm danh mục loại này chỉ cần thêm dòng (seed), không cần bảng mới |
| `SysCatalogItem` (danh mục) | `CatalogId` FK, `Code V(30)` (chữ hoa, số, `.`, `_`, `-`), `Name`, `Description` · `UQ (CatalogId, Code)` | Mục của danh mục. Mã lưu vào dữ liệu nghiệp vụ (`SalesOrder.OrderType`, `SalesOrder.ProductionFactoryCode`) nên bất biến (trigger); `UNIT` dùng mã đơn vị BRAVO để script nạp đổi sang tên |
| `SysShift` (danh mục) | `Code V(20)`, `Name`, `StartTime TIME(0)`, `EndTime TIME(0)`, `BreakMinutes` (0–480) · `CK StartTime <> EndTime` | Ca làm việc dùng chung toàn công ty; `EndTime < StartTime` là ca qua đêm; service kiểm nghỉ ngắn hơn ca. Mã bất biến (trigger) |

Chuyền may là `SysOrgUnit` loại `LINE` (bảng Phase 5.1). Màn Danh mục hệ thống:
- thêm chuyền; tạo nút nhà máy nếu nhà máy thêm sau seed chưa có;
- đổi tên, thứ tự, ngừng dùng.

Bật/tắt và chuyển xưởng tăng `SysPermissionVersion`, vì cây tổ chức nằm trong quyền đã tính. Danh mục không xóa vật lý.

### Bổ sung ở Phase 5.4, task 5.4.8 (migration `0005_org_workshop.sql`, ADR 0010): cấp Xưởng
| Thay đổi | Ghi chú |
|---|---|
| `SysOrgUnit.OrgType` thêm `WORKSHOP` | Cây Nhà máy → Xưởng → Chuyền. Xưởng chỉ nằm dưới nhà máy; chuyền nằm dưới xưởng hoặc thẳng dưới nhà máy. Dữ liệu nghiệp vụ vẫn gắn vào chuyền (`LineCode`) |
| Cột `ParentOrgType V(10) NULL` | Loại của nút cha, `NULL` ở nhà máy. Mọi chỗ ghi `SysOrgUnit` phải ghi cột này |
| `UQ_SysOrgUnit_IdBranchType (Id, BranchCode, OrgType)`, `FK_SysOrgUnit_Parent (ParentId, BranchCode, ParentOrgType)` | Thay khóa ngoại `(ParentId, BranchCode)` và `UQ_SysOrgUnit_IdBranch`. Con cùng nhà máy với cha; `ParentOrgType` đúng loại của cha; không đổi được loại của nút đang có con |
| `CK_SysOrgUnit_Level` | Thay `CK_SysOrgUnit_Line`. Cặp hợp lệ: (`FACTORY`, `NULL`), (`WORKSHOP`, `FACTORY`), (`LINE`, `FACTORY` hoặc `WORKSHOP`). Có `ParentOrgType IS NOT NULL` để giá trị `NULL` không lọt qua CHECK; `0006` tạo lại cho database đã chạy bản 0005 đầu |
| `TR_SysOrgUnit_PathMatchesParent` (`0006_org_path_guard.sql`) | `Path` = `Path` của cha + `Code` + `/` (nhà máy: `/` + `Code` + `/`), lỗi `ORG_PATH_MISMATCH`. Bảng có trigger INSERT nên chèn không dùng `OUTPUT`: thêm rồi đọc lại theo mã |

Quy tắc ở service (`CatalogService`), chạy nối tiếp bằng `sp_getapplock`:
- chuyền đang dùng phải nằm trong xưởng đang dùng;
- xưởng còn chuyền đang dùng thì không ngừng được;
- chuyển chuyền đổi `ParentId`, `ParentOrgType`, `Path` trong một lệnh;
- chuyển chuyền cần `admin.permission:update`, và người đang được giao cả xưởng cũ hay mới không tự chuyển được.

### Bổ sung ở Phase 5.9 (migration `0007_production_factory.sql`, ADR 0013): Đơn vị cơ sở, Nhà máy SX
`SysBranch` giữ nguyên bảng, đổi nghĩa thành **Đơn vị cơ sở** (ĐVCS): danh sách theo danh mục chi nhánh BRAVO (`MES_Sync.bravo.DM_CHINHANH`), cộng đơn vị tổng hợp `A00`.
- Ứng dụng chép (`importBravoBranches`): thêm mã thiếu, `Name` = `TenChiNhanh`, `Description` = `TenDayDu`; không tắt mã vắng trong BRAVO.
- Tên ĐVCS có trong BRAVO không sửa ở MES.

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `SysProductionFactory` (danh mục) | `Code NV(100)` (tên nhà máy theo OSM, có dấu, khoảng trắng; không dấu phẩy, không khoảng trắng đầu cuối; bất biến bằng trigger; `V(30)` chữ hoa không dấu trước `0008`), `Name`, `BranchCode V(10) NULL` FK→`SysBranch.Code`, `Description`, `SortOrder`, `IsActive`, `IsSystem` + audit · `UQ (Code)` · index `(BranchCode)` | Nhà máy SX, mỗi nhà máy thuộc một ĐVCS (service không cho gắn đơn vị tổng hợp; `NULL`: mục chép từ `PROD_FACTORY` không trùng mã ĐVCS nào). Mã lưu ở `MES_Order.SalesOrder.ProductionFactoryCode` (khóa ngầm, danh sách cách nhau dấu phẩy). Tên nhà máy mới trong OSM tự thêm sau mỗi lần đồng bộ OSM (ADR 0013 mục 9). Phiên làm việc ở ĐVCS nào thì lập kế hoạch xuất hàng cho đơn của các nhà máy thuộc ĐVCS đó; thêm nhà máy, đổi ĐVCS, bật, tắt nhà máy tăng `SysPermissionVersion` (ADR 0013 mục 11). Thay danh mục mã-tên `PROD_FACTORY` (migration chép mục cũ giữ mã, rồi ngừng danh mục cũ) |
| `SysUserProductionFactory` (bảng gán) | `UserId` FK, `ProductionFactoryId` FK, `CreatedAt/CreatedBy` · `UQ (UserId, ProductionFactoryId)` · index `(ProductionFactoryId)` | **Không còn dùng từ 12/10/2026** (ADR 0013 mục 11): lập kế hoạch xuất hàng theo nhà máy SX thuộc ĐVCS đăng nhập (`SysProductionFactory.BranchCode`), không tích theo người. Bảng và dữ liệu cũ giữ nguyên, chờ chốt xóa bằng migration |

Migration còn đổi tên chiều phạm vi `FACTORY` thành "Đơn vị cơ sở" và tăng `SysPermissionVersion`.

## 4. Chỉ mục (ngoài PK/UQ ở trên)

Mọi cột khóa ngoại có index riêng, hoặc là cột đầu của một UQ/index khác (các bảng thêm ở 0002 dùng cách này cho `UserRoleId`, `ResourceId`): `SysUserBranch(UserId)`, `SysUserBranch(BranchId)`, `SysUserRole(UserId)`, `SysUserRole(RoleId)`, `SysRolePermission(RoleId)`, `SysRolePermission(PermissionId)`, `SysPermission(ResourceId)`, `SysMenu(ParentId)`, `SysMenu(ResourceId)`, `SysUserSession(UserId)`.
`SysAuditLog(EventAt DESC)` và `SysAuditLog(EntityType, EntityId)`.

## 5. Khóa ngầm giữa database

Khai báo trong `backend/migrations/softkeys.json` (tạo ở Phase 1) cho mỗi cột trỏ sang database khác, kèm `ownerModule`. Dạng:

```json
{ "from": "MES_Order.SalesOrder.BranchCode", "to": "MES_Core.SysBranch.Code", "ownerModule": "order" }
```
Mọi bảng nghiệp vụ có `BranchCode` đều có một dòng như trên. Script kiểm toàn vẹn (bản ghi mồ côi) và linter (index trên cột khóa ngầm) đọc từ file này.

## 6. Đã chốt (08/10/2026)

- `BranchCode` là chuỗi ngắn (`A01`, `A02`…) lấy từ `SysBranch.Code`; **cấm sửa `Code`**, `Name` sửa được qua màn Quản trị.
- Đơn vị tổng hợp `A00` (`IsAggregate = 1`): xem tất cả nhà máy, chỉ đọc, không gắn dữ liệu.
- Bảng gán xóa vật lý (có audit) thay vì `IsActive`.
- `SysPermission` sinh từ `SysResource × 5 hành động` bằng seed.
- Một user có nhiều Role, quyền = hợp các Role.
