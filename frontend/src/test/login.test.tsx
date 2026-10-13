import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '../features/auth/LoginPage';
import { api, ApiError } from '../lib/api';
import type { Branch } from '../lib/types';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

const A00: Branch = { code: 'A00', name: 'Toàn công ty', isAggregate: true };
const A01: Branch = { code: 'A01', name: 'VSN', isAggregate: false };
const A02: Branch = { code: 'A02', name: 'VDC', isAggregate: false };

interface Server {
  /** Lỗi của lần gọi /auth/login */
  loginError?: Error;
  /** Lỗi của từng lần gọi /auth/select-branch theo thứ tự (null: thành công) */
  selectErrors?: (Error | null)[];
  /** /me lỗi mạng sau khi chọn đơn vị cơ sở thành công */
  meFails?: boolean;
}

/** Máy chủ giả: người dùng id 1 được vào `branches` */
function serve(branches: Branch[], { loginError, selectErrors = [], meFails = false }: Server = {}) {
  let current = branches[0];
  let selects = 0;
  vi.mocked(api).mockImplementation((async (path: string, opts?: { body?: { branchCode?: string } }) => {
    if (path === '/auth/login') {
      if (loginError) throw loginError;
      return { preAuthToken: 'tam', user: { id: 1, fullName: 'Nguyễn Văn An' }, branches };
    }
    if (path === '/auth/select-branch') {
      const fail = selectErrors[selects++];
      if (fail) throw fail;
      current = branches.find((b) => b.code === opts?.body?.branchCode)!;
      return { accessToken: 'token', expiresIn: 900, branch: current };
    }
    if (path === '/me' && meFails) throw new TypeError('Failed to fetch');
    if (path === '/me') return { user: { id: 1, username: 'an', fullName: 'Nguyễn Văn An' }, branch: current, roles: [], permissionVersion: 1 };
    if (path === '/me/permissions') return { permissions: [], version: 1, stamp: 's' };
    if (path === '/me/field-policies') return { resources: {} };
    return [];
  }) as unknown as typeof api);
}

const callsTo = (path: string) => vi.mocked(api).mock.calls.filter((c) => c[0] === path);
const sentBody = (path: string, i = 0) => (callsTo(path)[i]?.[1] as { body?: Record<string, string> } | undefined)?.body;

