import { Alert, Button, Checkbox, Group, PasswordInput, Select, Stack, Text, TextInput, Title, type SelectProps } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDocumentTitle } from '@mantine/hooks';
import { IconAlertCircle, IconBuildingFactory2, IconEye } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, endSession } from '../../lib/api';
import { lastBranchCode, login, logout, selectBranch } from '../../store/auth';
import { useSession } from '../../store/session';

const REMEMBER_KEY = 'mes.username';

// Tên vừa gõ ở bước mật khẩu, giữ tới khi vào được ứng dụng: token tạm hết hạn thì không phải gõ lại
let typedUsername = '';

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

export function LoginPage() {
  // Đã qua bước mật khẩu mà tài khoản làm việc ở nhiều nhà máy: chọn nhà máy ngay trên màn này
  const picking = useSession((s) => s.status === 'preauth' && s.choices.length > 1);

  return (
    <div className="login-shell">
      <div className="login-art">
        <p className="login-art-title">MES Vietsun</p>
        <p className="login-art-sub">Hệ thống điều hành sản xuất</p>
        <div className="login-sun" aria-hidden="true" />
      </div>
      <main className="login-main">
        <div className="login-panel">
          <img src="/logo-vs.png" alt="Vietsun" className="login-logo" />
          {picking ? <BranchStep /> : <CredentialsStep />}
        </div>
      </main>
    </div>
  );
}

