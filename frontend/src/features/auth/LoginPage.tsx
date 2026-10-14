// Font Inter chỉ cho màn đăng nhập (quyết định 12.4): chỉ bộ chữ Latin và tiếng Việt, trình duyệt tải khi màn này hiện chữ
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/vietnamese-400.css';
import '@fontsource/inter/vietnamese-500.css';
import '@fontsource/inter/vietnamese-600.css';
import '@fontsource/inter/vietnamese-700.css';
import { Alert, Anchor, Button, Checkbox, Group, PasswordInput, Popover, Select, Stack, Text, TextInput, Title, type ButtonProps, type SelectProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDocumentTitle } from '@mantine/hooks';
import {
  IconAlertCircle,
  IconArrowRight,
  IconBuildingFactory2,
  IconCircleCheck,
  IconClock,
  IconEye,
  IconEyeOff,
  IconLock,
  IconShieldCheck,
  IconUser,
} from '@tabler/icons-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../../components/BrandMark';
import { ApiError, endSession } from '../../lib/api';
import type { Branch } from '../../lib/types';
import { lastBranchCode, login, logout, selectBranch } from '../../store/auth';
import { useSession } from '../../store/session';

const REMEMBER_KEY = 'mes.username';

/** Khẩu hiệu công ty (giá trị cốt lõi), chữ đầu màu cam theo bộ nhận diện Vietsun */
const CORE_VALUES = ['Trust', 'Passion', 'Innovation', 'Sustainability'];

type Problem = { title: string; text: string };

function remembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberUsername(username: string | null) {
  try {
    if (username) localStorage.setItem(REMEMBER_KEY, username);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    /* không lưu được thì bỏ qua */
  }
}

type PasswordCredentialInit = { id: string; password: string; name?: string };

/**
 * Mật khẩu do trình quản lý mật khẩu của trình duyệt giữ, ứng dụng không tự lưu (máy trong xưởng hay dùng chung).
 * Chrome, Edge hỗ trợ thì hỏi lưu ngay; trình duyệt khác hoặc trang chạy HTTP thì trình duyệt tự hỏi theo cách riêng.
 */
function offerToSavePassword(username: string, password: string, name: string) {
  const Ctor = (window as unknown as { PasswordCredential?: new (init: PasswordCredentialInit) => Credential }).PasswordCredential;
  if (!Ctor || !navigator.credentials) return;
  navigator.credentials.store(new Ctor({ id: username, password, name })).catch(() => undefined);
}

function describe(e: unknown): Problem {
  if (e instanceof ApiError) {
    if (e.code === 'INVALID_CREDENTIALS') return { title: 'Chưa đăng nhập được', text: 'Tên đăng nhập hoặc mật khẩu chưa đúng. Hãy kiểm tra lại.' };
    if (e.code === 'ACCOUNT_LOCKED') {
      const until = (e.details as { until?: string } | null)?.until;
      const time = until ? new Date(until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;
      return { title: 'Tài khoản đang bị khóa tạm', text: `Bạn đã nhập sai nhiều lần.${time ? ` Thử lại sau ${time}.` : ''} Cần mở khóa sớm, hãy liên hệ quản trị viên.` };
    }
    if (e.code === 'VALIDATION_FAILED') return { title: 'Thiếu thông tin', text: 'Nhập tên đăng nhập và mật khẩu.' };
    return { title: 'Có lỗi xảy ra', text: e.message };
  }
  return { title: 'Không kết nối được máy chủ', text: 'Kiểm tra mạng nội bộ hoặc VPN rồi thử lại.' };
}

function ProblemAlert({ problem }: { problem: Problem }) {
  return (
    <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} title={problem.title} role="alert">
      {problem.text}
    </Alert>
  );
}

const WEEKDAYS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Ngày giờ theo đồng hồ máy đang dùng. Thành phần riêng: mỗi phút chỉ phần này vẽ lại, form đang nhập không bị ảnh hưởng. */
function LoginClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    // Hẹn đúng đầu phút sau, không dùng setInterval 60 giây (lệch dần so với đồng hồ hệ thống)
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60_000 - (Date.now() % 60_000));
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);
  return (
    <p className="login-clock">
      <IconClock size={16} stroke={1.7} aria-hidden />
      <span>{`${WEEKDAYS[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`}</span>
      <span className="login-clock-sep" aria-hidden />
      <span>{`${pad(now.getHours())}:${pad(now.getMinutes())}`}</span>
    </p>
  );
}

