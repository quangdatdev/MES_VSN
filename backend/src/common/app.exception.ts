import { HttpException } from '@nestjs/common';

/** Lỗi nghiệp vụ có mã ổn định để frontend xử lý (xem docs/thiet-ke/api-contract.md). */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: number,
    readonly details: unknown = null,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  unauthenticated: (msg = 'Bạn cần đăng nhập.') => new AppException('UNAUTHENTICATED', msg, 401),
  tokenExpired: () => new AppException('TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn.', 401),
  invalidCredentials: () => new AppException('INVALID_CREDENTIALS', 'Sai tên đăng nhập hoặc mật khẩu.', 401),
  accountLocked: (until: Date) =>
    new AppException('ACCOUNT_LOCKED', 'Tài khoản tạm thời bị khóa do đăng nhập sai nhiều lần.', 423, { until }),
  permissionDenied: () => new AppException('PERMISSION_DENIED', 'Bạn không có quyền thực hiện thao tác này.', 403),
  branchNotAllowed: () => new AppException('BRANCH_NOT_ALLOWED', 'Bạn không được phép chọn đơn vị cơ sở này.', 403),
  endpointNotDeclared: () =>
    new AppException('ENDPOINT_NOT_DECLARED', 'Endpoint chưa khai báo quyền truy cập.', 403),
  notFound: (msg = 'Không tìm thấy dữ liệu.') => new AppException('NOT_FOUND', msg, 404),
  aggregateReadOnly: () =>
    new AppException('AGGREGATE_READ_ONLY', 'Chế độ xem tổng hợp chỉ đọc. Hãy chọn một đơn vị cơ sở cụ thể để thêm hoặc sửa dữ liệu.', 403),
  selfElevation: (msg = 'Bạn không được tự thay đổi quyền của chính mình.') => new AppException('SELF_ELEVATION_FORBIDDEN', msg, 403),
  conflict: (msg: string) => new AppException('CONFLICT', msg, 409),
  payloadTooLarge: (limitBytes?: number) =>
    new AppException(
      'PAYLOAD_TOO_LARGE',
      `Dữ liệu gửi lên quá lớn${limitBytes ? ` (tối đa ${Math.round(limitBytes / 1024)} KB)` : ''}. Hãy chia nhỏ rồi lưu lại.`,
      413,
      limitBytes ? { limitBytes } : null,
    ),
  codeImmutable: () => new AppException('CODE_IMMUTABLE', 'Mã không được sửa sau khi đã tạo. Chỉ sửa được tên.', 422),
  scopeDenied: () =>
    new AppException('SCOPE_DENIED', 'Dữ liệu này nằm ngoài phạm vi bạn được giao (chuyền, đơn vị cơ sở, nhà máy SX hoặc người tạo).', 403),
  /** Dòng dùng chung mà ĐVCS giữ dòng suy từ Nhà máy SX (Phân bổ PO, Phase 5.10 Q2): có dòng thuộc nhà máy của ĐVCS khác */
  factoryOfOtherBranch: (rows: number, total: number) =>
    new AppException(
      'FACTORY_OF_OTHER_BRANCH',
      `Có ${rows.toLocaleString('vi-VN')}/${total.toLocaleString('vi-VN')} dòng (cùng SO, PO, Style No, Màu với dòng đã chọn) đang thuộc nhà máy SX của đơn vị cơ sở khác. Chỉ đơn vị cơ sở quản lý nhà máy đó đổi được; không dòng nào được đổi.`,
      403,
      { rows, total },
    ),
  fieldReadonly: (fields: string[], names: string[] = []) =>
    new AppException('FIELD_READONLY', names.length ? `Bạn không được sửa cột: ${names.join(', ')}.` : 'Bạn không được sửa một số cột trong dữ liệu gửi lên.', 403, { fields }),
  syncNotReady: () =>
    new AppException(
      'SYNC_NOT_READY',
      'Chưa có database đồng bộ (MES_Sync), tài khoản ứng dụng chưa được cấp quyền vào, hoặc chưa chạy migration. Nhờ quản trị CSDL tạo database và cấp quyền, rồi chạy npm run migrate.',
      503,
    ),
  resourceNotRegistered: (code: string) =>
    new AppException('RESOURCE_NOT_REGISTERED', `Tài nguyên "${code}" chưa khai báo hợp lệ trong danh bạ tài nguyên.`, 500),
};
