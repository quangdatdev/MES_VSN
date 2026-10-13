import { Center, Loader, Menu, Text, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useDocumentTitle, useLocalStorage } from '@mantine/hooks';
import { Spotlight, spotlight, type SpotlightActionData } from '@mantine/spotlight';
import {
  IconBuildingFactory2,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconLayoutDashboard,
  IconLogout,
  IconMoon,
  IconSearch,
  IconSun,
  IconSwitchHorizontal,
  IconUser,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { preloadPage } from '../routes/registry';
import { PageErrorBoundary } from '../features/errors/ErrorPages';
import { guardedLeave } from '../lib/leaveGuard';
import { logout } from '../store/auth';
import { useSession } from '../store/session';
import { BranchSwitcher, type BranchSwitcherHandle } from './BranchSwitcher';
import { iconFor } from './menuIcons';
import { flattenLeaves } from './permissions';

export function AppLayout() {
  const [collapsed, setCollapsed] = useLocalStorage({ key: 'mes.nav.collapsed', defaultValue: false });
  const menu = useSession((s) => s.menu);
  const user = useSession((s) => s.user);
  const roles = useSession((s) => s.roles);
  const location = useLocation();
  const { pathname } = location;
  const switchCount = useSession((s) => s.switchCount);
  // Tự đổi nhà máy (BranchSwitcher): gỡ màn cũ ngay, không vẽ lại theo quyền của nhà máy mới; URL mới (bỏ bộ lọc của nhà
  // máy cũ) tới thì mở màn từ đầu. React Router đổi URL trong transition nên tới sau lần đổi phiên một nhịp. Tab khác đổi
  // nhà máy thì không tăng số này: màn giữ phần đang nhập, lệnh ghi bị chặn bằng BRANCH_CHANGED.
  const [shown, setShown] = useState(switchCount);
  const arrived = (location.state as { branchSwitch?: number } | null)?.branchSwitch === switchCount;
  if (shown !== switchCount && arrived) setShown(switchCount);
  const reopening = shown !== switchCount;
  const navigate = useNavigate();
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme('light');

  const leaves = useMemo(() => flattenLeaves(menu), [menu]);
  const activeLeaf = leaves.find((l) => l.path === pathname);
  const activeGroup = activeLeaf?.group ?? null;
  // Tên tab trình duyệt theo màn: mở nhiều tab hoặc xem lịch sử vẫn biết tab nào là màn nào
  useDocumentTitle(activeLeaf ? `${activeLeaf.name} – MES Vietsun` : pathname === '/' ? 'Trang chủ – MES Vietsun' : 'MES Vietsun');

  // Nhóm quản trị (biểu tượng bánh răng) nằm cuối thanh bên, các nhóm nghiệp vụ nằm trên.
  const mainGroups = menu.filter((g) => g.icon !== 'settings');
  const adminGroups = menu.filter((g) => g.icon === 'settings');

  /** Rời màn hiện tại (còn thay đổi chưa lưu thì hỏi lại trước); đang ở đúng màn đó thì không làm gì. */
  const go = (path: string) => path !== pathname && guardedLeave(() => navigate(path));
  /** Liên kết của khung: Ctrl/Shift + bấm vẫn mở tab mới như liên kết thường; bấm thường thì đi qua `go`. */
  const linkClick = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(path);
  };

  const actions = useMemo<SpotlightActionData[]>(
    () => [
      { id: 'home', label: 'Trang chủ', description: 'Tổng quan và lối tắt', onClick: () => pathname !== '/' && guardedLeave(() => navigate('/')), leftSection: <IconLayoutDashboard size={18} /> },
      ...leaves.map((l) => {
        const Icon = iconFor(l.group.icon);
        // Chọn lại chính màn đang mở: không làm gì (không hỏi, không mất phần đang sửa)
        return { id: l.code, label: l.name, description: l.group.name, onClick: () => l.path !== pathname && guardedLeave(() => navigate(l.path!)), leftSection: <Icon size={18} /> };
      }),
    ],
    [leaves, navigate, pathname],
  );

  // Trên màn hẹp, dải tab cuộn ngang: đưa tab đang mở vào tầm nhìn
  const tabbar = useRef<HTMLElement>(null);
  const main = useRef<HTMLElement>(null);
  const switcher = useRef<BranchSwitcherHandle>(null);
  useEffect(() => {
    tabbar.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [pathname]);

  const railButton = (g: (typeof menu)[number]) => {
    const Icon = iconFor(g.icon);
    const first = g.children.find((c) => c.path)?.path;
    const active = activeGroup?.code === g.code;
    if (!first) return null;
    return (
      <div key={g.code} className="rail-item">
        <Link to={first} className="rail-btn focus-ring" data-active={active} aria-label={g.name} aria-current={active ? 'true' : undefined} onClick={linkClick(first)} onPointerEnter={() => preloadPage(first)} onFocus={() => preloadPage(first)}>
          <Icon size={20} stroke={1.7} />
          <span className="rail-label">{g.name}</span>
          {/* Chỉ để trang trí (quyết định 12.3): bấm nhóm vẫn mở màn đầu tiên, màn con nằm ở dải menu con */}
          <IconChevronRight size={16} stroke={1.8} className="rail-caret" aria-hidden />
        </Link>
      </div>
    );
  };

  return (
    <div className="app">
      {/* Người dùng bàn phím bỏ qua menu, thanh trên để vào thẳng nội dung */}
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          main.current?.focus();
        }}
      >
        Bỏ qua tới nội dung chính
      </a>

      {/* Thanh trên sáng, chạy hết chiều ngang, chứa logo (quyết định 12.3) */}
      <header className="topbar">
        <Link to="/" className="topbar-brand focus-ring" aria-label="Trang chủ MES Vietsun" onClick={linkClick('/')}>
          <BrandMark height={50} className="topbar-logo-full" />
          <BrandMark variant="mark" height={34} className="topbar-logo-mark" />
        </Link>
        <span className="brand-chip">
          <IconBuildingFactory2 size={18} stroke={1.8} aria-hidden />
          MES - VSN
        </span>

        <BranchSwitcher handle={switcher} />
        <span className="topbar-sep" aria-hidden />

        <button type="button" className="searchbar focus-ring" onClick={() => spotlight.open()} aria-keyshortcuts="Control+K">
          <IconSearch size={18} stroke={1.8} className="searchbar-icon" aria-hidden />
          <span className="searchbar-text">Tìm màn hình theo tên, ví dụ: "Xếp chuyền"</span>
          <kbd className="searchbar-key">Ctrl K</kbd>
        </button>

        <div className="topbar-tools">
          <button type="button" className="nav-btn nav-icon-btn nav-search-icon focus-ring" onClick={() => spotlight.open()} aria-label="Tìm màn hình">
            <IconSearch size={20} />
          </button>
          <span className="topbar-sep" aria-hidden />
          <div className="scheme-toggle" role="group" aria-label="Giao diện sáng hoặc tối">
            <Tooltip label="Giao diện sáng" openDelay={300}>
              <button type="button" className="scheme-btn focus-ring" aria-pressed={scheme === 'light'} aria-label="Giao diện sáng" onClick={() => setColorScheme('light')}>
                <IconSun size={20} stroke={1.8} />
              </button>
            </Tooltip>
            <Tooltip label="Giao diện tối" openDelay={300}>
              <button type="button" className="scheme-btn focus-ring" aria-pressed={scheme === 'dark'} aria-label="Giao diện tối" onClick={() => setColorScheme('dark')}>
                <IconMoon size={20} stroke={1.8} />
              </button>
            </Tooltip>
          </div>
          <span className="topbar-sep" aria-hidden />

          <Menu position="bottom-end" width={240}>
            <Menu.Target>
              <button type="button" className="nav-btn nav-account focus-ring" aria-label={`Xin chào ${user?.fullName ?? ''}, mở menu tài khoản`}>
                <span className="nav-avatar" aria-hidden>
                  <IconUser size={20} stroke={1.7} />
                </span>
                <span className="nav-btn-stack">
                  <span className="nav-btn-small">Xin chào</span>
                  <span className="nav-btn-main">{user?.fullName}</span>
                </span>
                <IconChevronDown size={16} className="nav-account-caret" aria-hidden />
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>
                <Text fw={700} c="var(--app-ink)" size="sm">{user?.fullName}</Text>
                <Text size="xs" c="dimmed">{roles.map((r) => r.name).join(', ')}</Text>
              </Menu.Label>
              <Menu.Divider />
              {/* Menu đóng xong (trả focus về nút tài khoản) mới mở danh sách đơn vị cơ sở */}
              <Menu.Item leftSection={<IconSwitchHorizontal size={15} />} onClick={() => requestAnimationFrame(() => switcher.current?.open())}>
                Đổi đơn vị cơ sở
              </Menu.Item>
              <Menu.Item
                color="red"
                leftSection={<IconLogout size={15} />}
                onClick={() =>
                  guardedLeave(async () => {
                    await logout();
                    navigate('/login', { replace: true });
                  })
                }
              >
                Đăng xuất
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
      </header>

      <div className="app-frame">
        <nav className="rail" data-collapsed={collapsed} aria-label="Nhóm chức năng">
          <div className="rail-group">{mainGroups.map(railButton)}</div>
          <div className="rail-group">{adminGroups.map(railButton)}</div>
          <Tooltip label={collapsed ? 'Mở rộng menu' : 'Rút gọn menu'} position="right" withArrow>
            <button type="button" className="rail-toggle focus-ring" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Mở rộng menu' : 'Rút gọn menu'}>
              {collapsed ? <IconChevronRight size={14} stroke={2.2} /> : <IconChevronLeft size={14} stroke={2.2} />}
            </button>
          </Tooltip>
        </nav>

        <div className="app-body">
          <nav ref={tabbar} className="tabbar" aria-label={activeGroup ? activeGroup.name : 'Trang chủ'}>
            {activeGroup ? (
              <>
                <span className="tab-group-name">{activeGroup.name}</span>
                {activeGroup.children.filter((c) => c.path).map((c) => {
                  const current = c.path === pathname;
                  return (
                    <Link key={c.code} to={c.path!} className="tab focus-ring" aria-current={current ? 'page' : undefined} onClick={linkClick(c.path!)} onPointerEnter={() => preloadPage(c.path)} onFocus={() => preloadPage(c.path)}>
                      {c.name}
                    </Link>
                  );
                })}
              </>
            ) : (
              <Link to="/" className="tab focus-ring" aria-current={pathname === '/' ? 'page' : undefined} onClick={linkClick('/')}>
                <IconHome size={15} />
                Trang chủ
              </Link>
            )}
          </nav>

          {/* Thẻ trắng trên nền xám: chính vùng cuộn này mang khung thẻ, các màn không phải bọc thêm */}
          <main ref={main} id="main" tabIndex={-1} className="app-main">
            <PageErrorBoundary resetKey={`${pathname}|${shown}`}>
              {reopening ? (
                <Center py="xl">
                  <Loader color="brand" role="status" aria-label="Đang mở lại màn theo đơn vị cơ sở mới" />
                </Center>
              ) : (
                <Outlet key={shown} />
              )}
            </PageErrorBoundary>
          </main>
        </div>
      </div>

      <Spotlight
        actions={actions}
        shortcut={['mod + K']}
        nothingFound="Không có màn hình nào khớp"
        highlightQuery
        searchProps={{ placeholder: 'Gõ tên màn hình...', 'aria-label': 'Tìm màn hình' }}
      />
    </div>
  );
}
