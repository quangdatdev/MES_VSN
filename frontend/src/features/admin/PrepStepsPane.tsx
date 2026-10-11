import { Button, Group, Modal, NumberInput, Stack, Text, TextInput, Textarea, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowBackUp, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { DataGrid } from '../../components/DataGrid';
import { SheetGrid, sheetNumber, sheetReadonly, sheetSelect, sheetText, type SheetColumn } from '../../components/SheetGrid';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { useCan } from '../../shell/permissions';
import type { PrepStep } from '../sewing/api';
import { escapeToClose, LoadError, upper } from './common';

export const PREP_STEPS_KEY = ['admin', 'prep-steps'] as const;
const STATUS_OPTIONS = [
  { value: 'on', label: 'Đang dùng' },
  { value: 'off', label: 'Ngừng dùng' },
];

interface Row {
  key: number;
  code: string;
  name: string;
  planDays: number | null;
  performer: string;
  dataSource: string;
  sortOrder: number | null;
  active: boolean;
}

const rowOf = (s: PrepStep): Row => ({
  key: s.id,
  code: s.code,
  name: s.name,
  planDays: s.planDays,
  performer: s.performer ?? '',
  dataSource: s.dataSource ?? '',
  sortOrder: s.sortOrder,
  active: s.isActive,
});
const same = (a: Row, b: Row) =>
  a.name.trim() === b.name.trim() && a.planDays === b.planDays && a.performer.trim() === b.performer.trim() && a.dataSource.trim() === b.dataSource.trim() && a.sortOrder === b.sortOrder && a.active === b.active;

/**
 * Danh mục "Cấu hình chuẩn bị SX" (module May, ADR 0009): các bước chuẩn bị trước ngày vào chuyền, theo thứ tự cột ở màn
 * Kế hoạch chuẩn bị SX. Sửa thẳng trên bảng như bảng tính (dán được từ Excel) rồi Lưu thay đổi một lần.
 */
export function PrepStepsPane() {
  const canEdit = useCan('admin.catalog:update');
  const canCreate = useCan('admin.catalog:create');
  const qc = useQueryClient();
  const steps = useQuery({ queryKey: PREP_STEPS_KEY, queryFn: () => api<PrepStep[]>('/sewing/prep-steps') });
  const original = useMemo(() => (steps.data ?? []).map(rowOf), [steps.data]);
  const [draft, setDraft] = useState<Row[] | null>(null);
  const rows = draft ?? original;
  const changed = draft ? draft.filter((r) => !same(r, original.find((o) => o.key === r.key)!)) : [];
  const dirty = changed.length > 0;
  useLeaveGuard(dirty);
  const [adding, setAdding] = useState(false);

  const issues = rows.flatMap((r, i) => [
    ...(!r.name.trim() ? [`Dòng ${i + 1}: thiếu Nội dung`] : []),
    ...(r.planDays == null ? [`Dòng ${i + 1}: thiếu Số ngày KH`] : r.planDays > 365 ? [`Dòng ${i + 1}: Số ngày KH tối đa 365`] : []),
    ...(r.sortOrder == null ? [`Dòng ${i + 1}: thiếu Thứ tự`] : []),
  ]);

  // Gửi ảnh chụp lúc bấm Lưu: `rows` là bảng lúc đó, để biết người dùng có gõ thêm trong lúc chờ không
  const save = useMutation({
    mutationFn: ({ sent }: { sent: Row[]; rows: Row[] }) =>
      api('/sewing/prep-steps', {
        method: 'PUT',
        body: {
          items: sent.map((r) => ({
            id: r.key,
            name: r.name.trim(),
            planDays: r.planDays,
            performer: r.performer.trim() || null,
            dataSource: r.dataSource.trim() || null,
            sortOrder: r.sortOrder,
            isActive: r.active,
          })),
        },
      }),
    onSuccess: (_r, { sent, rows: snapshot }) => {
      toastOk(`Đã lưu ${sent.length} bước chuẩn bị SX.`);
      // Bảng vẫn sửa được trong lúc lưu: có ô gõ thêm thì giữ bản nháp (ô vừa lưu thôi tính là đã đổi khi danh mục tải lại),
      // không thì bỏ nháp
      setDraft((d) => (d === snapshot ? null : d));
      void qc.invalidateQueries({ queryKey: PREP_STEPS_KEY });
      void qc.invalidateQueries({ queryKey: ['sewing', 'prep'] });
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });

  const submit = () => {
    const stopping = changed.filter((r) => !r.active && original.find((o) => o.key === r.key)?.active);
    const send = () => save.mutate({ sent: changed, rows });
    if (!stopping.length) return send();
    confirmAction({
      title: `Ngừng dùng ${stopping.length} bước?`,
      consequence: `${stopping.map((r) => r.name).join(', ')}: cột của bước không còn hiện ở màn Kế hoạch chuẩn bị SX và không còn tính vào trạng thái. Ngày đã nhập giữ nguyên, bật lại lúc nào cũng được.`,
      confirmLabel: 'Ngừng dùng và lưu',
      onConfirm: send,
    });
  };

  const columns = useMemo<SheetColumn<Row>[]>(
    () => [
      sheetNumber<Row>('sortOrder', 'Thứ tự', { required: true, minWidth: 80, grow: 0 }),
      sheetReadonly<Row>('Mã', (r) => <span className="cell-code">{r.code}</span>, (r) => r.code, { minWidth: 80 }),
      sheetText<Row>('name', 'Nội dung', { required: true, minWidth: 220, grow: 2 }),
      sheetNumber<Row>('planDays', 'Số ngày KH', { required: true, minWidth: 100, error: (r) => r.planDays != null && r.planDays > 365 }),
      sheetText<Row>('performer', 'Người thực hiện', { minWidth: 150 }),
      sheetText<Row>('dataSource', 'Nguồn dữ liệu đầu vào', { minWidth: 280, grow: 3 }),
      sheetSelect<Row>('Trạng thái', { options: () => STATUS_OPTIONS, get: (r) => (r.active ? 'on' : 'off'), set: (r, v) => ({ ...r, active: v !== 'off' }) }, { minWidth: 120 }),
    ],
    [],
  );

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <div style={{ minWidth: 0, maxWidth: 680 }}>
          <Title order={2} size="h3">Cấu hình chuẩn bị SX</Title>
          <Text size="sm" c="dimmed" mt={2}>
            Các bước chuẩn bị trước ngày vào chuyền, theo thứ tự cột ở màn Kế hoạch chuẩn bị SX. KH của bước = Ngày vào chuyền − Số ngày KH. Đổi Số ngày KH ở đây thì mọi dòng chưa chỉnh riêng đổi theo.
          </Text>
        </div>
        <Group gap="xs">
          {canCreate && (
            // Bảng đang có thay đổi chưa lưu thì bước mới không hiện được trong bảng: lưu hoặc hoàn tác trước
            <ActionButton variant="default" leftSection={<IconPlus size={15} />} blockedReason={dirty ? 'Lưu hoặc hoàn tác các thay đổi trên bảng trước khi thêm bước.' : null} onClick={() => setAdding(true)}>
              Thêm bước
            </ActionButton>
          )}
          {canEdit && (
            <>
              <ActionButton variant="default" leftSection={<IconArrowBackUp size={15} />} blockedReason={dirty ? null : 'Chưa có thay đổi nào.'} onClick={() => confirmDiscard(true, () => setDraft(null), 'Mọi ô đã đổi trở lại như lần lưu gần nhất.')}>
                Hoàn tác
              </ActionButton>
              <ActionButton loading={save.isPending} blockedReason={!dirty ? 'Chưa có thay đổi nào.' : issues.length ? 'Sửa các ô tô đỏ hoặc còn trống trước khi lưu.' : null} onClick={submit}>
                Lưu thay đổi
              </ActionButton>
            </>
          )}
        </Group>
      </Group>
      {steps.isError && <LoadError error={steps.error} what="danh mục Cấu hình chuẩn bị SX" onRetry={() => void steps.refetch()} retrying={steps.isFetching} />}
      {dirty && issues.length > 0 && (
        <Text size="sm" c="red" role="alert">
          {issues.slice(0, 5).join('. ')}
          {issues.length > 5 ? `. Và ${issues.length - 5} lỗi khác.` : '.'}
        </Text>
      )}
      <div style={{ height: 'min(62vh, 620px)', display: 'flex', flexDirection: 'column' }}>
        {canEdit ? (
          <SheetGrid label="Cấu hình chuẩn bị SX" value={rows} onChange={setDraft} columns={columns} rowKey={(r) => r.key} empty="Chưa có bước nào. Bấm Thêm bước để bắt đầu." />
        ) : (
          <DataGrid
            label="Cấu hình chuẩn bị SX"
            fill
            loading={steps.isLoading}
            rows={rows}
            rowKey={(r) => r.key}
            empty="Chưa có bước nào."
            columns={[
              { key: 'sortOrder', title: 'Thứ tự', field: null, format: 'number' },
              { key: 'code', title: 'Mã', field: null, format: 'code' },
              { key: 'name', title: 'Nội dung', field: null, maxWidth: 280 },
              { key: 'planDays', title: 'Số ngày KH', field: null, format: 'number' },
              { key: 'performer', title: 'Người thực hiện', field: null },
              { key: 'dataSource', title: 'Nguồn dữ liệu đầu vào', field: null, maxWidth: 360 },
              { key: 'active', title: 'Trạng thái', field: null, render: (r) => (r.active ? 'Đang dùng' : 'Ngừng dùng') },
            ]}
          />
        )}
      </div>
      {adding && <AddStepDialog onClose={() => setAdding(false)} />}
    </Stack>
  );
}

function AddStepDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const form = useForm({
    initialValues: { code: '', name: '', planDays: '' as number | '', performer: '', dataSource: '' },
    validateInputOnBlur: true,
    validate: {
      code: (v) => (/^[A-Z0-9._-]{1,30}$/.test(v) ? null : 'Mã gồm chữ hoa không dấu, số, dấu chấm, gạch dưới, gạch ngang; tối đa 30 ký tự'),
      name: (v) => (v.trim() ? null : 'Nhập nội dung bước'),
      planDays: (v) => (v === '' ? 'Nhập số ngày KH' : v < 0 || v > 365 ? 'Từ 0 đến 365 ngày' : null),
    },
  });
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  const create = useMutation({
    mutationFn: (v: typeof form.values) =>
      api('/sewing/prep-steps', { method: 'POST', body: { code: v.code, name: v.name.trim(), planDays: v.planDays, performer: v.performer.trim() || null, dataSource: v.dataSource.trim() || null } }),
    onSuccess: (_r, v) => {
      toastOk(`Đã thêm bước ${v.name.trim()}. Bước mới nằm cuối, sửa Thứ tự để đổi chỗ.`);
      void qc.invalidateQueries({ queryKey: PREP_STEPS_KEY });
      void qc.invalidateQueries({ queryKey: ['sewing', 'prep'] });
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa thêm được'),
  });
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title="Thêm bước chuẩn bị SX">
      <form onSubmit={form.onSubmit((v) => create.mutate(v))}>
        <Stack gap="sm">
          <TextInput label="Mã" withAsterisk description="Không đổi được sau khi tạo" maxLength={30} data-autofocus {...form.getInputProps('code')} onChange={upper((v) => form.setFieldValue('code', v))} />
          <TextInput label="Nội dung" withAsterisk maxLength={150} {...form.getInputProps('name')} />
          <NumberInput label="Số ngày KH" withAsterisk description="KH = Ngày vào chuyền − số ngày này" min={0} max={365} allowDecimal={false} {...form.getInputProps('planDays')} />
          <TextInput label="Người thực hiện" maxLength={100} {...form.getInputProps('performer')} />
          <Textarea label="Nguồn dữ liệu đầu vào" autosize minRows={2} maxLength={500} {...form.getInputProps('dataSource')} />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={create.isPending}>Thêm bước</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
