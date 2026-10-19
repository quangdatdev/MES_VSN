# Thiết kế database MES_Sewing (module May)

Module May, Phase 5.5, ADR 0009. Migration: `backend/migrations/MES_Sewing/`.

Quy ước như `MES_Order` (`docs/thiet-ke/db-order.md`):
- tên bảng PascalCase, số ít; thời điểm `DATETIME2(3)` giờ UTC;
- bảng giao dịch có `BranchCode`;
- bảng con mang `BranchCode` của cha, khóa ngoại ghép `(ParentId, BranchCode)`.

## Bảng
| Bảng | Tài nguyên / vai trò | Cột chính | Ghi chú |
|---|---|---|---|
| `PrepStep` | Danh mục "Cấu hình chuẩn bị SX" (Quản trị › Danh mục hệ thống, quyền `admin.catalog`) | `Code` (bất biến, trigger), `Name`, `Description`, `PlanDays` (0–365, số ngày KH mặc định), `Performer` (người thực hiện), `DataSource` (nguồn dữ liệu đầu vào), `SortOrder` (thứ tự cột), `IsActive`, `IsSystem` | Dùng chung toàn công ty, không xóa vật lý. Seed 16 bước `CB01`…`CB16` theo ảnh mẫu |
| `SewingPrep` | `order.prep` (Kế hoạch chuẩn bị SX) | `ShipmentPlanLineId` (duy nhất), `ShipmentPlanId`, `PlanNo`, `CustomerName`, `StyleCode` NVARCHAR(120), `ProductName`, `LineCode`, `LineQty`, `StartDate` (bản chép từ dàn chuyền); `StyleType`, `ConfirmedQty`, `PriorityFactor` (nhập tay); `SourceSyncedAt`; `SourceCreatedAt` (thời điểm tạo dòng nguồn, nhận diện khi Id được dùng lại, migration 0002); `BranchCode` | Mỗi dòng dàn chuyền một dòng. Chép lại khi dàn chuyền đổi (ADR 0009). `reset:demo`, `load:bravo` xóa hết bảng này (giữ `PrepStep`) |
| `SewingPrepStep` | con của `SewingPrep` | `PrepStepId` (FK `PrepStep`), `PlanDays` (NULL: theo danh mục), `DoneDate` (ngày thực hiện) | Chỉ có dòng khi người dùng đã nhập; bỏ hết thì dòng bị xóa. `UQ (SewingPrepId, PrepStepId)`, `ON DELETE CASCADE` |

## Chỉ mục
- `UX_SewingPrep_Line (ShipmentPlanLineId)`
- `IX_SewingPrep_Branch_Start (BranchCode, StartDate, Id)`
- `IX_SewingPrep_Branch_Line (BranchCode, LineCode)`
- `IX_SewingPrep_Plan (ShipmentPlanId)` (khóa ngầm, migration 0002)
- `IX_SewingPrepStep_Branch (BranchCode, SewingPrepId)`
- `IX_PrepStep_Sort (SortOrder, Id)`

## Khóa ngầm (`migrations/softkeys.json`)
| Cột | Trỏ tới |
|---|---|
| `SewingPrep.ShipmentPlanLineId` | `MES_Order.ShipmentPlanLine.Id`, cùng nhà máy |
| `SewingPrep.ShipmentPlanId` | `MES_Order.ShipmentPlan.Id`, cùng nhà máy |
| `SewingPrep.LineCode` | `MES_Core.SysOrgUnit.Code` (chuyền), cùng nhà máy |
| `SewingPrep.BranchCode`, `SewingPrepStep.BranchCode` | `MES_Core.SysBranch.Code` |

## Chiều phạm vi (`SysResourceScopeBinding`)
| Tài nguyên | FACTORY | LINE | OWNER |
|---|---|---|---|
| `order.prep` | `BranchCode` | `LineCode` | – |

Không có OWNER: dòng do hệ thống chép từ dàn chuyền, không có người tạo.

## Quy tắc tính (chờ BA xác nhận)
- **KH của bước** = `StartDate` − (`SewingPrepStep.PlanDays` nếu có, không thì `PrepStep.PlanDays`), tính theo ngày lịch.
- **Trạng thái một bước:**
  - xong đúng hạn: TH ≤ KH;
  - xong trễ: TH > KH;
  - trễ: chưa có TH và hôm nay (giờ Việt Nam) đã qua KH;
  - chưa đến hạn.
- **Trạng thái vào chuyền của dòng** (người dùng chốt 10/10/2026, task 5.5.7; chỉ xét bước đang dùng):
  - Chưa đến ngày V/C (`NOT_DUE`): ngày vào chuyền sau hôm nay, nhập đủ TH hay chưa cũng vậy;
  - Đủ điều kiện V/C (`READY`): đã đến ngày vào chuyền, mọi bước có TH;
  - Chưa đủ đk V/C (`NOT_READY`): đã đến ngày vào chuyền, còn bước chưa có TH.
- **Ô TH tô đỏ** khi TH > KH (xong trễ).
- **Thanh tuần T1…T53** (tuần ISO, thứ Hai – Chủ nhật): chọn tuần W thì hiện dòng có bước đang dùng chưa có TH mà KH ≤ Chủ nhật của W (kể cả việc tồn từ các tuần trước), cộng dòng vào chuyền trong W. Lọc trong SQL (`weekFilter`), cùng công thức KH với lọc trạng thái.
