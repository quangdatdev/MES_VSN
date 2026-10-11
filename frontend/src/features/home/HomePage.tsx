import { Alert, Badge, Group, Paper, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { IconEye, IconKeyboard } from '@tabler/icons-react';
import { pages, preloadPage } from '../../routes/registry';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { flattenLeaves } from '../../shell/permissions';
import { iconFor } from '../../shell/menuIcons';
import { useSession } from '../../store/session';

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function HomePage() {
  const user = useSession((s) => s.user);
  const branch = useSession((s) => s.branch);
  const roles = useSession((s) => s.roles);
  const menu = useSession((s) => s.menu);
  const leaves = useMemo(() => flattenLeaves(menu), [menu]);
  // Màn đã có nội dung lên trước trong mỗi nhóm; màn giữ chỗ ghi rõ để người xem không bấm nhầm rồi thất vọng
  const groups = useMemo(
    () =>
      menu
        .map((g) => ({ group: g, items: leaves.filter((l) => l.group.code === g.code).sort((a, b) => Number(!pages[a.path!]) - Number(!pages[b.path!])) }))
        .filter((g) => g.items.length > 0),
    [menu, leaves],
  );

  return (
    <Stack gap="xl" maw={980}>
      <div>
        <Title order={1}>{greeting()}, {user?.fullName}</Title>
        <Group gap="xs" mt={8}>
          {roles.map((r) => (
            <Badge key={r.code} variant="light" color="charcoal" size="md">{r.name}</Badge>
          ))}
          <Text c="dimmed" size="sm">đang làm việc ở {branch?.name}</Text>
        </Group>
      </div>

      {branch?.isAggregate && (
        <Alert variant="light" color="orange" icon={<IconEye size={18} />} title="Bạn đang xem tổng hợp mọi nhà máy" maw={720}>
          Chế độ này chỉ đọc. Muốn thêm hoặc sửa dữ liệu, hãy đổi sang một nhà máy cụ thể ở thanh trên cùng (cạnh chữ MES - VSN).
        </Alert>
      )}

      <div>
        <Title order={2} fz="lg" lh="22px" mb="sm">Màn hình bạn được dùng</Title>
        {leaves.length === 0 ? (
          <Paper withBorder p="lg">
            <Text>Ở nhà máy này tài khoản chưa được dùng màn hình nào. Hãy đổi nhà máy khác hoặc nhờ quản trị viên gán vai trò.</Text>
          </Paper>
        ) : (
          <Stack gap="lg">
            {groups.map(({ group, items }) => {
              const Icon = iconFor(group.icon);
              return (
                <section key={group.code} aria-label={group.name}>
                  <Group gap={8} mb={8}>
                    <Icon size={18} stroke={1.7} color="var(--app-ink-soft)" />
                    <Title order={3} fz="md" lh="20px">{group.name}</Title>
                  </Group>
                  <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
                    {items.map((l) => {
                      const ready = !!pages[l.path!];
                      return (
                        <UnstyledButton key={l.code} component={Link} to={l.path!} className="focus-ring" style={{ borderRadius: 8 }} onPointerEnter={() => preloadPage(l.path)} onFocus={() => preloadPage(l.path)}>
                          <Paper p="sm" className="home-tile" data-ready={ready || undefined} style={{ height: '100%' }}>
                            <Text fw={600} size="md" className="home-tile-name">{l.name}</Text>
                            <Text size="xs" c="dimmed">{ready ? 'Dùng được' : 'Đã phân quyền, chờ tài liệu nghiệp vụ'}{l.isMobile ? ', dùng trên điện thoại' : ''}</Text>
                          </Paper>
                        </UnstyledButton>
                      );
                    })}
                  </SimpleGrid>
                </section>
              );
            })}
          </Stack>
        )}
      </div>

      <Group gap="xs" c="dimmed">
        <IconKeyboard size={18} />
        <Text size="sm">Nhấn Ctrl + K để tìm nhanh một màn hình.</Text>
      </Group>
    </Stack>
  );
}
