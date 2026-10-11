import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC = 'mes:isPublic';
export const ALLOW_PRE_AUTH = 'mes:allowPreAuth';
export const AUTHENTICATED = 'mes:authenticated';
export const REQUIRE_PERMISSION = 'mes:requirePermission';
export const FIELD_RESOURCE = 'mes:fieldResource';

/** Không cần đăng nhập. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Cho phép token tạm (sau login, trước khi chọn nhà máy). Phải đi cùng @Authenticated. */
export const AllowPreAuth = () => SetMetadata(ALLOW_PRE_AUTH, true);
/** Chỉ cần đã đăng nhập, không đòi quyền cụ thể (việc của chính người dùng). */
export const Authenticated = () => SetMetadata(AUTHENTICATED, true);
/** Đòi đủ các quyền dạng module.resource:action. */
export const RequirePermission = (...codes: string[]) => SetMetadata(REQUIRE_PERMISSION, codes);
/**
 * Áp chính sách cột (L4) của tài nguyên cho endpoint: dữ liệu gửi lên có cột không được sửa thì 403 FIELD_READONLY,
 * dữ liệu trả về bỏ cột Ẩn, che cột Che. Đặt ở controller của mọi màn có cột đăng ký trong SysResourceField.
 */
export const FieldResource = (code: string) => SetMetadata(FIELD_RESOURCE, code);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().authUser;
});
