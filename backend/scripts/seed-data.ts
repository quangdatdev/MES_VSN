// Dữ liệu khởi tạo cho Demo. Nguồn: docs/thiet-ke/seed-demo.md (giữ hai nơi đồng bộ khi sửa).

export const ACTIONS = ['view', 'create', 'update', 'delete', 'export'] as const;
export type Action = (typeof ACTIONS)[number];

/** Ký hiệu trong ma trận: V xem · C thêm · U sửa · D xóa · E xuất file */
export const LETTER: Record<string, Action> = { V: 'view', C: 'create', U: 'update', D: 'delete', E: 'export' };
export const ACTION_LABEL: Record<Action, string> = {
  view: 'Xem',
  create: 'Thêm',
  update: 'Sửa',
  delete: 'Xóa',
  export: 'Xuất file',
};

/**
 * Đơn vị cơ sở (SysBranch, ADR 0013). A00 là đơn vị tổng hợp của MES, luôn tạo. A01–A03 chỉ là dữ liệu mẫu (máy demo chưa
 * có đồng bộ BRAVO): danh sách thật lấy theo danh mục chi nhánh BRAVO (MES_Sync.bravo.DM_CHINHANH), seed chép sau bước này.
 */
export const branches = [
  { code: 'A00', name: 'Toàn công ty', isAggregate: true, sort: 0 },
  { code: 'A01', name: 'Nhà máy 1', isAggregate: false, sort: 10 },
  { code: 'A02', name: 'Nhà máy 2', isAggregate: false, sort: 20 },
  { code: 'A03', name: 'Nhà máy 3', isAggregate: false, sort: 30 },
];

/** Chuyền giả mỗi nhà máy (Q2 Phase 5.1). Mã A01-L01..., sau này đồng bộ từ Nhân sự/GSD. */
export const LINE_COUNT: Record<string, number> = { A01: 12, A02: 8, A03: 6 };
export const lineCode = (branch: string, n: number) => `${branch}-L${String(n).padStart(2, '0')}`;

/**
 * Xưởng giả (ADR 0010): mỗi xưởng gom một dải chuyền liên tiếp (số thứ tự chuyền). A03 không chia xưởng: chuyền nằm thẳng
 * dưới nhà máy, để thấy cả hai cách trong demo.
 */
export const WORKSHOPS: Record<string, { from: number; to: number }[]> = {
  A01: [{ from: 1, to: 6 }, { from: 7, to: 12 }],
  A02: [{ from: 1, to: 4 }, { from: 5, to: 8 }],
};
export const workshopCode = (branch: string, n: number) => `${branch}-X${String(n).padStart(2, '0')}`;
export const workshopName = (n: number) => `Xưởng ${String(n).padStart(2, '0')}`;
/** Số thứ tự xưởng giả (từ 1) chứa chuyền thứ n của nhà máy; 0 khi chuyền nằm thẳng dưới nhà máy */
export const workshopOfLine = (branch: string, n: number) => (WORKSHOPS[branch] ?? []).findIndex((w) => n >= w.from && n <= w.to) + 1;

export const roles = [
  { code: 'ADMIN', name: 'Quản trị hệ thống', description: 'Quản lý người dùng, vai trò, phân quyền; chỉ xem dữ liệu nghiệp vụ' },
  { code: 'DIRECTOR', name: 'Giám đốc', description: 'Xem và xuất mọi nghiệp vụ, kể cả Doanh thu; không tạo/sửa' },
  { code: 'PLANNER', name: 'Kế hoạch', description: 'Toàn quyền khối Đơn hàng; lập kế hoạch may và hoàn thiện' },
  { code: 'LINE_LEADER', name: 'Trưởng chuyền', description: 'Phân cụm, bấm năng suất, ghi tiến độ gấp xếp/đóng thùng; phân màu cỡ cho chuyền mình' },
  { code: 'QC', name: 'Kiểm hàng', description: 'Danh mục lỗi, kiểm Endline, báo cáo chất lượng' },
  { code: 'ACCOUNTANT', name: 'Kế toán', description: 'Xem và xuất đơn hàng, doanh thu; thấy giá nhưng không sửa' },
  // Phase 5.8 (ADR 0012 mục 6): người được thêm, sửa phòng ban và hồ sơ nhân viên; ADMIN chỉ xem (tách nhiệm vụ, ADR 0004)
  { code: 'HR', name: 'Nhân sự', description: 'Quản lý sơ đồ tổ chức và hồ sơ nhân viên; không xem nghiệp vụ sản xuất' },
  // ADR 0014 (người dùng yêu cầu 12/10/2026): quyền tính riêng (fullAccessLetters), không có cột trong ma trận của tài nguyên
  { code: 'FULL_ACCESS', name: 'Toàn quyền', description: 'Mọi quyền xem, thêm, sửa, xóa, xuất file và quản trị; thấy, sửa mọi cột. Vẫn theo luật chung: ghi dữ liệu theo ĐVCS đang làm việc, không tự đổi quyền của mình' },
];

/** Vai trò Toàn quyền (ADR 0014) */
export const FULL_ACCESS_ROLE = 'FULL_ACCESS';

export interface Group {
  code: string;
  name: string;
  icon: string;
}
/** Nhóm menu theo thứ tự hiển thị (tên, thứ tự đồng bộ theo seed; người dùng chốt 10/10/2026) */
export const groups: Group[] = [
  { code: 'order', name: 'Quản trị đơn hàng', icon: 'clipboard-list' },
  { code: 'cutting', name: 'Quản trị nhà cắt', icon: 'scissors' },
  { code: 'sewing', name: 'Quản trị xưởng may', icon: 'needle-thread' },
  { code: 'qms', name: 'Quản trị chất lượng', icon: 'shield-check' },
  { code: 'finishing', name: 'Quản trị hoàn thiện', icon: 'package' },
  { code: 'hr', name: 'Quản trị nhân sự', icon: 'users' },
  { code: 'report', name: 'Báo cáo quản trị', icon: 'chart-bar' },
  { code: 'admin', name: 'Quản trị', icon: 'settings' },
];

/**
 * matrix theo thứ tự cột: ADMIN, DIRECTOR, PLANNER, LINE_LEADER, QC, ACCOUNTANT, HR (khớp docs/thiet-ke/seed-demo.md mục 4).
 * Cột HR thêm ở Phase 5.8: bỏ trống là không có quyền.
 */
