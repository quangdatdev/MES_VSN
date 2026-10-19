# Review Phase 5.10 – 12–13/10/2026

Phạm vi: 80 file (diff `17cca79..phase-5-10`): luồng A Phân bổ PO (`modules/order/po-allocation*`, `platform/data/base.repository.ts`, `platform/sync/osm-po-source.ts`, `platform/feed`, migration `MES_Order/0009`, `MES_Core/0010`, `PoAllocationPage.tsx`); luồng B chuyền may (`platform/org`, `modules/hr`, `platform/permission`, `platform/admin/admin-grants.service.ts`, `platform/catalog`, migration `MES_Hr/0002`, `MES_Core/0009`, `scripts/*`, `softkeys.json`, `UserAccessDrawer.tsx`, `CatalogsPage.tsx`, `features/hr/*`). Quyết định liên quan: `13-quyet-dinh.md` mục 6.7, 7.9 (mới), 3.5, 3.9, 4.3, 4.4, 6.4, 6.5, 7.8. Kế hoạch: `docs/phases/phase-5-10-phan-bo-po-chuyen-may.md`.

Trong lúc làm, agent B2 tự chạy một lượt `code-reviewer` trên luồng của mình (0 CRITICAL, 2 HIGH, 4 MEDIUM, 7 LOW): HIGH "thiếu test cho migration 0009" đã sửa (`phase5-line-scope-migration.spec.ts`); HIGH "test cũ của B3 dùng `orgUnitId` chuyền" sửa ở bước tích hợp (`sewing.spec.ts`); MEDIUM giá trị `~mã` cho phạm vi vốn không có tác dụng đã làm.

## Lượt 1 – luồng A (Phân bổ PO)
Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 8 LOW). Phiên chính đọc lại code, xác nhận M1, M2 đúng; các LOW đúng.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `po-allocation.repository.ts`, `po-allocation-refresh.service.ts` | Nguồn giảm quá 20% thì bỏ cả lần làm mới, không có đường vượt: bảng có thể đứng hẳn | Giảm quá ngưỡng: vẫn thêm, sửa dòng, chỉ bỏ bước xóa, đếm dòng giữ lại; ngưỡng `PO_ALLOCATION_MAX_SHRINK_PERCENT` (mặc định 20, 100 là không chặn); nhật ký có lý do; màn hiện cảnh báo lần làm mới gần nhất | Đóng (`54e4c3d`, `c520ee2`) |
| M2 | MEDIUM | `po-allocation.repository.ts` | Mỗi lần làm mới ghi lại mọi dòng (chỉ để đổi `SyncedAt`), khóa cả bảng | Chỉ `UPDATE` dòng đổi (`EXISTS … EXCEPT`); bỏ cột `PoAllocation.SyncedAt`; trạng thái lần làm mới ở bảng một dòng `PoAllocationRefresh` | Đóng (`54e4c3d`) |
| L1 | LOW | `po-allocation.service.ts` | Xem trước giữ khóa ghi độc quyền; không xét mức cột Nhà máy SX | Xem trước không khóa; đòi `factoryName` Sửa được cả khi xem trước | Đóng |
| L2 | LOW | `po-allocation.service.ts` | `writable < rows` so số đếm của hai tập khác nhau | Đếm "xem được mà không sửa được" và "sửa được mà không xem được" đều phải bằng 0 | Đóng |
| L3 | LOW | `po-allocation.service.ts` | File xuất lộ `isInOsm` khi cột này bị Ẩn riêng | Cột xuất riêng "Còn trong OSM" (`field: 'isInOsm'`) | Đóng |
| L4 | LOW | `po-allocation.service.ts` | `CASE` tra ĐVCS tốn 2 tham số mỗi nhà máy, khoảng 330 nhà máy là vượt 2.100 tham số; sắp xếp phụ 15 cột không dùng được chỉ mục | Bảng tra gửi một tham số JSON (`OPENJSON`); sắp xếp phụ chỉ `Id`; test 400 nhà máy giả | Đóng |
| L5 | LOW | `PoAllocationPage.tsx` | Popup không báo số dòng sẽ bị bỏ khi "Theo OSM"; lỗi xem trước không có nút thử lại | Xem trước trả `removable`, popup hiện số; nút "Thử lại" | Đóng |
| L6 | LOW | `base.repository.ts` | Nhà máy chưa có trong danh mục thì ĐVCS nào cũng sửa được | Có chủ đích (Q2); bước làm mới đếm, ghi log và nhật ký tên nhà máy chưa có trong danh mục (`UnknownFactories`); ghi vào tài liệu | Đóng |
| L7 | LOW | `po-allocation.repository.ts` | Khóa đã nhập tay về nhà máy ĐVCS A, OSM thêm dòng của ĐVCS B cùng khóa: dòng mới nhận nhà máy của A | Hỏi người dùng 13/10/2026: giữ "theo nhóm nhập tay" (Q6 của kế hoạch) | Đóng (không sửa) |
| L8 | LOW | tài liệu | Mục 7.1, 7.8 còn mô tả cũ; mã lỗi `FACTORY_OF_OTHER_BRANCH` | Task 5.10.16 | Đóng ở 5.10.16 |
| L9 | LOW | test | Thiếu test `MES_Core/0010`, test 409 khi đang làm mới | `po-allocation-grant-migration.spec.ts` (chạy thân migration rồi rollback); bài 409 giữ `sp_getapplock` ở kết nối riêng | Đóng |

