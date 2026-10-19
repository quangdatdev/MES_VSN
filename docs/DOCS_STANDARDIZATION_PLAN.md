# DOCS STANDARDIZATION PLAN

## 1. Mục tiêu

Chuẩn hóa và tinh gọn toàn bộ tài liệu Markdown của dự án dựa trên source code thực tế.

Bộ tài liệu sau chuẩn hóa phải trở thành nguồn tham chiếu thống nhất cho:
- Dev team.
- Tech Lead.
- Claude Code và các AI coding agent.
- Quy trình phát triển, kiểm thử, review và bảo trì về sau.

Mục tiêu không phải tăng số lượng tài liệu, mà là loại bỏ thông tin trùng lặp, thống nhất cách diễn đạt và bảo đảm mọi hướng dẫn đều có căn cứ.

## 2. Nguyên tắc bắt buộc

1. Source code và cấu hình thực tế là căn cứ để xác minh kiến trúc đang tồn tại.
2. Không mặc định tài liệu hiện có luôn đúng; phải đối chiếu với source code.
3. Không biến đề xuất mới thành quy tắc chính thức nếu chưa được Tech Lead phê duyệt.
4. Mỗi nội dung phải có một tài liệu sở hữu chính thức; tài liệu khác chỉ tham chiếu khi cần.
5. Không tự ý thay đổi source code, nghiệp vụ, API, database schema hoặc kiến trúc ứng dụng trong nhiệm vụ chuẩn hóa docs.
6. Không xóa tài liệu hiện có khi chưa xác định đầy đủ nội dung, mức độ sử dụng và phương án chuyển đổi.
7. Không đưa secret, password, token, dữ liệu cá nhân hoặc thông tin kết nối nhạy cảm vào docs.
8. Không tạo ra thông tin giả định về công nghệ, module, API, luồng nghiệp vụ, lệnh chạy hoặc quy trình Git.
9. Mọi kết luận chưa đủ bằng chứng phải ghi rõ NEEDS VERIFICATION.
10. Ưu tiên tài liệu ngắn gọn, có cấu trúc, dễ tìm, dễ cập nhật và phục vụ trực tiếp công việc phát triển.

## 3. Cấu trúc tài liệu mục tiêu

### Root

- `CLAUDE.md`

### docs/

- `PROJECT_OVERVIEW.md`
- `ARCHITECTURE.md`
- `DATA_FLOWS.md`
- `CODE_CONVENTIONS.md`
- `ENGINEERING_STANDARDS.md`
- `DEVELOPMENT_WORKFLOW.md`

Không tạo thêm tài liệu cấp cao nếu chưa chứng minh được nhu cầu.

Nếu repository đã có file tương đương, hãy ưu tiên hợp nhất vào file mục tiêu thay vì tạo bản sao.

## 4. Phạm vi nhiệm vụ

### Giai đoạn 1 — Kiểm kê và phân tích tài liệu hiện tại

Khảo sát:
- Toàn bộ file Markdown trong repository.
- Các file hướng dẫn AI coding agent hiện có.
- README, tài liệu kiến trúc, convention, nghiệp vụ và triển khai.
- Các file cấu hình, manifests, scripts và test cần thiết để xác minh tài liệu.
- Các hướng dẫn hoặc quy tắc bị lặp, mâu thuẫn, lỗi thời hoặc không có bằng chứng.

Lập bảng kiểm kê gồm:
- Đường dẫn file.
- Mục đích.
- Nội dung chính.
- Tình trạng: CURRENT / PARTIALLY CURRENT / OUTDATED / DUPLICATED / UNVERIFIED.
- File mục tiêu sẽ tiếp nhận nội dung.
- Nội dung cần giữ, hợp nhất, viết lại hoặc đề xuất ngừng sử dụng.

Không kết luận file đã lỗi thời chỉ vì chưa tìm thấy bằng chứng trong một lần tìm kiếm.

### Giai đoạn 2 — Khảo sát source code

Xác minh:
- Tech stack và phiên bản.
- Cấu trúc repository.
- Entry points.
- Các module và trách nhiệm.
- Dependency giữa module.
- API contracts.
- Cách truy cập database.
- Authentication, authorization và data scope.
- Luồng đọc/ghi dữ liệu.
- Các hệ thống tích hợp.
- Cách xử lý lỗi.
- Scripts build, lint, test và khởi chạy thực tế.

Truy vết code trước khi mô tả luồng. Không chỉ suy luận từ tên file.

Với mỗi kết luận quan trọng, ghi đường dẫn file và tên function, method, class hoặc cấu hình liên quan. Ghi số dòng nếu xác định được đáng tin cậy.