export type Matrix = [string, string, string, string, string, string, string?];
export interface ResourceDef {
  code: string;
  name: string;
  path: string;
  /** Bảng nguồn (SysResource.SourceTable) khi tài nguyên đã có dữ liệu thật */
  table?: string;
  /** Phạm vi dữ liệu (SysResource.ScopeType). Mặc định: nhóm admin dùng chung, còn lại theo nhà máy */
  scope?: 'BRANCH' | 'SHARED';
  mobile?: boolean;
  matrix: Matrix;
}

export const resources: ResourceDef[] = [
  // Đơn hàng, PO lấy hết từ BRAVO, dùng chung toàn công ty, không lọc theo ĐVCS (ADR 0013, đổi từ BRANCH ngày 11/10/2026)
  { code: 'order.allocation', name: 'Thông tin đơn hàng', path: '/order/info', table: 'SalesOrder', scope: 'SHARED', matrix: ['V', 'VE', 'VCUDE', '', '', 'VE'] },
  // Phân bổ PO theo nhà máy SX lấy từ OSM (task 5.9.12): bảng làm việc MES_Order.PoAllocation chép từ dữ liệu OSM đã đồng bộ,
  // dùng chung toàn công ty (ĐVCS suy từ Nhà máy SX). Quyền xem như Thông tin đơn hàng; Kế hoạch sửa Nhà máy SX (Phase 5.10,
  // máy đã cài nhận quyền qua migration MES_Core/0010)
  { code: 'order.poallocation', name: 'Phân bổ PO', path: '/order/po-allocation', table: 'PoAllocation', scope: 'SHARED', matrix: ['V', 'VE', 'VUE', '', '', 'VE'] },
  { code: 'order.shipment', name: 'Kế hoạch xuất hàng', path: '/order/shipment', table: 'ShipmentPlan', matrix: ['V', 'VE', 'VCUDE', '', '', 'VE'] },
  { code: 'order.po', name: 'Cập nhật tỷ lệ cắt', path: '/order/cut-ratio', table: 'SalesOrderPo', scope: 'SHARED', matrix: ['V', 'VE', 'VCUDE', 'V', '', 'VE'] },
  { code: 'order.lineplan', name: 'Xếp chuyền', path: '/order/line-plan', table: 'ShipmentPlan', matrix: ['V', 'VE', 'VCUDE', 'V', '', 'VE'] },
  { code: 'order.colorsize', name: 'Phân bổ màu cỡ', path: '/order/color-size', table: 'ShipmentPlanLine', matrix: ['V', 'VE', 'VCUDE', 'VU', '', 'VE'] },
  // Kế hoạch chuẩn bị SX (Phase 5.5, ADR 0009): màn thuộc nhóm Quản trị đơn hàng, dữ liệu ở MES_Sewing (module May).
  // Dòng do hệ thống chép từ Xếp chuyền nên không có Thêm, Xóa
  { code: 'order.prep', name: 'Kế hoạch chuẩn bị SX', path: '/order/prep', table: 'SewingPrep', matrix: ['V', 'VE', 'VUE', 'V', '', ''] },

  { code: 'cutting.progress', name: 'Đồng bộ tiến độ cắt', path: '/cutting/progress', matrix: ['V', 'VE', 'V', 'V', '', ''] },
  { code: 'cutting.supply', name: 'Xác nhận cấp BTP', path: '/cutting/supply', matrix: ['V', 'VE', 'V', '', '', ''] },
  { code: 'cutting.embroidery', name: 'Quản lý in thêu', path: '/cutting/embroidery', matrix: ['V', 'VE', 'V', '', '', ''] },

  { code: 'sewing.plan', name: 'Kế hoạch may', path: '/sewing/plan', matrix: ['V', 'VE', 'VCUE', 'V', '', ''] },
  { code: 'sewing.cluster', name: 'Phân cụm trưởng', path: '/sewing/cluster', mobile: true, matrix: ['V', 'VE', 'V', 'VCU', '', ''] },
  { code: 'sewing.output', name: 'Bấm năng suất cụm', path: '/sewing/output', mobile: true, matrix: ['V', 'VE', 'V', 'VCU', 'V', ''] },
  { code: 'sewing.balance', name: 'Biểu đồ cân bằng chuyền', path: '/sewing/balance', matrix: ['V', 'VE', 'V', 'V', '', ''] },

  { code: 'qms.defect', name: 'Danh mục lỗi', path: '/qms/defect', matrix: ['V', 'VE', 'V', 'V', 'VCUD', ''] },
  { code: 'qms.endline', name: 'Kiểm Endline', path: '/qms/endline', mobile: true, matrix: ['V', 'VE', 'V', 'V', 'VCUE', ''] },
  { code: 'qms.report', name: 'Báo cáo chất lượng', path: '/qms/report', matrix: ['V', 'VE', 'V', 'V', 'VE', ''] },

  { code: 'finishing.plan', name: 'Kế hoạch hoàn thiện', path: '/finishing/plan', matrix: ['V', 'VE', 'VCUE', 'V', '', ''] },
  { code: 'finishing.folding', name: 'Tiến độ gấp xếp', path: '/finishing/folding', matrix: ['V', 'VE', 'V', 'VCU', '', ''] },
  { code: 'finishing.packing', name: 'Tiến độ đóng thùng', path: '/finishing/packing', matrix: ['V', 'VE', 'V', 'VCU', '', ''] },

  // Quản trị nhân sự (menu 10/10/2026, màn thật Phase 5.8, ADR 0012): dữ liệu dùng chung toàn công ty, vai trò Nhân sự được sửa.
  // Không có quyền xóa: phòng ban giải thể, nhân viên nghỉ việc
  { code: 'hr.orgchart', name: 'Sơ đồ tổ chức', path: '/hr/org-chart', table: 'Department', scope: 'SHARED', matrix: ['V', 'VE', '', '', '', '', 'VCUE'] },
  { code: 'hr.employee', name: 'Thông tin nhân sự', path: '/hr/employees', table: 'Employee', scope: 'SHARED', matrix: ['V', 'VE', '', '', '', '', 'VCUE'] },

  { code: 'report.prepare', name: 'Kế hoạch chuẩn bị sản xuất', path: '/report/prepare', matrix: ['V', 'VE', 'VE', '', '', ''] },
  { code: 'report.progress', name: 'Tiến độ sản xuất', path: '/report/progress', matrix: ['V', 'VE', 'VE', '', '', 'VE'] },
  { code: 'report.revenue', name: 'Doanh thu nhà máy', path: '/report/revenue', matrix: ['V', 'VE', '', '', '', 'VE'] },
  { code: 'report.hourly', name: 'Sản lượng theo giờ', path: '/report/hourly', matrix: ['V', 'VE', 'V', 'V', '', ''] },

  { code: 'admin.user', name: 'Người dùng', path: '/admin/users', matrix: ['VCUD', '', '', '', '', ''] },
  { code: 'admin.role', name: 'Vai trò', path: '/admin/roles', matrix: ['VCUD', '', '', '', '', ''] },
  { code: 'admin.permission', name: 'Phân quyền', path: '/admin/permissions', matrix: ['VU', '', '', '', '', ''] },
  { code: 'admin.fieldpolicy', name: 'Chính sách cột', path: '/admin/field-policies', matrix: ['VU', '', '', '', '', ''] },
  { code: 'admin.branch', name: 'Đơn vị cơ sở', path: '/admin/branches', matrix: ['VCU', '', '', '', '', ''] },
  // Không có quyền xóa: danh mục ngừng dùng bằng IsActive (CLAUDE.md mục 5)
  { code: 'admin.catalog', name: 'Danh mục hệ thống', path: '/admin/catalogs', matrix: ['VCU', '', '', '', '', ''] },
  { code: 'admin.audit', name: 'Nhật ký hệ thống', path: '/admin/audit', matrix: ['VE', '', '', '', '', ''] },
  // Đồng bộ dữ liệu (ADR 0007): Xem = theo dõi; Sửa = bấm chạy đồng bộ
  { code: 'admin.sync', name: 'Đồng bộ dữ liệu', path: '/admin/sync', matrix: ['VU', '', '', '', '', ''] },
];