Sau khi sửa (agent A, bộ `MES_*_T510A4`): lint, build qua; `po-allocation*.spec.ts` 41/41; `phase3.spec.ts` + `phase5.spec.ts` 59/59; frontend `po-allocation.test.tsx` 11/11.

## Lượt 1 – luồng B (chuyền may, phạm vi `LINE`, bỏ danh mục cũ), có lượt bảo mật
Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 2 MEDIUM, 10 LOW). Lượt bảo mật: đóng an toàn chiều `LINE`, không tự nâng quyền, cache và phiên bản quyền, ranh giới module, bỏ danh mục cũ, frontend đều đạt. Phiên chính xác nhận M1, M2 đúng.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `department.service.ts` | Đổi tập chuyền là đổi phạm vi dữ liệu nhưng nhật ký ghi kiểu cố gắng (nuốt lỗi, sau commit), tăng phiên bản lỗi chỉ ghi log | `PermissionService.recordLineSetChange`: sau commit `MES_Hr`, một transaction `MES_Core` gồm nhật ký bắt buộc `LINE_SET_CHANGE` và tăng phiên bản; thử lại 3 lần, vẫn lỗi thì 500 `LINE_SCOPE_UPDATE_FAILED`, log đủ dữ liệu, xóa cache quyền | Đóng (`08b3df4`) |
| M2 | MEDIUM | `department.service.ts`, `DepartmentPanel.tsx` | Tích, thêm, khôi phục chuyền làm sống lại phạm vi đang "ngủ" của người khác (mã cũ sau 0009) mà không báo | `lineScopeHolders`, API `GET /hr/departments/line-holders`; form thêm, tích, khôi phục hỏi "N người sẽ thấy dữ liệu chuyền này"; nhật ký ghi danh sách | Đóng (`08b3df4`) |
| L1 | LOW | `department.service.ts` | Tăng phiên bản lỗi thì quyền cũ có thể kẹt | Gộp vào M1 | Đóng (`08b3df4`, `d00f122`) |
| L2 | LOW | `org.service.ts` | Đổi ĐVCS của chuyền có dữ liệu: dòng ở ĐVCS cũ thành "(chuyền cũ)" | `lineNamer` tra mọi ĐVCS; form báo trước | Đóng (`08b3df4`, `d00f122`) |
| L3 | LOW | `UserAccessDrawer.tsx` | Bỏ hết chuyền chỉ có chữ cảnh báo | `confirmAction` | Đóng (`08b3df4`, `d00f122`) |
| L4 | LOW | `org.service.ts` | `all()` không gộp các lần đọc đang chạy | Giữ một Promise mỗi lượt invalidate | Đóng (`08b3df4`, `d00f122`) |
| L5 | LOW | `hr-line-source.ts` | Tham số làm chỉ mục có lọc không được dùng | Hằng trong câu | Đóng (`08b3df4`, `d00f122`) |
| L6 | LOW | `permission.service.ts` | JSDoc đặt lệch; mã chiều viết cứng | Sửa | Đóng (`08b3df4`, `d00f122`) |
| L7 | LOW | test | Thiếu test tạo/khôi phục/đổi ĐVCS bởi người giữ mã, nguồn chuyền lỗi, `~mã` | Thêm test | Đóng (`08b3df4`, `d00f122`) |
| L8 | LOW | `eslint.config.mjs` | Chưa có luật cấm `platform` import `modules` | Thêm `no-restricted-imports` | Đóng (`08b3df4`, `d00f122`) |
| L9 | LOW | `department.service.ts` | Thiếu quyền sửa Phân quyền trả `SELF_ELEVATION_FORBIDDEN` | Không sửa: nhất quán với danh mục chuyền cũ; ghi tài liệu | Bỏ |
| L10 | LOW | tài liệu, `admin-branches.service.ts` | Thứ tự triển khai (migrate `MES_Hr`, `MES_Core` trước bản build mới); mục 3.5, 3.9, 4.2, 4.3, 6.4, 6.5 cũ; comment cũ | Tài liệu ở 5.10.16; comment giao B1 | Đóng (`08b3df4`, `d00f122`) |