/** Màn đăng nhập theo mẫu giao diện 12/10/2026 (quyết định 12.3): nền tối, mặt trời của logo bên trái, thẻ đăng nhập bên phải. */
export function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-backdrop" aria-hidden="true">
        <div className="login-sun" />
      </div>
      {/* Chiều cao logo theo biến CSS: co theo chiều cao màn (global.css) */}
      <header className="login-top">
        <BrandMark tone="dark" height="var(--login-logo-h)" />
        <LoginClock />
      </header>
      <section className="login-hero" aria-label="Khẩu hiệu Vietsun">
        <p className="login-kicker">MES VSN</p>
        {/* lang="en": trình đọc màn hình đọc đúng giọng tiếng Anh */}
        <ul className="login-values" lang="en">
          {CORE_VALUES.map((value) => (
            <li key={value}>
              <span className="login-values-initial">{value[0]}</span>
              {value.slice(1)}
            </li>
          ))}
        </ul>
      </section>
      <main className="login-main">
        <div className="login-card">
          <BrandMark height="var(--login-logo-h)" className="login-card-logo" />
          <p className="login-system">MES - Manufacturing Execution System</p>
          <LoginForm />
          <p className="login-card-foot">
            <IconShieldCheck size={16} stroke={1.7} aria-hidden />
            Hệ thống dành cho sản xuất VIETSUN
          </p>
        </div>
      </main>
      <footer className="login-footer">
        <p className="login-meta">
          <span>Vietsun Group</span>
          <span>HQ5</span>
          <span>Version {__APP_VERSION__}</span>
        </p>
        <p className="login-slogan">Warming Your Life</p>
      </footer>
    </div>
  );
}

/**
 * Nút chính màn đăng nhập: chữ trắng như ảnh mẫu trên cam đậm hơn cam logo (3,3:1, chữ to đậm đạt chuẩn chữ lớn), quyết định 12.4.
 * Theme gắn màu nút chính bằng biến CSS inline (chữ đen), nên ghi đè qua `vars` của nút, không qua class.
 */
const submitVars: ButtonProps['vars'] = () => ({
  root: {
    '--button-bg': 'var(--login-cta)',
    '--button-hover': 'var(--login-cta-hover)',
    '--button-color': '#ffffff',
    '--button-bd': '1px solid var(--login-cta-hover)',
    // Từ 18,67px chữ đậm mới là "chữ lớn" (ngưỡng 3:1)
    '--button-fz': '19px',
  },
});

/** Như ảnh mẫu: mắt gạch chéo khi mật khẩu đang ẩn. Khai báo ngoài form để không gắn lại biểu tượng sau mỗi phím gõ */
function PasswordEye({ reveal }: { reveal: boolean }) {
  return reveal ? <IconEye size={18} stroke={1.6} /> : <IconEyeOff size={18} stroke={1.6} />;
}

/** Hệ thống chưa tự đặt lại mật khẩu được (cần backend): chỉ hướng dẫn người dùng tìm quản trị viên. */
function ForgotPassword() {
  return (
    <Popover width={280} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Anchor component="button" type="button" className="login-forgot" c="var(--brand-ink)">
          Quên mật khẩu?
        </Anchor>
      </Popover.Target>
      <Popover.Dropdown>
        <Text size="sm">Liên hệ quản trị viên hệ thống để được đặt lại mật khẩu. Đăng nhập lại bằng mật khẩu mới được cấp.</Text>
      </Popover.Dropdown>
    </Popover>
  );
}

/**
 * Một form duy nhất: nhập tên, mật khẩu; đúng thì hai ô khóa lại và ô Đơn vị cơ sở mở ra ngay bên dưới (tài khoản nhiều
 * ĐVCS), không sang trang khác. Một ĐVCS thì vào thẳng. Token tạm hết hạn hay đăng nhập tài khoản khác thì quay về nhập mật khẩu.
 */