export const ROLE_ORDER = ['ADMIN', 'DIRECTOR', 'PLANNER', 'LINE_LEADER', 'QC', 'ACCOUNTANT', 'HR'];

/**
 * Quyền của vai trò Toàn quyền trên một tài nguyên (ADR 0014): mọi hành động nghiệp vụ; quyền quản trị đúng bằng ADMIN, vì người
 * thao tác chỉ gán, sửa được vai trò có quyền `admin.*` mà chính mình có (trần quyền quản trị, ADR 0004). Các quyền quản trị
 * ADMIN không có (ví dụ xuất file danh sách vai trò) không dùng ở màn nào.
 */
export const fullAccessLetters = (r: ResourceDef): string => (r.code.startsWith('admin.') ? r.matrix[0] : 'VCUDE');

/** Chiều phạm vi (ngoài FACTORY luôn có) gắn với từng tài nguyên: chiều → cột của bảng nguồn. */
export const scopeBindings: Record<string, Record<string, string>> = {
  // Đơn hàng, PO dùng chung (ADR 0013): BranchCode chỉ là Chi nhánh FOB, không còn là chiều phạm vi
  'order.allocation': { OWNER: 'CreatedBy' },
  'order.shipment': { FACTORY: 'BranchCode', OWNER: 'CreatedBy' },
  'order.po': { OWNER: 'CreatedBy' },
  'order.lineplan': { FACTORY: 'BranchCode', OWNER: 'CreatedBy' },
  'order.colorsize': { FACTORY: 'BranchCode', LINE: 'LineCode', OWNER: 'CreatedBy' },
  'order.prep': { FACTORY: 'BranchCode', LINE: 'LineCode' },
};

