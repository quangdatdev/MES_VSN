import { Alert, Button, Checkbox, Group, PasswordInput, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDocumentTitle } from '@mantine/hooks';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../../components/BrandMark';
import { ApiError } from '../../lib/api';
import { login, selectBranch } from '../../store/auth';
import { useSession } from '../../store/session';

const REMEMBER_KEY = 'mes.username';
const DEMO_USERS = [
  { username: 'admin', hint: 'Quản trị hệ thống' },
  { username: 'giamdoc', hint: 'Giám đốc' },
  { username: 'kehoach.a', hint: 'Kế hoạch' },
  { username: 'truongchuyen.a', hint: 'Trưởng chuyền 3' },
  { username: 'truongchuyen.b', hint: 'Trưởng chuyền 3, có ngoại lệ' },
  { username: 'ketoan', hint: 'Kế toán nhà máy 1, 2' },
];

function remembered(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function describe(e: unknown): { title: string; text: string } {
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

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; text: string } | null>(null);
  const [remember, setRemember] = useState(() => remembered() !== '');
  useDocumentTitle('Đăng nhập – MES Vietsun');
  const notice = useSession((st) => st.notice);

  const form = useForm({
    initialValues: { username: remembered(), password: '' },
    validate: {
      username: (v) => (v.trim() ? null : 'Nhập tên đăng nhập'),
      password: (v) => (v ? null : 'Nhập mật khẩu'),
    },
  });

  async function submit(values: { username: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      const r = await login(values.username.trim(), values.password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, values.username.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* không lưu được thì bỏ qua */
      }
      if (r.branches.length === 0) {
        useSession.getState().reset('anonymous');
        setError({ title: 'Tài khoản chưa có nhà máy', text: 'Tài khoản này chưa được gán nhà máy nào. Hãy nhờ quản trị viên gán nhà máy.' });
      } else if (r.branches.length === 1) {
        await selectBranch(r.branches[0]);
        navigate('/', { replace: true });
      } else {
        navigate('/select-branch', { replace: true });
      }
    } catch (e) {
      setError(describe(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-art" aria-label="Giới thiệu">
        <Group gap="sm" wrap="nowrap">
          <BrandMark height={52} />
          <div>
            <span className="brand-chip">MES - VSN</span>
            <Text size="sm" c="#cccccc" mt={6}>Hệ thống điều hành sản xuất Vietsun</Text>
          </div>
        </Group>
        <Stack gap={8} maw={440} className="login-art-copy">
          <Text component="p" c="#ffffff" fz={28} lh="36px" fw={700} m={0}>Từ kế hoạch đến thùng hàng, theo dõi trên một hệ thống.</Text>
          <Text c="#cccccc" size="md">Kế hoạch, cắt, may, kiểm hàng và hoàn thiện dùng chung một dữ liệu.</Text>
        </Stack>
      </section>

      <section className="login-form-wrap">
        <form onSubmit={form.onSubmit(submit)} className="login-card" noValidate>
          <Stack gap="sm">
            <div>
              <Title order={1} fz={28} lh="36px" fw={400}>Đăng nhập</Title>
              <Text c="dimmed" size="sm" mt={4}>Dùng tài khoản MES của bạn.</Text>
            </div>

            {notice && !error && (
              <Alert color="orange" variant="light" icon={<IconAlertCircle size={18} />} role="status">
                {notice}
              </Alert>
            )}

            {error && (
              <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} title={error.title} role="alert">
                {error.text}
              </Alert>
            )}

            {/* Đã nhớ tên đăng nhập thì con trỏ vào thẳng ô mật khẩu */}
            <TextInput label="Tên đăng nhập" withAsterisk autoComplete="username" autoFocus={remember === false} {...form.getInputProps('username')} />
            <PasswordInput label="Mật khẩu" withAsterisk autoComplete="current-password" autoFocus={remember} {...form.getInputProps('password')} />
            <Checkbox label="Nhớ tên đăng nhập" checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
            <Button type="submit" loading={loading} leftSection={<IconLock size={16} />} fullWidth>
              Đăng nhập
            </Button>

            {import.meta.env.DEV && (
              <Stack gap={6} mt="xs">
                <Text size="xs" c="dimmed">Bản demo: bấm để điền sẵn tên đăng nhập (mật khẩu là DEMO_PASSWORD trong backend/.env).</Text>
                <Group gap={6}>
                  {DEMO_USERS.map((u) => (
                    <UnstyledButton
                      key={u.username}
                      type="button"
                      className="demo-user focus-ring"
                      onClick={() => form.setFieldValue('username', u.username)}
                      title={u.hint}
                    >
                      {u.username}
                    </UnstyledButton>
                  ))}
                </Group>
              </Stack>
            )}
            <Text size="xs" c="dimmed">Quên mật khẩu? Liên hệ quản trị viên hệ thống để được đặt lại.</Text>
          </Stack>
        </form>
      </section>
    </div>
  );
}
