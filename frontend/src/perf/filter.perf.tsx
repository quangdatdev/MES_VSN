import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, describe, it } from 'vitest';
import { ColumnFilterButton } from '../components/ColumnFilter';
import { measure, printResults, record, Shell } from './measure';

// Popup lọc theo cột với 500 giá trị (mức tối đa máy chủ trả): đo lúc tích một giá trị
const VALUES = Array.from({ length: 500 }, (_, i) => `Giá trị ${String(i).padStart(3, '0')}`);

describe('Popup lọc theo cột', () => {
  afterAll(() => printResults('Popup lọc theo cột'));

  it('500 giá trị: tích một giá trị', async () => {
    render(
      <Shell>
        <ColumnFilterButton title="Mã hàng" field="styleCode" others={{}} load={async () => ({ values: VALUES, truncated: false })} label={String} onChange={() => undefined} />
      </Shell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lọc theo cột Mã hàng' }));
    await screen.findByText('Giá trị 499', {}, { timeout: 15000 });
    // Tra theo nhãn trên 500 ô tích rất chậm ở jsdom: lấy thẳng ô tích theo thứ tự (ô đầu là "Chọn tất cả")
    const boxes = () => document.querySelectorAll<HTMLInputElement>('.col-filter-list input[type="checkbox"]');
    const ticks = [];
    for (const i of [3, 120, 250, 400, 499]) ticks.push(await measure(() => fireEvent.click(boxes()[i + 1])));
    record('Popup lọc 500 giá trị: tích một giá trị', ticks);
  });
});
