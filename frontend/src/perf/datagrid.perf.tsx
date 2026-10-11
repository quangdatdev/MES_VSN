import { Badge } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterAll, describe, it } from 'vitest';
import { DataGrid, Masked, type Column } from '../components/DataGrid';
import { measure, printResults, record, Shell } from './measure';

// Lưới xem dùng chung: 100 dòng như một trang thật. Đo lúc dựng, lúc bấm chọn dòng và lúc trang render lại vì state khác.

interface Row {
  id: number;
  [k: string]: string | number;
}

const ROWS: Row[] = Array.from({ length: 100 }, (_, i) => {
  const r: Row = { id: i + 1 };
  for (let c = 0; c < 18; c++) r[`c${c}`] = c % 3 === 0 ? (i + 1) * 1000 + c : c % 3 === 1 ? `2026-10-${String((i % 28) + 1).padStart(2, '0')}` : `Giá trị ${i}-${c}`;
  return r;
});

const COLS: Column<Row>[] = Array.from({ length: 18 }, (_, c) => ({
  key: `c${c}`,
  title: `Cột ${c}`,
  format: c % 3 === 0 ? 'number' : c % 3 === 1 ? 'date' : 'text',
  ...(c === 17 ? { render: (r: Row) => <Badge size="sm" variant="light">{String(r.c17)}</Badge> } : {}),
}));

// Kế hoạch chuẩn bị SX khi cột bước bị Che: 9 cột thường và 32 ô Che mỗi dòng
const MASKED_COLS: Column<Row>[] = [
  ...COLS.slice(0, 9),
  ...Array.from({ length: 32 }, (_, i) => ({ key: `s${i}`, title: i % 2 ? 'TH' : 'KH', group: `Bước ${Math.floor(i / 2) + 1}`, field: 'steps', render: () => <Masked /> })),
];

function Page({ columns }: { columns: Column<Row>[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTick((t) => t + 1)}>
        Đổi state khác {tick}
      </button>
      <DataGrid label="Lưới đo" columns={columns} rows={ROWS} rowKey={(r) => r.id} selectedKey={selected} onRowClick={(r) => setSelected(r.id)} onRowDoubleClick={() => {}} />
    </>
  );
}

describe('Lưới xem 100 dòng', () => {
  afterAll(() => printResults('DataGrid'));

  for (const [name, columns] of [
    ['18 cột', COLS],
    ['41 cột, 32 ô Che mỗi dòng', MASKED_COLS],
  ] as const) {
    it(name, async () => {
      const mount = await measure(() => {
        render(
          <Shell>
            <Page columns={columns} />
          </Shell>,
        );
      });
      record(`${name}: dựng lưới`, [mount]);
      const rows = screen.getAllByRole('row').slice(1);
      const clicks = [];
      for (const i of [3, 10, 25, 50, 75, 90]) clicks.push(await measure(() => fireEvent.click(rows[i])));
      record(`${name}: bấm chọn dòng`, clicks);
      const other = [];
      for (let i = 0; i < 6; i++) other.push(await measure(() => fireEvent.click(screen.getByRole('button', { name: /Đổi state khác/ }))));
      record(`${name}: trang render lại vì state khác`, other);
    });
  }
});
