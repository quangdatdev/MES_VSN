interface Props {
  /** full: logo đầy đủ chữ VIETSUN; mark: chỉ hình mặt trời */
  variant?: 'full' | 'mark';
  height?: number;
}

/** Logo Vietsun nguyên bản, đặt trên nền trắng để chữ xám và viền xám của logo đọc rõ trên cả nền tối. */
export function BrandMark({ variant = 'full', height = 40 }: Props) {
  const full = variant === 'full';
  return (
    <span
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        verticalAlign: 'top',
        boxSizing: 'border-box',
        background: '#fff',
        borderRadius: 8,
        padding: full ? '4px 10px' : 4,
        height,
        width: full ? 'auto' : height,
        flexShrink: 0,
      }}
    >
      {/* Hình mặt trời không vuông (rộng hơn cao): co vừa ô vuông, giữ tỉ lệ, nằm giữa, không bị cắt mép */}
      <img
        src={full ? '/logo-vs.png' : '/logo-vs-mark.png'}
        alt="Vietsun"
        style={full ? { height: height - 8, width: 'auto', display: 'block' } : { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
}
