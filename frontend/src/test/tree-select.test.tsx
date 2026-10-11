import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TreeSelect } from '../components/TreeSelect';
import { type GroupedOption } from '../lib/lines';
import { theme } from '../theme/theme';

// Xưởng 01: L01, L02; Xưởng 02: L03, L04; L09 thẳng dưới nhà máy
const options: GroupedOption[] = [
  { value: 'A01-L01', label: 'Chuyền 01 (L01)', groups: ['Xưởng 01'], keywords: 'A01-X01' },
  { value: 'A01-L02', label: 'Chuyền 02 (L02)', groups: ['Xưởng 01'], keywords: 'A01-X01' },
  { value: 'A01-L03', label: 'Chuyền 03 (L03)', groups: ['Xưởng 02'], keywords: 'A01-X02' },
  { value: 'A01-L04', label: 'Chuyền 04 (L04)', groups: ['Xưởng 02'], keywords: 'A01-X02' },
  { value: 'A01-L09', label: 'Chuyền 09 (L09)' },
];

function setup(initial: string | null = null, data = options) {
  const onChange = vi.fn();
  function Host() {
    const [value, setValue] = useState(initial);
    return (
      <TreeSelect
        label="Chuyền"
        options={data}
        value={value}
        unit="chuyền"
        nothingFoundMessage="Không có chuyền khớp."
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
    );
  }
  render(
    <MantineProvider theme={theme} env="test">
      <Host />
    </MantineProvider>,
  );
  const input = screen.getByRole('combobox', { name: 'Chuyền' });
  fireEvent.click(input);
  return { input, onChange, list: () => screen.getByRole('listbox', { name: 'Chuyền' }) };
}
const rowNames = (list: HTMLElement) => within(list).getAllByRole('option').map((o) => o.textContent);
const key = (el: HTMLElement, k: string) => fireEvent.keyDown(el, { key: k, code: k });
const selectedRow = (list: HTMLElement) => list.querySelector('[data-combobox-selected]')?.textContent;