function LoginForm() {
  useDocumentTitle('Đăng nhập – MES Vietsun');
  const navigate = useNavigate();
  const notice = useSession((s) => s.notice);
  // Đã qua bước mật khẩu mà tài khoản làm việc ở nhiều ĐVCS: chọn ĐVCS ngay trên form này
  const picking = useSession((s) => s.status === 'preauth' && s.choices.length > 1);
  const choices = useSession((s) => s.choices);
  const name = useSession((s) => s.pendingName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const [remember, setRemember] = useState(() => remembered() !== '');
  const [initialUsername] = useState(remembered);
  const [code, setCode] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const chosen = choices.find((b) => b.code === code) ?? null;

  const form = useForm({
    initialValues: { username: initialUsername, password: '' },
    validate: {
      username: (v) => (v.trim() ? null : 'Nhập tên đăng nhập'),
      password: (v) => (v ? null : 'Nhập mật khẩu'),
    },
  });

  async function enter(branch: Branch) {
    if (await selectBranch(branch)) navigate('/', { replace: true });
  }

  async function signIn(values: { username: string; password: string }) {
    const username = values.username.trim();
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const r = await login(username, values.password);
      rememberUsername(remember ? username : null);
      if (remember) offerToSavePassword(username, values.password, r.user.fullName);
      if (r.branches.length === 0) {
        useSession.getState().reset('anonymous');
        setError({ title: 'Tài khoản chưa có đơn vị cơ sở', text: 'Tài khoản này chưa được gán đơn vị cơ sở nào. Hãy nhờ quản trị viên gán.' });
      } else if (r.branches.length === 1) {
        await enter(r.branches[0]);
      } else {
        // Mật khẩu không nằm lại trên form trong lúc chọn ĐVCS (máy dùng chung): ô chỉ hiện dấu che
        form.setFieldValue('password', '');
        // Chọn sẵn ĐVCS người này làm việc lần trước trên máy này, nếu vẫn được vào: chỉ cần bấm Vào làm việc
        const last = lastBranchCode(r.user.id);
        setCode(r.branches.some((b) => b.code === last) ? last : null);
      }
    } catch (e) {
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  }

  async function choose() {
    if (!chosen) {
      setMissing(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await enter(chosen);
    } catch (err) {
      // Token tạm hết hạn (sống vài phút), mật khẩu vừa đổi, tài khoản bị khóa: về nhập mật khẩu, tên vẫn giữ trên form
      if (err instanceof ApiError && err.status === 401) {
        endSession(err.code === 'TOKEN_EXPIRED' ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : err.message);
        return;
      }
      setError(describe(err));
    } finally {
      setLoading(false);
    }
  }

  // Mật khẩu trình duyệt tự điền có lúc chưa báo cho React (Chrome giữ lại tới khi người dùng chạm vào trang):
  // lấy giá trị đang nằm trong ô rồi mới kiểm
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (picking) {
      e.preventDefault();
      void choose();
      return;
    }
    const data = new FormData(e.currentTarget);
    form.setValues({ username: String(data.get('username') ?? ''), password: String(data.get('password') ?? '') });
    form.onSubmit(signIn)(e);
  }

  function otherAccount() {
    form.setValues({ username: '', password: '' });
    setCode(null);
    setError(null);
    setMissing(false);
    // Đăng xuất hẳn (thu hồi cookie nếu máy chủ đã cấp), không chỉ xóa phía trình duyệt: máy dùng chung
    void logout();
  }

  const renderOption: SelectProps['renderOption'] = ({ option, checked }) => {
    const aggregate = choices.find((b) => b.code === option.value)?.isAggregate;
    return (
      <Group gap={10} wrap="nowrap" w="100%">
        {aggregate ? <IconEye size={16} stroke={1.7} /> : <IconBuildingFactory2 size={16} stroke={1.7} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={checked ? 700 : 400} truncate="end">{option.label}</Text>
          {aggregate && <Text size="xs" c="dimmed">Xem mọi đơn vị, chỉ đọc</Text>}
        </div>
        <Text size="xs" c="dimmed" className="mono">{option.value}</Text>
      </Group>
    );
  };

  // Ô đã kiểm xong: khóa lại, dấu tích báo mật khẩu đúng
  const verified = picking ? <IconCircleCheck size={18} stroke={1.8} color="var(--mantine-color-teal-6)" aria-hidden /> : undefined;

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap="var(--login-gap)">
        <div className="login-intro">
          <Title order={1} className="login-title">Chào mừng trở lại</Title>
          <Text c="dimmed" className="login-subtitle">
            {picking && name ? `Xin chào, ${name}. Chọn đơn vị cơ sở để vào làm việc.` : 'Đăng nhập để tiếp tục công việc của bạn.'}
          </Text>
        </div>

        {notice && !error && !picking && (
          <Alert color="orange" variant="light" icon={<IconAlertCircle size={18} />} role="alert">
            {notice}
          </Alert>
        )}
        {error && <ProblemAlert problem={error} />}

        {/* Đã có tên đăng nhập thì con trỏ vào thẳng ô mật khẩu */}
        <TextInput
          size="md"
          name="username"
          label="Tài khoản"
          placeholder="Nhập tên đăng nhập"
          leftSection={<IconUser size={18} stroke={1.6} />}
          autoComplete="username"
          autoFocus={!initialUsername}
          readOnly={picking}
          rightSection={verified}
          {...form.getInputProps('username')}
        />
        <PasswordInput
          size="md"
          name="password"
          label="Mật khẩu"
          leftSection={<IconLock size={18} stroke={1.6} />}
          autoComplete="current-password"
          autoFocus={!!initialUsername}
          readOnly={picking}
          placeholder={picking ? '••••••••' : 'Nhập mật khẩu'}
          // Prop này thay cả mặc định của theme: phải nhắc lại nhãn, không thì trình đọc màn hình đọc nhãn tiếng Anh
          visibilityToggleButtonProps={picking ? { disabled: true, 'aria-label': 'Hiện hoặc ẩn mật khẩu' } : undefined}
          visibilityToggleIcon={PasswordEye}
          {...form.getInputProps('password')}
        />

        {picking && (
          <div className="login-reveal">
            <Select
              size="md"
              label="Đơn vị cơ sở"
              placeholder="Chọn đơn vị làm việc"
              autoFocus={code === null}
              data={choices.map((b) => ({ value: b.code, label: b.name }))}
              value={code}
              onChange={(v) => {
                setCode(v);
                setMissing(false);
              }}
              allowDeselect={false}
              searchable={choices.length > 6}
              openOnFocus={false}
              nothingFoundMessage="Không có đơn vị khớp"
              renderOption={renderOption}
              leftSection={chosen?.isAggregate ? <IconEye size={18} stroke={1.7} /> : <IconBuildingFactory2 size={18} stroke={1.7} />}
              description={chosen?.isAggregate ? 'Xem số liệu mọi đơn vị cơ sở, không nhập hay sửa được.' : undefined}
              error={missing ? 'Chọn đơn vị cơ sở để vào làm việc' : undefined}
            />
          </div>
        )}

        {!picking && (
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Checkbox label="Ghi nhớ đăng nhập" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
            <ForgotPassword />
          </Group>
        )}
        {/* Chữ viết hoa bằng CSS (ngoại lệ riêng màn đăng nhập, Q4), mũi tên là biểu tượng: tên đọc vẫn là chữ thường */}
        <Button
          type="submit"
          size="md"
          loading={loading}
          fullWidth
          className="login-submit"
          vars={submitVars}
          rightSection={<IconArrowRight size={20} stroke={2} aria-hidden />}
          autoFocus={picking && code !== null}
        >
          {picking ? 'Vào làm việc' : 'Đăng nhập'}
        </Button>
        {picking && (
          <Button variant="subtle" color="gray" size="md" fullWidth disabled={loading} onClick={otherAccount}>
            Đăng nhập tài khoản khác
          </Button>
        )}
      </Stack>
    </form>
  );
}
