import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BranchName } from '../components/BranchName';
import { api } from '../lib/api';

vi.mock('../lib/api', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/api')>();
  return { ...mod, api: vi.fn() };
});

function show(codes: (string | null)[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      {codes.map((c, i) => (
        <p key={i} data-testid={`b${i}`}>
          <BranchName code={c} />
        </p>
      ))}
    </QueryClientProvider>,
  );
}

describe('Tên chi nhánh thay mã', () => {
  it('hiện tên chi nhánh theo mã; mã không có trong danh mục thì hiện mã, ô trống thì để trống', async () => {
    vi.mocked(api).mockImplementation((async (path: string) => {
      if (path === '/me/branch-names') return [{ code: 'A01', name: 'Chi nhánh thử' }];
      throw new Error(`Chưa giả: ${path}`);
    }) as typeof api);
    show(['A01', 'A09', null]);
    expect(await screen.findByText('Chi nhánh thử')).toHaveAttribute('title', 'A01');
    expect(screen.getByTestId('b1')).toHaveTextContent('A09');
    expect(screen.getByTestId('b2')).toBeEmptyDOMElement();
  });

  it('chưa tải được tên thì vẫn hiện mã', async () => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockRejectedValue(new Error('mất mạng'));
    show(['A01']);
    // Chờ lần tải lỗi xong rồi mới kiểm (ngay sau render là trạng thái đang tải)
    await waitFor(() => expect(api).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByTestId('b0')).toHaveTextContent('A01');
  });
});
