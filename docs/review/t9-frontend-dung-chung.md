# Review task T9 – Chuyển phần dùng chung khỏi `features/order`

Phạm vi: 6 file mới (`frontend/src/components/StatusBadge.tsx`, `EmptyState.tsx`, `ExportButton.tsx`, `OrderFilters.tsx`, `frontend/src/lib/pagedList.ts`, `orderOptions.ts`), thêm vào `lib/lines.ts`, `lib/notify.ts`, `lib/fieldPolicy.ts`, `shell/permissions.ts`, `components/ActionButton.tsx`; rút gọn `features/order/common.tsx`, `features/order/api.ts`; đổi import ở 9 màn; tài liệu `ARCHITECTURE`, `CODE_CONVENTIONS`, 06, 10, 13, STATUS. Quyết định: Q46 (chuyển phần dùng chung của `features/order/common.tsx`, `features/order/api.ts` sang `components`/`lib`), mục 10 A3 của `ARCHITECTURE`.

Lệch gốc: màn Cắt, May dùng `features/order/common.tsx`, `features/order/api.ts` làm thư viện chung (`usePagedList`, `OrderFilters`, `useCanWrite`, `useLines`, `loadError`, `StatusBadge`, `ExportButton`, `EmptyState`…). Bản sửa: chép nguyên khối bằng script sang `components`, `lib`, `shell`, đổi import; `common.tsx` chỉ còn phần riêng của Đơn hàng (bảng trạng thái, `IssueList`, `useOriginLock`). Không đổi hành vi.

## Lượt 1 – bản sửa

Kết luận agent: APPROVE WITH SUGGESTIONS (0 CRITICAL, 0 HIGH, 2 MEDIUM, 8 LOW). Agent so bằng TypeScript parser: 34 khai báo trùng từng ký tự với `HEAD` (chỉ `StatusMap` thêm `export`); 9 màn không đổi dòng code nào ngoài import; khóa truy vấn giữ nguyên; dựng đồ thị import ở `HEAD` và bản mới: 0 vòng; các hằng mảng rỗng nhân bản không gây vẽ lại thừa. Chạy `tsc`, eslint, vitest 295/295.
Phiên chính đã kiểm chứng: đúng cả 10 phát hiện.

| # | Mức | Vị trí | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|---|
| M1 | MEDIUM | `10-giao-dien.md` mục 2, 9, 10 | Danh mục `shell/`, `components/`, `lib/` chưa có các hàm, thành phần mới (dễ viết trùng) | Bổ sung `useCanWrite`, `PICK_ROW`, `StatusBadge`, `EmptyState`, `ExportButton`, `OrderFilters`, `pagedList.ts`, `orderOptions.ts`, `readable`, `useLines`, `useLinesState`, `loadError` | Đóng |
| M2 | MEDIUM | `CODE_CONVENTIONS.md` mục 7 | Dòng mới ghi luật ranh giới import chung là CURRENT, mâu thuẫn A2/Q29 (`features/admin` còn import `hr`, `sewing`) | Thu hẹp về đúng phạm vi Q46, ghi rõ luật chung chưa có | Đóng |
| L1 | LOW | 7 dòng import | `type` xen giữa, lệch nếp của repo (`type` để cuối) | Chuyển `type` về cuối | Đóng |
| L2 | LOW | 8 màn | Import mới nối cuối khối, lệch thứ tự nhóm | Xếp lại: gói ngoài, `components`, `lib`, `shell`, `store`, `./` | Đóng |
| L3 | LOW | STATUS dòng T9 | Link báo cáo chưa có; "Quản trị" vốn không import `features/order`; số file sai | Sửa dòng T9, tạo file này | Đóng |
| L4 | LOW | `10-giao-dien.md` mục 1; ARCHITECTURE | Gạch "phần dùng chung" đặt dưới "import chéo"; thiếu `useLinesState` | Tách gạch riêng, thêm tên | Đóng |
| L5 | LOW | `shell/permissions.ts` | `lib`, `components` nay import `shell`; nếu file này import thêm `lib`, `components` sẽ sinh vòng | Thêm comment ràng buộc | Đóng |
| L6 | LOW | `lib/pagedList.ts` | Tiền tố khóa `'order'` cố định trong `lib` dễ bị "dọn" làm đổi hành vi làm mới | Thêm comment vì sao giữ | Đóng |
| L7 | LOW | `PrepPlanPage.tsx` | Tự viết `useLines` giống hệt hàm chung | Ngoài phạm vi: ghi STATUS mục 8.1 | Hoãn |
| L8 | LOW | `components/ActionButton.tsx` | Xuất thêm hằng `PICK_ROW` (chỉ ảnh hưởng Fast Refresh lúc dev) | Không sửa | Không sửa |

Sau khi sửa (21/10/2026): frontend `tsc --noEmit`, eslint, `vite build` qua; vitest 36 file, 295/295. Không đổi backend.
