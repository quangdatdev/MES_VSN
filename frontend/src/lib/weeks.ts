// Tuần theo ISO 8601 như thanh tuần T1…T53 của file mẫu: tuần bắt đầu thứ Hai, tuần 1 là tuần có thứ Năm đầu tiên của
// năm. Ngày dạng YYYY-MM-DD, tính theo UTC để không lệch múi giờ.

const DAY = 86_400_000;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
/** 0 = thứ Hai … 6 = Chủ nhật */
const weekday = (d: Date) => (d.getUTCDay() + 6) % 7;

/** Thứ Hai của tuần chứa ngày `iso`. */
export function mondayOf(iso: string): string {
  const d = utc(iso);
  return isoOf(new Date(d.getTime() - weekday(d) * DAY));
}

/** Chủ nhật của tuần bắt đầu thứ Hai `monday`. */
export const sundayOf = (monday: string) => isoOf(new Date(utc(monday).getTime() + 6 * DAY));

/** Năm và số tuần ISO của ngày `iso` (đầu tháng 1 có thể thuộc tuần cuối của năm trước). */
export function isoWeekOf(iso: string): { year: number; week: number } {
  const d = utc(iso);
  const thursday = new Date(d.getTime() + (3 - weekday(d)) * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return { year, week };
}

/** Thứ Hai của tuần `week` năm `year` (ISO). */
export function weekMonday(year: number, week: number): string {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  return isoOf(new Date(jan4.getTime() - weekday(jan4) * DAY + (week - 1) * 7 * DAY));
}

/** Số tuần ISO của năm: 52 hoặc 53 (ngày 28/12 luôn nằm ở tuần cuối). */
export const weeksInYear = (year: number) => isoWeekOf(`${year}-12-28`).week;
