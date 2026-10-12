import { Center, Loader, Menu, Text, Tooltip, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useDocumentTitle, useLocalStorage } from '@mantine/hooks';
import { Spotlight, spotlight, type SpotlightActionData } from '@mantine/spotlight';
import {
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
  IconUserCircle,
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
      <nav className="rail" data-collapsed={collapsed} aria-label="Nhóm chức năng">
        <div className="rail-group">
          <div className="rail-item rail-item-brand">
            <Link to="/" className="rail-brand focus-ring" aria-label="Trang chủ MES Vietsun" onClick={linkClick('/')}>
              <span className="rail-logo-full"><BrandMark height={46} /></span>
              <span className="rail-logo-mark"><BrandMark variant="mark" height={44} /></span>
            </Link>
          </div>
          <div className="rail-divider" />
          {mainGroups.map(railButton)}
        </div>
        <div className="rail-group">{adminGroups.map(railButton)}</div>
        <Tooltip label={collapsed ? 'Mở rộng menu' : 'Rút gọn menu'} position="right" withArrow>
          <button type="button" className="rail-toggle focus-ring" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Mở rộng menu' : 'Rút gọn menu'}>
            {collapsed ? <IconChevronRight size={14} stroke={2.2} /> : <IconChevronLeft size={14} stroke={2.2} />}
          </button>
        </Tooltip>
      </nav>

      <div className="app-body">
        <header className="topbar">
          <span className="brand-chip">MES - VSN</span>

          <BranchSwitcher handle={switcher} />

          <button type="button" className="searchbar" onClick={() => spotlight.open()} aria-keyshortcuts="Control+K">
            <span className="searchbar-scope">Màn hình</span>
            <span className="searchbar-text">Tìm màn hình theo tên, ví dụ "Xếp chuyền"</span>
            <kbd className="searchbar-key">Ctrl K</kbd>
            <span className="searchbar-go"><IconSearch size={20} stroke={2} /></span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
            <button type="button" className="nav-btn nav-icon-btn nav-search-icon focus-ring" onClick={() => spotlight.open()} aria-label="Tìm màn hình">
              <IconSearch size={20} />
            </button>
            <Tooltip label={scheme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} openDelay={300}>
              <button
                type="button"
                className="nav-btn nav-icon-btn focus-ring"
                onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
                aria-label={scheme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
              >
                {scheme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
              </button>
            </Tooltip>

            <Menu position="bottom-end" width={240}>
              <Menu.Target>
                <button type="button" className="nav-btn nav-account focus-ring" aria-label={`Xin chào ${user?.fullName ?? ''}, mở menu tài khoản`}>
                  <IconUserCircle size={22} stroke={1.6} className="nav-account-icon" />
                  <span className="nav-btn-stack">
                    <span className="nav-btn-small">Xin chào</span>
                    <span className="nav-btn-main" style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.fullName}</span>
                      <IconChevronDown size={14} style={{ flexShrink: 0 }} />
                    </span>
                  </span>
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
