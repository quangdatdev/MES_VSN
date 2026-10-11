import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from '@testing-library/react';
import { Profiler, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { useSession } from '../store/session';
import { theme } from '../theme/theme';

/** Tổng thời gian React vẽ (actualDuration của Profiler) trong một thao tác */
const sink = { ms: 0, commits: 0 };

export function Probe({ children }: { children: ReactNode }) {
  return (
    <Profiler
      id="probe"
      onRender={(_id, _phase, actual) => {
        sink.ms += actual;
        sink.commits++;
      }}
    >
      {children}
    </Profiler>
  );
}

/** Khung giống ứng dụng: Mantine (tắt hiệu ứng), popup, bộ đệm truy vấn, router; bọc Profiler quanh màn */
export function Shell({ children, path = '/' }: { children: ReactNode; path?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 15_000 } } });
  return (
    <MantineProvider theme={theme} env="test">
      <ModalsProvider>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[path]}>
            <Probe>{children}</Probe>
          </MemoryRouter>
        </QueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}

/** Đo một thao tác: thời gian vẽ và số lần commit của React trong lúc thao tác */
export async function measure(fn: () => unknown) {
  sink.ms = 0;
  sink.commits = 0;
  await act(async () => {
    await fn();
  });
  return { ms: sink.ms, commits: sink.commits };
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

const results: { name: string; median: number; total: number; commits: number; n: number }[] = [];

/** Ghi một dòng kết quả: trung vị và tổng thời gian vẽ của các lần thao tác */
export function record(name: string, samples: { ms: number; commits: number }[]) {
  const ms = samples.map((s) => s.ms);
  results.push({ name, median: median(ms), total: ms.reduce((a, b) => a + b, 0), commits: samples.reduce((a, s) => a + s.commits, 0), n: samples.length });
}

export function printResults(title: string) {
  const rows = results.map((r) => `| ${r.name} | ${r.n} | ${r.median.toFixed(1)} | ${r.total.toFixed(1)} | ${r.commits} |`);
  console.log([`\n### ${title}`, '| Thao tác | Số lần | Trung vị (ms) | Tổng (ms) | Commit |', '|---|---|---|---|---|', ...rows].join('\n'));
  results.length = 0;
}

export function signIn(permissions: string[], fieldPolicies: Record<string, Record<string, 'HIDDEN' | 'MASKED' | 'READONLY' | 'EDITABLE'>> = {}) {
  useSession.getState().reset('anonymous');
  useSession.getState().set({
    status: 'ready',
    user: { id: 1, username: 'do.hieunang', fullName: 'Người đo' },
    branch: { code: 'A01', name: 'Nhà máy 1', isAggregate: false },
    roles: [],
    permissions: new Set(permissions),
    fieldPolicies,
  });
}

/** Chờ các truy vấn giả trả về và React vẽ xong */
export const settle = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
