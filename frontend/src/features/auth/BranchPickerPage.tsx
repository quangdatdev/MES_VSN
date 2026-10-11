import { Alert, Badge, Button, Container, Group, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useDocumentTitle } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconEye } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark } from '../../components/BrandMark';
import { ApiError } from '../../lib/api';
import type { Branch } from '../../lib/types';
import { fetchBranchChoices, logout, selectBranch } from '../../store/auth';
import { useSession } from '../../store/session';

export function BranchPickerPage() {
  const navigate = useNavigate();
  const status = useSession((s) => s.status);
  const choices = useSession((s) => s.choices);
  const current = useSession((s) => s.branch);
  const name = useSession((s) => s.pendingName ?? s.user?.fullName ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Đổi nhà máy khi đã đăng nhập: danh sách được tải lại ngay, coi như đang tải từ đầu (không nháy câu "chưa được gán")
  const [loading, setLoading] = useState(status === 'ready');
  const [loadFailed, setLoadFailed] = useState(false);
  useDocumentTitle('Chọn nhà máy – MES Vietsun');

  // Đổi nhà máy khi đã đăng nhập: lấy danh sách mới nhất từ server
  const load = useCallback(() => {
    setLoading(true);
    setLoadFailed(false);
    fetchBranchChoices()
      .catch(() => setLoadFailed(true))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (status === 'ready') load();
  }, [status, load]);

  async function pick(b: Branch) {
    if (status === 'ready' && current?.code === b.code) {
      navigate('/');
      return;
    }
    setBusy(b.code);
    setError(null);
    try {
      await selectBranch(b);
      notifications.show({ color: 'teal', title: 'Đã chuyển nhà máy', message: `Bạn đang làm việc ở ${b.name}.` });
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Không chọn được nhà máy. Thử lại sau.');
    } finally {
      setBusy(null);
    }
  }

  const aggregate = choices.filter((c) => c.isAggregate);
  const factories = choices.filter((c) => !c.isAggregate);

  return (
    <Container size="sm" py={{ base: 24, sm: 48 }}>
      <Stack gap="xl">
        <Group gap="sm">
          <BrandMark height={46} />
          <span className="brand-chip">MES - VSN</span>
        </Group>

        <div>
          <Title order={1}>
            {status === 'ready' ? 'Đổi nhà máy' : `Chào ${name}, bạn làm việc ở nhà máy nào?`}
          </Title>
          <Text c="dimmed" mt={6}>Dữ liệu trên màn hình chỉ gồm nhà máy bạn chọn.</Text>
        </div>

        {error && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} role="alert">
            {error}
          </Alert>
        )}

        {loadFailed && (
          <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />} role="alert" title="Chưa tải được danh sách nhà máy">
            <Group gap="sm" justify="space-between">
              <Text size="sm">Kiểm tra kết nối mạng nội bộ rồi thử lại.</Text>
              <Button size="xs" variant="default" onClick={load} loading={loading}>
                Thử lại
              </Button>
            </Group>
          </Alert>
        )}

        {!loading && !loadFailed && choices.length === 0 && (
          <Alert color="orange" variant="light" icon={<IconAlertCircle size={18} />} title="Tài khoản chưa được gán nhà máy nào">
            Hãy nhờ quản trị viên gán nhà máy cho tài khoản này, rồi đăng nhập lại.
          </Alert>
        )}

        {loading && choices.length === 0 ? (
          <SimpleGrid cols={{ base: 1, xs: 2 }}>
            <Skeleton h={84} />
            <Skeleton h={84} />
          </SimpleGrid>
        ) : (
          <Stack gap="md">
            {aggregate.map((b) => (
              <button
                key={b.code}
                type="button"
                className="branch-tile aggregate focus-ring"
                aria-current={current?.code === b.code}
                disabled={busy !== null}
                onClick={() => pick(b)}
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text fw={700} size="lg">{b.name}</Text>
                    <Text size="sm" opacity={0.8} mt={2}>
                      {current?.code === b.code ? 'Đang xem ở đây. ' : ''}Xem tổng hợp mọi nhà máy. Chỉ đọc, không chỉnh sửa được.
                    </Text>
                  </div>
                  <Group gap={6} wrap="nowrap">
                    <IconEye size={18} />
                    <Badge color="brand" variant="filled">{b.code}</Badge>
                  </Group>
                </Group>
                {busy === b.code && <Text size="sm" mt="sm">Đang chuyển...</Text>}
              </button>
            ))}

            <SimpleGrid cols={{ base: 1, xs: 2 }}>
              {factories.map((b) => (
                <button
                  key={b.code}
                  type="button"
                  className="branch-tile focus-ring"
                  aria-current={current?.code === b.code}
                  disabled={busy !== null}
                  onClick={() => pick(b)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={700} size="lg">{b.name}</Text>
                    <Badge variant="light" color="navy">{b.code}</Badge>
                  </Group>
                  <Text size="sm" c="dimmed" mt={4}>
                    {busy === b.code ? 'Đang chuyển...' : current?.code === b.code ? 'Đang làm việc ở đây' : 'Xem và nhập dữ liệu của nhà máy này'}
                  </Text>
                </button>
              ))}
            </SimpleGrid>
          </Stack>
        )}

        <Group>
          {status === 'ready' ? (
            // Mở thẳng /select-branch (không có trang trước trong ứng dụng) thì về Trang chủ, không thoát khỏi ứng dụng
            <Button variant="default" onClick={() => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'))}>
              Quay lại
            </Button>
          ) : (
            <Button variant="subtle" color="gray" onClick={async () => { await logout(); navigate('/login', { replace: true }); }}>
              Dùng tài khoản khác
            </Button>
          )}
        </Group>
      </Stack>
    </Container>
  );
}
