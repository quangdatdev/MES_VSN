import { ActionIcon, Badge, Button, Chip, Group, Modal, MultiSelect, NumberInput, SegmentedControl, Select, SimpleGrid, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { DateField } from '../../components/DateField';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { addDays, fmtDate, fmtNum, today } from '../../lib/format';
import { guardedLeave, useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { isoWeekday, offsetsInOrder, productionDaysOf, WEEKDAYS } from '../../lib/workCalendar';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { EmptyRow, escapeToClose, IconAction, LoadError, SkeletonRows } from './common';
import type { MesCatalog, WorkCalendarConfig, WorkCalendarDayRow, WorkCalendarItem, WorkCalendarList } from './types';

/** Cùng tiền tố khóa với màn Danh mục hệ thống: lưu xong thì tổng quan (số ĐVCS có lịch riêng) tải lại */
const KEY = ['admin', 'catalogs', 'work-calendars'] as const;
/** Như máy chủ: một lần đặt tối đa bấy nhiêu ngày */
const MAX_RANGE_DAYS = 62;
/** Năm xem được, như máy chủ nhận */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const OFFSETS: { key: keyof Omit<WorkCalendarConfig, 'weeklyOffDays'>; label: string; after: string }[] = [
  { key: 'outStartOffsetDays', label: 'Bắt đầu ra chuyền', after: 'từ bắt đầu vào chuyền' },
  { key: 'outEndOffsetDays', label: 'Kết thúc ra chuyền', after: 'từ kết thúc vào chuyền' },
  { key: 'warehouseStartOffsetDays', label: 'Bắt đầu nhập kho', after: 'từ bắt đầu ra chuyền' },
  { key: 'warehouseEndOffsetDays', label: 'Kết thúc nhập kho', after: 'từ kết thúc ra chuyền' },
];
const DAY_TYPE = { OFF: 'Nghỉ', WORK: 'Làm bù' } as const;
const decimal = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
/** Ví dụ theo ngưỡng đang nhập: Số lượng / Năng suất ra 7,3; 7,5; 7,8 thì được mấy ngày */
/** Ô ngưỡng giữ chuỗi trong lúc gõ dở ("0,", "0,70"): chỉ đổi ra số khi kiểm, xem ví dụ và gửi đi */
type ConfigForm = Omit<WorkCalendarConfig, 'productionRoundUpFrom'> & { productionRoundUpFrom: number | string };
const asNumber = (v: number | string) => (typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v));
const roundingExample = (from: number) =>
  [73, 75, 78].map((q) => `${decimal(q / 10)} → ${productionDaysOf({ productionRoundUpFrom: from }, q, 10)} ngày`).join('; ');
const span = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
const range = (from: string, to: string) => (from === to ? fmtDate(from) : `${fmtDate(from)} – ${fmtDate(to)}`);

/** Đợt: các ngày liền nhau cùng loại, cùng tên (Tết 9 ngày là một dòng) */
interface Period {
  from: string;
  to: string;
  dayType: 'OFF' | 'WORK';
  name: string | null;
}
function periodsOf(days: WorkCalendarDayRow[]): Period[] {
  const out: Period[] = [];
  for (const d of days) {
    const last = out.at(-1);
    if (last && last.dayType === d.dayType && last.name === d.name && addDays(last.to, 1) === d.date) last.to = d.date;
    else out.push({ from: d.date, to: d.date, dayType: d.dayType, name: d.name });
  }
  return out;
}

/**
 * Lịch làm việc theo đơn vị cơ sở (phase 5.12): ngày nghỉ hằng tuần, ngày nghỉ lễ, Tết, ngày làm bù và số ngày cộng thêm cho ra
 * chuyền, nhập kho. Chi tiết dàn chuyền tự tính ngày theo lịch này.
 */
export function WorkCalendarPane({ info }: { info: MesCatalog }) {
  const list = useQuery({ queryKey: KEY, queryFn: () => api<WorkCalendarList>('/admin/catalogs/work-calendars') });
  const session = useSession((s) => s.branch?.code);
  const items = list.data?.items ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  // Mặc định là ĐVCS đang đăng nhập (đơn vị tổng hợp không có lịch thì lấy ĐVCS đầu tiên)
  const branch = items.find((i) => i.branchCode === picked) ?? items.find((i) => i.branchCode === session) ?? items[0] ?? null;
  const [year, setYear] = useState(() => Number(today().slice(0, 4)));

  return (
    <>
      <Stack gap={6} mb="sm">
        <div style={{ maxWidth: 680 }}>
          <Title order={2} size="h3">{info.name}</Title>
          {info.description && <Text size="sm" c="dimmed" mt={2}>{info.description}</Text>}
        </div>
        <Group gap="sm" wrap="wrap" align="center">
          <Select
            aria-label="Đơn vị cơ sở"
            w={260}
            allowDeselect={false}
            value={branch?.branchCode ?? null}
            onChange={(v) => v && guardedLeave(() => setPicked(v))}
            data={items.map((i) => ({ value: i.branchCode, label: `${i.branchName || i.branchCode} (${i.branchCode})${i.branchActive ? '' : ' – ngừng dùng'}` }))}
            placeholder={list.isPending ? 'Đang tải…' : 'Chọn đơn vị cơ sở'}
          />
          {branch && (branch.configured ? <Badge variant="light" color="teal">Lịch riêng</Badge> : <Badge variant="light" color="gray">Đang dùng lịch mặc định</Badge>)}
          <Group gap={2} ml="auto" wrap="nowrap" role="group" aria-label="Năm">
            <ActionIcon variant="subtle" color="gray" aria-label="Năm trước" disabled={year <= MIN_YEAR} onClick={() => setYear(year - 1)}><IconChevronLeft size={16} /></ActionIcon>
            <Text fw={700} w={48} ta="center" aria-live="polite">{year}</Text>
            <ActionIcon variant="subtle" color="gray" aria-label="Năm sau" disabled={year >= MAX_YEAR} onClick={() => setYear(year + 1)}><IconChevronRight size={16} /></ActionIcon>
          </Group>
        </Group>
      </Stack>
      {list.error && <LoadError error={list.error} what="lịch làm việc" onRetry={() => void list.refetch()} retrying={list.isFetching} />}
      {list.isPending && <Skeleton h={320} />}
      {list.isSuccess && !branch && <Text size="sm" c="dimmed">Chưa có đơn vị cơ sở nào. Chép đơn vị cơ sở từ BRAVO ở Quản trị › Đơn vị cơ sở trước.</Text>}
      {branch && <BranchCalendar key={branch.branchCode} item={branch} branches={items} year={year} />}
    </>
  );
}

function BranchCalendar({ item, branches, year }: { item: WorkCalendarItem; branches: WorkCalendarItem[]; year: number }) {
  const canDelete = useCan('admin.catalog:update');
  // ĐVCS đã ngừng dùng chỉ còn xem và xóa ngày (máy chủ từ chối ghi mới)
  const canEdit = canDelete && item.branchActive;
  const weeklyId = useId();
  const qc = useQueryClient();
  const days = useQuery({
    queryKey: [...KEY, item.branchCode, year],
    queryFn: () => api<WorkCalendarDayRow[]>(`/admin/catalogs/work-calendars/${item.branchCode}/days?year=${year}`),
  });
  const special = useMemo(() => new Map((days.data ?? []).map((d) => [d.date, d])), [days.data]);
  const periods = useMemo(() => periodsOf(days.data ?? []), [days.data]);
  const [dialog, setDialog] = useState<{ from: string; to: string } | null>(null);

  const form = useForm<ConfigForm>({
    initialValues: {
      weeklyOffDays: item.weeklyOffDays,
      outStartOffsetDays: item.outStartOffsetDays,
      outEndOffsetDays: item.outEndOffsetDays,
      warehouseStartOffsetDays: item.warehouseStartOffsetDays,
      warehouseEndOffsetDays: item.warehouseEndOffsetDays,
      productionRoundUpFrom: item.productionRoundUpFrom,
    },
    validate: {
      weeklyOffDays: (v) => (v.length >= 7 ? 'Phải còn ít nhất một ngày làm việc trong tuần.' : null),
      outEndOffsetDays: (_v, all) => (offsetsInOrder(all) ? null : 'Ngày kết thúc phải từ ngày bắt đầu trở đi: số ngày của "Kết thúc" phải từ số ngày của "Bắt đầu" trở lên.'),
      productionRoundUpFrom: (v) => (asNumber(v) >= 0.01 && asNumber(v) <= 1 ? null : 'Nhập từ 0,01 đến 1.'),
    },
  });
  useLeaveGuard(form.isDirty());
  const reload = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'catalogs'] });
  };
  const saveConfig = useMutation({
    mutationFn: (v: WorkCalendarConfig) => api(`/admin/catalogs/work-calendars/${item.branchCode}`, { method: 'PUT', body: v }),
    onSuccess: (_r, v) => {
      form.setInitialValues(v);
      form.reset();
      toastOk(`Đã lưu lịch làm việc của ${item.branchName || item.branchCode}.`);
      reload();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  const remove = useMutation({
    mutationFn: (p: Period) => api<{ deleted: number }>(`/admin/catalogs/work-calendars/${item.branchCode}/days?from=${p.from}&to=${p.to}`, { method: 'DELETE' }),
    onSuccess: (r, p) => {
      toastOk(`Đã xóa ${fmtNum(r.deleted)} ngày ${DAY_TYPE[p.dayType].toLowerCase()} (${range(p.from, p.to)}).`);
      reload();
    },
    onError: (e) => toastError(e, 'Chưa xóa được'),
  });
  const askRemove = (p: Period) =>
    confirmAction({
      title: `Xóa ${p.name ? `“${p.name}”` : `ngày ${DAY_TYPE[p.dayType].toLowerCase()}`}?`,
      consequence: `${range(p.from, p.to)} trở lại theo ngày nghỉ hằng tuần. Dàn chuyền đã lưu giữ ngày cũ tới lần bấm Lưu kế tiếp.`,
      confirmLabel: 'Xóa',
      onConfirm: () => remove.mutate(p),
    });

  return (
    <Stack gap="md">
      <form className="wcal-config" onSubmit={form.onSubmit((v) => saveConfig.mutate({ ...v, productionRoundUpFrom: asNumber(v.productionRoundUpFrom) }))}>
        <Text fw={600} size="sm" mb={4} id={`${weeklyId}-label`}>Ngày nghỉ hằng tuần</Text>
        <Chip.Group multiple value={form.values.weeklyOffDays.map(String)} onChange={(v) => form.setFieldValue('weeklyOffDays', v.map(Number).sort())}>
          <Group gap={6} role="group" aria-labelledby={`${weeklyId}-label`} aria-describedby={form.errors.weeklyOffDays ? `${weeklyId}-error` : undefined}>
            {WEEKDAYS.map((d) => (
              <Chip key={d.value} value={String(d.value)} size="sm" disabled={!canEdit} aria-label={`Nghỉ ${d.label}`}>
                {d.short}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        {form.errors.weeklyOffDays && <Text size="xs" c="red" mt={4} id={`${weeklyId}-error`}>{form.errors.weeklyOffDays}</Text>}
        <Text fw={600} size="sm" mt="md" mb={4}>Số ngày cộng thêm (ngày lịch, kể cả ngày nghỉ)</Text>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          {OFFSETS.map((o) => (
            <NumberInput
              key={o.key}
              label={o.label}
              description={o.after}
              suffix=" ngày"
              min={0}
              max={60}
              allowDecimal={false}
              clampBehavior="strict"
              readOnly={!canEdit}
              className={canEdit ? undefined : 'field-readonly'}
              {...form.getInputProps(o.key)}
              onChange={(v) => form.setFieldValue(o.key, typeof v === 'number' ? v : 0)}
            />
          ))}
        </SimpleGrid>
        <Text fw={600} size="sm" mt="md" mb={4}>Làm tròn Số ngày SX</Text>
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
          <NumberInput
            label="Làm tròn lên khi phần lẻ từ"
            description={roundingExample(Math.min(1, Math.max(0.01, asNumber(form.values.productionRoundUpFrom) || 0.01)))}
            min={0.01}
            max={1}
            step={0.05}
            decimalScale={2}
            decimalSeparator=","
            // Kẹp khi rời ô: kẹp từng phím chặn các bước gõ dở như "0," (review 5.12.3 H1)
            clampBehavior="blur"
            readOnly={!canEdit}
            className={canEdit ? undefined : 'field-readonly'}
            {...form.getInputProps('productionRoundUpFrom')}
          />
        </SimpleGrid>
        {canEdit && (
          <Group justify="flex-end" mt="sm" gap="xs">
            {form.isDirty() && <Button variant="default" onClick={() => form.reset()}>Hoàn tác</Button>}
            <Button type="submit" loading={saveConfig.isPending} disabled={!form.isDirty() && item.configured}>
              {item.configured ? 'Lưu cấu hình' : 'Tạo lịch riêng'}
            </Button>
          </Group>
        )}
      </form>

      <div>
        <Group justify="space-between" align="flex-end" mb={6} wrap="wrap" gap="xs">
          <div>
            <Text fw={600} size="sm">Năm {year}</Text>
            <Text size="xs" c="dimmed">{canEdit ? 'Bấm vào một ngày để đặt nghỉ hoặc làm bù.' : 'Ngày nghỉ, làm bù trong năm.'}</Text>
          </div>
          <div className="wcal-legend" aria-hidden>
            <span><i data-kind="weekly" />Nghỉ hằng tuần</span>
            <span><i data-kind="holiday" />Nghỉ lễ, Tết</span>
            <span><i data-kind="work" />Làm bù</span>
          </div>
        </Group>
        {days.error && <LoadError error={days.error} what="ngày nghỉ của năm" onRetry={() => void days.refetch()} retrying={days.isFetching} />}
        <YearGrid year={year} weeklyOff={form.values.weeklyOffDays} special={special} onPick={canEdit ? (d) => setDialog({ from: d, to: d }) : undefined} />
      </div>

      <div>
        <Group justify="space-between" mb={6}>
          <Text fw={600} size="sm">Ngày nghỉ lễ, làm bù năm {year}</Text>
          {canEdit && (
            <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => setDialog({ from: '', to: '' })}>
              Thêm ngày nghỉ, làm bù
            </Button>
          )}
        </Group>
        <div className="table-frame">
          <table className="dense-table">
            <thead>
              <tr>
                <th style={{ width: 220 }}>Ngày</th>
                <th style={{ width: 80 }} className="num">Số ngày</th>
                <th style={{ width: 100 }}>Loại</th>
                <th>Tên</th>
                {canDelete && <th style={{ width: 56 }} aria-label="Thao tác" />}
              </tr>
            </thead>
            <tbody>
              {days.isPending && <SkeletonRows cols={canDelete ? 5 : 4} rows={3} />}
              {periods.map((p) => (
                <tr key={p.from}>
                  <td>{range(p.from, p.to)}</td>
                  <td className="num">{span(p.from, p.to)}</td>
                  <td><Badge size="sm" variant="light" color={p.dayType === 'OFF' ? 'orange' : 'teal'}>{DAY_TYPE[p.dayType]}</Badge></td>
                  <td>{p.name ?? <Text span size="sm" c="dimmed">Không tên</Text>}</td>
                  {canDelete && (
                    <td>
                      <IconAction label={`Xóa ${range(p.from, p.to)}`} icon={<IconTrash size={16} />} color="red" onClick={() => askRemove(p)} />
                    </td>
                  )}
                </tr>
              ))}
              {days.isSuccess && periods.length === 0 && (
                <EmptyRow colSpan={canDelete ? 5 : 4}>
                  Năm {year} chưa có ngày nghỉ lễ hay làm bù nào{canEdit ? '. Bấm “Thêm ngày nghỉ, làm bù” hoặc bấm vào ngày trên lịch.' : '.'}
                </EmptyRow>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {dialog && <DaysDialog initial={dialog} branch={item} branches={branches} onClose={() => setDialog(null)} onSaved={reload} />}
    </Stack>
  );
}

/** 12 tháng của năm: ngày nghỉ hằng tuần xám, nghỉ lễ cam, làm bù xanh. Bấm một ngày (khi sửa được) để đặt ngày đó */
function YearGrid({ year, weeklyOff, special, onPick }: { year: number; weeklyOff: number[]; special: Map<string, WorkCalendarDayRow>; onPick?: (date: string) => void }) {
  const now = today();
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => {
        const first = `${year}-${String(m + 1).padStart(2, '0')}-01`;
        const count = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
        return { m, lead: isoWeekday(first) - 1, dates: Array.from({ length: count }, (_, i) => addDays(first, i)) };
      }),
    [year],
  );
  return (
    <div className="wcal-year">
      {months.map(({ m, lead, dates }) => (
        <section key={m} className="wcal-month" aria-label={`Tháng ${m + 1} năm ${year}`}>
          <div className="wcal-month-title">Tháng {m + 1}</div>
          <div className="wcal-grid">
            {WEEKDAYS.map((w) => (
              <span key={w.value} className="wcal-head" aria-hidden>{w.short}</span>
            ))}
            {lead > 0 && <span style={{ gridColumn: `span ${lead}` }} />}
            {dates.map((d) => {
              const s = special.get(d);
              const weekday = isoWeekday(d);
              const kind = s ? (s.dayType === 'OFF' ? 'holiday' : 'work') : weeklyOff.includes(weekday) ? 'weekly' : undefined;
              const state = s ? `${DAY_TYPE[s.dayType].toLowerCase()}${s.name ? `, ${s.name}` : ''}` : kind === 'weekly' ? 'nghỉ hằng tuần' : 'làm việc';
              const label = `${WEEKDAYS[weekday - 1].label} ${fmtDate(d)}: ${state}`;
              const common = { className: 'wcal-day', 'data-kind': kind, 'data-today': d === now || undefined, title: label, 'aria-label': label };
              // Chuột bấm cho nhanh; bàn phím dùng nút "Thêm ngày nghỉ, làm bù" (365 nút trong thứ tự Tab thì khó đi qua)
              return onPick ? (
                <button key={d} type="button" tabIndex={-1} onClick={() => onPick(d)} {...common}>{Number(d.slice(8))}</button>
              ) : (
                <span key={d} role="img" {...common}>{Number(d.slice(8))}</span>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function DaysDialog({ initial, branch, branches, onClose, onSaved }: { initial: { from: string; to: string }; branch: WorkCalendarItem; branches: WorkCalendarItem[]; onClose: () => void; onSaved: () => void }) {
  const form = useForm({
    initialValues: { branchCodes: [branch.branchCode], from: initial.from, to: initial.to, dayType: 'OFF' as 'OFF' | 'WORK', name: '' },
    validate: {
      branchCodes: (v) => (v.length ? null : 'Chọn ít nhất một đơn vị cơ sở'),
      from: (v) => (v ? null : 'Chọn ngày bắt đầu'),
      to: (v, all) => (!v ? 'Chọn ngày kết thúc' : all.from && v < all.from ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi' : all.from && span(all.from, v) > MAX_RANGE_DAYS ? `Mỗi lần đặt tối đa ${MAX_RANGE_DAYS} ngày` : null),
    },
  });
  const save = useMutation({
    mutationFn: (v: typeof form.values) => api<{ count: number }>('/admin/catalogs/work-calendars/days', { method: 'POST', body: { ...v, name: v.name.trim() || null } }),
    onSuccess: (r, v) => {
      toastOk(`Đã đặt ${fmtNum(r.count)} ngày ${DAY_TYPE[v.dayType].toLowerCase()} (${range(v.from, v.to)}) cho ${v.branchCodes.join(', ')}.`);
      onSaved();
      onClose();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  const options = branches.filter((b) => b.branchActive).map((b) => ({ value: b.branchCode, label: `${b.branchName || b.branchCode} (${b.branchCode})` }));
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title="Đặt ngày nghỉ, làm bù">
      <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            data={[
              { value: 'OFF', label: 'Nghỉ (lễ, Tết, nghỉ công ty)' },
              { value: 'WORK', label: 'Làm bù' },
            ]}
            {...form.getInputProps('dayType')}
          />
          <Group grow align="flex-start">
            <DateField label="Từ ngày" withAsterisk {...form.getInputProps('from')} onChange={(v) => form.setValues({ from: v, to: form.values.to && form.values.to >= v ? form.values.to : v })} />
            <DateField label="Đến ngày" withAsterisk minDate={form.values.from || undefined} {...form.getInputProps('to')} onChange={(v) => form.setFieldValue('to', v)} />
          </Group>
          <TextInput label="Tên" placeholder={form.values.dayType === 'OFF' ? 'Ví dụ: Tết Nguyên đán' : 'Ví dụ: Làm bù ngày 2/9'} maxLength={100} data-autofocus {...form.getInputProps('name')} />
          <MultiSelect label="Áp cho đơn vị cơ sở" withAsterisk data={options} searchable={options.length > 6} {...form.getInputProps('branchCodes')} />
          <Text size="xs" c="dimmed">Ngày đã đặt trước đó trong khoảng này được thay bằng loại và tên mới. Dàn chuyền đã lưu được tính lại khi bấm Lưu ở Chi tiết dàn chuyền.</Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={save.isPending}>Lưu</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
