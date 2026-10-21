import type { Masked } from '../../lib/fieldPolicy';

export type StepState = 'DONE' | 'DONE_LATE' | 'OVERDUE' | 'PENDING';
/** Trạng thái vào chuyền (V/C): chưa đến ngày vào chuyền; đã đến ngày mà còn bước chưa có TH; đã nhập đủ TH */
export type PrepStatus = 'NOT_DUE' | 'NOT_READY' | 'READY';

/** Một bước của danh mục Cấu hình chuẩn bị SX */
export interface PrepStep {
  id: number;
  code: string;
  name: string;
  description: string | null;
  planDays: number;
  performer: string | null;
  dataSource: string | null;
  sortOrder: number;
  isActive: boolean;
}

/** Một bước của một dòng: KH = Ngày vào chuyền - số ngày KH (chỉnh riêng, không thì theo danh mục) */
export interface PrepStepValue {
  stepId: number;
  planDays: number;
  custom: boolean;
  planDate: string;
  doneDate: string | null;
  state: StepState;
}

/** Một dòng dàn chuyền của màn Kế hoạch chuẩn bị SX. Cột bị Che trả "***", cột bị Ẩn không có trong dữ liệu. */
export interface PrepRow {
  id: number;
  branchCode: string;
  planNo?: Masked<string>;
  customerName?: Masked<string>;
  styleCode?: Masked<string>;
  productName?: Masked<string>;
  lineCode?: Masked<string>;
  /** Tên chuyền do máy chủ tra, kể cả chuyền đã ngừng; chuyền mồ côi là "<mã> (chuyền cũ)". Không có khi Tổ SX bị Ẩn hoặc Che */
  lineName?: string;
  lineQty?: Masked<number>;
  startDate?: Masked<string>;
  styleType?: Masked<string | null>;
  confirmedQty?: Masked<number | null>;
  priorityFactor?: Masked<number | null>;
  steps?: Masked<PrepStepValue[]>;
  statusCode?: Masked<PrepStatus>;
  /** Thời điểm tạo dòng dàn chuyền gốc */
  createdAt?: string;
  /** Dòng nằm trong phạm vi sửa của người xem (danh sách); máy chủ vẫn kiểm khi lưu */
  canEdit?: boolean;
}

export interface PrepPage {
  items: PrepRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Hôm nay theo giờ Việt Nam của máy chủ: mốc tính trễ hạn */
  today: string;
  /** Các bước đang dùng, theo thứ tự cột */
  stepInfo: PrepStep[];
}

export interface PrepDetail extends PrepRow {
  /** Bước đang dùng, cộng bước đã ngừng mà dòng còn ngày đã nhập */
  stepInfo: PrepStep[];
  /** Hôm nay theo giờ Việt Nam của máy chủ */
  today: string;
}

/** Tên trạng thái theo đúng chữ người dùng dùng (10/10/2026) */
export const PREP_STATUS: Record<PrepStatus, { label: string; hint: string }> = {
  NOT_READY: { label: 'Chưa đủ đk V/C', hint: 'Đã đến ngày vào chuyền mà còn bước chưa nhập ngày TH' },
  NOT_DUE: { label: 'Chưa đến ngày V/C', hint: 'Chưa đến ngày vào chuyền (nhập đủ ngày TH hay chưa cũng vậy)' },
  READY: { label: 'Đủ điều kiện V/C', hint: 'Đã nhập ngày TH cho mọi bước' },
};

/** Kết quả lưu các ô TH nhập trên bảng */
export interface PrepDoneSaved {
  rows: number;
  cells: number;
}

// ---------- Kế hoạch may (sewing.plan, phase 5.16) ----------

/**
 * Một dòng dàn chuyền trong ngày của màn Kế hoạch may. Cột bị Che trả "***", bị Ẩn thì không có; số suy ra (Còn lại, Doanh số,
 * otherBefore, otherAfter) là null khi cột gốc không xem được.
 */
