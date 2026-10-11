import { DateInput, type DateInputProps } from '@mantine/dates';
import { useState } from 'react';
import { parseDmy } from '../lib/format';

type Props = Omit<DateInputProps, 'value' | 'onChange' | 'defaultValue'> & {
  /** YYYY-MM-DD hoặc rỗng */
  value?: string | null;
  onChange: (value: string) => void;
};

/**
 * Ô ngày hiển thị dd/mm/yyyy bất kể ngôn ngữ trình duyệt (ô date của trình duyệt theo máy, nhiều máy hiện mm/dd/yyyy).
 * Gõ tay cũng hiểu theo dd/mm/yyyy (bộ đọc mặc định của Mantine cần plugin dayjs, thiếu thì đảo ngày và tháng).
 * Giá trị trao đổi vẫn là chuỗi YYYY-MM-DD như API.
 */
export function DateField({ value, onChange, popoverProps, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <DateInput
      valueFormat="DD/MM/YYYY"
      placeholder="dd/mm/yyyy"
      dateParser={parseDmy}
      clearable
      value={value || null}
      onChange={(v) => onChange(v ?? '')}
      // Lịch đang mở: Esc chỉ đóng lịch. Popup của Mantine nghe Esc trên cả cửa sổ và bỏ qua phần tử có thuộc tính này
      data-mantine-stop-propagation={open || undefined}
      popoverProps={{
        ...popoverProps,
        onOpen: () => {
          setOpen(true);
          popoverProps?.onOpen?.();
        },
        onClose: () => {
          setOpen(false);
          popoverProps?.onClose?.();
        },
      }}
      {...rest}
    />
  );
}
