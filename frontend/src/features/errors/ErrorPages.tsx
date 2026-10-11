import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Một màn gặp lỗi khi hiển thị (ví dụ dữ liệu thiếu trường do phân quyền) thì chỉ màn đó báo lỗi, menu và thanh trên
 * vẫn dùng được. Đổi sang màn khác (resetKey đổi) thì thử hiển thị lại.
 */
export class PageErrorBoundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Lỗi hiển thị màn hình', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Stack gap="xs" maw={560} py="xl">
        <Title order={1}>Màn hình này gặp lỗi khi hiển thị</Title>
        <Text c="dimmed">Dữ liệu đã lưu không bị ảnh hưởng. Bấm Thử lại; nếu vẫn lỗi, tải lại trang hoặc chọn màn hình khác ở menu và báo cho quản trị viên.</Text>
        <Group mt="sm">
          <Button onClick={() => this.setState({ failed: false })}>Thử lại</Button>
          <Button variant="default" onClick={() => window.location.reload()}>Tải lại trang</Button>
          <Button component={Link} to="/" variant="default">Về trang chủ</Button>
        </Group>
      </Stack>
    );
  }
}

export function ForbiddenPage() {
  return (
    <Stack gap="xs" maw={520} py="xl">
      <Title order={1}>Bạn chưa có quyền vào màn hình này</Title>
      <Text c="dimmed">Vai trò hiện tại không được cấp quyền xem màn hình này. Nếu bạn cần dùng, hãy nhờ quản trị viên cấp thêm quyền.</Text>
      <div><Button component={Link} to="/" mt="sm">Về trang chủ</Button></div>
    </Stack>
  );
}

export function NotFoundPage() {
  return (
    <Stack gap="xs" maw={520} py="xl">
      <Title order={1}>Không tìm thấy trang</Title>
      <Text c="dimmed">Đường dẫn này không tồn tại hoặc đã được đổi. Dùng menu hoặc nhấn Ctrl + K để tìm màn hình.</Text>
      <div><Button component={Link} to="/" mt="sm">Về trang chủ</Button></div>
    </Stack>
  );
}
