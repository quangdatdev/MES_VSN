import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PickMany } from '../features/admin/UsersPage';
import { theme } from '../theme/theme';

describe('Hộp gán vai trò / nhà máy', () => {
  it('tích và bỏ tích không làm sập màn hình; Lưu gửi đúng danh sách', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MantineProvider theme={theme}>
        <PickMany
          title="Vai trò của dat.le"
          hint="Chọn vai trò"
          options={[{ value: 1, label: 'Kế hoạch' }, { value: 2, label: 'Kế toán' }]}
          initial={[]}
          onClose={() => {}}
          onSave={onSave}
        />
      </MantineProvider>,
    );
    const plan = screen.getByRole('checkbox', { name: 'Kế hoạch' });
    const acc = screen.getByRole('checkbox', { name: 'Kế toán' });
    fireEvent.click(plan);
    fireEvent.click(acc);
    fireEvent.click(acc);
    expect(plan).toBeChecked();
    expect(acc).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith([1]));
  });

  it('mục đã ngừng dùng vẫn hiện để bỏ chọn; còn tích thì chưa cho lưu', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <MantineProvider theme={theme}>
        <PickMany
          title="Vai trò của dat.le"
          hint="Chọn vai trò"
          options={[{ value: 1, label: 'Kế hoạch' }]}
          stopped={[{ value: 9, label: 'Vai trò cũ' }]}
          initial={[1, 9]}
          onClose={() => {}}
          onSave={onSave}
        />
      </MantineProvider>,
    );
    const old = screen.getByRole('checkbox', { name: 'Vai trò cũ' });
    expect(old).toBeChecked();
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(save).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(old);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith([1]));
  });
});
