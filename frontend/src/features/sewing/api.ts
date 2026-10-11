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
