interface Props {
  /** full: logo đầy đủ chữ VIETSUN; mark: chỉ hình mặt trời (nền trong suốt, dùng được trên nền sáng và tối) */
  variant?: 'full' | 'mark';
  height?: number;
  /** auto: theo chế độ sáng/tối của ứng dụng; dark: luôn bản chữ trắng (nền màn đăng nhập luôn tối) */
  tone?: 'auto' | 'dark';
  className?: string;
}

/**
 * Logo Vietsun. Logo gốc chữ xám trên nền trắng đặc nên trên nền tối phải dùng bản chữ trắng, nền trong suốt.
 * Chế độ auto đặt cả hai ảnh, CSS chọn theo chế độ màu: không nháy bản sáng lúc mở trang ở chế độ tối.
 * Ảnh bị ẩn có loading="lazy" nên trình duyệt không tải.
 */
export function BrandMark({ variant = 'full', height = 40, tone = 'auto', className }: Props) {
  const size = { height, width: 'auto' };
  const cls = (base: string) => (className ? `${base} ${className}` : base);
  if (variant === 'mark') return <img src="/logo-vs-sun.png" alt="Vietsun" className={cls('brand-img')} style={size} />;
  if (tone === 'dark') return <img src="/logo-vs-dark.png" alt="Vietsun" className={cls('brand-img')} style={size} />;
  return (
    <span className={cls('brand-logo')}>
      <img src="/logo-vs.png" alt="Vietsun" className="brand-img brand-logo-light" style={size} />
      <img src="/logo-vs-dark.png" alt="Vietsun" className="brand-img brand-logo-dark" loading="lazy" style={size} />
    </span>
  );
}
