// Quy tắc dữ liệu màu cỡ dùng chung cho DTO và script nạp BRAVO (file thuần, không decorator: script nạp không cần reflect-metadata)

/** Cỡ: chữ, số, dấu chấm, gạch, ngoặc, dấu cách; dữ liệu BRAVO có dạng "32 SHORT", "2T(XS)" */
export const SIZE_NAME = /^[A-Za-z0-9.\-/() ]{1,20}$/;

/** Số dòng màu cỡ tối đa mỗi lần lưu (một PO, một kế hoạch, một dòng chuyền) */
export const MAX_COLOR_SIZE_ROWS = 300;