Sau khi sửa (agent B1, bộ `MES_*_T510B1b`): lint, build qua; backend 111/113 (2 bài `catalog.spec.ts` cần dữ liệu BRAVO đã chép); frontend 173/173.

Tích hợp sau lượt sửa (`d00f122`), bộ database mới `MES_*_T510J` (migrate, seed mẫu): `npm run lint`, `npm run build` qua; backend 29 file, 328 qua, 2 bỏ qua, 2 hỏng (`catalog.spec.ts`: "chép ĐVCS từ BRAVO", "danh mục BRAVO chỉ xem", đòi bảng chép BRAVO có dữ liệu, bộ test mới không có); frontend 25 file, 173/173.

## Lượt 2 – kiểm bản sửa (`0fe1600..d00f122`)
Kết luận agent: **APPROVE WITH SUGGESTIONS** (phát hiện mới: 0 CRITICAL, 0 HIGH, 0 MEDIUM, 5 LOW). Xác nhận đóng: luồng A M1, M2, L1–L6, L9 (L7 không sửa theo Q6, L8 tài liệu); luồng B M1 (còn kẽ hở N1), M2, L1–L8, L10 (L9 không sửa). Thử luật lint `platform` không import `modules` bằng file vi phạm: bị chặn đúng.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| N1 | LOW | `department.service.ts` | Ghi tập chuyền chạy sau `detail()`: đọc lại lỗi thì mất nhật ký `LINE_SET_CHANGE`, không tăng phiên bản quyền | `savedWithLines`: đọc lại lỗi vẫn ghi tập chuyền rồi mới báo lỗi; nhật ký phòng ban thường ghi trước; test giả lập `detail` lỗi | Đóng (`eca2b89`) |
| N2 | LOW | `po-allocation.repository.ts` | Chế độ giảm nguồn: mốc so tự phình (dòng vắng giữ `IsInOsm = 1`), lưới có dòng cũ trùng dòng mới | Cột mốc `PoAllocationRefresh.BaselineRows` (số dòng nguồn của lần làm mới đủ gần nhất), chốt giảm so với mốc này; cảnh báo nói rõ lưới có thể có dòng cũ lẫn mới; không thêm cờ "cho qua một lần" (cần API, quyền, nút riêng; mốc đã hết phình), giữ biến môi trường | Đóng (`6a6121c`) |
| N3 | LOW | `MES_Order/0009` | Migration sửa tại chỗ; `migrate` không phát hiện database đã chạy bản cũ | Chỉ các bộ database test `MES_*_T510*` đã chạy bản cũ (xóa khi dọn); database máy chủ chưa chạy. Ghi ở `02-trang-thai.md` | Đóng (tài liệu) |
| N4 | LOW | `PoAllocationPage.tsx` | Số liệu và hướng dẫn của cảnh báo chỉ ở `title`, điện thoại không xem được | Số liệu thành dòng chữ trong `Alert`; cách xử lý chỉ hiện cho người có `admin.sync:update` | Đóng (`6a6121c`) |
| N5 | LOW | `org.service.ts` | Comment sai sau khi bỏ tham số `lineNamer` | Sửa | Đóng (`eca2b89`) |