/** Cột đăng ký (Resource Registry mức cột). Mã trùng trường JSON của API. S = nhạy cảm (mặc định Ẩn). */
export const resourceFields: Record<string, [code: string, name: string, sensitive?: 'S'][]> = {
  'order.allocation': [
    ['orderNo', 'Số đơn'],
    ['customerName', 'Khách hàng'],
    ['styleCode', 'Mã hàng'],
    ['season', 'Season'],
    ['orderType', 'Loại'],
    ['productName', 'Tên sản phẩm'],
    ['productionFactoryCode', 'Nhà máy SX'],
    ['staffName', 'Nhân viên lập'],
    ['qty', 'Số lượng'],
    ['unitName', 'Đơn vị tính'],
    ['unitPrice', 'Đơn giá', 'S'],
    ['amount', 'Thành tiền', 'S'],
    ['cmPrice', 'Giá CM', 'S'],
    ['syncedAt', 'Ngày đồng bộ'],
    ['shipDate', 'Ngày xuất hàng'],
    ['statusCode', 'Trạng thái'],
  ],
  // Mã trùng khóa JSON của API Phân bổ PO (po-allocation.service.ts); tên cột theo view OSM v_OSMData. Đơn vị cơ sở, nhà máy theo
  // OSM, dấu nhập tay suy ra từ Nhà máy SX: mức của chúng còn đi theo mức của Nhà máy SX (service lấy mức chặt hơn)
  'order.poallocation': [
    ['brand', 'Brand'],
    ['season', 'Season'],
    ['po', 'PO'],
    ['so', 'SO'],
    ['shipMode', 'Ship mode'],
    ['styleName', 'Style name'],
    ['styleNo', 'Style No'],
    ['color', 'Màu'],
    ['etdActual', 'ETD-Actual'],
    ['etdRevised', 'ETD-Revised'],
    ['factoryName', 'Nhà máy SX'],
    ['branchCode', 'Đơn vị cơ sở'],
    ['isFactoryManual', 'Nhập tay'],
    ['osmFactoryName', 'Nhà máy SX theo OSM'],
    ['isInOsm', 'Còn trong OSM'],
  ],
  'order.shipment': [
    ['planNo', 'Số kế hoạch'],
    ['customerName', 'Khách hàng'],
    ['styleCode', 'Mã hàng'],
    ['productName', 'Tên sản phẩm'],
    ['poBuyDate', 'PO/Buy date'],
    ['syncedAt', 'Ngày đồng bộ'],
    ['shipDate', 'Ngày xuất hàng'],
    ['plannerName', 'Nhân viên lập'],
    ['planQty', 'Số lượng KH'],
    ['cutQty', 'LK cắt'],
    ['sewnQty', 'LK May ra'],
    ['endlineQty', 'LK Endline'],
    ['finishedQty', 'LK Hoàn thiện'],
    ['statusCode', 'Trạng thái'],
  ],
  'order.po': [
    ['poCode', 'Mã PO'],
    ['poNumber', 'PO#'],
    ['customerName', 'Khách hàng'],
    ['styleCode', 'Mã hàng'],
    ['qty', 'Số lượng'],
    ['syncedAt', 'Ngày đồng bộ'],
    ['shipDate', 'Ngày xuất hàng'],
    ['destination', 'Đích đến'],
    ['packingListCode', 'Mã PKL'],
    ['customsDeclarationNo', 'Số tờ khai'],
    ['statusCode', 'Trạng thái'],
  ],
  'order.lineplan': [
    ['planNo', 'Số kế hoạch'],
    ['customerName', 'Khách hàng'],
    ['styleCode', 'Mã hàng'],
    ['orderType', 'Loại đơn hàng'],
    ['poBuyDate', 'PO/Buy date'],
    ['planQty', 'SL kế hoạch'],
    ['scheduledQty', 'SL đã xếp chuyền'],
    ['remainingQty', 'SL còn lại'],
    ['cmPrice', 'Giá CM', 'S'],
    ['revenue', 'Doanh số', 'S'],
    ['syncedAt', 'Ngày đồng bộ'],
    ['startDate', 'Ngày bắt đầu SX'],
    ['endDate', 'Ngày kết thúc SX'],
    ['shipDate', 'Ngày xuất hàng'],
    ['statusCode', 'Trạng thái'],
  ],
  'order.colorsize': [
    ['customerName', 'Khách hàng'],
    ['styleCode', 'Mã hàng'],
    ['poBuyDate', 'PO Buy date'],
    ['lineCode', 'Chuyền may'],
    ['startDate', 'Ngày bắt đầu chuyền'],
    ['avgOutput', 'NSBQ chuyền'],
    ['endDate', 'Ngày kết thúc chuyền'],
    ['shipDate', 'Ngày xuất hàng'],
    ['qty', 'Số lượng kế hoạch'],
    ['assignedQty', 'Số lượng giao'],
    ['statusCode', 'Trạng thái'],
  ],
  'order.prep': [
    ['lineCode', 'Tổ SX'],
    ['planNo', 'Số kế hoạch'],
    ['customerName', 'Khách hàng'],
    ['styleCode', 'Mã hàng'],
    ['productName', 'Tên sản phẩm'],
    ['styleType', 'Loại mã'],
    ['lineQty', 'SL của chuyền'],
    ['confirmedQty', 'Số lượng chốt UD'],
    ['priorityFactor', 'HS Ưu đãi VC'],
    ['startDate', 'Ngày vào chuyền'],
    ['steps', 'Các bước chuẩn bị (KH, TH)'],
    ['statusCode', 'Trạng thái'],
  ],
  // Mã trùng khóa JSON của API Thông tin nhân sự (modules/hr/employee-fields.ts). Chỉ đăng ký thông tin cá nhân: mã, tên, phòng
  // ban, chức danh, tình trạng là khung của màn (ẩn đi thì không lưu được hồ sơ), và phòng ban, chức danh còn đi kèm cột tên.
  // 5 cột giấy tờ, liên lạc nhạy cảm (ADR 0012 mục 8)
  'hr.employee': [
    ['email', 'Email'],
    ['birthPlace', 'Nơi sinh'],
    ['hometown', 'Nguyên quán'],
    ['birthDate', 'Ngày sinh', 'S'],
    ['idNumber', 'Số CMND/CCCD', 'S'],
    ['contactPhone', 'Điện thoại liên lạc', 'S'],
    ['contactPerson', 'Người liên hệ', 'S'],
    ['currentAddress', 'Địa chỉ hiện tại', 'S'],
  ],
};

/**
 * Danh mục Cấu hình chuẩn bị SX ban đầu (MES_Sewing.PrepStep), theo docs/nguon/danh-muc-cau-hinh-chuan-bi-san-xuat.png và
 * tên cột của file mẫu. Seed chỉ thêm bước còn thiếu theo mã, không sửa bước đã có (người dùng sửa ở Danh mục hệ thống).
 */