function renderLogin() {
  return render(
    <MantineProvider theme={theme}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>trang chủ</div>} />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

const usernameBox = () => screen.getByLabelText(/Tài khoản/) as HTMLInputElement;
const passwordBox = () => screen.getByLabelText(/Mật khẩu/) as HTMLInputElement;
/** Đúng mật khẩu, tài khoản nhiều ĐVCS: ô Đơn vị cơ sở mở ra ngay trên form, nút đổi thành Vào làm việc */
const branchStep = () => screen.findByRole('button', { name: 'Vào làm việc' });

function signIn(username = 'an', password = 'mat-khau') {
  fireEvent.change(usernameBox(), { target: { value: username } });
  fireEvent.change(passwordBox(), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
}

describe('Màn đăng nhập', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    localStorage.clear();
    useSession.getState().reset('anonymous');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (navigator as { credentials?: unknown }).credentials;
  });

  it('chỉ có tài khoản, mật khẩu, ô ghi nhớ, Quên mật khẩu; không còn nút tài khoản mẫu hay chú thích', () => {
    renderLogin();
    expect(usernameBox()).toBeInTheDocument();
    expect(passwordBox()).toBeInTheDocument();
    expect(screen.getByLabelText('Ghi nhớ đăng nhập')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'admin' })).not.toBeInTheDocument();
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
    // Ô bắt buộc không có dấu * ở riêng màn đăng nhập (quyết định 12.3); thiếu thì vẫn báo dưới ô
    expect(document.querySelector('.mantine-InputWrapper-required')).toBeNull();
  });

  it('Quên mật khẩu: chỉ hướng dẫn liên hệ quản trị viên, không gửi form, không gọi máy chủ', async () => {
    renderLogin();
    fireEvent.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
    expect(await screen.findByText(/Liên hệ quản trị viên hệ thống để được đặt lại mật khẩu/)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    // Không gửi form: chưa có lỗi "Nhập tên đăng nhập" dưới ô trống
    expect(screen.queryByText('Nhập tên đăng nhập')).not.toBeInTheDocument();
  });

  it('chân trang có số phiên bản lấy từ package.json, góc trên có ngày giờ', () => {
    renderLogin();
    expect(screen.getByText(`Version ${__APP_VERSION__}`)).toBeInTheDocument();
    expect(screen.getByText(/^(Chủ nhật|Thứ [2-7]), \d{2}\/\d{2}\/\d{4}$/)).toBeInTheDocument();
  });

  it('sai mật khẩu: báo rõ, ở lại bước mật khẩu', async () => {
    serve([A01], { loginError: new ApiError(401, 'INVALID_CREDENTIALS', 'Sai.') });
    renderLogin();
    signIn();
    expect(await screen.findByText('Tên đăng nhập hoặc mật khẩu chưa đúng. Hãy kiểm tra lại.')).toBeInTheDocument();
    expect(callsTo('/auth/select-branch')).toHaveLength(0);
  });

  it('mật khẩu trình duyệt tự điền mà không báo sự kiện cho React vẫn được gửi', async () => {
    serve([A01]);
    renderLogin();
    // Gán thẳng giá trị như trình duyệt tự điền, không phát sự kiện change
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setValue.call(usernameBox(), 'an');
    setValue.call(passwordBox(), 'tu-dien');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('trang chủ')).toBeInTheDocument();
    expect(sentBody('/auth/login')).toEqual({ username: 'an', password: 'tu-dien' });
  });

  it('tài khoản chưa được gán đơn vị cơ sở: báo, không giữ token tạm', async () => {
    serve([]);
    renderLogin();
    signIn();
    expect(await screen.findByText('Tài khoản chưa có đơn vị cơ sở')).toBeInTheDocument();
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().preAuthToken).toBeNull();
  });

  it('tài khoản một đơn vị cơ sở: vào thẳng ứng dụng, không hỏi đơn vị', async () => {
    serve([A01]);
    renderLogin();
    signIn();
    expect(await screen.findByText('trang chủ')).toBeInTheDocument();
    expect(sentBody('/auth/select-branch')?.branchCode).toBe('A01');
  });

  it('nhiều đơn vị cơ sở: ô Đơn vị cơ sở hiện ngay trên form đăng nhập (không sang trang khác), chọn sẵn đơn vị lần trước của chính người đó', async () => {
    localStorage.setItem('mes.branch.1', 'A02');
    serve([A00, A01, A02]);
    renderLogin();
    signIn();
    await branchStep();
    // Vẫn là form đăng nhập: tên, mật khẩu còn đó nhưng khóa lại; không còn ô nhớ
    expect(screen.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeInTheDocument();
    expect(document.title).toBe('Đăng nhập – MES Vietsun');
    expect(usernameBox()).toHaveValue('an');
    expect(usernameBox()).toHaveAttribute('readonly');
    expect(passwordBox()).toHaveAttribute('readonly');
    // Mật khẩu không nằm lại trên form trong lúc chọn ĐVCS
    expect(passwordBox()).toHaveValue('');
    expect(screen.queryByLabelText('Ghi nhớ đăng nhập')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đăng nhập' })).not.toBeInTheDocument();
    expect(screen.getByText('Xin chào, Nguyễn Văn An. Chọn đơn vị cơ sở để vào làm việc.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('VDC')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vào làm việc' }));
    expect(await screen.findByText('trang chủ')).toBeInTheDocument();
    expect(sentBody('/auth/select-branch')?.branchCode).toBe('A02');
    expect(localStorage.getItem('mes.branch.1')).toBe('A02');
  });

  it('không chọn sẵn đơn vị của người khác hay đơn vị không còn được vào; chưa chọn thì không gửi', async () => {
    localStorage.setItem('mes.branch.2', 'A02');
    serve([A01, A02]);
    const first = renderLogin();
    signIn();
    await branchStep();
    expect(screen.queryByDisplayValue('VDC')).not.toBeInTheDocument();
    first.unmount();

    useSession.getState().reset('anonymous');
    localStorage.setItem('mes.branch.1', 'A09');
    renderLogin();
    signIn();
    await branchStep();
    fireEvent.click(screen.getByRole('button', { name: 'Vào làm việc' }));
    expect(await screen.findByText('Chọn đơn vị cơ sở để vào làm việc')).toBeInTheDocument();
    expect(callsTo('/auth/select-branch')).toHaveLength(0);
  });

  it('chọn đơn vị lỗi (không phải 401): ở lại bước chọn, báo lỗi, bấm lại được', async () => {
    localStorage.setItem('mes.branch.1', 'A02');
    serve([A01, A02], { selectErrors: [new ApiError(403, 'BRANCH_NOT_ALLOWED', 'Bạn không được phép chọn đơn vị cơ sở này.')] });
    renderLogin();
    signIn();
    await branchStep();
    fireEvent.click(screen.getByRole('button', { name: 'Vào làm việc' }));
    expect(await screen.findByText('Bạn không được phép chọn đơn vị cơ sở này.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vào làm việc' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Vào làm việc' }));
    expect(await screen.findByText('trang chủ')).toBeInTheDocument();
  });

  it('đã cấp phiên mà chưa tải được quyền: thu hồi cookie ngay, ở lại bước chọn', async () => {
    localStorage.setItem('mes.branch.1', 'A01');
    serve([A01, A02], { meFails: true });
    renderLogin();
    signIn();
    await branchStep();
    fireEvent.click(screen.getByRole('button', { name: 'Vào làm việc' }));
    expect(await screen.findByText('Không kết nối được máy chủ')).toBeInTheDocument();
    expect(callsTo('/auth/logout')).toHaveLength(1);
  });

  it('token tạm hết hạn: mở lại ô tên, mật khẩu, báo đăng nhập lại, giữ tên vừa gõ', async () => {
    localStorage.setItem('mes.branch.1', 'A01');
    serve([A01, A02], { selectErrors: [new ApiError(401, 'TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn.')] });
    renderLogin();
    signIn('an');
    await branchStep();
    fireEvent.click(screen.getByRole('button', { name: 'Vào làm việc' }));
    expect(await screen.findByText('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(usernameBox()).toHaveValue('an');
    expect(usernameBox()).not.toHaveAttribute('readonly');
    expect(passwordBox()).toHaveValue('');
  });

  it('401 vì lý do khác (mật khẩu vừa đổi): báo đúng lý do máy chủ trả', async () => {
    localStorage.setItem('mes.branch.1', 'A01');
    serve([A01, A02], { selectErrors: [new ApiError(401, 'UNAUTHENTICATED', 'Mật khẩu đã được đổi. Hãy đăng nhập lại.')] });
    renderLogin();
    signIn();
    await branchStep();
    fireEvent.click(screen.getByRole('button', { name: 'Vào làm việc' }));
    expect(await screen.findByText('Mật khẩu đã được đổi. Hãy đăng nhập lại.')).toBeInTheDocument();
  });

  it('Đăng nhập tài khoản khác: đăng xuất hẳn (thu hồi cookie), về bước mật khẩu trống', async () => {
    serve([A01, A02]);
    renderLogin();
    signIn('an');
    await branchStep();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập tài khoản khác' }));
    expect(await screen.findByRole('button', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(callsTo('/auth/logout')).toHaveLength(1);
    expect(useSession.getState().status).toBe('anonymous');
    expect(useSession.getState().preAuthToken).toBeNull();
    expect(usernameBox()).toHaveValue('');
  });

  it('nhớ mật khẩu: nhờ trình duyệt lưu khi tích, ứng dụng không giữ mật khẩu', async () => {
    const store = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('PasswordCredential', class {
      constructor(readonly init: unknown) {}
    });
    Object.defineProperty(navigator, 'credentials', { value: { store }, configurable: true });
    serve([A01]);

    const first = renderLogin();
    signIn('an', 'bi-mat-1');
    await screen.findByText('trang chủ');
    expect(store).not.toHaveBeenCalled();
    first.unmount();

    useSession.getState().reset('anonymous');
    renderLogin();
    fireEvent.click(screen.getByLabelText('Ghi nhớ đăng nhập'));
    signIn('an', 'bi-mat-2');
    await screen.findByText('trang chủ');
    expect(store).toHaveBeenCalledTimes(1);
    expect((store.mock.calls[0][0] as { init: unknown }).init).toEqual({ id: 'an', password: 'bi-mat-2', name: 'Nguyễn Văn An' });
    const saved = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '');
    expect(saved.some((v) => v.includes('bi-mat'))).toBe(false);
  });

  it('nhớ tài khoản: lần sau điền sẵn tên; bỏ tích thì quên', async () => {
    serve([A01]);
    const first = renderLogin();
    fireEvent.click(screen.getByLabelText('Ghi nhớ đăng nhập'));
    signIn('kehoach.a');
    await screen.findByText('trang chủ');
    expect(localStorage.getItem('mes.username')).toBe('kehoach.a');
    first.unmount();

    useSession.getState().reset('anonymous');
    renderLogin();
    expect(usernameBox()).toHaveValue('kehoach.a');
    expect(screen.getByLabelText('Ghi nhớ đăng nhập')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Ghi nhớ đăng nhập'));
    signIn('kehoach.a');
    await screen.findByText('trang chủ');
    await waitFor(() => expect(localStorage.getItem('mes.username')).toBeNull());
  });
});
