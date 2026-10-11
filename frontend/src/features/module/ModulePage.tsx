import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconCheck, IconDeviceMobile, IconLock, IconTools } from '@tabler/icons-react';
import { useSession } from '../../store/session';
import { resourceOf, type Leaf } from '../../shell/permissions';

const ACTIONS: { code: string; label: string }[] = [
  { code: 'view', label: 'Xem' },
  { code: 'create', label: 'Thêm' },
  { code: 'update', label: 'Sửa' },
  { code: 'delete', label: 'Xóa' },
  { code: 'export', label: 'Xuất file' },
];

/** Trang giữ chỗ cho module chưa dựng: cho thấy ngay quyền thật của người dùng tại màn hình này. */
export function ModulePage({ leaf }: { leaf: Leaf }) {
  const permissions = useSession((s) => s.permissions);
  const branch = useSession((s) => s.branch);
  const resource = resourceOf(leaf.code);

  return (
    <Stack gap="lg" maw={760}>
      <div>
        <Group gap="xs">
          <Title order={1}>{leaf.name}</Title>
          {leaf.isMobile && (
            <Badge variant="light" leftSection={<IconDeviceMobile size={12} />}>Dùng trên điện thoại</Badge>
          )}
        </Group>
        <Text c="dimmed" mt={4}>{leaf.group.name}</Text>
      </div>

      <Paper withBorder p="lg">
        <Group align="flex-start" wrap="nowrap" gap="lg">
          <IconTools size={36} stroke={1.4} color="var(--app-ink-soft)" style={{ flexShrink: 0 }} />
          <div>
            <Title order={2} fz="md" lh="20px">Màn hình này chưa có nội dung nghiệp vụ</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Menu và phân quyền của màn hình đã hoạt động. Nội dung sẽ được dựng khi có tài liệu nghiệp vụ.
            </Text>
          </div>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={2} fz="md" lh="20px">Quyền của bạn ở màn hình này</Title>
        <Text size="sm" c="dimmed" mb="sm">
          Tại {branch?.name}. Quản trị viên đổi quyền ở mục Quản trị, kết quả hiện ra ngay không cần đăng nhập lại.
        </Text>
        <Group gap="xs">
          {ACTIONS.map((a) => {
            const allowed = permissions.has(`${resource}:${a.code}`) && !(branch?.isAggregate && a.code !== 'view' && a.code !== 'export');
            return (
              <Badge
                key={a.code}
                size="md"
                variant={allowed ? 'filled' : 'light'}
                color={allowed ? 'brand' : 'gray'}
                leftSection={allowed ? <IconCheck size={14} /> : <IconLock size={14} />}
                style={{ textTransform: 'none' }}
              >
                {a.label}
              </Badge>
            );
          })}
        </Group>
        {branch?.isAggregate && (
          <Text size="xs" c="dimmed" mt="sm">Ở chế độ tổng hợp, mọi thao tác ghi đều bị khóa.</Text>
        )}
      </Paper>
    </Stack>
  );
}
