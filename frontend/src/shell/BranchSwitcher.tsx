import { Button, Combobox, Group, Loader, Text, useCombobox } from '@mantine/core';
import { IconBuildingFactory2, IconCheck, IconChevronDown, IconEye } from '@tabler/icons-react';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBranchChoices } from '../lib/branches';
import { guardedLeave } from '../lib/leaveGuard';
import { toastError, toastOk } from '../lib/notify';
import type { Branch } from '../lib/types';
import { selectBranch } from '../store/auth';
import { useSession } from '../store/session';
import { flattenLeaves } from './permissions';

export interface BranchSwitcherHandle {
  open: () => void;
}

/**
 * Nút nhà máy trên thanh trên cùng: bấm là mở danh sách nhà máy để chọn ngay tại chỗ, không sang trang khác. Chọn xong
 * vẫn ở màn đang mở (mở lại từ đầu với dữ liệu nhà máy mới, bỏ bộ lọc trên URL của nhà máy cũ); nhà máy mới không có màn
 * này thì về Trang chủ. Còn thay đổi chưa lưu thì hỏi lại trước khi đổi.
 */
export function BranchSwitcher({ handle }: { handle?: Ref<BranchSwitcherHandle> }) {
  const branch = useSession((s) => s.branch);
  const navigate = useNavigate();
  // Màn đang mở lúc có kết quả đổi nhà máy (có thể đã chuyển màn trong lúc chờ)
  const here = useRef('/');
  here.current = useLocation().pathname;
  const [busy, setBusy] = useState<string | null>(null);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    // Như Select của Mantine: phím mũi tên đi tiếp từ nhà máy đang làm việc
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active', { scrollIntoView: true }),
  });
  const choices = useBranchChoices(combobox.dropdownOpened);
  useImperativeHandle(
    handle,
    () => ({
      // Mở từ menu tài khoản: đặt focus vào nút nhà máy để phím mũi tên, Enter, Esc làm việc với danh sách (menu đóng xong
      // mới gọi, nên không bị trả focus về nút tài khoản)
      open: () => {
        combobox.targetRef.current?.focus();
        combobox.openDropdown();
      },
    }),
    [combobox],
  );

  if (!branch) return null;

  const switchTo = (b: Branch) => {
    combobox.closeDropdown();
    if (b.code === branch.code || busy) return;
    guardedLeave(() => {
      setBusy(b.code);
      selectBranch(b, () => {
        // Cùng lần đổi phiên: AppLayout chờ đúng lần điều hướng này (branchSwitch) rồi mới mở màn từ đầu
        const { menu, switchCount } = useSession.getState();
        const path = here.current;
        const stay = path === '/' || flattenLeaves(menu).some((l) => l.path === path);
        navigate(stay ? path : '/', { replace: true, state: { branchSwitch: switchCount } });
      })
        .then((ok) => ok && toastOk(b.isAggregate ? 'Bạn đang xem tổng hợp mọi nhà máy, chỉ đọc.' : `Bạn đang làm việc ở ${b.name}.`, 'Đã chuyển nhà máy'))
        // Phiên đã kết thúc (lý do hiện ở màn đăng nhập) thì không báo thêm câu khác
        .catch((e) => useSession.getState().status !== 'anonymous' && toastError(e, 'Chưa đổi được nhà máy'))
        .finally(() => setBusy(null));
    });
  };

  const list = choices.data ?? [];
  const option = (b: Branch) => {
    const current = b.code === branch.code;
    return (
      // Tên đọc lấy từ chữ đang hiện; nhà máy đang làm việc báo bằng aria-selected (Combobox.Option không tự đặt)
      <Combobox.Option key={b.code} value={b.code} active={current} aria-selected={current} disabled={!!busy}>
        <Group gap={8} wrap="nowrap" justify="space-between">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            {b.isAggregate ? <IconEye size={16} stroke={1.7} /> : <IconBuildingFactory2 size={16} stroke={1.7} />}
            <div style={{ minWidth: 0 }}>
              <Text size="sm" fw={current ? 700 : 500} truncate="end">
                {b.name}
              </Text>
              <Text size="xs" c="dimmed">
                {b.code}
                {b.isAggregate ? ', xem tổng hợp, chỉ đọc' : ''}
              </Text>
            </div>
          </Group>
          {current && <IconCheck size={16} stroke={2.2} color="var(--link)" aria-hidden />}
        </Group>
      </Combobox.Option>
    );
  };
  const aggregate = list.filter((b) => b.isAggregate);
  const caption = branch.isAggregate ? 'Tổng hợp, chỉ đọc' : `Chi nhánh SX ${branch.code}`;
  const factories = list.filter((b) => !b.isAggregate);

  return (
    <Combobox store={combobox} onOptionSubmit={(code) => { const b = list.find((x) => x.code === code); if (b) switchTo(b); }} position="bottom-start" width={300} shadow="md" withinPortal>
      <Combobox.Target targetType="button" withExpandedAttribute>
        {/* Vai trò combobox không lấy tên từ chữ bên trong: tên đọc ghép đúng chữ đang hiện (WCAG 2.5.3) */}
        <button
          type="button"
          className="nav-btn nav-branch focus-ring"
          title="Đổi nhà máy"
          aria-label={`${caption} ${branch.name}, đổi nhà máy`}
          onClick={() => combobox.toggleDropdown()}
          aria-busy={!!busy || undefined}
        >
          {busy ? <Loader size={18} color="white" aria-hidden /> : <IconBuildingFactory2 size={20} stroke={1.6} />}
          <span className="nav-btn-stack">
            <span className="nav-btn-small">{caption}</span>
            <span className="nav-btn-main">{branch.name}</span>
          </span>
          <IconChevronDown size={14} className="nav-branch-caret" aria-hidden />
        </button>
      </Combobox.Target>
      <Combobox.Dropdown aria-label="Chọn nhà máy">
        <Combobox.Options>
          {choices.isError ? (
            <Combobox.Empty>
              <Text size="sm">Chưa tải được danh sách nhà máy. Bấm Thử lại hoặc mở lại danh sách.</Text>
              <Button size="xs" variant="default" mt={6} loading={choices.isFetching} onClick={() => void choices.refetch()}>
                Thử lại
              </Button>
            </Combobox.Empty>
          ) : !choices.data ? (
            <Combobox.Empty>
              <Group gap={8} justify="center">
                <Loader size="xs" aria-hidden />
                <Text size="sm">Đang tải danh sách nhà máy…</Text>
              </Group>
            </Combobox.Empty>
          ) : list.length === 0 ? (
            <Combobox.Empty>Tài khoản chưa được gán nhà máy nào.</Combobox.Empty>
          ) : (
            <>
              {aggregate.length > 0 && <Combobox.Group label="Tổng hợp">{aggregate.map(option)}</Combobox.Group>}
              {factories.length > 0 && <Combobox.Group label="Nhà máy">{factories.map(option)}</Combobox.Group>}
            </>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
