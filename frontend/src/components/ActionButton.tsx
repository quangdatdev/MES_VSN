import { Button, Tooltip, type ButtonProps } from '@mantine/core';
import type { ComponentPropsWithoutRef } from 'react';

type Props = ButtonProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof ButtonProps | 'disabled'> & {
    /** Có lý do thì nút trông như bị khóa, bấm không làm gì, rê chuột, chạm hoặc Tab tới thì hiện lý do. */
    blockedReason?: string | null;
  };

/**
 * Nút bị khóa phải nói vì sao (chưa chọn dòng, PO đã xác nhận, không có quyền...). Không dùng `disabled`: nút disabled
 * không nhận chuột, chạm hay Tab nên tooltip không hiện được. Luôn bọc Tooltip (tắt khi không có lý do) để đổi khóa/mở
 * không dựng lại nút: focus bàn phím và chỗ trả focus của popup vẫn còn.
 */
export function ActionButton({ blockedReason, onClick, ...rest }: Props) {
  const blocked = !!blockedReason;
  return (
    <Tooltip label={blockedReason} disabled={!blocked} multiline maw={300} openDelay={150} events={{ hover: true, focus: true, touch: true }}>
      <Button
        {...rest}
        data-disabled={blocked || undefined}
        aria-disabled={blocked || undefined}
        onClick={(e) => {
          if (blocked) e.preventDefault();
          else onClick?.(e);
        }}
      />
    </Tooltip>
  );
}
