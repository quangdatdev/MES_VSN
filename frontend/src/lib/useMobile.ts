import { useMediaQuery } from '@mantine/hooks';

/** Màn hình điện thoại (dưới 768px, cùng mốc với CSS): popup lớn chuyển toàn màn hình. */
export const useMobile = () => useMediaQuery('(max-width: 47.99em)') ?? false;