export const prepSteps: { code: string; name: string; planDays: number; performer: string; dataSource: string }[] = [
  { code: 'CB01', name: 'Họp đánh giá rủi ro', planDays: 0, performer: 'P.Công nghệ', dataSource: 'Ngày họp phương án công nghệ' },
  { code: 'CB02', name: 'Ngày ĐB VT may mẫu PP', planDays: 1, performer: 'NV Kỹ thuật', dataSource: 'Link từ phân hệ Kỹ thuật / Kế hoạch mẫu / Ngày CN xác nhận đồng bộ VT may mẫu' },
  { code: 'CB03', name: 'Ngày gửi mẫu PP', planDays: 1, performer: 'NV Kỹ thuật', dataSource: 'Link từ phân hệ Kỹ thuật / Kế hoạch mẫu / Ngày xong mẫu' },
  { code: 'CB04', name: 'Ngày duyệt mẫu PP', planDays: 1, performer: 'NV Kỹ thuật', dataSource: 'Link từ phân hệ Kỹ thuật / Kế hoạch mẫu / Ngày nhận PP Comment' },
  { code: 'CB05', name: 'Ngày đồng bộ NPL', planDays: 0, performer: 'NV Đơn hàng', dataSource: 'Link từ kế hoạch xuất hàng theo từng PO' },
  { code: 'CB06', name: 'In thêu (nếu có)', planDays: 2, performer: 'NV Điều độ nhà cắt', dataSource: 'Cập nhật ngày đồng bộ in, thêu ngay tại thông tin chuẩn bị SX' },
  { code: 'CB07', name: 'Kết quả test NPL', planDays: 1, performer: 'NV Phòng Lab', dataSource: 'Lấy theo ngày trả mẫu cuối cùng, hiển thị kết quả và ghi chú, xem chi tiết các kết quả test của mã hàng' },
  { code: 'CB08', name: 'Kết quả test thành phẩm (mockup)', planDays: 1, performer: 'NV Phòng Lab', dataSource: 'Bổ sung hình thức kiểm tra test thành phẩm mockup bên phòng Lab' },
  { code: 'CB09', name: 'Thiết kế chuyền', planDays: 0, performer: 'NV TKC', dataSource: 'Lấy theo ngày thiết kế chuyền được phê duyệt lần đầu' },
  { code: 'CB10', name: 'Chuẩn bị máy, thiết bị', planDays: 0, performer: 'P.Cơ điện', dataSource: 'Bổ sung phần chuẩn bị thiết bị vào chuyền: số lượng, hiệu chỉnh máy, ke gá (nhập tại thông tin chuẩn bị SX)' },
  { code: 'CB11', name: 'Chuẩn bị ke gá', planDays: 1, performer: 'P.Công nghệ', dataSource: 'Cập nhật thông tin tại mục thông tin chuẩn bị SX' },
  { code: 'CB12', name: 'May chế thử mẫu', planDays: 1, performer: 'P.Công nghệ', dataSource: 'Cập nhật thông tin tại mục thông tin chuẩn bị SX' },
  { code: 'CB13', name: 'Hướng dẫn công nhân may chế thử công đoạn khó', planDays: 1, performer: 'P.Công nghệ', dataSource: 'Cập nhật thông tin tại mục thông tin chuẩn bị SX' },
  { code: 'CB14', name: 'SOP', planDays: 1, performer: 'P.Công nghệ', dataSource: 'Cập nhật thông tin tại mục thông tin chuẩn bị SX' },
  { code: 'CB15', name: 'Họp PP', planDays: 1, performer: 'P.Kỹ thuật', dataSource: 'Link từ phân hệ Kỹ thuật / Biên bản họp PP / Ngày duyệt' },
  { code: 'CB16', name: 'Tài liệu kỹ thuật', planDays: 1, performer: 'P.Kỹ thuật', dataSource: 'Lấy ngày phê duyệt bộ hồ sơ kỹ thuật lần đầu' },
];

type Level = 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE';
/**
 * Chính sách cột mẫu theo vai trò (Q1 Phase 5.1): cột giá mặc định Ẩn; Giám đốc, Kế toán xem; Kế hoạch xem giá, nhập giá CM.
 * Ví dụ Che: Trưởng chuyền thấy cột khách hàng nhưng tên khách bị che (bảo mật tên khách dưới xưởng).
 * Không dùng Che cho doanh số với Kế hoạch vì Kế hoạch thấy SL và giá CM nên tự tính ra được (review 5.1 #19).
 */
export const roleFieldPolicies: { role: string; resource: string; field: string; level: Level }[] = [
  ...['DIRECTOR', 'ACCOUNTANT'].flatMap((role) => [
    { role, resource: 'order.allocation', field: 'unitPrice', level: 'READONLY' as Level },
    { role, resource: 'order.allocation', field: 'amount', level: 'READONLY' as Level },
    { role, resource: 'order.allocation', field: 'cmPrice', level: 'READONLY' as Level },
    { role, resource: 'order.lineplan', field: 'cmPrice', level: 'READONLY' as Level },
    { role, resource: 'order.lineplan', field: 'revenue', level: 'READONLY' as Level },
  ]),
  { role: 'PLANNER', resource: 'order.allocation', field: 'unitPrice', level: 'READONLY' },
  { role: 'PLANNER', resource: 'order.allocation', field: 'amount', level: 'READONLY' },
  { role: 'PLANNER', resource: 'order.allocation', field: 'cmPrice', level: 'EDITABLE' },
  { role: 'PLANNER', resource: 'order.lineplan', field: 'cmPrice', level: 'READONLY' },
  { role: 'PLANNER', resource: 'order.lineplan', field: 'revenue', level: 'READONLY' },
  { role: 'LINE_LEADER', resource: 'order.lineplan', field: 'customerName', level: 'MASKED' },
  { role: 'LINE_LEADER', resource: 'order.colorsize', field: 'customerName', level: 'MASKED' },
  // Chính sách cột tính theo tài nguyên: màn nào có cùng dữ liệu cũng phải khai báo, không thì lộ ở màn đó (review 5.1 lượt 2 N3)
  { role: 'LINE_LEADER', resource: 'order.po', field: 'customerName', level: 'MASKED' },
  { role: 'LINE_LEADER', resource: 'order.prep', field: 'customerName', level: 'MASKED' },
  // Toàn quyền (ADR 0014): mọi cột nhạy cảm được xem, sửa (cột tính sẵn như Thành tiền, Doanh thu vẫn không nhập được)
  ...Object.entries(resourceFields).flatMap(([resource, fields]) =>
    fields.filter(([, , sensitive]) => sensitive === 'S').map(([field]) => ({ role: FULL_ACCESS_ROLE, resource, field, level: 'EDITABLE' as Level })),
  ),
  // Giấy tờ, liên lạc của nhân viên (ADR 0012 mục 8): mặc định Ẩn; Nhân sự sửa được, Giám đốc thấy là có nhưng bị che
  ...['birthDate', 'idNumber', 'contactPhone', 'contactPerson', 'currentAddress'].flatMap((field) => [
    { role: 'HR', resource: 'hr.employee', field, level: 'EDITABLE' as Level },
    { role: 'DIRECTOR', resource: 'hr.employee', field, level: 'MASKED' as Level },
  ]),
];

export interface UserDef {
  username: string;
  fullName: string;
  role: string;
  branches: string[];
  defaultBranch: string;
  /** Phạm vi của phép gán vai trò (L3) */
  scopes?: { dimension: string; mode: 'ALL' | 'ORG_SUBTREE' | 'LIST' | 'OWN'; org?: string; value?: string }[];
  /** Ngoại lệ theo người (L5) */
  overrides?: { permission: string; effect: 'ALLOW' | 'DENY'; validTo?: string; reason: string }[];
  /** Chính sách cột riêng (L4 theo người) */
  fieldPolicies?: { resource: string; field: string; level: Level; validTo?: string; reason: string }[];
  /**
   * Vai trò gán thêm, không kèm phạm vi. Tài khoản đã có thì chỉ gán khi vai trò vừa tạo ở lần seed này (chưa ai thu hồi được),
   * như ĐVCS mẫu; quản trị gỡ rồi thì seed chạy lại không gán lại
   */
  extraRoles?: string[];
}

