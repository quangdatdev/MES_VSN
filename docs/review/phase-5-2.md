# Review Phase 5.2 – Đồng bộ dữ liệu qua database trung gian

Phase 5.2 chạm migration, `platform/database` và API `/admin/*`, nên review ngay khi xong phần code (CLAUDE.md mục 2). Agent chỉ đọc, không chạy migrate/seed/test ghi DB.

## Lượt 1 – 10/10/2026
Phạm vi: 24 file (`MES_Sync/0001`, `0002`, `scripts/sync-gen.ts`, `migrate.ts`, `check-softkeys.ts`, `softkeys.json`, `database/db.ts`, `config/env.ts`, `platform/sync/*`, seed, `test/sync.spec.ts`, `SyncPage.tsx` và các file frontend liên quan, sửa lỗi `UsersPage.tsx` + `admin.test.tsx`).

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 1 | BLOCK | 0 CRITICAL, 1 HIGH, 5 MEDIUM, 13 LOW |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | HIGH | Chưa có `MES_Sync`: tedious báo lỗi đăng nhập không có mã 4060, tarn thử lại 30 giây → màn hình chờ 30 giây rồi nhận 500, SQL Server ghi hàng trăm lần đăng nhập lỗi | Hỏi trước qua kết nối `MES_Core` (`DB_ID`, `HAS_DBACCESS`) → `503 SYNC_NOT_READY` ngay; pool đồng bộ `propagateCreateError` (`failFast`) | Đóng (đã thử trên trình duyệt: báo ngay) |
| 2 | MEDIUM | Lần chạy `QUEUED` bị bỏ rơi nếu lần bấm lỗi giữa chừng hoặc mọi nguồn bị bỏ qua | `start()` luôn quét hàng đợi trong `finally`; `.finally` của vòng chạy tự chạy lại khi có yêu cầu mới; `sources()` thấy lần chờ thì quét | Đóng |
| 3 | MEDIUM | Chép tăng dần không thấy dòng bị xóa, dòng đổi nhóm, nhóm bị xóa, dòng thiếu ngày; ADR mô tả quá mức | Đối soát khóa mỗi lần tăng dần (KEY: xóa dòng không còn, đọc thêm dòng chưa có; PARTITION: so số dòng từng nhóm). Màn hình hiện lần chép toàn bộ gần nhất. ADR ghi rõ giới hạn còn lại (cột lấy từ bảng khác, lệch giờ máy trạm) | Đóng; giới hạn còn lại ghi ADR |
| 4 | MEDIUM | Collation: bảng tạm theo tempdb, so theo CI bỏ sót đổi hoa/thường, có thể lỗi 468 | Bảng chép và bảng tạm giữ collation của cột nguồn; so "có đổi" theo byte (`VARBINARY`) | Đóng (test đổi "b" → "B") |
| 5 | MEDIUM | `requestTimeout: 0` cho cả pool, không hủy được lần chạy treo | Pool màn hình giữ giới hạn mặc định; mỗi lần chép một kết nối riêng giới hạn 60 phút, đóng khi xong/quá giờ để nhả khóa, rồi `RecoverStale` | Đóng |
| 6 | MEDIUM | Thiếu test PARTITION, lỗi giữa transaction; test giữ mốc đúng tình cờ | Bảng mẫu trong `MES_Sync`, thủ tục sinh bằng `render()`: KEY (đổi hoa/thường, xóa, thiếu ngày, chạy lại không ghi), lỗi trigger giữa transaction (không ghi, giữ mốc, chạy lại được), PARTITION (đổi nhóm, xóa nhóm NULL); mốc biết trước. Test cần `MES_Sync` như các test khác cần `MES_Core`/`MES_Order`, báo rõ khi thiếu | Đóng |
| 7 | LOW | `@LockTimeout = 0` đánh lỗi oan | 5 giây | Đóng |
| 8 | LOW | Khóa phiên bị bỏ lại trên kết nối pool | Kết nối riêng mỗi lần chép; bước nhận việc vào trong `TRY` | Đóng |
| 9 | LOW | Ghi mốc và SUCCEEDED tách rời | Một transaction | Đóng |
| 10 | LOW | `OverlapMinutes = 0` có thể bỏ sót | CHECK 1–1440 | Đóng |
| 11 | LOW | Chốt chặn chỉ bắt "0 dòng", view trả thiếu một phần vẫn xóa nhiều | Giữ chốt "0 dòng" cho cả chép toàn bộ và đối soát | Hoãn: ngưỡng % cần nút chạy ép, quyết khi có dữ liệu thật chạy định kỳ |
| 12 | LOW | `EXEC @Proc` lấy tên từ bảng | Chỉ chạy thủ tục 2 phần thuộc schema `bravo` | Đóng |
| 13 | LOW | Kiểu alias, kiểu không so sánh được, nguồn toàn cột khóa | `TYPE_NAME(system_type_id)`, từ chối xml/geography/…, bỏ `UPDATE` khi không có cột thường | Đóng |
| 14 | LOW | Số đếm PARTITION gần đúng; `SyncRowId`/`SyncedAt` đổi mỗi lần | Ghi trong `db-sync.md` (lớp ánh xạ đọc theo khóa nguồn) | Đóng (tài liệu) |
| 15 | LOW | `check-softkeys` treo ở máy chưa có `MES_Sync` | Bỏ qua database chưa có, cảnh báo | Đóng |
| 16 | LOW | Nuốt lỗi `failIfQueued`; thông điệp lỗi thiếu mã/vị trí | Ghi log; `ErrorMessage` kèm `[lỗi N, thủ tục dòng L]` | Đóng |
| 17 | LOW | Giao diện: nhóm lạ bị ẩn, chọn nguồn đang khuất, tooltip không nhận focus, vùng đọc to đọc lại mỗi 30 giây | Nhóm lạ hiện "Khác"; chỉ chạy nguồn đang hiện; tooltip nhận focus; vùng đọc to chỉ báo trạng thái chạy | Đóng |
| 18 | LOW | Quy ước: tên `DB_TRUNGGIAN_NAME`, ADR nói linked server chỉ cần đổi synonym, `ModifiedAt/By` của nguồn bị ghi khi bấm, `db: any` | Ghi ngoại lệ tên biến vào ADR; sửa câu linked server; bỏ ghi `ModifiedAt/By`; đặt kiểu | Đóng |
| 19 | LOW | `lastSuccess` quét toàn `SyncRun` mỗi lần poll; mã đọc lỗi SQL trùng | Chỉ mục lọc `IX_SyncRun_Succeeded`; gom `sqlErrorNumbers` vào `common/db-errors.ts` | Đóng (xóa bớt lịch sử cũ: hoãn) |
| 20 | LOW | Test làm bẩn dữ liệu, `idle()` không chờ khởi động | `try/finally` trả bảng chép về đúng nguồn; xóa dòng `SyncRun` giả; `idle()` chờ cả bước khởi động | Đóng |

