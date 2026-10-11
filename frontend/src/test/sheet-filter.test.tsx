import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnFilterButton } from '../components/ColumnFilter';
import { SheetGrid, sheetReadonly, type HeadFilter } from '../components/SheetGrid';
import type { ColumnFilter } from '../lib/columnFilter';
import { theme } from '../theme/theme';

// jsdom không đo được kích thước: cho khung lưới cao 400px để lưới được vẽ
vi.mock('@mantine/hooks', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@mantine/hooks')>();
  return { ...mod, useElementSize: () => ({ ref: { current: null }, width: 900, height: 400 }) };
});

interface Row {
  id: number;
  code: string;
}
const ROWS: Row[] = [
  { id: 1, code: 'MA-01' },
  { id: 2, code: 'MA-02' },
];

function filterOf(current?: ColumnFilter): HeadFilter {
  const load = vi.fn(async () => ({ values: ['MA-01', 'MA-02'], truncated: false }));
  return {
    active: !!current,
    node: <ColumnFilterButton title="Mã hàng" field="code" current={current} others={{}} load={load} label={String} onChange={() => undefined} />,
  };
}

// Nút lọc nằm ở lớp tiêu đề của SheetGrid (ở jsdom thư viện đo bề rộng bằng 0 nên không vẽ ô tiêu đề của nó)
function renderGrid(current?: ColumnFilter, grouped = true) {
  const columns = [
    sheetReadonly<Row>('Mã hàng', (r) => r.code, (r) => r.code, { minWidth: 160, headFilter: filterOf(current) }),
    sheetReadonly<Row>('KH', (r) => r.code, (r) => r.code, { minWidth: 90, group: grouped ? 'Bước 1' : undefined }),
  ];
  return render(
    <MantineProvider theme={theme} env="test">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SheetGrid<Row> label="Lưới thử" value={ROWS} onChange={() => undefined} columns={columns} rowKey={(r) => r.id} />
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe('Lọc theo cột trên tiêu đề lưới nhập', () => {
  it('lưới có tiêu đề hai tầng: nút lọc nằm ở lớp tiêu đề, đọc được tên, bấm mở popup lọc', async () => {
    renderGrid();
    const button = screen.getByRole('button', { name: 'Lọc theo cột Mã hàng' });
    expect(button.closest('.sheet-head2-cell')).toHaveAttribute('data-row', 'full');
    fireEvent.click(button);
    expect(await screen.findByRole('dialog', { name: 'Lọc cột Mã hàng' })).toBeInTheDocument();
  });

  it('lưới không có nhóm cột cũng dùng lớp tiêu đề (Tab tới được, nằm trước các ô); lớp tiêu đề đứng trước lưới trong DOM', () => {
    const { container } = renderGrid(undefined, false);
    const layer = container.querySelector('.sheet-head2')!;
    expect(layer).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Lọc theo cột Mã hàng' }).closest('.sheet-head2')).toBe(layer);
    expect(layer.compareDocumentPosition(container.querySelector('.sheet-root')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cột đang lọc: nút thành "Đang lọc", ô tiêu đề có vạch dưới', () => {
    renderGrid({ mode: 'in', values: ['MA-01'] });
    const button = screen.getByRole('button', { name: 'Đang lọc cột Mã hàng: giữ 1 giá trị' });
    expect(button.closest('.sheet-head2-cell')).toHaveAttribute('data-filtered', 'true');
  });
});