/** Năm người mẫu của phương án nền tảng mục 4.4, cộng tài khoản quản trị. */
export const users: UserDef[] = [
  // Toàn quyền: người dùng chốt 12/10/2026 gán cho tài khoản admin (ADR 0014, thay phần tách nhiệm vụ của ADR 0004 với tài khoản này)
  { username: 'admin', fullName: 'Quản trị hệ thống', role: 'ADMIN', branches: ['A00', 'A01', 'A02', 'A03'], defaultBranch: 'A00', extraRoles: ['FULL_ACCESS'] },
  // Quản trị chỉ xem nghiệp vụ (tách nhiệm vụ, ADR 0004): minh họa ở kịch bản demo, vì admin đã có Toàn quyền
  { username: 'quantri', fullName: 'Ngô Văn Quân', role: 'ADMIN', branches: ['A00', 'A01', 'A02', 'A03'], defaultBranch: 'A00' },
  { username: 'giamdoc', fullName: 'Phạm Quốc Hưng', role: 'DIRECTOR', branches: ['A00', 'A01'], defaultBranch: 'A00' },
  { username: 'kehoach.a', fullName: 'Lê Thị Mai', role: 'PLANNER', branches: ['A01'], defaultBranch: 'A01' },
  {
    username: 'truongchuyen.a',
    fullName: 'Nguyễn Văn Tâm',
    role: 'LINE_LEADER',
    branches: ['A01'],
    defaultBranch: 'A01',
    scopes: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }],
  },
  {
    username: 'truongchuyen.b',
    fullName: 'Hoàng Minh Bảo',
    role: 'LINE_LEADER',
    branches: ['A01'],
    defaultBranch: 'A01',
    scopes: [{ dimension: 'LINE', mode: 'LIST', value: 'A01-L03' }],
    overrides: [{ permission: 'order.shipment:view', effect: 'ALLOW', validTo: '2026-12-31T16:59:59.000Z', reason: 'Xem kế hoạch xuất hàng để chuẩn bị nguyên phụ liệu cho chuyền 3' }],
    fieldPolicies: [{ resource: 'order.lineplan', field: 'cmPrice', level: 'READONLY', validTo: '2026-12-31T16:59:59.000Z', reason: 'Theo dõi giá CM của chuyền 3 đến hết năm 2026' }],
  },
  {
    username: 'ketoan',
    fullName: 'Đỗ Thu Hà',
    role: 'ACCOUNTANT',
    branches: ['A00', 'A01', 'A02', 'A03'],
    defaultBranch: 'A00',
    // Kế toán phụ trách Nhà máy 1 và 2: ở A00 chỉ đọc dữ liệu hai nhà máy này, ở A03 không có quyền gì
    scopes: [
      { dimension: 'FACTORY', mode: 'LIST', org: 'A01' },
      { dimension: 'FACTORY', mode: 'LIST', org: 'A02' },
    ],
  },
  // Dữ liệu nhân sự dùng chung toàn công ty (ADR 0012): làm việc ở đơn vị tổng hợp như quản trị
  { username: 'nhansu', fullName: 'Trịnh Thu Hằng', role: 'HR', branches: ['A00', 'A01', 'A02', 'A03'], defaultBranch: 'A00' },
];

// ---------- Dữ liệu đơn hàng giả (MES_Order): sinh xác định theo hạt giống, chạy lại cho cùng kết quả ----------

/** Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32): cùng hạt giống thì cùng dãy số. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tên khách hàng hư cấu, không dùng tên khách hàng thật. */
export const CUSTOMERS = ['Nordic Trail AB', 'Alpenhaus GmbH', 'Coastline Apparel Ltd', 'Sakura Sports KK', 'Maple Workwear Inc', 'Baltic Knit OÜ'];
export const PRODUCTS = [
  ['JK', 'Áo jacket 3 lớp chống nước'],
  ['SS', 'Quần softshell leo núi'],
  ['DW', 'Áo khoác lông vũ'],
  ['PL', 'Áo polo thể thao'],
  ['RS', 'Quần short chạy bộ'],
  ['FL', 'Áo fleece giữ nhiệt'],
] as const;
export const COLORS = ['Đen', 'Xanh navy', 'Đỏ', 'Xám', 'Trắng', 'Xanh rêu'];
export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
export const DESTINATIONS = ['Hamburg (DE)', 'Oslo (NO)', 'Rotterdam (NL)', 'Yokohama (JP)', 'Los Angeles (US)', 'Gdańsk (PL)'];
export const STAFF = ['Nguyễn Thu Trang', 'Phạm Văn Lộc', 'Trần Bích Ngọc'];
export const ORDER_COUNT: Record<string, number> = { A01: 16, A02: 10, A03: 8 };
/** Ngày bắt đầu của bảng dàn chuyền mẫu (đầu tuần của ngày demo). */
export const SCHEDULE_START = '2026-10-05';

/**
 * Danh mục đơn giản (mã, tên) trong SysCatalog. Seed chỉ thêm loại và mục còn thiếu, không ghi đè thay đổi ở màn Danh mục hệ thống.
 * Đơn vị tính: mã là mã đơn vị bên BRAVO viết hoa không dấu (script nạp BRAVO đổi mã sang tên theo danh mục này).
 * fromBranches: mục lấy theo các nhà máy (SysBranch) thay cho danh sách cố định, xem catalogSeedItems; như mọi danh mục, seed chỉ
 * thêm mục còn thiếu nên nhà máy tạo sau ở màn Nhà máy có mục ở lần seed kế tiếp.
 */