function CredentialsStep() {
  useDocumentTitle('Đăng nhập – MES Vietsun');
  const navigate = useNavigate();
  const notice = useSession((s) => s.notice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const [remember, setRemember] = useState(() => remembered() !== '');
  const [initialUsername] = useState(() => typedUsername || remembered());

  const form = useForm({
    initialValues: { username: initialUsername, password: '' },
    validate: {
      username: (v) => (v.trim() ? null : 'Nhập tên đăng nhập'),
      password: (v) => (v ? null : 'Nhập mật khẩu'),
    },
  });

  async function submit(values: { username: string; password: string }) {
    const username = values.username.trim();
    typedUsername = username;
    setLoading(true);
    setError(null);
    try {
      const r = await login(username, values.password);
      rememberUsername(remember ? username : null);
      if (remember) offerToSavePassword(username, values.password, r.user.fullName);
      if (r.branches.length === 0) {
        useSession.getState().reset('anonymous');
        setError({ title: 'Tài khoản chưa có nhà máy', text: 'Tài khoản này chưa được gán nhà máy nào. Hãy nhờ quản trị viên gán nhà máy.' });
      } else if (r.branches.length === 1) {
        if (await selectBranch(r.branches[0])) {
          typedUsername = '';
          navigate('/', { replace: true });
        }
      }
      // Nhiều nhà máy: LoginPage chuyển sang bước chọn nhà máy
    } catch (e) {
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  }

  // Mật khẩu trình duyệt tự điền có lúc chưa báo cho React (Chrome giữ lại tới khi người dùng chạm vào trang):
  // lấy giá trị đang nằm trong ô rồi mới kiểm
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    const data = new FormData(e.currentTarget);
    form.setValues({ username: String(data.get('username') ?? ''), password: String(data.get('password') ?? '') });
    form.onSubmit(submit)(e);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack gap="md">
        <Title order={1} fz={28} lh="34px">Đăng nhập</Title>

        {notice && !error && (
          <Alert color="orange" variant="light" icon={<IconAlertCircle size={18} />} role="alert">
            {notice}
          </Alert>
        )}
        {error && <ProblemAlert problem={error} />}

        {/* Đã có tên đăng nhập thì con trỏ vào thẳng ô mật khẩu */}
        <TextInput size="md" name="username" label="Tên đăng nhập" withAsterisk autoComplete="username" autoFocus={!initialUsername} {...form.getInputProps('username')} />
        <PasswordInput size="md" name="password" label="Mật khẩu" withAsterisk autoComplete="current-password" autoFocus={!!initialUsername} {...form.getInputProps('password')} />
        <Checkbox label="Nhớ tài khoản và mật khẩu" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
        <Button type="submit" size="md" loading={loading} fullWidth mt={4}>
          Đăng nhập
        </Button>
      </Stack>
    </form>
  );
}

function BranchStep() {
  useDocumentTitle('Chọn nhà máy – MES Vietsun');
  const navigate = useNavigate();
  const choices = useSession((s) => s.choices);
  const name = useSession((s) => s.pendingName);
  const userId = useSession((s) => s.pendingUserId);
  // Chọn sẵn nhà máy người này làm việc lần trước nếu vẫn được vào: chỉ cần bấm Vào làm việc
  const [initial] = useState(() => {
    const last = userId === null ? null : lastBranchCode(userId);
    return choices.some((b) => b.code === last) ? last : null;
  });
  const [code, setCode] = useState(initial);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const chosen = choices.find((b) => b.code === code) ?? null;

  async function enter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) {
      setMissing(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (await selectBranch(chosen)) {
        typedUsername = '';
        navigate('/', { replace: true });
      }
    } catch (err) {
      // Token tạm hết hạn (sống vài phút), mật khẩu vừa đổi, tài khoản bị khóa: về bước mật khẩu
      if (err instanceof ApiError && err.status === 401) {
        endSession(err.code === 'TOKEN_EXPIRED' ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : err.message);
        return;
      }
      setError(describe(err));
    } finally {
      setLoading(false);
    }
  }

  const renderOption: SelectProps['renderOption'] = ({ option, checked }) => {
    const aggregate = choices.find((b) => b.code === option.value)?.isAggregate;
    return (
      <Group gap={10} wrap="nowrap" w="100%">
        {aggregate ? <IconEye size={16} stroke={1.7} /> : <IconBuildingFactory2 size={16} stroke={1.7} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={checked ? 700 : 400} truncate="end">{option.label}</Text>
          {aggregate && <Text size="xs" c="dimmed">Xem mọi nhà máy, chỉ đọc</Text>}
        </div>
        <Text size="xs" c="dimmed" className="mono">{option.value}</Text>
      </Group>
    );
  };

  return (
    <form onSubmit={enter} noValidate>
      <Stack gap="md">
        <div>
          <Title order={1} fz={28} lh="34px">Chọn nhà máy</Title>
          {name && <Text c="dimmed" size="md" mt={4}>Xin chào, {name}.</Text>}
        </div>

        {error && <ProblemAlert problem={error} />}

        <Select
          size="md"
          label="Nhà máy"
          placeholder="Chọn nhà máy làm việc"
          withAsterisk
          autoFocus={initial === null}
          data={choices.map((b) => ({ value: b.code, label: b.name }))}
          value={code}
          onChange={(v) => {
            setCode(v);
            setMissing(false);
          }}
          allowDeselect={false}
          searchable={choices.length > 6}
          openOnFocus={false}
          nothingFoundMessage="Không có nhà máy khớp"
          renderOption={renderOption}
          leftSection={chosen?.isAggregate ? <IconEye size={18} stroke={1.7} /> : <IconBuildingFactory2 size={18} stroke={1.7} />}
          description={chosen?.isAggregate ? 'Xem số liệu mọi nhà máy, không nhập hay sửa được.' : undefined}
          error={missing ? 'Chọn nhà máy để vào làm việc' : undefined}
        />
        <Button type="submit" size="md" loading={loading} fullWidth autoFocus={initial !== null}>
          Vào làm việc
        </Button>
        <Button
          variant="subtle"
          color="gray"
          size="md"
          fullWidth
          disabled={loading}
          onClick={() => {
            typedUsername = '';
            // Đăng xuất hẳn (thu hồi cookie nếu máy chủ đã cấp), không chỉ xóa phía trình duyệt: máy dùng chung
            void logout();
          }}
        >
          Đăng nhập tài khoản khác
        </Button>
      </Stack>
    </form>
  );
}
