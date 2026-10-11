import { Controller, Get } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { Authenticated, CurrentUser } from '../auth/decorators';
import { CatalogLookupService } from '../catalog/catalog-lookup.service';
import { OrgService } from '../org/org.service';
import { MeService } from './me.service';

/** Thông tin của chính người dùng đăng nhập: chỉ cần access token (đã chọn nhà máy). */
@Authenticated()
@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly org: OrgService,
    private readonly catalogs: CatalogLookupService,
  ) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.me.profile(user);
  }

  @Get('branches')
  branches(@CurrentUser() user: AuthUser) {
    return this.me.branchList(user);
  }

  @Get('menu')
  menu(@CurrentUser() user: AuthUser) {
    return this.me.menu(user);
  }

  @Get('permissions')
  permissions(@CurrentUser() user: AuthUser) {
    return this.me.permissionList(user);
  }

  /** Chuyền của nhà máy đang làm việc (chọn chuyền khi xếp chuyền, dựng bảng dàn chuyền). */
  @Get('lines')
  lines(@CurrentUser() user: AuthUser) {
    return this.org.lines(user.branchCode!, user.isAggregate);
  }

  /**
   * Tên chi nhánh theo mã nhà máy (TenChiNhanh của danh mục chi nhánh BRAVO) để màn hình hiện tên thay mã ở cột Chi nhánh.
   * Mọi nhà máy, không theo nhà máy được giao: chỉ là tên hiển thị, dữ liệu vẫn lọc theo nhà máy của phiên.
   */
  @Get('branch-names')
  async branchNames() {
    return [...(await this.catalogs.branchNames())].map(([code, name]) => ({ code, name }));
  }

  @Get('field-policies')
  fieldPolicies(@CurrentUser() user: AuthUser) {
    return this.me.fieldPolicies(user);
  }
}