export const catalogs = [
  {
    code: 'UNIT',
    name: 'Đơn vị tính',
    description: 'Đơn vị tính của đơn hàng. Mã là mã đơn vị bên BRAVO (viết hoa, không dấu); đơn hàng lưu tên hiển thị.',
    items: [
      ['CAI', 'Cái'],
      ['CHIEC', 'Chiếc'],
      ['BO', 'Bộ'],
      ['PCS', 'PCS'],
      ['SET', 'Set'],
    ],
  },
  {
    code: 'ORDER_TYPE',
    name: 'Loại đơn hàng',
    description: 'Loại hình sản xuất của đơn hàng (cột Loại). Đơn hàng lưu mã.',
    items: [
      ['SXXK', 'Sản xuất xuất khẩu'],
      ['GCXK', 'Gia công xuất khẩu'],
      ['GCND', 'Gia công nội địa'],
      ['GCND-1P', 'Gia công nội địa 1 phần'],
      ['SXND', 'Sản xuất nội địa'],
    ],
  },
] as const;

/** Mục seed của một danh mục mã-tên */
export function catalogSeedItems(c: (typeof catalogs)[number]): [code: string, name: string][] {
  return c.items.map(([code, name]) => [code, name]);
}

/**
 * Nhà máy SX mẫu (SysProductionFactory, ADR 0013), chỉ nạp khi có dữ liệu mẫu: mỗi ĐVCS mẫu một nhà máy cùng mã (như danh
 * mục PROD_FACTORY cũ, đơn hàng đã chọn vẫn trỏ đúng), A01 thêm một nhà máy thứ hai để thấy một ĐVCS có nhiều nhà máy.
 * Máy dùng thật tạo nhà máy ở Quản trị › Danh mục hệ thống.
 */
export const productionFactories = [
  { code: 'A01', name: 'Nhà máy 1', branch: 'A01' },
  { code: 'A01-B', name: 'Nhà máy 1B', branch: 'A01' },
  { code: 'A02', name: 'Nhà máy 2', branch: 'A02' },
  { code: 'A03', name: 'Nhà máy 3', branch: 'A03' },
];

/**
 * Lịch làm việc mẫu (phase 5.12, chỉ máy demo): ngày nghỉ lễ, Tết gần đúng để demo, không phải lịch chính thức; '*' là mọi ĐVCS
 * mẫu. A01 có một Chủ nhật làm bù, A02 một ngày nghỉ riêng trong khoảng bảng dàn chuyền mặc định, để thấy hai ĐVCS tính khác nhau.
 * Lịch mặc định (nghỉ Chủ nhật, lệch 3/3/2/5) áp cho mọi ĐVCS mẫu.
 */
export const workCalendarSample: { branch: string; from: string; to: string; dayType: 'OFF' | 'WORK'; name: string }[] = [
  { branch: '*', from: '2026-01-01', to: '2026-01-01', dayType: 'OFF', name: 'Tết Dương lịch (mẫu)' },
  { branch: '*', from: '2026-02-14', to: '2026-02-22', dayType: 'OFF', name: 'Tết Nguyên đán (mẫu)' },
  { branch: '*', from: '2026-04-27', to: '2026-04-27', dayType: 'OFF', name: 'Giỗ Tổ Hùng Vương, nghỉ bù (mẫu)' },
  { branch: '*', from: '2026-04-30', to: '2026-05-01', dayType: 'OFF', name: 'Lễ 30/4, 1/5 (mẫu)' },
  { branch: '*', from: '2026-09-01', to: '2026-09-02', dayType: 'OFF', name: 'Quốc khánh (mẫu)' },
  { branch: '*', from: '2027-01-01', to: '2027-01-01', dayType: 'OFF', name: 'Tết Dương lịch (mẫu)' },
  { branch: '*', from: '2027-02-04', to: '2027-02-10', dayType: 'OFF', name: 'Tết Nguyên đán (mẫu)' },
  { branch: 'A01', from: '2026-11-15', to: '2026-11-15', dayType: 'WORK', name: 'Làm bù Chủ nhật (mẫu)' },
  { branch: 'A02', from: '2026-11-20', to: '2026-11-20', dayType: 'OFF', name: 'Nghỉ bảo trì điện (mẫu)' },
];

/** Ca làm việc mẫu: [mã, tên, bắt đầu, kết thúc, phút nghỉ] */
export const shifts = [
  ['HC', 'Hành chính', '07:30', '16:30', 60],
  ['CA1', 'Ca 1', '06:00', '14:00', 30],
  ['CA2', 'Ca 2', '14:00', '22:00', 30],
  ['CA3', 'Ca 3 (qua đêm)', '22:00', '06:00', 30],
] as const;

// ---------- Dữ liệu nhân sự giả (MES_Hr, Phase 5.8): tên, mã hư cấu; số CCCD đầu 999, điện thoại đầu 0900, email miền .example ----------

/** Loại phòng ban: [mã, tên, cấp, cấp cuối] */
export const hrDepartmentTypes = [
  ['CONG_TY', 'Công ty', 1, false],
  ['KHOI', 'Khối', 2, false],
  ['NHA_MAY', 'Nhà máy', 2, false],
  ['PHONG', 'Phòng', 3, false],
  ['BO_PHAN', 'Bộ phận', 4, true],
] as const;

type HrDepartmentSeed = { code: string; name: string; nameEn?: string; type: string; parent?: string; branch?: string; established?: string; dissolved?: string; productionWorkshop?: boolean };

/** Phòng ban cha của xưởng, chuyền mẫu theo ĐVCS */
const HR_LINE_PARENT: Record<string, string> = { A01: 'NM1', A02: 'NM2', A03: 'NM3' };

/**
 * Xưởng, chuyền mẫu (phase 5.10): chuyền là bộ phận tích "Xưởng sản xuất", mã như chuyền mẫu cũ (A01-L01…) để đơn hàng,
 * dàn chuyền, chuẩn bị SX mẫu (sinh mã theo lineCode) có chuyền; xưởng mẫu là phòng ban cha, A03 không chia xưởng.
 */
const hrLineDepartments: HrDepartmentSeed[] = Object.entries(LINE_COUNT).flatMap(([branch, count]) => [
  ...(WORKSHOPS[branch] ?? []).map((_, i) => ({ code: workshopCode(branch, i + 1), name: workshopName(i + 1), type: 'PHONG', parent: HR_LINE_PARENT[branch], branch, established: '2012-09-01' })),
  ...Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const w = workshopOfLine(branch, n);
    return { code: lineCode(branch, n), name: `Chuyền ${String(n).padStart(2, '0')}`, type: 'BO_PHAN', parent: w ? workshopCode(branch, w) : HR_LINE_PARENT[branch], branch, established: '2012-09-01', productionWorkshop: true };
  }),
]);

