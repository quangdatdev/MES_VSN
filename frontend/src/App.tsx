import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import 'dayjs/locale/vi';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './features/auth/LoginPage';
import { HomePage } from './features/home/HomePage';
import { queryClient } from './lib/queryClient';
import { FallbackRoute } from './routes/FallbackRoute';
import { AppLayout } from './shell/AppLayout';
import { AnonymousOnly, RequireReady } from './shell/guards';
import { bootstrap } from './store/auth';
import { theme } from './theme/theme';

export function App() {
  useEffect(() => {
    void bootstrap();
  }, []);

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <DatesProvider settings={{ locale: 'vi', firstDayOfWeek: 1 }}>
      {/* QueryClientProvider ngoài ModalsProvider: nội dung modal mở bằng modals.* cũng dùng được useQuery */}
      <QueryClientProvider client={queryClient}>
      <ModalsProvider labels={{ confirm: 'Đồng ý', cancel: 'Hủy' }}>
        <Notifications position="top-right" />
          <BrowserRouter>
            <Routes>
              <Route element={<AnonymousOnly />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>
              {/* Trang chọn nhà máy cũ: nay chọn ở màn đăng nhập, đổi ở thanh trên. Link, lối tắt cũ về Trang chủ */}
              <Route path="/select-branch" element={<Navigate to="/" replace />} />
              <Route element={<RequireReady />}>
                <Route element={<AppLayout />}>
                  <Route index element={<HomePage />} />
                  <Route path="*" element={<FallbackRoute />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
      </ModalsProvider>
      </QueryClientProvider>
      </DatesProvider>
    </MantineProvider>
  );
}