## Lượt 3 – 5.10.17 ĐVCS mặc định theo phòng ban cha (13/10/2026)
Phạm vi: `frontend/src/features/hr/DepartmentPanel.tsx`, `frontend/src/features/hr/api.ts`, `frontend/src/test/hr.test.tsx` (chỉ frontend, chưa commit). Kết luận agent: **APPROVE WITH SUGGESTIONS** (0 CRITICAL, 0 HIGH, 3 MEDIUM, 6 LOW). Agent xác nhận: máy chủ vẫn cưỡng chế đổi ĐVCS của chuyền (`admin.permission:update`, ĐVCS đang dùng, không `A00`); không có đường nào làm chuyền đổi ĐVCS mà không có hộp báo trước; người thiếu quyền không làm ĐVCS của chuyền đổi ngầm.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| P1 | MEDIUM | `DepartmentPanel.tsx` (`DepartmentForm`) | Skeleton theo `isPending`: `queryClient.clear()` (đổi ĐVCS ở tab khác) rồi trang dựng lại thì form đang sửa bị gỡ, mất phần nhập mà không hỏi | `useDepartmentOptions` dùng `placeholderData: keepPreviousData`; form dựng khi có `data`; test "cache bị xóa khi đang sửa" (hỏng khi bỏ bản sửa) | Đóng |
| P2 | MEDIUM | `DepartmentPanel.tsx` (`pickParent`) | Đổi cha làm xóa ngầm ĐVCS đã lưu (cha mới không có ĐVCS, ĐVCS đã tắt, tải danh mục lỗi, bấm lại cha đang chọn thành gốc) | Cha mới không có ĐVCS dùng được thì ô về giá trị đã lưu; `allowDeselect={false}` ở ô Phòng ban cha; tải lỗi thì không dựng form (P7) | Đóng |
| P3 | MEDIUM | `hr.test.tsx` | Thiếu test giữ ĐVCS đã chọn tay từ trước, cha không có ĐVCS, xóa tay rồi đổi cha, chú thích ô, cache | Thêm 6 bài; bài "đã chọn tay từ trước" hỏng khi bỏ điều kiện | Đóng |
| P4 | LOW | `DepartmentPanel.tsx` | `dirty` và nút Lưu lệch nhau (hỏi bỏ thay đổi khi không có gì để lưu) | `dirty = form.isDirty() && !unchanged` | Đóng |
| P5 | LOW | `DepartmentPanel.tsx` (`changedOf`) | Dữ liệu cũ chưa chuẩn hóa (tên dư khoảng trắng, `NameEn = ''`) làm nút Lưu mở khi chưa sửa | Không sửa: lưu thì chuẩn hóa dữ liệu, vô hại; dữ liệu mới đã trim ở DTO | Bỏ |
| P6 | LOW | `DepartmentPanel.tsx` (`followParent`) | ĐVCS đã tắt trùng cha: đổi cha rồi chọn lại thành xóa ngầm | Hết nhờ P2 (về giá trị đã lưu) | Đóng |
| P7 | LOW | `DepartmentPanel.tsx` | Tải danh mục lỗi vẫn dựng form với danh sách rỗng | `LoadError` kèm Thử lại, nút Hủy; test | Đóng |
| P8 | LOW | `DepartmentPanel.tsx` | Đổi ĐVCS của phòng ban có con: con không đổi theo mà không báo | Hỏi trước khi lưu, nói con giữ ĐVCS hiện tại; có lan xuống hay không là câu hỏi Q31 ở `02-trang-thai.md` | Đóng (phần báo) |
| P9 | LOW | tài liệu | Chưa ghi trạng thái, danh sách test | `02-trang-thai.md`, `08-nhan-su.md`, `12-du-lieu-mau-va-kiem-thu.md` | Đóng |

Sau khi sửa: `npm run lint`, `npm run build -w frontend` qua; frontend 26 file, 190/190 (kể cả 2 file test của luồng khác đang sửa dở trong cùng thư mục làm việc). Không chạy lại agent sau bản sửa.