/** Phòng ban theo thứ tự cha trước con. dissolved: phòng ban đã giải thể (để thử ô "Hiện phòng ban giải thể") */
export const hrDepartments: HrDepartmentSeed[] = [
  { code: 'VSN', name: 'Công ty Vietsun', nameEn: 'Vietsun Corporation', type: 'CONG_TY', established: '2005-03-15' },
  { code: 'VP', name: 'Khối văn phòng', nameEn: 'Head Office', type: 'KHOI', parent: 'VSN', established: '2005-03-15' },
  { code: 'HCNS', name: 'Phòng Hành chính nhân sự', nameEn: 'HR & Administration', type: 'PHONG', parent: 'VP', established: '2005-03-15' },
  { code: 'KT', name: 'Phòng Kế toán', nameEn: 'Accounting', type: 'PHONG', parent: 'VP', established: '2005-03-15' },
  { code: 'KH', name: 'Phòng Kế hoạch', nameEn: 'Planning', type: 'PHONG', parent: 'VP', established: '2008-06-01' },
  { code: 'NM1', name: 'Nhà máy 1', nameEn: 'Factory 1', type: 'NHA_MAY', parent: 'VSN', branch: 'A01', established: '2006-01-10' },
  { code: 'NM1-CAT', name: 'Bộ phận cắt', nameEn: 'Cutting', type: 'BO_PHAN', parent: 'NM1', branch: 'A01', established: '2006-01-10' },
  { code: 'NM1-MAY', name: 'Bộ phận may', nameEn: 'Sewing', type: 'BO_PHAN', parent: 'NM1', branch: 'A01', established: '2006-01-10' },
  { code: 'NM1-QC', name: 'Bộ phận QC', nameEn: 'Quality Control', type: 'BO_PHAN', parent: 'NM1', branch: 'A01', established: '2006-01-10' },
  { code: 'NM2', name: 'Nhà máy 2', nameEn: 'Factory 2', type: 'NHA_MAY', parent: 'VSN', branch: 'A02', established: '2012-09-01' },
  { code: 'NM2-MAY', name: 'Bộ phận may', nameEn: 'Sewing', type: 'BO_PHAN', parent: 'NM2', branch: 'A02', established: '2012-09-01' },
  { code: 'NM2-HT', name: 'Bộ phận hoàn thiện (cũ)', nameEn: 'Finishing (old)', type: 'BO_PHAN', parent: 'NM2', branch: 'A02', established: '2012-09-01', dissolved: '2025-12-31' },
  { code: 'NM3', name: 'Nhà máy 3', nameEn: 'Factory 3', type: 'NHA_MAY', parent: 'VSN', branch: 'A03', established: '2015-04-01' },
  ...hrLineDepartments,
];

/** Chức danh: [mã, tên, phòng ban (bỏ trống: dùng chung)] */
export const hrJobTitles: [code: string, name: string, department?: string][] = [
  ['GD', 'Giám đốc'],
  ['PGD', 'Phó giám đốc'],
  ['TP', 'Trưởng phòng'],
  ['NV', 'Nhân viên'],
  ['QDNM', 'Quản đốc nhà máy'],
  ['TT', 'Tổ trưởng'],
  ['CNM', 'Công nhân may'],
  ['KTT', 'Kế toán trưởng', 'KT'],
  ['KTV', 'Kế toán viên', 'KT'],
  ['CVNS', 'Chuyên viên nhân sự', 'HCNS'],
  ['NVKH', 'Nhân viên kế hoạch', 'KH'],
  ['CNC', 'Công nhân cắt', 'NM1-CAT'],
  ['NVQC', 'Nhân viên QC', 'NM1-QC'],
];

/** Số nhân viên giả theo phòng ban và chức danh; manager: người đầu tiên làm quản lý phòng ban */
export const hrStaffing: { department: string; title: string; count: number; manager?: boolean }[] = [
  { department: 'VSN', title: 'GD', count: 1, manager: true },
  { department: 'VSN', title: 'PGD', count: 1 },
  { department: 'HCNS', title: 'TP', count: 1, manager: true },
  { department: 'HCNS', title: 'CVNS', count: 3 },
  { department: 'KT', title: 'KTT', count: 1, manager: true },
  { department: 'KT', title: 'KTV', count: 3 },
  { department: 'KH', title: 'TP', count: 1, manager: true },
  { department: 'KH', title: 'NVKH', count: 3 },
  { department: 'NM1', title: 'QDNM', count: 1, manager: true },
  { department: 'NM1-CAT', title: 'TT', count: 1, manager: true },
  { department: 'NM1-CAT', title: 'CNC', count: 4 },
  { department: 'NM1-MAY', title: 'TT', count: 2, manager: true },
  { department: 'NM1-MAY', title: 'CNM', count: 8 },
  { department: 'NM1-QC', title: 'NVQC', count: 3 },
  { department: 'NM2', title: 'QDNM', count: 1, manager: true },
  { department: 'NM2-MAY', title: 'TT', count: 1, manager: true },
  { department: 'NM2-MAY', title: 'CNM', count: 5 },
];

export const HR_FAMILY = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
export const HR_MIDDLE = { 1: ['Văn', 'Đức', 'Minh', 'Quốc', 'Hữu', 'Thành'], 2: ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Bích', 'Kim'] } as const;
export const HR_GIVEN = {
  1: ['An', 'Bình', 'Cường', 'Dũng', 'Hải', 'Hùng', 'Khoa', 'Long', 'Nam', 'Phúc', 'Quang', 'Sơn', 'Tài', 'Tuấn', 'Việt'],
  2: ['Anh', 'Chi', 'Dung', 'Giang', 'Hà', 'Hạnh', 'Hoa', 'Lan', 'Linh', 'Mai', 'Nga', 'Nhung', 'Oanh', 'Phương', 'Thảo', 'Trang', 'Vy', 'Yến'],
} as const;
export const HR_PROVINCES = ['Hà Nội', 'Hải Phòng', 'Nam Định', 'Thái Bình', 'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Nam', 'Bình Định', 'Đồng Nai', 'Bình Dương', 'TP. Hồ Chí Minh'];
