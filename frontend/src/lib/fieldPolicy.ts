import { useMemo } from 'react';
import { useSession } from '../store/session';
import type { AccessLevel } from './types';

export const MASK = '***';
/** Giá trị cột có thể bị Che theo chính sách cột */
export type Masked<T> = T | typeof MASK;
export const LEVEL_LABEL: Record<AccessLevel, string> = { HIDDEN: 'Ẩn', MASKED: 'Che', READONLY: 'Chỉ đọc', EDITABLE: 'Sửa được' };

export interface FieldPolicy {
  level: (field: string) => AccessLevel;
  visible: (field: string) => boolean;
  editable: (field: string) => boolean;
  hidden: string[];
  masked: string[];
  readonly: string[];
}

/**
 * Chính sách cột của một tài nguyên cho người đang đăng nhập (từ GET /me/field-policies).
 * Chỉ để phản chiếu: cột Ẩn không có trong dữ liệu server trả về, cột Che đã là "***".
 * Cột không đăng ký thì coi là Sửa được.
 */
export function useFieldPolicy(resource: string): FieldPolicy {
  const map = useSession((s) => s.fieldPolicies[resource]);
  return useMemo(() => {
    const levels = map ?? {};
    const level = (f: string): AccessLevel => levels[f] ?? 'EDITABLE';
    const pick = (l: AccessLevel) => Object.entries(levels).filter(([, v]) => v === l).map(([k]) => k);
    return {
      level,
      visible: (f) => level(f) !== 'HIDDEN',
      editable: (f) => level(f) === 'EDITABLE',
      hidden: pick('HIDDEN'),
      masked: pick('MASKED'),
      readonly: pick('READONLY'),
    };
  }, [map]);
}

/** Bỏ khỏi dữ liệu gửi lên những trường người dùng không được sửa (server cũng từ chối nếu có). */
export function onlyEditable<T extends Record<string, unknown>>(policy: FieldPolicy, body: T): Partial<T> {
  return Object.fromEntries(Object.entries(body).filter(([k]) => policy.editable(k))) as Partial<T>;
}