### Giai đoạn 3 — Lập bản đồ hợp nhất

Trước khi ghi đè hoặc xóa tài liệu cũ, xác định:
- Nội dung nào được giữ nguyên.
- Nội dung nào cần cập nhật.
- Nội dung nào trùng lặp và có thể hợp nhất.
- Nội dung nào không còn đúng với source code.
- Nội dung nào là đề xuất mới cần Tech Lead phê duyệt.
- Những tài liệu nào có liên kết nội bộ cần cập nhật.

Ưu tiên hợp nhất theo cấu trúc mục tiêu ở mục 3.

Không bỏ thông tin nghiệp vụ quan trọng chỉ vì muốn giảm số lượng file.

### Giai đoạn 4 — Điền nội dung tài liệu mục tiêu

#### A. CLAUDE.md

Chỉ chứa:
- Mục đích và phạm vi repository.
- Các nguyên tắc bắt buộc khi sửa code.
- Thứ tự đọc các tài liệu liên quan.
- Quy tắc bảo vệ kiến trúc và contract.
- Quy tắc xử lý khi thiếu thông tin.
- Các lệnh kiểm tra đã xác minh.
- Yêu cầu kiểm thử và báo cáo kết quả.

Không sao chép toàn bộ nội dung của các file docs khác vào đây.

Nếu đã có CLAUDE.md, phải giữ lại và hợp nhất các quy tắc hữu ích.

#### B. docs/PROJECT_OVERVIEW.md

Chứa:
- Mục đích dự án.
- Phạm vi nghiệp vụ.
- Tech stack.
- Các thành phần hệ thống.
- Cấu trúc repository ở mức tổng quan.
- Cách cài đặt, chạy và kiểm tra cơ bản.
- Các phụ thuộc quan trọng.

Không mô tả chi tiết từng function hoặc từng luồng nghiệp vụ.

#### C. docs/ARCHITECTURE.md

Chứa:
- Kiến trúc tổng thể.
- Các layer và trách nhiệm.
- Các module.
- Quan hệ dependency.
- Shared components và contracts.
- Các ranh giới kiến trúc cần bảo vệ.
- Sơ đồ Mermaid.
- Các vấn đề kiến trúc cần quyết định.

Không áp đặt một kiến trúc lý tưởng chưa tồn tại trong source code.

#### D. docs/DATA_FLOWS.md

Chứa các luồng dữ liệu quan trọng:
- Authentication và authorization.
- Đọc dữ liệu.
- Ghi/cập nhật/xóa dữ liệu.
- Các luồng nghiệp vụ xuyên module.
- Integration và đồng bộ.
- Background jobs hoặc queue nếu có.
- Xử lý lỗi, retry, transaction và idempotency khi có bằng chứng.

Mỗi luồng cần nêu điểm bắt đầu, thứ tự gọi, file/function liên quan, dữ liệu vào/ra, điểm kiểm tra quyền và các trường hợp lỗi.

Dùng Mermaid khi giúp thể hiện luồng rõ hơn.

#### E. docs/CODE_CONVENTIONS.md

Chứa quy tắc:
- Đặt tên.
- Cấu trúc file và module.
- Component, function, service và utility.
- API contracts và types.
- Validation và error handling.
- Truy cập database.
- Tái sử dụng code.
- Tổ chức test.

Phân biệt rõ:
- CURRENT CONVENTION: cách làm đang được xác minh trong code.
- APPROVED STANDARD: quy tắc mới đã được phê duyệt.
- PROPOSED STANDARD: đề xuất chưa được phê duyệt.
- NEEDS VERIFICATION: chưa đủ bằng chứng.

Với mỗi quy tắc quan trọng, cung cấp ví dụ đúng, ví dụ cần tránh và vị trí tham chiếu trong source code khi có thể.

#### F. docs/ENGINEERING_STANDARDS.md

Chứa tiêu chuẩn:
- Testing.
- Security.
- Authorization và data scope.
- Data integrity.
- Transaction và concurrency.
- Migration và rollback.
- Logging và audit.
- Dependency/security checks.
- Build và CI quality gates.
- Definition of Done về kỹ thuật.

Phân biệt rõ yêu cầu hiện đang được tự động kiểm tra với yêu cầu mới chỉ là hướng dẫn thủ công.

Không tự đặt ra coverage threshold hoặc CI command chưa được xác minh và phê duyệt.

#### G. docs/DEVELOPMENT_WORKFLOW.md

Chứa quy trình phát triển thống nhất:
- Điều kiện nhận task.
- Task scope và acceptance criteria.
- Quy tắc branch.
- Vai trò của Develop.
- Pull Request.
- Code review.
- Điều kiện merge.
- Conflict resolution.
- Revert, hotfix và rollback.