export interface SewingPlanItem {
  lineId: number;
  lineCreatedAt: string;
  planId: number;
  branchCode: string;
  lineCode?: Masked<string>;
  /** Tên chuyền; không có khi Tổ SX bị Ẩn, Che */
  lineName?: string;
  styleCode?: Masked<string>;
  productName: string;
  poBuyDate?: Masked<string>;
  cmPrice?: Masked<number | null>;
  startDate?: Masked<string | null>;
  endDate?: Masked<string | null>;
  planQty?: Masked<number>;
  deliveredQty?: Masked<number>;
  remainQty?: Masked<number | null>;
  linemapQty?: Masked<number | null>;
  dayQty?: Masked<number | null>;
  planRevenue?: Masked<number | null>;
  startTime?: Masked<string>;
  endTime?: Masked<string>;
  /** Tổng Kế hoạch ngày xưởng giao các ngày trước, sau ngày đang xem (để tính khi gõ) */
  otherBefore: number | null;
  otherAfter: number | null;
  saved: boolean;
  /** Chuyền chưa có bản ghi trong ngày: lần đầu lập cần quyền Thêm */
  firstOfDay?: boolean;
  locked: boolean;
  /** Dòng dàn chuyền không còn ở Xếp chuyền: hiện theo bản chụp, chỉ xem */
  sourceGone: boolean;
  canEdit: boolean;
}

/** Một chuyền đang hiện trong ngày: trạng thái chốt, phiên bản (người khác vừa ghi thì 409) */
export interface SewingPlanLine {
  branchCode: string;
  lineCode: string;
  lineName?: string;
  locked: boolean;
  lockedAt: string | null;
  lockerName: string | null;
  version: string;
  canEdit: boolean;
}

export interface SewingPlanDay {
  date: string;
  today: string;
  /** Ngày sửa được: không ở A00, có quyền Sửa, không trước hôm nay */
  editableDay: boolean;
  lines: SewingPlanLine[];
  items: SewingPlanItem[];
}

/** Dòng dàn chuyền để Thêm dòng (chuyền → mã hàng → PO/Buy date) */
export interface SewingPlanOption {
  lineId: number;
  lineCreatedAt: string;
  branchCode: string;
  lineCode?: Masked<string>;
  lineName?: string;
  styleCode?: Masked<string>;
  productName: string;
  poBuyDate?: Masked<string>;
  startDate?: Masked<string>;
  endDate?: Masked<string>;
  planQty?: Masked<number>;
}

/** Phân cụm trưởng (phase 5.18): một tổ (chuyền may) người đăng nhập thấy */
export interface ClusterTeam {
  id: number;
  branchCode: string;
  lineCode: string;
  /** Tên tổ theo cây sơ đồ tổ chức; chuyền không còn là "<mã> (chuyền cũ)" */
  lineName: string;
  /** Người đăng nhập là tổ trưởng của tổ, có quyền Sửa, tổ trong phạm vi sửa, không ở A00 */
  canEdit: boolean;
}

export interface ClusterTeams {
  /** Tài khoản đã gắn với nhân viên */
  linked: boolean;
  /** Là tổ trưởng của ít nhất một tổ: khi đó chỉ có tổ của mình */
  leader: boolean;
  items: ClusterTeam[];
}

/** Mã hàng đã phân cụm cho tổ. `assigned` null khi cột Tên cụm trưởng bị Ẩn, Che */
export interface ClusterStyle {
  styleCode: string;
  styleLabel: string | null;
  clusters: number;
  assigned: number | null;
}

/** Một cụm của mã hàng ở tổ. Cột Tên cụm trưởng bị Ẩn thì không có các khóa leader*, bị Che thì leaderEmployeeId là "***" */
export interface ClusterItem {
  id: number;
  code: string;
  name: string;
  sortOrder: number;
  leaderEmployeeId?: Masked<number | null>;
  /** Mã nhân viên hiện tại (không tra được danh bạ thì mã chụp lúc lưu) */
  leaderCode?: string | null;
  leaderName?: string | null;
  leaderDepartment?: string | null;
  /** false: cụm trưởng đã nghỉ việc; null: không tra được danh bạ */
  leaderActive?: boolean | null;
}

export interface ClusterDetail {
  team: { id: number; branchCode: string; lineCode: string; lineName: string };
  teamLeaders: { id: number; code: string; fullName: string }[];
  styleCode: string;
  styleLabel: string | null;
  canEdit: boolean;
  /** Vì sao chỉ xem (null: sửa được) */
  readOnlyReason: string | null;
  /** Có quyền tra Danh bạ nhân viên */
  canSearch: boolean;
  items: ClusterItem[];
}

/** Người trong danh bạ cho ô Tên cụm trưởng */
export interface ClusterEmployee {
  id: number;
  code: string;
  fullName: string;
  departmentName: string | null;
}
