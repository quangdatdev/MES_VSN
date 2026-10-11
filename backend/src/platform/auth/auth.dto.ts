import { IsString, Length, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(1, 50)
  username: string;

  @IsString()
  @Length(1, 200)
  password: string;
}

/** Đây là yêu cầu chọn nhà máy (không phải điều kiện lọc): server kiểm với SysUserBranch rồi mới cấp token. */
export class SelectBranchDto {
  @IsString()
  @MaxLength(10)
  branchCode: string;
}