describe('Ô chọn dạng cây (TreeSelect)', () => {
  it('mở ra thì các xưởng thu gọn, kèm số chuyền; bấm xưởng để mở hoặc thu gọn, chọn chuyền', () => {
    const { input, onChange, list } = setup();
    expect(rowNames(list())).toEqual(['Xưởng 01 2 chuyền, đang thu gọn', 'Xưởng 02 2 chuyền, đang thu gọn', 'Chuyền 09 (L09)']);

    fireEvent.click(within(list()).getByRole('option', { name: /Xưởng 02/ }));
    expect(rowNames(list())).toEqual(['Xưởng 01 2 chuyền, đang thu gọn', 'Xưởng 02 2 chuyền, đang mở', 'Chuyền 03 (L03)', 'Chuyền 04 (L04)', 'Chuyền 09 (L09)']);
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(within(list()).getByRole('option', { name: 'Chuyền 04 (L04)' }));
    expect(onChange).toHaveBeenCalledWith('A01-L04');
    expect(input).toHaveValue('Chuyền 04 (L04)');
  });

  it('đang chọn một chuyền thì mở sẵn xưởng chứa nó, đánh dấu chuyền đó', () => {
    const { list } = setup('A01-L02');
    expect(rowNames(list())).toEqual(['Xưởng 01 2 chuyền, đang mở', 'Chuyền 01 (L01)', 'Chuyền 02 (L02)', 'Xưởng 02 2 chuyền, đang thu gọn', 'Chuyền 09 (L09)']);
    expect(within(list()).getByRole('option', { name: 'Chuyền 02 (L02)' })).toHaveAttribute('aria-selected', 'true');
  });

  it('gõ không dấu theo tên xưởng: hiện các chuyền của xưởng đó, Enter chọn chuyền đầu', () => {
    const { input, onChange, list } = setup();
    fireEvent.change(input, { target: { value: 'xuong 02' } });
    expect(rowNames(list())).toEqual(['Xưởng 02 2 chuyền, đang mở', 'Chuyền 03 (L03)', 'Chuyền 04 (L04)']);
    key(input, 'Enter');
    expect(onChange).toHaveBeenCalledWith('A01-L03');
  });

  it('tìm theo mã xưởng, theo số chuyền; không khớp thì nói cách tìm', () => {
    const { input, list } = setup();
    fireEvent.change(input, { target: { value: 'x01' } });
    expect(rowNames(list())).toEqual(['Xưởng 01 2 chuyền, đang mở', 'Chuyền 01 (L01)', 'Chuyền 02 (L02)']);
    fireEvent.change(input, { target: { value: 'l09' } });
    expect(rowNames(list())).toEqual(['Chuyền 09 (L09)']);
    fireEvent.change(input, { target: { value: 'không có' } });
    expect(within(list()).queryAllByRole('option')).toHaveLength(0);
    expect(within(list()).getByText('Không có chuyền khớp.')).toBeInTheDocument();
  });

  it('bàn phím: mũi tên xuống tới dòng xưởng, phải để mở rồi vào dòng con, trái để về dòng xưởng rồi thu gọn, Enter mở/thu gọn', () => {
    const { input, onChange, list } = setup();
    key(input, 'ArrowDown');
    expect(selectedRow(list())).toMatch(/^Xưởng 01/);

    key(input, 'ArrowRight');
    expect(rowNames(list())).toContain('Chuyền 01 (L01)');
    expect(selectedRow(list())).toMatch(/^Xưởng 01 .*đang mở/);

    key(input, 'ArrowRight');
    expect(selectedRow(list())).toBe('Chuyền 01 (L01)');

    key(input, 'ArrowLeft');
    expect(selectedRow(list())).toMatch(/^Xưởng 01/);
    key(input, 'ArrowLeft');
    expect(rowNames(list())).not.toContain('Chuyền 01 (L01)');

    key(input, 'Enter');
    expect(rowNames(list())).toContain('Chuyền 01 (L01)');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tìm theo đầu từ: "01" ra Xưởng 01 và Chuyền 01, không ra mọi chuyền dù mã nào cũng chứa "A01"; "04" chỉ ra Chuyền 04', () => {
    const { input, list } = setup();
    fireEvent.change(input, { target: { value: '01' } });
    expect(rowNames(list())).toEqual(['Xưởng 01 2 chuyền, đang mở', 'Chuyền 01 (L01)', 'Chuyền 02 (L02)']);
    fireEvent.change(input, { target: { value: '04' } });
    expect(rowNames(list())).toEqual(['Xưởng 02 1 chuyền, đang mở', 'Chuyền 04 (L04)']);
  });

  it('đang gõ tìm thì mũi tên trái phải di con trỏ trong ô gõ, không thu gọn kết quả; đi bằng mũi tên lên xuống rồi mới mở/thu gọn', () => {
    const { input, list } = setup();
    fireEvent.change(input, { target: { value: 'xuong 02' } });
    expect(selectedRow(list())).toBe('Chuyền 03 (L03)');
    // fireEvent trả false khi phím bị chặn (preventDefault)
    expect(key(input, 'ArrowLeft')).toBe(true);
    expect(selectedRow(list())).toBe('Chuyền 03 (L03)');
    key(input, 'ArrowDown');
    key(input, 'ArrowLeft');
    expect(selectedRow(list())).toMatch(/^Xưởng 02/);
  });

  it('Esc khi đang gõ dở: ô về nhãn đang chọn, mở lại thì như lúc đầu', () => {
    const { input, list } = setup('A01-L01');
    fireEvent.change(input, { target: { value: 'xuong 02' } });
    key(input, 'Escape');
    expect(input).toHaveValue('Chuyền 01 (L01)');
    fireEvent.click(input);
    expect(rowNames(list())).toEqual(['Xưởng 01 2 chuyền, đang mở', 'Chuyền 01 (L01)', 'Chuyền 02 (L02)', 'Xưởng 02 2 chuyền, đang thu gọn', 'Chuyền 09 (L09)']);
  });

  it('giá trị không có trong danh sách (link cũ, chuyền ngoài phạm vi) thì ô hiện mã, không để trống như chưa chọn', () => {
    const { input } = setup('A01-L77');
    expect(input).toHaveValue('A01-L77');
  });

  it('danh sách rỗng khi chưa gõ gì thì báo chưa có lựa chọn, không báo "không khớp"', () => {
    const { list } = setup(null, []);
    expect(within(list()).getByText('Chưa có lựa chọn nào.')).toBeInTheDocument();
  });

  it('trình đọc màn hình: ô gõ trỏ aria-activedescendant tới dòng đang đứng, kể cả dòng tự làm nổi khi gõ tìm', async () => {
    const { input, list } = setup();
    fireEvent.change(input, { target: { value: 'xuong 02' } });
    const first = within(list()).getByRole('option', { name: 'Chuyền 03 (L03)' });
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', first.id));
    key(input, 'ArrowDown');
    const second = within(list()).getByRole('option', { name: 'Chuyền 04 (L04)' });
    await waitFor(() => expect(input).toHaveAttribute('aria-activedescendant', second.id));
  });

  it('danh sách không có nhóm thì phẳng như Select', () => {
    const { list } = setup(null, [
      { value: 'on', label: 'Đang dùng' },
      { value: 'off', label: 'Ngừng dùng' },
    ]);
    expect(rowNames(list())).toEqual(['Đang dùng', 'Ngừng dùng']);
  });

  it('xem nhiều nhà máy: nhà máy rồi xưởng; một nhà máy duy nhất thì mở sẵn', () => {
    const { list } = setup(null, [
      { value: 'A01-L01', label: 'Chuyền 01', groups: ['Nhà máy A01', 'Xưởng 01'] },
      { value: 'A01-L02', label: 'Chuyền 02', groups: ['Nhà máy A01'] },
    ]);
    expect(rowNames(list())).toEqual(['Nhà máy A01 2 chuyền, đang mở', 'Xưởng 01 1 chuyền, đang thu gọn', 'Chuyền 02']);
  });
});
