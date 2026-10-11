import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { FallbackRoute } from '../routes/FallbackRoute';
import { Can } from '../shell/Can';
import { AnonymousOnly, RequireReady } from '../shell/guards';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';
import type { MenuNode } from '../lib/types';

const leaf = (code: string, name: string, path: string): MenuNode => ({ code, name, icon: null, path, isMobile: false, children: [] });
const MENU: MenuNode[] = [
  { code: 'menu.order', name: 'Đơn hàng', icon: null, path: null, isMobile: false, children: [leaf('menu.order.shipment', 'Kế hoạch xuất hàng', '/order/shipment')] },
  // Màn chưa có nội dung nghiệp vụ: hiện trang giữ chỗ
  { code: 'menu.cutting', name: 'Cắt', icon: null, path: null, isMobile: false, children: [leaf('menu.cutting.progress', 'Đồng bộ tiến độ cắt', '/cutting/progress')] },
];

function ready(perms: string[], isAggregate = false) {
  useSession.getState().set({
    status: 'ready',
    user: { id: 1, username: 'u', fullName: 'Người dùng' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate },
    permissions: new Set(perms),
    menu: MENU,
  });
}

function renderAt(path: string, ui: React.ReactNode) {
  return render(
    <MantineProvider theme={theme}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </MantineProvider>,
  );
}

describe('Giao diện chỉ ẩn/hiện theo quyền từ server', () => {
  beforeEach(() => useSession.getState().reset('anonymous'));

  it('Can chỉ hiện khi có quyền', () => {
    ready(['order.po:view']);
    renderAt('/', <><Can permission="order.po:view"><span>thấy</span></Can><Can permission="order.po:update"><span>sửa</span></Can></>);
    expect(screen.getByText('thấy')).toBeInTheDocument();
    expect(screen.queryByText('sửa')).not.toBeInTheDocument();
  });

  it('chưa đăng nhập thì chuyển về /login', () => {
    renderAt('/order/po', (
      <Routes>
        <Route path="/login" element={<div>trang đăng nhập</div>} />
        <Route element={<RequireReady />}><Route path="*" element={<div>nội dung</div>} /></Route>
      </Routes>
    ));
    expect(screen.getByText('trang đăng nhập')).toBeInTheDocument();
  });

  it('có token tạm (chưa chọn nhà máy) thì về màn đăng nhập, nơi có bước chọn nhà máy', () => {
    useSession.getState().set({ status: 'preauth' });
    renderAt('/', (
      <Routes>
        <Route path="/login" element={<div>chọn nhà máy</div>} />
        <Route element={<RequireReady />}><Route path="*" element={<div>nội dung</div>} /></Route>
      </Routes>
    ));
    expect(screen.getByText('chọn nhà máy')).toBeInTheDocument();
  });

  it('có token tạm thì /login vẫn mở (bước chọn nhà máy), không chuyển hướng vòng', () => {
    useSession.getState().set({ status: 'preauth' });
    renderAt('/login', (
      <Routes>
        <Route path="/" element={<div>trang chủ</div>} />
        <Route element={<AnonymousOnly />}><Route path="/login" element={<div>đăng nhập</div>} /></Route>
      </Routes>
    ));
    expect(screen.getByText('đăng nhập')).toBeInTheDocument();
  });

  it('đã đăng nhập thì /login đưa về trang chủ', () => {
    ready([]);
    renderAt('/login', (
      <Routes>
        <Route path="/" element={<div>trang chủ</div>} />
        <Route element={<AnonymousOnly />}><Route path="/login" element={<div>đăng nhập</div>} /></Route>
      </Routes>
    ));
    expect(screen.getByText('trang chủ')).toBeInTheDocument();
  });

  it('đường dẫn có trong menu mở được; thuộc module nhưng không có trong menu là 403; lạ là 404', () => {
    ready(['cutting.progress:view']);
    const { unmount } = renderAt('/cutting/progress', <Routes><Route path="*" element={<FallbackRoute />} /></Routes>);
    expect(screen.getByRole('heading', { name: 'Đồng bộ tiến độ cắt' })).toBeInTheDocument();
    unmount();

    const r2 = renderAt('/report/revenue', <Routes><Route path="*" element={<FallbackRoute />} /></Routes>);
    expect(screen.getByText('Bạn chưa có quyền vào màn hình này')).toBeInTheDocument();
    r2.unmount();

    renderAt('/khong-co', <Routes><Route path="*" element={<FallbackRoute />} /></Routes>);
    expect(screen.getByText('Không tìm thấy trang')).toBeInTheDocument();
  });

  it('đường dẫn cũ của màn đã đổi nhóm chuyển sang đường dẫn mới, giữ bộ lọc', () => {
    ready([]);
    const Shown = () => <p>{`Màn mới ${useLocation().pathname}${useLocation().search}`}</p>;
    renderAt('/sewing/prep?status=OVERDUE', <Routes><Route path="/order/prep" element={<Shown />} /><Route path="*" element={<FallbackRoute />} /></Routes>);
    expect(screen.getByText('Màn mới /order/prep?status=OVERDUE')).toBeInTheDocument();
  });

  it('trang giữ chỗ hiện đúng quyền, và khóa thao tác ghi ở chế độ tổng hợp', () => {
    ready(['cutting.progress:view', 'cutting.progress:update'], true);
    renderAt('/cutting/progress', <Routes><Route path="*" element={<FallbackRoute />} /></Routes>);
    expect(screen.getByText('Xem')).toBeInTheDocument();
    expect(screen.getByText(/mọi thao tác ghi đều bị khóa/)).toBeInTheDocument();
  });
});
