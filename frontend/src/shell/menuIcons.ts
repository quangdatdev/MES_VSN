import {
  IconBuildingFactory2,
  IconChartBar,
  IconClipboardList,
  IconPackage,
  IconPoint,
  IconScissors,
  IconSettings,
  IconShieldCheck,
  IconNeedleThread,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

// Backend trả tên biểu tượng (chuỗi); frontend ánh xạ sang component. Tên lạ dùng biểu tượng mặc định.
const map: Record<string, Icon> = {
  'clipboard-list': IconClipboardList,
  scissors: IconScissors,
  'needle-thread': IconNeedleThread,
  package: IconPackage,
  'shield-check': IconShieldCheck,
  users: IconUsers,
  'chart-bar': IconChartBar,
  settings: IconSettings,
  factory: IconBuildingFactory2,
};

export function iconFor(name: string | null | undefined): Icon {
  return (name && map[name]) || IconPoint;
}
