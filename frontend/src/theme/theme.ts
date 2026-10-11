import { Button, createTheme, type MantineColorsTuple } from '@mantine/core';

// Màu chủ đạo lấy từ logo Vietsun: cam #F39830 (chữ S, mặt trời) và xám than (chữ VIETSUN). Shade 6 (primaryShade) là màu chuẩn của mỗi thang.
const brand: MantineColorsTuple = [
  '#fff5ea', '#ffe8cf', '#fdd2a3', '#fabb72', '#f7a94e', '#f5a03e', '#f39830', '#e0851d', '#b86a12', '#8f520e',
];
// Shade 5, 6 là hai màu xám của chữ trong logo; 7, 8 là dải menu con và thanh bên/thanh trên
const charcoal: MantineColorsTuple = [
  '#f3f3f3', '#e4e4e5', '#c9c9ca', '#a9a9aa', '#888889', '#686869', '#4d4e4e', '#3f4041', '#2b2c2d', '#1a1b1b',
];
// Màu chữ liên kết và trạng thái được chọn (#007185)
const link: MantineColorsTuple = [
  '#e6f6f9', '#c8f3fa', '#9fdfe8', '#6cc6d4', '#3aa9bb', '#1a8ea2', '#007185', '#005f70', '#004c5a', '#003a45',
];
// Ghi đè teal/red/orange để badge, alert dùng đúng màu Success, Error, Warning của design system
const teal: MantineColorsTuple = [
  '#e7f6f2', '#c4e9df', '#9bd8c7', '#6cc4ac', '#3fae91', '#1b9677', '#067d62', '#056a53', '#045644', '#034234',
];
const red: MantineColorsTuple = [
  '#fdeeea', '#f9d3ca', '#f0a898', '#e57b63', '#d6553a', '#c43e1f', '#b12704', '#952003', '#781a02', '#5c1402',
];
const orange: MantineColorsTuple = [
  '#fff1e6', '#ffdcc2', '#ffbd8a', '#fb9a52', '#ec7a26', '#dd650d', '#cc5500', '#ab4700', '#8a3900', '#682b00',
];
const gray: MantineColorsTuple = [
  '#f7f8f8', '#f0f2f2', '#e3e6e6', '#d5d9d9', '#888c8c', '#6f7373', '#565959', '#3a3d3d', '#232525', '#0f1111',
];
const dark: MantineColorsTuple = [
  '#e3e6e6', '#bcc3c9', '#8d97a1', '#66727e', '#3e4a57', '#2c3744', '#1f2933', '#18212b', '#121a22', '#0b1117',
];

const sans = '"Source Sans 3", system-ui, -apple-system, "Segoe UI", sans-serif';
const mono = '"JetBrains Mono", ui-monospace, Consolas, monospace';

export const theme = createTheme({
  primaryColor: 'brand',
  primaryShade: { light: 6, dark: 5 },
  colors: { brand, charcoal, link, teal, red, orange, gray, dark },
  black: '#0f1111',
  autoContrast: true,
  luminanceThreshold: 0.35,
  fontFamily: sans,
  fontFamilyMonospace: mono,
  lineHeights: { xs: '1.3', sm: '1.35', md: '1.4', lg: '1.45', xl: '1.5' },
  headings: {
    fontFamily: sans,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: '21px', lineHeight: '28px' },
      h2: { fontSize: '18px', lineHeight: '24px' },
      h3: { fontSize: '16px', lineHeight: '22px' },
      h4: { fontSize: '14px', lineHeight: '20px' },
    },
  },
  fontSizes: { xs: '12px', sm: '13px', md: '14px', lg: '16px', xl: '18px' },
  defaultRadius: 'sm',
  radius: { xs: '2px', sm: '4px', md: '8px', lg: '12px', xl: '16px' },
  shadows: {
    xs: '0 1px 2px rgba(15,17,17,0.06)',
    sm: '0 2px 5px rgba(15,17,17,0.08)',
    md: '0 0 6px rgba(15,17,17,0.15)',
    lg: '0 4px 14px rgba(15,17,17,0.18)',
    xl: '0 8px 24px rgba(15,17,17,0.2)',
  },
  cursorType: 'pointer',
  // Modal, Drawer, Popover... bỏ hiệu ứng khi máy đặt giảm chuyển động
  respectReducedMotion: true,
  components: {
    Button: Button.extend({
      defaultProps: { size: 'sm', radius: 'md' },
      styles: { root: { fontWeight: 400 } },
      // Nút chính: cam Vietsun, chữ đen (chữ trắng trên cam chỉ đạt 2,3:1). Nút màu khác (đỏ xóa, xám) giữ nguyên.
      vars: (_theme, props) => {
        const variant = props.variant ?? 'filled';
        // Nút phụ: chữ đen; riêng nút xóa (color="red") giữ chữ đỏ để không lẫn với nút thường
        if (variant === 'default')
          return { root: { '--button-bd': '1px solid var(--app-line-strong)', '--button-color': props.color === 'red' ? 'var(--mantine-color-red-text)' : 'var(--app-ink)' } };
        if (variant !== 'filled' || (props.color && props.color !== 'brand')) return { root: {} };
        return {
          root: {
            '--button-bg': '#f39830',
            '--button-hover': '#e0851d',
            '--button-color': '#0f1111',
            '--button-bd': '1px solid #e0851d',
          },
        };
      },
    }),
    TextInput: { defaultProps: { size: 'sm' } },
    PasswordInput: { defaultProps: { size: 'sm', visibilityToggleButtonProps: { 'aria-label': 'Hiện hoặc ẩn mật khẩu' } } },
    // Nút xóa giá trị (dấu x) không có nhãn sẵn: trình đọc màn hình chỉ đọc "nút"
    Select: { defaultProps: { size: 'sm', clearButtonProps: { 'aria-label': 'Xóa giá trị' } } },
    MultiSelect: { defaultProps: { size: 'sm', clearButtonProps: { 'aria-label': 'Xóa giá trị' } } },
    NumberInput: { defaultProps: { size: 'sm' } },
    Textarea: { defaultProps: { size: 'sm' } },
    DateInput: { defaultProps: { size: 'sm', clearButtonProps: { 'aria-label': 'Xóa ngày' } } },
    DateTimePicker: { defaultProps: { size: 'sm', clearButtonProps: { 'aria-label': 'Xóa thời điểm' } } },
    Checkbox: { defaultProps: { color: 'link', radius: 'xs' } },
    Switch: { defaultProps: { color: 'teal' } },
    Pagination: { defaultProps: { color: 'link' } },
    // Bấm nhầm ra nền mờ không đóng popup (mất phần đang nhập); đóng bằng nút Hủy, dấu x hoặc Esc
    Modal: { defaultProps: { radius: 'md', centered: true, overlayProps: { backgroundOpacity: 0.45 }, closeOnClickOutside: false, closeButtonProps: { 'aria-label': 'Đóng' } } },
    Drawer: { defaultProps: { closeButtonProps: { 'aria-label': 'Đóng' } } },
    Notification: { defaultProps: { closeButtonProps: { 'aria-label': 'Đóng thông báo' } } },
    Paper: { defaultProps: { radius: 'md' } },
    Badge: { defaultProps: { radius: 'xs' }, styles: { root: { textTransform: 'none', fontWeight: 700 } } },
    Tooltip: { defaultProps: { openDelay: 200 } },
    Menu: { defaultProps: { radius: 'md', shadow: 'md' } },
    Anchor: { defaultProps: { c: 'link.6' } },
  },
});
