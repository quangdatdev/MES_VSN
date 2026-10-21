import { Alert, Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { api } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { qs } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { escapeToClose } from './common';
import type { AdminEmployee, AdminUser } from './types';

/** Nhãn người: "Tên - Mã - Phòng ban" như ô Tên cụm trưởng ở Phân cụm trưởng */
export const employeeText = (e: Pick<AdminEmployee, 'fullName' | 'code' | 'departmentName'>) => [e.fullName, e.code, e.departmentName].filter((x) => !!x).join(' - ');

/**
 * Nhân viên của tài khoản (phase 5.18, quyết định 10.3): màn Phân cụm trưởng biết người đăng nhập là tổ trưởng tổ nào theo nhân viên này.
 * Tìm trên máy chủ theo mã hoặc tên (danh bạ nhân viên, chỉ người đang làm). Bỏ chọn rồi lưu là gỡ.
 */
export function UserEmployeeDialog({ user, onClose, onDone }: { user: AdminUser; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [value, setValue] = useState<number | null>(user.employeeId);
  const [picked, setPicked] = useState<AdminEmployee | null>(user.employee);
  const [term, setTerm] = useState('');
  const [debounced] = useDebouncedValue(term, 300);
  const q = debounced.trim();
  const found = useQuery({
    queryKey: ['admin', 'employee-options', q],
    queryFn: () => api<{ canSearch: boolean; items: AdminEmployee[] }>(`/admin/users/employee-options${qs({ q: q || undefined })}`),
    staleTime: 60_000,
  });
  const options = useMemo(() => {
    const list = (found.data?.items ?? []).map((e) => ({ value: String(e.id), label: employeeText(e) }));
    if (value != null && !list.some((o) => o.value === String(value))) {
      list.unshift({ value: String(value), label: picked ? `${employeeText(picked)}${picked.isActive ? '' : ' (đã nghỉ việc)'}` : `Nhân viên #${value}` });
    }
    return list;
  }, [found.data, value, picked]);
  const dirty = value !== user.employeeId;
  const save = useMutation({
    mutationFn: () => api(`/admin/users/${user.id}/employee`, { method: 'PUT', body: { employeeId: value } }),
    onSuccess: () => {
      toastOk(value == null ? `Đã gỡ nhân viên khỏi tài khoản ${user.username}.` : `Đã gắn ${picked ? employeeText(picked) : 'nhân viên'} cho tài khoản ${user.username}.`);
      // Đóng popup trước rồi mới làm mới danh sách người dùng (10-giao-dien mục 13.7, review 5.18 L10)
      onClose();
      void onDone();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  useLeaveGuard(dirty);
  const requestClose = () => confirmDiscard(dirty, onClose);
  const canSearch = found.data?.canSearch !== false;
  return (
    <Modal opened onClose={requestClose} {...escapeToClose(requestClose)} title={`Nhân viên của ${user.username}`}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed" maw={520}>
          Màn Phân cụm trưởng dựa vào nhân viên này để biết tài khoản là tổ trưởng của tổ nào. Một tài khoản gắn một nhân viên đang làm việc.
        </Text>
        {!canSearch && (
          <Alert color="orange" variant="light" py={8}>
            Bạn chưa được xem Danh bạ nhân viên nên chưa tìm được người. Nhờ quản trị viên cấp quyền.
          </Alert>
        )}
        <Select
          label="Nhân viên"
          placeholder="Gõ mã hoặc tên để tìm"
          searchable
          clearable
          data={options}
          value={value == null ? null : String(value)}
          onChange={(v) => {
            setValue(v ? Number(v) : null);
            setPicked(v ? (found.data?.items.find((e) => String(e.id) === v) ?? picked) : null);
          }}
          // Chọn xong, ô tự đặt chữ tìm bằng nhãn người vừa chọn: không phải chữ gõ, không gửi lên máy chủ
          onSearchChange={(text) => setTerm(options.some((o) => o.label === text) ? '' : text)}
          filter={({ options: all }) => all}
          nothingFoundMessage={found.isFetching ? 'Đang tìm…' : 'Không có nhân viên đang làm khớp'}
          comboboxProps={{ withinPortal: true }}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={requestClose}>
            Hủy
          </Button>
          <ActionButton loading={save.isPending} blockedReason={dirty ? null : 'Chưa đổi gì'} onClick={() => save.mutate()}>
            Lưu thay đổi
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  );
}