Trước tiên phải kiểm tra Git workflow thực tế và các quy định hiện có.

Những nội dung chưa được Tech Lead xác nhận phải ghi PROPOSED, không tự động biến thành quy định bắt buộc.

### Giai đoạn 5 — Chuẩn hóa liên kết và loại bỏ trùng lặp

- Kiểm tra các đường dẫn Markdown.
- Kiểm tra các liên kết đến file đã di chuyển hoặc hợp nhất.
- Loại bỏ các đoạn văn trùng lặp sau khi đã xác minh không làm mất thông tin.
- Giữ lại các quy tắc nghiệp vụ cần thiết.
- Đảm bảo CLAUDE.md dẫn đến đúng tài liệu.
- Đảm bảo không có tài liệu nào mô tả một quy tắc mâu thuẫn với nguồn chính thức.

Đối với tài liệu cũ:
- Không xóa ngay.
- Lập danh sách file đề xuất ngừng sử dụng.
- Chỉ xóa hoặc di chuyển sau khi có phê duyệt.
- Không để tài liệu cũ tiếp tục được trình bày như nguồn chính thức nếu nội dung đã được thay thế.

## 5. Quy tắc chất lượng nội dung

Mỗi tài liệu phải:
- Có mục đích rõ ràng.
- Có phạm vi và đối tượng sử dụng.
- Có heading nhất quán.
- Có đường dẫn tham chiếu tương đối phù hợp.
- Không chứa nội dung trùng lặp không cần thiết.
- Phân biệt sự thật đã xác minh với đề xuất.
- Có thông tin về những phần chưa xác minh khi cần.
- Đủ ngắn để dễ đọc nhưng không bỏ sót thông tin quan trọng.

Ưu tiên bảng khi so sánh hoặc liệt kê thuộc tính; dùng Mermaid khi cần biểu diễn kiến trúc hoặc trình tự.

Không tạo nội dung chỉ để lấp đầy các heading.

## 6. Quy trình thực hiện an toàn

Thực hiện theo từng giai đoạn, không chạy toàn bộ một cách mù quáng.

1. Khảo sát và lập báo cáo kiểm kê.
2. Đưa ra bản đồ hợp nhất và danh sách các điểm chưa xác minh.
3. Xác định các quyết định cần Tech Lead duyệt.
4. Sau khi được phép, cập nhật các tài liệu mục tiêu.
5. Kiểm tra tính nhất quán và liên kết.
6. Báo cáo các thay đổi.

Trong suốt quá trình:
- Không sửa source code ứng dụng.
- Không sửa database hoặc chạy migration.
- Không thay đổi pipeline triển khai.
- Không tự động xóa tài liệu cũ.
- Không ghi secret vào tài liệu.
- Không tự thay đổi nghiệp vụ hoặc kiến trúc.

Nếu chưa được phép thực hiện giai đoạn tiếp theo, hãy dừng tại giai đoạn hiện tại và trình bày kết quả.

## 7. Tiêu chí nghiệm thu

Bộ docs được coi là đạt khi:
- Các thành phần và luồng dữ liệu quan trọng phản ánh đúng source code.
- Các kết luận kiến trúc có thể truy vết.
- Không có hai tài liệu cùng đóng vai trò nguồn chính thức cho một quy tắc.
- Các quy tắc hiện tại được phân biệt với đề xuất.
- Codex có thể xác định tài liệu cần đọc khi nhận một task.
- Các lệnh và quy trình được ghi nhận đều đã xác minh.
- Các liên kết nội bộ hoạt động.
- Không có thay đổi ngoài phạm vi docs được phê duyệt.
- Có danh sách các vấn đề còn cần Tech Lead quyết định.

## 8. Báo cáo cuối cùng

Sau khi hoàn thành, báo cáo:
1. Cấu trúc docs trước và sau chuẩn hóa.
2. Danh sách file được tạo mới hoặc cập nhật.
3. Danh sách tài liệu được hợp nhất và lý do.
4. Các convention đã xác minh.
5. Các nội dung mới đề xuất nhưng chưa được duyệt.
6. Những điểm kiến trúc hoặc luồng dữ liệu chưa xác minh.
7. Các tài liệu cũ đề xuất ngừng sử dụng.
8. Kết quả kiểm tra liên kết và tính nhất quán.
9. Các quyết định còn cần Tech Lead phê duyệt.

Ưu tiên tính chính xác, khả năng truy vết và khả năng sử dụng lâu dài hơn việc hoàn thành thật nhiều tài liệu trong một lần.