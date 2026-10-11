import { Autocomplete, TextInput, type AutocompleteProps, type TextInputProps } from '@mantine/core';
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

/** Thời gian chờ ngừng gõ trước khi lọc, cùng mốc ở mọi ô lọc */
export const TYPING_DELAY = 300;

/**
 * Chữ đang gõ giữ ngay trong ô: gõ phím chỉ vẽ lại ô, không vẽ lại cả màn và lưới bên dưới. Chữ được đẩy ra sau khi
 * ngừng gõ `delay` ms; Enter hoặc rời ô thì đẩy ngay. Giá trị đổi từ ngoài (Xóa lọc, mở link, Back) thì ô hiện giá trị
 * mới và bỏ lượt đẩy đang chờ.
 *
 * Chữ vừa đẩy đi có thể quay về qua `value` chậm hơn (React Router đổi URL trong startTransition): người dùng đã gõ thêm
 * thì giữ chữ đang gõ, không coi giá trị quay về là "đổi từ ngoài". Bên nhận nên lưu nguyên chữ (cắt khoảng trắng lúc
 * dựng truy vấn): chữ quay về khác chữ đã đẩy thì bị coi là đổi từ ngoài.
 */
export function useDebouncedText(value: string, onCommit: (value: string) => void, delay = TYPING_DELAY) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // Các chữ vừa đẩy đi, chờ quay về qua `value` (đẩy hai lần liền nhau thì có thể quay về lần lượt)
  const sent = useRef<string[]>([]);
  if (seen !== value) {
    setSeen(value);
    if (!sent.current.includes(value)) setText(value);
  }
  // Chữ đang hiện và giá trị, hàm mới nhất: đọc được trong hẹn giờ (state trong hàm hẹn giờ là của lần vẽ cũ). Gán sau
  // khi vẽ xong, không gán giữa lúc vẽ (lượt vẽ chuyển tiếp có thể bị bỏ dở)
  const live = useRef(value);
  const latest = useRef({ value, onCommit });
  useLayoutEffect(() => {
    live.current = text;
  }, [text]);
  useLayoutEffect(() => {
    latest.current = { value, onCommit };
  });
  useLayoutEffect(() => {
    // Chữ đã quay về: bỏ nó và các chữ đẩy trước nó; giá trị lạ (đổi từ ngoài): bỏ hết
    const i = sent.current.indexOf(value);
    sent.current = i >= 0 ? sent.current.slice(i + 1) : [];
  }, [value]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = () => {
    clearTimeout(timer.current);
    const v = live.current;
    // So với chữ đẩy gần nhất còn chờ quay về (nếu có), không phải giá trị cũ đang có: đẩy "ABC" rồi xóa hết trước khi
    // "ABC" kịp quay về thì vẫn phải đẩy chữ rỗng
    if (v === (sent.current.at(-1) ?? latest.current.value)) return;
    sent.current.push(v);
    latest.current.onCommit(v);
  };
  const change = (next: string) => {
    live.current = next;
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };
  return { text, change, flush };
}

type DebouncedTextInputProps = Omit<TextInputProps, 'value' | 'onChange' | 'defaultValue'> & {
  value: string;
  /** Gọi khi ngừng gõ, Enter hoặc rời ô; không gọi khi chữ không đổi */
  onChange: (value: string) => void;
  delay?: number;
};

/** Ô lọc chữ: gõ không vẽ lại cả màn, lọc khi ngừng gõ (Enter để lọc ngay) */
export function DebouncedTextInput({ value, onChange, delay, onKeyDown, onBlur, ...rest }: DebouncedTextInputProps) {
  const { text, change, flush } = useDebouncedText(value, onChange, delay);
  return (
    <TextInput
      {...rest}
      value={text}
      onChange={(e) => change(e.currentTarget.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') flush();
        onKeyDown?.(e);
      }}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        flush();
        onBlur?.(e);
      }}
    />
  );
}

type DebouncedAutocompleteProps = Omit<AutocompleteProps, 'value' | 'onChange' | 'defaultValue'> & {
  value: string;
  onChange: (value: string) => void;
  delay?: number;
};

/** Ô lọc có gợi ý (khách hàng…): gõ thì chờ ngừng gõ, chọn một gợi ý thì lọc ngay */
export function DebouncedAutocomplete({ value, onChange, delay, onOptionSubmit, onKeyDown, onBlur, ...rest }: DebouncedAutocompleteProps) {
  const { text, change, flush } = useDebouncedText(value, onChange, delay);
  return (
    <Autocomplete
      {...rest}
      value={text}
      onChange={change}
      onOptionSubmit={(v) => {
        change(v);
        flush();
        onOptionSubmit?.(v);
      }}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') flush();
        onKeyDown?.(e);
      }}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        flush();
        onBlur?.(e);
      }}
    />
  );
}
