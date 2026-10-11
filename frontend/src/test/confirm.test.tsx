import { Button, MantineProvider, Modal, TextInput } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { confirmDiscard } from '../lib/confirm';
import { theme } from '../theme/theme';

/** Popup nhập liệu kiểu các màn Đơn hàng: Esc của Mantine (nghe trên cả cửa sổ) và nút Hủy đều đi qua confirmDiscard. */
function EditDialog({ onClosed }: { onClosed: () => void }) {
  const [value, setValue] = useState('');
  const close = () => confirmDiscard(value !== '', onClosed);
  return (
    <Modal opened onClose={close} title="Sửa đơn hàng">
      <TextInput label="Ghi chú" value={value} onChange={(e) => setValue(e.currentTarget.value)} />
      <Button onClick={close}>Hủy</Button>
    </Modal>
  );
}

function renderDialog(onClosed: () => void) {
  return render(
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <EditDialog onClosed={onClosed} />
      </ModalsProvider>
    </MantineProvider>,
  );
}

describe('Hỏi lại khi bỏ thay đổi chưa lưu', () => {
  it('chưa nhập gì: Hủy đóng ngay, không hỏi', () => {
    const onClosed = vi.fn();
    renderDialog(onClosed);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).not.toBeInTheDocument();
  });

  it('đang nhập: Esc hỏi lại; Esc trong hộp hỏi chỉ đóng hộp hỏi, không bật hộp mới, popup vẫn mở', async () => {
    const onClosed = vi.fn();
    renderDialog(onClosed);
    const input = screen.getByRole('textbox', { name: 'Ghi chú' });
    fireEvent.change(input, { target: { value: 'Giao trước 2 ngày' } });

    fireEvent.keyDown(input, { key: 'Escape' });
    const keep = await screen.findByRole('button', { name: 'Tiếp tục sửa' });
    fireEvent.keyDown(keep, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tiếp tục sửa' })).not.toBeInTheDocument());
    // Đợi qua lượt hẹn giờ: hộp hỏi không được bật lại
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Bỏ các thay đổi chưa lưu?')).not.toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Ghi chú' })).toHaveValue('Giao trước 2 ngày');

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }));
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