Đã kiểm, không thấy lỗi (theo agent): quyền 3 endpoint, deny by default, SQL injection ở `migrate.ts`/`EXEC @Proc`, nhật ký `SYNC_START`, quy tắc mốc (không lùi, chặn trên bằng giờ máy chủ, lỗi giữ mốc), khóa ứng dụng và `RecoverStale` khi một tiến trình, TRY/CATCH và `XACT_STATE`, giờ nguồn và giờ UTC ở API/giao diện, sửa lỗi `PickMany`.

Sau khi người dùng tạo `MES_Sync`: chạy migrate, test phát hiện lỗi 8155 ở thủ tục PARTITION (biểu thức không tên trong bảng dẫn xuất) → `0003` sinh lại thủ tục (không sửa `0002` đã chạy); test 12/12, đồng bộ thật 18 nguồn (14 thành công, 4 lỗi quyền BRAVO như dự kiến).

## Lượt 2 – 10/10/2026
Phạm vi: 17 file (phần đã sửa sau lượt 1, `0003`, test, tài liệu). Agent kiểm `0003` đúng bằng đầu ra `--procs-only` (khớp từng byte 18/18) và `0002` + `0003` cho cùng kết quả khi cài mới.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 2 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 1 MEDIUM, 7 LOW; 17/20 phát hiện lượt 1 đóng đúng |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | MEDIUM | Đối soát khóa (`#alive`) của KEY tăng dần không kiểm khóa NULL/trùng: view trả khóa NULL thì nút Đồng bộ xóa nhầm, có thể xóa sạch bảng chép | Chặn khóa NULL/trùng ngay sau khi nạp `#alive` (50003/50001); `0004` | Đóng (test khóa NULL: FAILED, không xóa) |
| 2 | LOW (#11 lượt 1) | Đối soát làm lần tăng dần (nút thường ngày) cũng xóa; view trả thiếu một phần là xóa ngay | Chốt xóa hàng loạt cho lần tăng dần (KEY và PARTITION): định xóa > 20% bảng chép và > 100 dòng thì dừng (50004), báo dùng Chép lại toàn bộ (có xác nhận) | Đóng (test 150 dòng: tăng dần dừng, chép toàn bộ xóa được) |
| 3 | LOW (#19 lượt 1) | Chỉ mục lọc `IX_SyncRun_Succeeded` không được dùng vì điều kiện truyền dạng tham số | `sql.lit('SUCCEEDED')`, `sql.lit('FULL')` | Đóng |
| 4 | LOW (#4 lượt 1) | Cột khóa chuỗi đổi hoa/thường không được ghi, bị đếm "đổi" mãi | `UPDATE` ghi cả cột khóa | Đóng |
| 5 | LOW | Quá giờ mà phiên SQL chưa đóng kịp thì lần chạy kẹt "Đang chạy" | `sources()` gọi `RecoverStale` khi thấy lần `RUNNING` quá giờ | Đóng |
| 6 | LOW | `dbReady` nhớ mãi: database bị gỡ sau đó thì trả 500 | Lỗi đăng nhập/kết nối thì hỏi lại `databaseReady()`, trả 503 | Đóng (test giả lập) |
| 7 | LOW | `> file` trên PowerShell 5.1 ghi UTF-16, hỏng tiếng Việt | `--out <file>` ghi UTF-8; tài liệu, CLAUDE.md đổi theo | Đóng |
| 8 | LOW | Test chưa chứng minh #1, #2 lượt 1; chưa có test giữ migration khớp script | Test 503; test lần chờ được chạy rồi mới xóa; `test/sync-gen.spec.ts` (không cần DB) so thủ tục migration mới nhất với `render()` – đã thử bỏ `0004` thì báo 18/18 | Đóng; test đường quá giờ (#5 lượt 1) hoãn: cần thời gian chờ tiêm được, chi phí cao so với rủi ro |
| 9 | LOW | Tài liệu thiếu `0003`, bước `--procs-only`, giới hạn dòng NULL ngày; phụ đề màn hình; `any` không chú thích | Đã sửa `db-sync.md`, ADR 0007, phụ đề, chú thích | Đóng |

**Kết quả cuối:** không còn CRITICAL/HIGH/MEDIUM mở. Test backend 109/109 (gồm 15 bài đồng bộ, 18 bài đối chiếu migration), frontend 19/19, lint và build qua. Đồng bộ thật sau `0004`: 14/18 thành công, lần tăng dần đọc vài đến vài chục dòng, 0 dòng ghi lại, lâu nhất khoảng 0,9 giây. Phần sửa sau lượt 2 kiểm bằng test và chạy thật, chưa qua agent lượt 3.

## Lượt 3 – 5.2.8a nạp dữ liệu BRAVO vào `MES_Order` – 10/10/2026
Phạm vi: 14 file (`MES_Order/0003`, `scripts/load-bravo-orders.ts`, `local-db.ts`, `reset-demo.ts`, DTO và service đơn hàng, 4 màn đơn hàng, `AuditPage.tsx`, `phase5.spec.ts`). Chạm migration và script ghi dữ liệu nên review ngay.

| Lượt | Kết luận agent | Phát hiện |
|---|---|---|
| 3 | APPROVE WITH SUGGESTIONS | 0 CRITICAL, 0 HIGH, 4 MEDIUM, 11 LOW |

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | MEDIUM | PO# nhận chữ Unicode nhưng cột `PoNumber` là `VARCHAR(40)`: chữ có dấu bị đổi thành "?" | PO# chỉ nhận ký tự ASCII in được ở API và form (nguồn BRAVO cũng là VARCHAR); dữ liệu đã nạp không có PO# ngoài ASCII | Đóng (test 422 cho PO# có dấu) |
| 2 | MEDIUM | Nhiều test vẫn ghi vào dòng đầu của dữ liệu đang có (dữ liệu thật) và dựa vào phân bố dữ liệu | Đơn hàng riêng của test thêm PO đã xác nhận, kế hoạch đang sản xuất có dòng đang may ở chuyền 5, dòng chuyền 3; 6 test có ghi chuyển sang đơn này; test A00 so tổng theo nhà máy thay vì tập nhà máy của trang đầu | Đóng (test chỉ đọc vẫn cần có đơn ở A01, A02 – ghi ở `db-order.md`) |
| 3 | MEDIUM | Script không kiểm dữ liệu nguồn theo quy tắc nhập tay (cỡ lạ, quá 300 ô): sửa trên màn hình sẽ bị 422 | Kiểm trên dữ liệu thật: 0 cỡ ngoài quy tắc, nhiều nhất 121 ô mỗi PO, 147 ô mỗi đơn. Quy tắc chuyển vào `order.rules.ts` dùng chung cho DTO và script; script báo số PO, ô vi phạm sau khi nạp | Đóng |
| 4 | MEDIUM | Sau khi nạp, dữ liệu thật mở cho cả mạng LAN (`HOST=0.0.0.0`, mật khẩu demo chung) | Script in nhắc sau mỗi lần nạp; `db-order.md` ghi cách khóa (`HOST=127.0.0.1` hoặc đổi `DEMO_PASSWORD`) | Chờ người dùng chọn |
| 5 | LOW | Mã hàng còn lọt ký tự định dạng ẩn, ngắt dòng Unicode; độ dài đo trước khi đổi chữ hoa | Chặn `\p{C}`, `\p{Zl}`, `\p{Zp}`; đổi chữ hoa trong bước chuyển đổi rồi mới kiểm `MaxLength(120)` | Đóng (test) |
| 6 | LOW | Lọc mã hàng trên bảng dàn chuyền phân biệt hoa thường | So sánh sau khi đổi chữ hoa | Đóng |
| 7 | LOW | Dữ liệu nguồn bất thường (PO# hay màu NULL, SL âm, nhà máy chữ thường, số đơn ngoài ASCII, Loại chưa làm sạch) | Lọc NULL, SL âm thành 0, đổi mã nhà máy chữ hoa, số đơn ngoài ASCII dùng `SP-<ProductId>`, Loại qua `clean()` | Đóng (test số đơn) |
| 8 | LOW | Thêm mã vào tên màu trùng tính theo PO, kế hoạch gộp màu không cùng cách với service | Tính tên trùng theo cả đơn; kế hoạch gộp theo đúng tên như `csKey` | Đóng (test) |
| 9 | LOW | Thời gian chờ mặc định 15 giây cho câu xóa, chèn cả bảng | 10 phút cho kết nối của script | Đóng |
| 10 | LOW | `DBCC CHECKIDENT` trong transaction có thể không rollback | Thử trên bảng nháp: RESEED rollback cùng transaction (mốc giữ 5, dòng chèn sau nhận Id 6) | Không phải lỗi |
| 11 | LOW | `SourceProductId` chưa khai báo khóa ngầm; script đọc thẳng `MES_Sync` khác ADR 0007 | Ghi là ngoại lệ tạm của 5.2.8a trong `db-order.md` (khóa nguồn ngoài, script chạy tay); 5.2.8 làm qua service công khai | Đóng (tài liệu) |
| 12 | LOW | Hàm `loadBravoOrders` xuất ra ngoài không tự kiểm máy cục bộ; `createDb<any>` thiếu chú thích | Gọi `assertLocalDb` trong hàm; thêm chú thích | Đóng |
| 13 | LOW | Phụ đề màn Thông tin đơn hàng còn ghi "Chưa đồng bộ BRAVO" | "nạp từ BRAVO hoặc nhập tay" | Đóng |
| 14 | LOW | Thiếu test kiểm hợp lệ mới và các hàm thuần của script | Test mã hàng (phase3), PO#/cỡ (phase5), `test/load-bravo.spec.ts` (5 bài, không cần DB) | Đóng |
| 15 | LOW | Lập kế hoạch cho đơn đã xong/hủy vẫn được qua API; popup cắt 200 dòng không báo; lô chèn chưa chặn 1.000 dòng | `create()` từ chối đơn Hoàn thành/Hủy; popup báo khi đang hiện 200 mã hàng đầu; lô tối đa 1.000 dòng | Đóng |

**Kết quả:** không còn CRITICAL/HIGH; 3/4 MEDIUM đóng, #4 chờ người dùng chọn cách khóa. Test backend 116/116 (7 bộ), frontend 19/19, lint và build qua. Nạp lại sau khi sửa: số liệu không đổi (1.521 đơn, 7.698 PO, 37.652 ô màu cỡ), không có dữ liệu vi phạm quy tắc nhập tay; kiểm nhất quán (tổng màu cỡ = SL PO, ngày xuất đơn = ETD sớm nhất, chuyền không chồng lịch) đều 0 lỗi. Phần sửa sau lượt 3 kiểm bằng test, chưa qua agent lượt 4.

## Lượt 4–5 – 5.2.8b dàn chuyền mô phỏng (`sim:board`) – 10/10/2026

Phạm vi: `backend/scripts/simulate-board.ts` (mới), `scripts/script-db.ts` (mới), `scripts/load-bravo-orders.ts`, `test/simulate-board.spec.ts`, `test/simulate-board.db.spec.ts` (mới), `test/load-bravo.spec.ts`, lệnh `sim:board` trong `package.json`. Review ngay vì là script ghi dữ liệu (`docs/review/README.md`).

**Lượt 4:** APPROVE WITH SUGGESTIONS, 0 CRITICAL, 0 HIGH, 5 MEDIUM, 12 LOW.

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | MEDIUM | Khôi phục trạng thái đơn khi xóa mô phỏng ghi đè trạng thái người dùng tự đặt; đơn có thể kẹt ở "Đã lập kế hoạch" | Chỉ chọn đơn đang đúng trạng thái lúc nạp (`closedAtLoad`), nên khôi phục trả đúng trạng thái trước mô phỏng. Đơn kẹt không tự sửa, chỉ đếm và cảnh báo | Đóng (test DB: đơn nhập tay và đơn BRAVO tự đặt Hoàn thành không bị chọn; hai nhánh khôi phục) |
| 2 | MEDIUM | Phần người dùng sửa trên kế hoạch mô phỏng (thêm dòng, phân màu cỡ, ngày chuẩn bị SX) mất im lặng khi chạy lại | Giữ kế hoạch có `ModifiedAt` ở kế hoạch, màu cỡ, dòng, phân màu cỡ; dòng thêm sau kế hoạch hơn 10 phút; dòng có dữ liệu ở Kế hoạch chuẩn bị SX (khớp Id và thời điểm tạo). Dòng của kế hoạch giữ lại thành vùng bận. `--all` để xóa cả. Lời nhắc nói rõ phần giữ, phần mất, thời gian khóa | Đóng (test DB đủ năm cách nhận diện và `--all`) |
| 3 | MEDIUM | Tình huống "chưa phân màu cỡ sát ngày" vắng ở 24–59% số ngày; test qua nhờ hạt giống | Ép tình huống chưa gặp sau 3 lần đủ điều kiện (tách đợt, xếp một phần, nhiều chuyền, trễ); hậu xử lý bảo đảm ba mức phân màu cỡ; nhà máy ít đơn giữ đơn cho kế hoạch chưa xếp | Đóng (test 24 ngày × 6/8/12 chuyền, 12 tình huống) |
| 4 | MEDIUM | Chưa có test DB cho `clearSimulated`, `simulateBranch` | `test/simulate-board.db.spec.ts`: nhà máy giả ZT1/ZT2, transaction rồi hủy | Đóng |
| 5 | MEDIUM | `db-order.md` mô tả cách mô phỏng cũ | Mục "Dàn chuyền mô phỏng (`sim:board`)"; lệnh trong CLAUDE.md mục 8; task 5.2.8b | Đóng |
| 6–17 | LOW | Thanh bị dòng dài đẩy ra ngoài khoảng; chia màu cỡ từng dòng độc lập lệch tổng; khóa màu cỡ chưa chuẩn hóa Unicode; `RIGHT(…, 6)` cắt Id 7 số; khoảng 2.000 câu lệnh; đợt sau vào chuyền trước đợt đầu; năng suất vô lý ở đơn rất lớn; chú thích sai; `any`; lời nhắc; hàm dùng chung đặt trong script mô phỏng; UPDATE số PO không lọc nhà máy; nhật ký ghi sau commit | Sửa hết: bỏ chuyền khi thanh ra ngoài khoảng; `lineShares` chia hai chiều; `cellKey` (NFC, chữ thường, bỏ khoảng trắng cuối); `docNoSql` (dùng cả ở `load:bravo`); ghi theo lô; `firstStart`; trần 700 sp/ngày; kiểu `SalesOrderStatus`; `script-db.ts`; chú thích vì sao UPDATE số PO không lọc nhà máy (nạp lại toàn bảng); nhật ký lỗi thì in cảnh báo. Giữ `as any` khi ghi `SysAuditLog` (cùng mẫu `load:bravo`) và `Kysely<any>` ở `insertAll` (có ghi lý do) | Đóng |

**Lượt 5:** APPROVE WITH SUGGESTIONS, 0 CRITICAL, 0 HIGH. Xác nhận mọi mục lượt 4 đã đóng (thăm dò 720 lượt chạy: không chồng lịch, năng suất ≤ 700, không thanh ngoài khoảng, phân màu cỡ đúng, đợt sau không trước đợt đầu).

| # | Mức | Vấn đề | Xử lý | Trạng thái |
|---|---|---|---|---|
| 1 | MEDIUM | Trần 9.800 sp mỗi dòng (sửa ở lượt 4) làm kế hoạch "Hoàn thành" còn SL chưa xếp, lũy kế may vượt SL đã xếp | Kế hoạch đã may xong mà còn dư: thu về SL đã may, phần dư thành kế hoạch chưa xếp chuyền của cùng đơn | Đóng (bất biến "Hoàn thành thì xếp đủ" trong bài chính và 72 lượt `it.each`, dữ liệu test thêm đơn 32.000) |
| 2 | LOW | Test DB chỉ phủ một cách nhận diện "đã sửa" | Thêm dòng có `ModifiedAt`, dòng thêm sau 11 phút, phân màu cỡ có `ModifiedAt`, dòng có ngày chuẩn bị SX, bản chép cũ khác thời điểm tạo | Đóng |
| 3 | LOW | Dòng có dữ liệu chuẩn bị SX khớp chỉ theo Id; đọc ngoài transaction | Khớp thêm thời điểm tạo như `syncFromSchedule`; đọc ngoài transaction ghi chú trong code (hai database không có transaction chung) | Đóng |
| 4 | LOW | File test thuần cần SQL Server | Tách bài DB sang `simulate-board.db.spec.ts` | Đóng |
| 5 | LOW | Kế hoạch mô phỏng đã sửa giữ mãi | Cờ `--all` | Đóng |
| 6 | LOW | Ép kế hoạch nhiều chuyền có thể không cùng lúc | Chỉ ép khi chuyền thứ hai rảnh trong vòng 7 ngày | Đóng |

**Kết quả:** không còn CRITICAL/HIGH/MEDIUM. Test backend 183/183 (14 bộ), lint và `tsc` qua. Đã chạy `sim:board` trên localhost: A01 164 kế hoạch/179 dòng dàn chuyền, A02 68/82, A03 76/76; mọi chuyền có việc, đủ bốn trạng thái thanh, không chồng lịch. Phần sửa sau lượt 5 kiểm bằng test, chưa qua agent lượt 6.
