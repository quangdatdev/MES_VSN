import { Badge } from '@mantine/core';

export type StatusMap = Record<string, { label: string; color: string }>;

export function StatusBadge({ map, code }: { map: StatusMap; code: string }) {
  const s = map[code] ?? { label: code, color: 'gray' };
  return (
    <Badge size="sm" variant="light" color={s.color}>
      {s.label}
    </Badge>
  );
}

export const statusOptions = (map: StatusMap) => Object.entries(map).map(([value, s]) => ({ value, label: s.label }));
