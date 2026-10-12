import { Alert, Anchor, Badge, Button, Group, Modal, NumberInput, Select, SimpleGrid, Skeleton, Stack, Switch, Text, TextInput, Textarea, Title, Tooltip, VisuallyHidden } from '@mantine/core';
import { TimePicker } from '@mantine/dates';
import { useForm } from '@mantine/form';
import {
  IconBuildingFactory2,
  IconChecklist,
  IconClock,
  IconHierarchy2,
  IconKey,
  IconListDetails,
  IconLock,
  IconPencil,
  IconPlus,
  IconSearch,
} from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ActionButton } from '../../components/ActionButton';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { PageHeader } from '../../components/PageHeader';
import { Pager } from '../../components/Pager';
import { api, ApiError } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { guardedLeave, useLeaveGuard } from '../../lib/leaveGuard';
import { fmtDateTime, fmtNum, qs } from '../../lib/format';
import { ORDER_OPTIONS_KEY } from '../../lib/queryKeys';
import { toastError, toastOk } from '../../lib/notify';
import { useCan } from '../../shell/permissions';
import { EmptyRow, escapeToClose, IconAction, LoadError, SkeletonRows, upper } from './common';
import { HR_KEYS } from '../hr/api';
import { fold } from '../hr/tree';
import type { PrepStep } from '../sewing/api';
import { PREP_STEPS_KEY, PrepStepsPane } from './PrepStepsPane';
import type { AdminDepartmentType, AdminFactory, CatalogItem, CatalogOverview, CatalogShift, ExternalCatalog, ExternalRows, MesCatalog } from './types';

const KEY = ['admin', 'catalogs'] as const;
/** Tổng quan danh mục: danh sách danh mục MES, BRAVO và ĐVCS (ô chọn của Nhà máy SX); khung Nhà máy SX dùng lại cùng kết quả */
const OVERVIEW_QUERY = { queryKey: KEY, queryFn: () => api<CatalogOverview>('/admin/catalogs') };
/** Khung mở khi chưa chọn danh mục: Nhà máy SX quyết định đơn hàng nào lập kế hoạch được ở ĐVCS nào */
const DEFAULT_CATALOG = 'PROD_FACTORY';
/** Mã khung Chuyền may cũ (bỏ ở phase 5.10): liên kết cũ ?c=LINE nói chuyền đã sang Nhân sự */
const OLD_LINES = 'LINE';
const KIND_ICON = { factory: IconBuildingFactory2, shift: IconClock, item: IconListDetails } as const;

/** Thời điểm UTC từ API hiện theo giờ máy */
const when = (iso: string | null) => (iso ? fmtDateTime(iso) : 'chưa chép');
/** Ngừng dùng một mục danh mục: hậu quả giống nhau cho mọi danh mục mã-tên và ca làm việc */
const STOP_ITEM = 'Không còn trong ô chọn khi nhập mới, dữ liệu cũ giữ nguyên. Bật lại lúc nào cũng được.';
const CODE_LOCKED = 'Mã không đổi được sau khi tạo';
/** Danh mục của module May (MES_Sewing), không nằm trong tổng quan danh mục của nền tảng */
const PREP = { code: 'PREP_STEP', name: 'Cấu hình chuẩn bị SX' };
/** Danh mục của module Nhân sự (MES_Hr, task 5.8.9): ô chọn loại ở Sơ đồ tổ chức */
const DEPT_TYPE = { code: 'DEPT_TYPE', name: 'Loại phòng ban' };
const DEPT_TYPES_QUERY = { queryKey: [...KEY, 'department-types'], queryFn: () => api<AdminDepartmentType[]>('/hr/department-types') };
const hours = (minutes: number) => `${Math.floor(minutes / 60)} giờ${minutes % 60 ? ` ${minutes % 60} phút` : ''}`;

export default function CatalogsPage() {
  const overview = useQuery(OVERVIEW_QUERY);
  const prepSteps = useQuery({ queryKey: PREP_STEPS_KEY, queryFn: () => api<PrepStep[]>('/sewing/prep-steps') });
  const deptTypes = useQuery(DEPT_TYPES_QUERY);
  const [params, setParams] = useSearchParams();
  const mes = overview.data?.mes ?? [];
  const external = overview.data?.external ?? [];
  const selected = params.get('c') ?? DEFAULT_CATALOG;
  // Đổi danh mục gỡ khung đang sửa (bảng Cấu hình chuẩn bị SX sửa trực tiếp): còn thay đổi chưa lưu thì hỏi lại
  const select = (code: string | null) => code && code !== selected && guardedLeave(() => setParams({ c: code }, { replace: true }));
  const currentMes = mes.find((c) => c.code === selected);
  const currentExt = external.find((c) => c.code === selected);

  return (
    <>
      <PageHeader
        title="Danh mục hệ thống"
        subtitle="Danh mục MES thêm, sửa, ngừng dùng được; không xóa, và mã không đổi được sau khi tạo vì đã nằm trong dữ liệu. Danh mục chép từ BRAVO chỉ xem: muốn sửa thì sửa bên BRAVO rồi bấm Đồng bộ."
      />
      <Select
        hiddenFrom="sm"
        mb="sm"
        aria-label="Chọn danh mục"
        value={selected}
        onChange={select}
        allowDeselect={false}
        data={[
          { group: 'Danh mục MES', items: [...mes.map((c) => ({ value: c.code, label: c.name })), { value: PREP.code, label: PREP.name }, { value: DEPT_TYPE.code, label: DEPT_TYPE.name }] },
          { group: 'Chép từ BRAVO (chỉ xem)', items: external.map((c) => ({ value: c.code, label: c.name })) },
        ]}
      />
      {overview.data?.externalError && (
        <Text hiddenFrom="sm" size="xs" c="dimmed" mb="sm">Danh mục BRAVO: {overview.data.externalError}</Text>
      )}
      <div className="catalog-layout">
        <nav className="catalog-nav" aria-label="Danh mục">
          <div className="catalog-nav-group">Danh mục MES</div>
          {mes.map((c) => {
            const Icon = KIND_ICON[c.kind];
            return (
              <NavItem key={c.code} active={c.code === selected} onClick={() => select(c.code)} icon={<Icon size={16} stroke={1.7} />} count={c.active} label={c.name} />
            );
          })}
          <NavItem
            active={selected === PREP.code}
            onClick={() => select(PREP.code)}
            icon={<IconChecklist size={16} stroke={1.7} />}
            count={prepSteps.data ? prepSteps.data.filter((s) => s.isActive).length : null}
            label={PREP.name}
          />
          <NavItem
            active={selected === DEPT_TYPE.code}
            onClick={() => select(DEPT_TYPE.code)}
            icon={<IconHierarchy2 size={16} stroke={1.7} />}
            count={deptTypes.data ? deptTypes.data.filter((t) => t.isActive).length : null}
            label={DEPT_TYPE.name}
          />
          <div className="catalog-nav-group">Chép từ BRAVO (chỉ xem)</div>
          {overview.data?.externalError ? (
            <Text size="xs" c="dimmed" px={10} pb={8}>{overview.data.externalError}</Text>
          ) : (
            external.map((c) => (
              <NavItem key={c.code} active={c.code === selected} onClick={() => select(c.code)} icon={<IconLock size={14} stroke={1.7} />} count={c.rowCount} label={c.name} />
            ))
          )}
        </nav>
        <section className="catalog-pane">
          {overview.isLoading && <Skeleton h={240} />}
          {overview.isError && <LoadError error={overview.error} what="danh mục" onRetry={() => void overview.refetch()} retrying={overview.isFetching} />}
          {currentMes?.kind === 'factory' && <FactoriesPane info={currentMes} />}
          {currentMes?.kind === 'item' && <ItemsPane key={currentMes.code} info={currentMes} />}
          {currentMes?.kind === 'shift' && <ShiftsPane info={currentMes} />}
          {currentExt && <ExternalPane key={currentExt.code} info={currentExt} />}
          {selected === PREP.code && <PrepStepsPane />}
          {selected === DEPT_TYPE.code && <DepartmentTypesPane />}
          {overview.isSuccess && !currentMes && !currentExt && selected !== PREP.code && selected !== DEPT_TYPE.code && (selected === OLD_LINES ? <LinesMoved /> : <Text c="dimmed" size="sm">Chọn một danh mục ở cột bên trái.</Text>)}
        </section>
      </div>
    </>
  );
}

function NavItem({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count: number | null }) {
  return (
    <button type="button" className="catalog-nav-item focus-ring" data-active={active} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <span className="catalog-nav-icon" aria-hidden>{icon}</span>
      <span className="catalog-nav-label">{label}</span>
      {count != null && <span className="catalog-nav-count">{fmtNum(count)}</span>}
    </button>
  );
}

function PaneHead({ title, description, actions, children }: { title: string; description?: string | null; actions?: ReactNode; children?: ReactNode }) {
  return (
    <Stack gap={6} mb="sm">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <div style={{ minWidth: 0, maxWidth: 640 }}>
          <Title order={2} size="h3">{title}</Title>
          {description && <Text size="sm" c="dimmed" mt={2}>{description}</Text>}
        </div>
        {actions}
      </Group>
      {children}
    </Stack>
  );
}

/** Lỗi tải của một khung danh mục, đặt trên bảng (bảng trống mà không có lời nào thì người dùng tưởng danh mục rỗng) */
function PaneError({ query, what }: { query: { error: unknown; isFetching: boolean; refetch: () => unknown }; what: string }) {
  if (!query.error) return null;
  return <LoadError error={query.error} what={what} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
}

/** Lưu một dòng danh mục rồi tải lại danh mục đó, tổng quan và các ô chọn đang dùng danh mục */
function useSave(onDone?: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ method, path, body }: { method: 'POST' | 'PUT'; path: string; body: object; done: string }) => api(path, { method, body }),
    onSuccess: (_r, v) => {
      toastOk(v.done);
      void qc.invalidateQueries({ queryKey: KEY });
      // Gợi ý của các ô Đơn hàng (đơn vị tính, loại đơn hàng, nhà máy SX)
      void qc.invalidateQueries({ queryKey: ORDER_OPTIONS_KEY });
      // Nhà máy SX hiện ở màn Đơn vị cơ sở và popup gán đơn vị của màn Người dùng
      void qc.invalidateQueries({ queryKey: ['admin', 'branches'] });
      // Ô chọn loại phòng ban, cây phòng ban (tên loại, thứ tự theo cấp) ở Sơ đồ tổ chức
      void qc.invalidateQueries({ queryKey: HR_KEYS.departments });
      onDone?.();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
}

/** Gạt Ngừng dùng thì hỏi trước (nêu hậu quả); gạt Dùng lại thì làm ngay. */
function confirmStop(on: boolean, name: string, consequence: ReactNode, go: () => void) {
  if (on) return go();
  confirmAction({ title: `Ngừng dùng ${name}?`, consequence, confirmLabel: 'Ngừng dùng', onConfirm: go });
}

/**
 * Công tắc Đang dùng / Ngừng dùng. Có blockedReason thì gạt không đổi gì, rê chuột, chạm hoặc Tab tới thì hiện lý do
 * (công tắc disabled không hiện được tooltip). Luôn bọc Tooltip để đổi khóa/mở không dựng lại công tắc, giữ focus.
 */
function StatusCell({ active, canEdit, busy, label, blockedReason, onChange }: { active: boolean; canEdit: boolean; busy: boolean; label: string; blockedReason?: string | null; onChange: (on: boolean) => void }) {
  const reasonId = useId();
  const state = active ? 'Đang dùng' : 'Ngừng dùng';
  return canEdit ? (
    <Tooltip label={blockedReason} disabled={!blockedReason} multiline maw={300} openDelay={150} events={{ hover: true, focus: true, touch: true }}>
      <span className="status-switch" data-blocked={blockedReason ? true : undefined}>
        {/* Tên đọc chứa chữ đang hiện (WCAG 2.5.3); lý do khóa đọc kèm qua aria-describedby, không chỉ nằm trong tooltip */}
        <Switch
          size="xs"
          checked={active}
          disabled={busy}
          aria-disabled={blockedReason ? true : undefined}
          aria-label={`${state}: ${label}`}
          aria-describedby={blockedReason ? reasonId : undefined}
          label={state}
          onChange={(e) => !blockedReason && onChange(e.currentTarget.checked)}
        />
        {blockedReason && <VisuallyHidden id={reasonId}>{blockedReason}</VisuallyHidden>}
      </span>
    </Tooltip>
  ) : (
    <Badge size="sm" variant="light" color={active ? 'teal' : 'gray'}>{active ? 'Đang dùng' : 'Ngừng dùng'}</Badge>
  );
}

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <IconAction label={`Sửa ${label}`} icon={<IconPencil size={16} />} onClick={onClick} />;
}

/** Ô tìm có chữ mà không ra dòng nào: kèm nút xóa tìm kiếm để thoát ngay */
const clearButton = (onClick: () => void, label = 'Xóa tìm kiếm') => <Button size="xs" variant="default" onClick={onClick}>{label}</Button>;

/** Ô tìm của khung: giữ chữ đang gõ (gõ không vẽ lại bảng), báo `onChange` khi ngừng gõ hoặc Enter */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <DebouncedTextInput leftSection={<IconSearch size={14} />} placeholder={placeholder} aria-label={placeholder} value={value} onChange={onChange} w={260} />;
}

/** Liên kết cũ tới khung Chuyền may (?c=LINE): chỉ đường sang Sơ đồ tổ chức thay vì để khung trống */
function LinesMoved() {
  const canOpen = useCan('hr.orgchart:view');
  return (
    <Alert variant="light" color="gray" role="note" maw={640}>
      Chuyền may không còn ở Danh mục hệ thống. Chuyền là bộ phận được tích “Xưởng sản xuất” ở{' '}
      {canOpen ? <Anchor component={Link} to="/hr/org-chart" size="sm">Sơ đồ tổ chức</Anchor> : 'Nhân sự › Sơ đồ tổ chức'}.
    </Alert>
  );
}

// ---------------- Danh mục mã, tên (Đơn vị tính, Loại đơn hàng…) ----------------

function ItemsPane({ info }: { info: MesCatalog }) {
  const canCreate = useCan('admin.catalog:create');
  const canEdit = useCan('admin.catalog:update');
  const [search, setSearch] = useState('');
  const debounced = search.trim();
  const q = useQuery({
    queryKey: [...KEY, 'items', info.code, debounced],
    queryFn: () => api<{ items: CatalogItem[] }>(`/admin/catalogs/items/${info.code}${qs({ q: debounced || undefined })}`),
    placeholderData: keepPreviousData,
  });
  const [dialog, setDialog] = useState<CatalogItem | 'create' | null>(null);
  const save = useSave();
  const rows = q.data?.items ?? [];

  return (
    <>
      <PaneHead title={info.name} description={info.description} actions={canCreate && <Button leftSection={<IconPlus size={15} />} onClick={() => setDialog('create')}>Thêm mục</Button>}>
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm mã, tên" />
      </PaneHead>
      <PaneError query={q} what={info.name.toLowerCase()} />
      <div className="table-frame">
        <table className="dense-table">
          <thead><tr><th style={{ width: 130 }}>Mã</th><th>Tên</th><th>Mô tả</th><th style={{ width: 80 }}>Thứ tự</th><th style={{ width: 150 }}>Trạng thái</th><th style={{ width: 56 }} aria-label="Thao tác" /></tr></thead>
          <tbody>
            {q.isPending && <SkeletonRows cols={6} />}
            {rows.map((i) => (
              <tr key={i.id} data-inactive={!i.isActive || undefined}>
                <td className="mono" style={{ fontWeight: 600 }}>{i.code}</td>
                <td>{i.name}</td>
                <td className="cell-wrap"><Text size="sm" c="dimmed">{i.description}</Text></td>
                <td className="num">{i.sortOrder}</td>
                <td>
                  <StatusCell
                    active={i.isActive}
                    canEdit={canEdit}
                    busy={save.isPending}
                    label={i.code}
                    onChange={(on) =>
                      confirmStop(on, `${i.name} (${i.code})`, STOP_ITEM, () =>
                        save.mutate({ method: 'PUT', path: `/admin/catalogs/items/${info.code}/${i.id}`, body: { isActive: on }, done: `Đã ${on ? 'dùng lại' : 'ngừng dùng'} ${i.name} (${i.code}).` }),
                      )
                    }
                  />
                </td>
                <td>{canEdit && <EditButton label={i.code} onClick={() => setDialog(i)} />}</td>
              </tr>
            ))}
            {q.isSuccess && !q.isPlaceholderData && rows.length === 0 && (
              debounced ? (
                <EmptyRow colSpan={6} action={clearButton(() => setSearch(''))}>Không có mục nào khớp “{debounced}”.</EmptyRow>
              ) : (
                <EmptyRow colSpan={6}>Danh mục chưa có mục nào. Bấm “Thêm mục” để tạo.</EmptyRow>
              )
            )}
          </tbody>
        </table>
      </div>
      {dialog && <ItemDialog catalog={info} item={dialog === 'create' ? null : dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

function ItemDialog({ catalog, item, onClose }: { catalog: MesCatalog; item: CatalogItem | null; onClose: () => void }) {
  const form = useForm({
    initialValues: { code: item?.code ?? '', name: item?.name ?? '', description: item?.description ?? '', sortOrder: (item?.sortOrder ?? '') as number | '' },
    validateInputOnBlur: true,
    validate: {
      code: (v) => (item || /^[A-Z0-9._-]{1,30}$/.test(v.trim().toUpperCase()) ? null : 'Gồm chữ không dấu, số, dấu chấm, gạch (tối đa 30 ký tự)'),
      name: (v) => (v.trim() ? null : 'Nhập tên'),
    },
  });
  const save = useSave(onClose);
  const submit = (v: typeof form.values) => {
    const body = { name: v.name.trim(), description: v.description.trim() || null, sortOrder: v.sortOrder === '' ? undefined : v.sortOrder };
    const code = v.code.trim().toUpperCase();
    if (item) save.mutate({ method: 'PUT', path: `/admin/catalogs/items/${catalog.code}/${item.id}`, body, done: `Đã lưu ${item.code} – ${body.name}.` });
    else save.mutate({ method: 'POST', path: `/admin/catalogs/items/${catalog.code}`, body: { ...body, code }, done: `Đã thêm ${code} – ${body.name} vào ${catalog.name}.` });
  };
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title={item ? `Sửa ${item.code} – ${catalog.name}` : `Thêm vào ${catalog.name}`}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput
            label="Mã"
            withAsterisk={!item}
            description={item ? `${CODE_LOCKED} vì dữ liệu đã lưu theo mã.` : 'Chữ không dấu; không sửa được sau khi tạo.'}
            readOnly={!!item}
            className={item ? 'field-readonly' : undefined}
            data-autofocus={!item || undefined}
            {...form.getInputProps('code')}
            onChange={upper((v) => form.setFieldValue('code', v))}
          />
          <TextInput
            label="Tên hiển thị"
            withAsterisk
            maxLength={catalog.nameMax ?? 100}
            description={(catalog.nameMax ?? 100) < 100 ? `Tối đa ${catalog.nameMax} ký tự. Đơn hàng lưu tên này: đổi tên không đổi các đơn đã lưu tên cũ.` : undefined}
            data-autofocus={item ? true : undefined}
            {...form.getInputProps('name')}
          />
          <Textarea label="Mô tả" autosize minRows={2} maxLength={300} {...form.getInputProps('description')} />
          <NumberInput label="Thứ tự" description="Bỏ trống: xếp cuối danh sách." min={0} max={100000} allowDecimal={false} {...form.getInputProps('sortOrder')} />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={save.isPending}>{item ? 'Lưu thay đổi' : 'Thêm mục'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------- Nhà máy SX (ADR 0013) ----------------

const STOP_FACTORY = 'Không còn trong ô chọn Nhà máy SX của đơn hàng. Đơn hàng của nhà máy này không còn hiện ở popup Chọn mã hàng khi lập kế hoạch xuất hàng. Đơn hàng đã chọn nhà máy này giữ nguyên.';

/** Không có quyền sửa phân quyền: không thêm, không đổi ĐVCS, không bật/tắt nhà máy (máy chủ cũng chặn) */
const SCOPE_LOCKED = 'Nhà máy SX gắn đơn vị cơ sở quyết định đơn hàng nào lập kế hoạch được ở đơn vị đó, nên cần thêm quyền sửa phân quyền.';

/** Nhà máy SX: mỗi nhà máy thuộc một đơn vị cơ sở. Đơn hàng lưu mã ở cột Nhà máy SX; đăng nhập ĐVCS nào thì lập kế hoạch cho nhà máy của ĐVCS đó. */
function FactoriesPane({ info }: { info: MesCatalog }) {
  const canCreate = useCan('admin.catalog:create');
  const canEdit = useCan('admin.catalog:update');
  // Thêm, đổi ĐVCS, bật/tắt nhà máy đổi phạm vi lập kế hoạch: máy chủ đòi quyền sửa phân quyền (ADR 0013 mục 11)
  const canScope = useCan('admin.permission:update');
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState<string | null>(null);
  const debounced = search.trim();
  const q = useQuery({
    queryKey: [...KEY, 'factories', debounced],
    queryFn: () => api<AdminFactory[]>(`/admin/catalogs/factories${qs({ q: debounced || undefined })}`),
    placeholderData: keepPreviousData,
  });
  // Danh sách ĐVCS (kể cả đang tắt, để hiện đúng tên) đi kèm tổng quan danh mục: cùng khóa nên dùng lại kết quả trang đã tải
  const overview = useQuery(OVERVIEW_QUERY);
  const branches = overview.data?.branches ?? [];
  const [dialog, setDialog] = useState<AdminFactory | 'create' | null>(null);
  const save = useSave();
  const all = q.data ?? [];
  const rows = branch ? all.filter((f) => (branch === '-' ? f.branchCode === null : f.branchCode === branch)) : all;
  const unassigned = all.some((f) => f.branchCode === null);

  return (
    <>
      <PaneHead
        title={info.name}
        description={info.description}
        actions={canCreate && <ActionButton leftSection={<IconPlus size={15} />} blockedReason={canScope ? null : SCOPE_LOCKED} onClick={() => setDialog('create')}>Thêm nhà máy</ActionButton>}
      >
        <Group gap="xs" wrap="wrap">
          <SearchBox value={search} onChange={setSearch} placeholder="Tìm mã, tên nhà máy" />
          <Select
            aria-label="Lọc theo đơn vị cơ sở"
            placeholder="Mọi đơn vị cơ sở"
            clearable
            value={branch}
            onChange={setBranch}
            w={220}
            data={[...branches.map((b) => ({ value: b.code, label: `${b.name} (${b.code})` })), ...(unassigned ? [{ value: '-', label: 'Chưa gắn đơn vị cơ sở' }] : [])]}
          />
        </Group>
      </PaneHead>
      <PaneError query={q} what="danh mục nhà máy SX" />
      <div className="table-frame">
        <table className="dense-table">
          <thead>
            <tr><th style={{ width: 120 }}>Mã</th><th>Tên</th><th>Đơn vị cơ sở</th><th>Mô tả</th><th style={{ width: 80 }}>Thứ tự</th><th style={{ width: 150 }}>Trạng thái</th><th style={{ width: 56 }} aria-label="Thao tác" /></tr>
          </thead>
          <tbody>
            {q.isPending && <SkeletonRows cols={7} />}
            {rows.map((f) => (
              <tr key={f.id} data-inactive={!f.isActive || undefined}>
                <td className="mono" style={{ fontWeight: 600 }}>{f.code}</td>
                <td>{f.name}</td>
                <td>
                  {f.branchCode ? (
                    <span title={f.branchCode}>{f.branchName ?? f.branchCode}</span>
                  ) : (
                    <Badge size="sm" color="yellow" variant="light">Chưa gắn</Badge>
                  )}
                </td>
                <td className="cell-wrap"><Text size="sm" c="dimmed">{f.description}</Text></td>
                <td className="num">{f.sortOrder}</td>
                <td>
                  <StatusCell
                    active={f.isActive}
                    canEdit={canEdit}
                    busy={save.isPending}
                    label={f.code}
                    blockedReason={canScope ? null : SCOPE_LOCKED}
                    onChange={(on) =>
                      confirmStop(on, `${f.name} (${f.code})`, STOP_FACTORY, () =>
                        save.mutate({ method: 'PUT', path: `/admin/catalogs/factories/${f.id}`, body: { isActive: on }, done: `Đã ${on ? 'dùng lại' : 'ngừng dùng'} ${f.name} (${f.code}).` }),
                      )
                    }
                  />
                </td>
                <td>{canEdit && <EditButton label={f.code} onClick={() => setDialog(f)} />}</td>
              </tr>
            ))}
            {q.isSuccess && !q.isPlaceholderData && rows.length === 0 && (
              debounced || branch ? (
                <EmptyRow colSpan={7} action={clearButton(() => { setSearch(''); setBranch(null); }, 'Xóa bộ lọc')}>Không có nhà máy SX nào khớp bộ lọc.</EmptyRow>
              ) : (
                <EmptyRow colSpan={7}>Chưa có nhà máy SX nào. Bấm “Thêm nhà máy” để tạo.</EmptyRow>
              )
            )}
          </tbody>
        </table>
      </div>
      {dialog && <FactoryDialog factory={dialog === 'create' ? null : dialog} canScope={canScope} branches={branches} branchesLoading={overview.isPending} defaultBranch={branch && branch !== '-' ? branch : undefined} onClose={() => setDialog(null)} />}
    </>
  );
}

function FactoryDialog({ factory, canScope, branches, branchesLoading, defaultBranch, onClose }: { factory: AdminFactory | null; canScope: boolean; branches: CatalogOverview['branches']; branchesLoading: boolean; defaultBranch?: string; onClose: () => void }) {
  const form = useForm({
    initialValues: {
      code: factory?.code ?? '',
      name: factory?.name ?? '',
      branchCode: factory?.branchCode ?? defaultBranch ?? '',
      description: factory?.description ?? '',
      sortOrder: (factory?.sortOrder ?? '') as number | '',
    },
    validateInputOnBlur: true,
    validate: {
      // Mã là tên nhà máy theo OSM (ADR 0013 mục 9): có dấu, khoảng trắng; đơn hàng lưu danh sách mã cách nhau dấu phẩy
      code: (v) => (factory || /^[^,\p{C}]{1,100}$/u.test(v.trim()) ? null : 'Nhập mã, tối đa 100 ký tự, không có dấu phẩy'),
      name: (v) => (v.trim() ? null : 'Nhập tên nhà máy'),
      branchCode: (v) => (v || !canScope ? null : 'Chọn đơn vị cơ sở'),
    },
  });
  const save = useSave(onClose);
  // ĐVCS đang tắt chỉ còn trong ô chọn khi là ĐVCS hiện tại của nhà máy
  const options = branches.filter((b) => b.isActive || b.code === factory?.branchCode).map((b) => ({ value: b.code, label: `${b.name} (${b.code})${b.isActive ? '' : ' – ngừng dùng'}` }));
  const submit = (v: typeof form.values) => {
    // Không có quyền sửa phân quyền thì không gửi ĐVCS (giữ nguyên), vẫn sửa được tên, mô tả, thứ tự
    const body = { name: v.name.trim(), branchCode: canScope ? v.branchCode : undefined, description: v.description.trim() || null, sortOrder: v.sortOrder === '' ? undefined : v.sortOrder };
    const code = v.code.trim().toUpperCase();
    if (factory) save.mutate({ method: 'PUT', path: `/admin/catalogs/factories/${factory.id}`, body, done: `Đã lưu ${factory.code} – ${body.name}.` });
    else save.mutate({ method: 'POST', path: '/admin/catalogs/factories', body: { ...body, code }, done: `Đã thêm nhà máy SX ${code} – ${body.name}.` });
  };
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title={factory ? `Sửa nhà máy SX ${factory.code}` : 'Thêm nhà máy SX'}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput
            label="Mã"
            withAsterisk={!factory}
            description={factory ? `${CODE_LOCKED} vì đơn hàng đã lưu theo mã.` : 'Đặt đúng tên nhà máy trong OSM (ví dụ VIET DUC) để đơn hàng nhận đúng nhà máy. Không sửa được sau khi tạo.'}
            readOnly={!!factory}
            className={factory ? 'field-readonly' : undefined}
            data-autofocus={!factory || undefined}
            {...form.getInputProps('code')}
            onChange={upper((v) => form.setFieldValue('code', v))}
          />
          <TextInput label="Tên nhà máy" withAsterisk maxLength={100} data-autofocus={factory ? true : undefined} {...form.getInputProps('name')} />
          <Select
            label="Đơn vị cơ sở"
            withAsterisk={canScope}
            placeholder={canScope ? 'Chọn đơn vị quản lý nhà máy' : 'Chưa gắn'}
            data={options}
            searchable={options.length > 6}
            allowDeselect={false}
            nothingFoundMessage="Không có đơn vị khớp"
            readOnly={!canScope}
            className={canScope ? undefined : 'field-readonly'}
            description={
              !canScope
                ? SCOPE_LOCKED
                : branchesLoading
                  ? 'Đang tải danh sách đơn vị cơ sở…'
                  : options.length === 0
                    ? 'Chưa tải được danh sách đơn vị cơ sở. Đóng popup, tải lại trang rồi thử lại.'
                    : 'Người đăng nhập đơn vị này lập kế hoạch xuất hàng được cho đơn hàng của nhà máy.'
            }
            {...form.getInputProps('branchCode')}
          />
          <Textarea label="Mô tả" autosize minRows={2} maxLength={300} {...form.getInputProps('description')} />
          <NumberInput label="Thứ tự" description="Bỏ trống: xếp cuối danh sách." min={0} max={100000} allowDecimal={false} {...form.getInputProps('sortOrder')} />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={save.isPending}>{factory ? 'Lưu thay đổi' : 'Thêm nhà máy'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------- Loại phòng ban (MES_Hr, task 5.8.9) ----------------

const stopDeptType = (n: number) =>
  `${n > 0 ? `${fmtNum(n)} phòng ban đang dùng loại này giữ nguyên loại và vẫn sửa được. ` : ''}Không chọn được loại này khi thêm phòng ban hay đổi loại. Bật lại lúc nào cũng được.`;

/** Loại phòng ban cho ô chọn ở Sơ đồ tổ chức. Xếp theo cấp rồi thứ tự, đúng thứ tự các phòng ban cùng cha trên cây. */
function DepartmentTypesPane() {
  const canCreate = useCan('admin.catalog:create');
  const canEdit = useCan('admin.catalog:update');
  const q = useQuery(DEPT_TYPES_QUERY);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<AdminDepartmentType | 'create' | null>(null);
  const save = useSave();
  const all = q.data ?? [];
  // Danh mục nhỏ: lọc tại chỗ, gõ không dấu vẫn ra
  const term = fold(search);
  const rows = term ? all.filter((t) => fold(`${t.code} ${t.name}`).includes(term)) : all;
  // Mọi loại đang dùng đều là cấp cuối thì không thêm được phòng ban gốc hay phòng ban có con
  const noParentType = q.isSuccess && !all.some((t) => t.isActive && !t.isFinalLevel);

  return (
    <>
      <PaneHead
        title={DEPT_TYPE.name}
        description="Dùng ở ô Loại phòng ban của Sơ đồ tổ chức. Cấp xếp thứ tự các phòng ban cùng cha; loại cấp cuối không có phòng ban con."
        actions={canCreate && <Button leftSection={<IconPlus size={15} />} onClick={() => setDialog('create')}>Thêm loại</Button>}
      >
        <SearchBox value={search} onChange={setSearch} placeholder="Tìm mã, tên loại" />
      </PaneHead>
      <PaneError query={q} what="danh mục loại phòng ban" />
      {noParentType && (
        <Alert color="yellow" mb="sm">
          Không còn loại nào đang dùng mà có phòng ban con được, nên chưa thêm được phòng ban gốc hay phòng ban cấp trên. Dùng lại hoặc thêm một loại không phải cấp cuối.
        </Alert>
      )}
      <div className="table-frame">
        <table className="dense-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>Mã</th>
              <th>Tên</th>
              <th style={{ width: 60 }}>Cấp</th>
              <th style={{ width: 90 }}>Cấp cuối</th>
              <th style={{ width: 72 }}>Thứ tự</th>
              <th style={{ width: 96 }}>Phòng ban</th>
              <th>Mô tả</th>
              <th style={{ width: 150 }}>Trạng thái</th>
              <th style={{ width: 56 }} aria-label="Thao tác" />
            </tr>
          </thead>
          <tbody>
            {q.isPending && <SkeletonRows cols={9} />}
            {rows.map((t) => (
              <tr key={t.id} data-inactive={!t.isActive || undefined}>
                <td className="mono" style={{ fontWeight: 600 }}>{t.code}</td>
                <td>
                  <Group gap={6} wrap="nowrap">
                    <span>{t.name}</span>
                    {t.isSystem && <Badge size="xs" variant="light" color="gray">Nạp sẵn</Badge>}
                  </Group>
                </td>
                <td className="num">{t.levelOrder}</td>
                <td>{t.isFinalLevel ? <Badge size="sm" variant="light" color="orange">Có</Badge> : <Text size="sm" c="dimmed">Không</Text>}</td>
                <td className="num">{t.sortOrder}</td>
                <td className="num">{fmtNum(t.departmentCount)}</td>
                <td className="cell-wrap"><Text size="sm" c="dimmed">{t.description}</Text></td>
                <td>
                  <StatusCell
                    active={t.isActive}
                    canEdit={canEdit}
                    busy={save.isPending}
                    label={t.code}
                    onChange={(on) =>
                      confirmStop(on, `${t.name} (${t.code})`, stopDeptType(t.departmentCount), () =>
                        save.mutate({ method: 'PUT', path: `/hr/department-types/${t.id}`, body: { isActive: on }, done: `Đã ${on ? 'dùng lại' : 'ngừng dùng'} loại ${t.name} (${t.code}).` }),
                      )
                    }
                  />
                </td>
                <td>{canEdit && <EditButton label={t.code} onClick={() => setDialog(t)} />}</td>
              </tr>
            ))}
            {q.isSuccess && rows.length === 0 && (
              term ? (
                <EmptyRow colSpan={9} action={clearButton(() => setSearch(''))}>Không có loại nào khớp “{search.trim()}”.</EmptyRow>
              ) : (
                <EmptyRow colSpan={9}>Chưa có loại phòng ban nào. Bấm “Thêm loại” để tạo.</EmptyRow>
              )
            )}
          </tbody>
        </table>
      </div>
      {dialog && <DepartmentTypeDialog type={dialog === 'create' ? null : dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

function DepartmentTypeDialog({ type, onClose }: { type: AdminDepartmentType | null; onClose: () => void }) {
  const form = useForm({
    initialValues: {
      code: type?.code ?? '',
      name: type?.name ?? '',
      levelOrder: (type?.levelOrder ?? '') as number | '',
      sortOrder: (type?.sortOrder ?? '') as number | '',
      isFinalLevel: type?.isFinalLevel ?? false,
      description: type?.description ?? '',
    },
    validateInputOnBlur: true,
    validate: {
      code: (v) => (type || /^[A-Z0-9_-]{1,20}$/.test(v.trim().toUpperCase()) ? null : 'Gồm chữ hoa không dấu, số, gạch dưới, gạch ngang (tối đa 20 ký tự)'),
      name: (v) => (v.trim() ? null : 'Nhập tên loại'),
      levelOrder: (v) => (v === '' ? 'Nhập cấp, từ 0 đến 99' : null),
    },
  });
  const save = useSave(onClose);
  const submit = (v: typeof form.values) => {
    const full = { name: v.name.trim(), levelOrder: Number(v.levelOrder), isFinalLevel: v.isFinalLevel, sortOrder: v.sortOrder === '' ? undefined : v.sortOrder, description: v.description.trim() || null };
    // Lỗi của máy chủ gắn vào đúng ô: trùng mã, trùng tên; bật cấp cuối khi có phòng ban loại này đang có con
    const onError = (e: unknown) => {
      if (!(e instanceof ApiError)) return;
      if (e.status === 409) form.setFieldError(!type && e.message.startsWith('Mã ') ? 'code' : 'name', e.message);
      else if (e.code === 'VALIDATION_FAILED' && full.isFinalLevel && !type?.isFinalLevel) form.setFieldError('isFinalLevel', e.message);
    };
    if (type) {
      const before: Record<string, unknown> = { name: type.name, levelOrder: type.levelOrder, isFinalLevel: type.isFinalLevel, sortOrder: type.sortOrder, description: type.description };
      // Chỉ gửi phần đã đổi: hai người sửa hai ô khác nhau không ghi đè nhau
      const body = Object.fromEntries(Object.entries(full).filter(([k, x]) => x !== undefined && x !== before[k]));
      if (Object.keys(body).length === 0) return onClose();
      save.mutate({ method: 'PUT', path: `/hr/department-types/${type.id}`, body, done: `Đã lưu loại ${type.code} – ${full.name}.` }, { onError });
    } else {
      const code = v.code.trim().toUpperCase();
      save.mutate({ method: 'POST', path: '/hr/department-types', body: { ...full, code }, done: `Đã thêm loại phòng ban ${code} – ${full.name}.` }, { onError });
    }
  };
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title={type ? `Sửa loại phòng ban ${type.code}` : 'Thêm loại phòng ban'}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <TextInput
            label="Mã"
            withAsterisk={!type}
            description={type ? `${CODE_LOCKED}.` : 'Chữ hoa không dấu, số, gạch dưới, gạch ngang. Không sửa được sau khi tạo.'}
            readOnly={!!type}
            className={type ? 'field-readonly' : undefined}
            maxLength={20}
            data-autofocus={!type || undefined}
            {...form.getInputProps('code')}
            onChange={upper((x) => form.setFieldValue('code', x))}
          />
          <TextInput label="Tên loại" withAsterisk maxLength={100} placeholder="Ví dụ: Tổ" data-autofocus={type ? true : undefined} {...form.getInputProps('name')} />
          <SimpleGrid cols={2} spacing="sm">
            <NumberInput label="Cấp" withAsterisk min={0} max={99} clampBehavior="strict" allowDecimal={false} allowNegative={false} {...form.getInputProps('levelOrder')} />
            <NumberInput label="Thứ tự" placeholder="Xếp cuối" min={0} max={1_000_000} allowDecimal={false} allowNegative={false} {...form.getInputProps('sortOrder')} />
          </SimpleGrid>
          <Text size="xs" c="dimmed" mt={-6}>
            Cấp xếp các phòng ban cùng cha: số nhỏ đứng trước (Công ty 1, Khối 2, Phòng 3). Cùng cấp thì theo Thứ tự rồi tên.
          </Text>
          <Switch
            label="Cấp cuối"
            description="Phòng ban loại này không có phòng ban con."
            {...form.getInputProps('isFinalLevel', { type: 'checkbox' })}
          />
          <Textarea label="Mô tả" autosize minRows={2} maxLength={300} {...form.getInputProps('description')} />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <Button type="submit" loading={save.isPending}>{type ? 'Lưu thay đổi' : 'Thêm loại'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------- Ca làm việc ----------------

function ShiftsPane({ info }: { info: MesCatalog }) {
  const canCreate = useCan('admin.catalog:create');
  const canEdit = useCan('admin.catalog:update');
  const q = useQuery({ queryKey: [...KEY, 'shifts'], queryFn: () => api<CatalogShift[]>('/admin/catalogs/shifts') });
  const [dialog, setDialog] = useState<CatalogShift | 'create' | null>(null);
  const save = useSave();

  return (
    <>
      <PaneHead title={info.name} description={info.description} actions={canCreate && <Button leftSection={<IconPlus size={15} />} onClick={() => setDialog('create')}>Thêm ca</Button>} />
      <PaneError query={q} what="ca làm việc" />
      <div className="table-frame">
        <table className="dense-table">
          <thead><tr><th style={{ width: 90 }}>Mã</th><th>Tên ca</th><th>Giờ làm</th><th style={{ width: 90 }} className="num">Nghỉ</th><th className="num">Thời gian làm</th><th style={{ width: 80 }} className="num">Thứ tự</th><th style={{ width: 150 }}>Trạng thái</th><th style={{ width: 56 }} aria-label="Thao tác" /></tr></thead>
          <tbody>
            {q.isPending && <SkeletonRows cols={8} rows={3} />}
            {(q.data ?? []).map((s) => (
              <tr key={s.id} data-inactive={!s.isActive || undefined}>
                <td className="mono" style={{ fontWeight: 600 }}>{s.code}</td>
                <td>{s.name}</td>
                <td>
                  <Group gap={6} wrap="nowrap">
                    <span className="mono">{s.startTime} – {s.endTime}</span>
                    {s.overnight && <Badge size="xs" variant="light" color="link">Qua đêm</Badge>}
                  </Group>
                </td>
                <td className="num">{s.breakMinutes} phút</td>
                <td className="num">{hours(s.workMinutes)}</td>
                <td className="num">{s.sortOrder}</td>
                <td>
                  <StatusCell
                    active={s.isActive}
                    canEdit={canEdit}
                    busy={save.isPending}
                    label={s.code}
                    onChange={(on) =>
                      confirmStop(on, `ca ${s.name} (${s.code})`, STOP_ITEM, () =>
                        save.mutate({ method: 'PUT', path: `/admin/catalogs/shifts/${s.id}`, body: { isActive: on }, done: `Đã ${on ? 'dùng lại' : 'ngừng dùng'} ca ${s.code}.` }),
                      )
                    }
                  />
                </td>
                <td>{canEdit && <EditButton label={s.code} onClick={() => setDialog(s)} />}</td>
              </tr>
            ))}
            {q.isSuccess && q.data.length === 0 && <EmptyRow colSpan={8}>Chưa có ca làm việc. Bấm “Thêm ca” để tạo.</EmptyRow>}
          </tbody>
        </table>
      </div>
      {dialog && <ShiftDialog shift={dialog === 'create' ? null : dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function ShiftDialog({ shift, onClose }: { shift: CatalogShift | null; onClose: () => void }) {
  const form = useForm({
    initialValues: {
      code: shift?.code ?? '',
      name: shift?.name ?? '',
      startTime: shift?.startTime ?? '07:30',
      endTime: shift?.endTime ?? '16:30',
      breakMinutes: (shift?.breakMinutes ?? 60) as number | '',
      description: shift?.description ?? '',
      sortOrder: (shift?.sortOrder ?? '') as number | '',
    },
    validateInputOnBlur: true,
    validate: {
      code: (v) => (shift || /^[A-Z0-9._-]{1,20}$/.test(v.trim().toUpperCase()) ? null : 'Gồm chữ không dấu, số, dấu chấm, gạch (tối đa 20 ký tự)'),
      name: (v) => (v.trim() ? null : 'Nhập tên ca'),
      startTime: (v) => (HHMM.test(v) ? null : 'Giờ dạng HH:mm'),
      endTime: (v, all) => (!HHMM.test(v) ? 'Giờ dạng HH:mm' : v === all.startTime ? 'Phải khác giờ bắt đầu' : null),
      breakMinutes: (v) => (typeof v === 'number' && v >= 0 && v <= 480 ? null : 'Từ 0 đến 480 phút'),
    },
  });
  const v = form.values;
  const total = HHMM.test(v.startTime) && HHMM.test(v.endTime) ? (toMin(v.endTime) - toMin(v.startTime) + 1440) % 1440 : null;
  const work = total != null && typeof v.breakMinutes === 'number' ? total - v.breakMinutes : null;
  const save = useSave(onClose);
  const submit = (x: typeof form.values) => {
    const body = { name: x.name.trim(), startTime: x.startTime, endTime: x.endTime, breakMinutes: x.breakMinutes, description: x.description.trim() || null, sortOrder: x.sortOrder === '' ? undefined : x.sortOrder };
    const code = x.code.trim().toUpperCase();
    if (shift) save.mutate({ method: 'PUT', path: `/admin/catalogs/shifts/${shift.id}`, body, done: `Đã lưu ca ${shift.code}.` });
    else save.mutate({ method: 'POST', path: '/admin/catalogs/shifts', body: { ...body, code }, done: `Đã thêm ca ${code}.` });
  };
  useLeaveGuard(form.isDirty());
  const close = () => confirmDiscard(form.isDirty(), onClose);
  return (
    <Modal opened onClose={close} {...escapeToClose(close)} title={shift ? `Sửa ca ${shift.code}` : 'Thêm ca làm việc'}>
      <form onSubmit={form.onSubmit(submit)}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm" verticalSpacing="xs">
            <TextInput
              label="Mã ca"
              withAsterisk={!shift}
              readOnly={!!shift}
              className={shift ? 'field-readonly' : undefined}
              description={shift ? `${CODE_LOCKED}.` : undefined}
              data-autofocus={!shift || undefined}
              {...form.getInputProps('code')}
              onChange={upper((v) => form.setFieldValue('code', v))}
            />
            <TextInput label="Tên ca" withAsterisk data-autofocus={shift ? true : undefined} {...form.getInputProps('name')} />
          </SimpleGrid>
          <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="sm" verticalSpacing="xs">
            {/* TimePicker 24 giờ: ô time của trình duyệt hiện SA/CH theo ngôn ngữ máy; giá trị trả về HH:mm:ss nên cắt về HH:mm */}
            {(['startTime', 'endTime'] as const).map((f) => (
              <TimePicker
                key={f}
                label={f === 'startTime' ? 'Bắt đầu' : 'Kết thúc'}
                withAsterisk
                format="24h"
                withDropdown
                {...form.getInputProps(f)}
                onChange={(t) => form.setFieldValue(f, t ? t.slice(0, 5) : '')}
              />
            ))}
            <NumberInput label="Nghỉ (phút)" withAsterisk min={0} max={480} allowDecimal={false} {...form.getInputProps('breakMinutes')} />
          </SimpleGrid>
          {total != null && total > 0 && (
            <Text size="sm" c={work != null && work <= 0 ? 'red' : 'dimmed'}>
              {toMin(v.endTime) < toMin(v.startTime) ? 'Ca qua đêm. ' : ''}
              Ca dài {hours(total)}{work != null && (work > 0 ? `, thời gian làm ${hours(work)}.` : ', thời gian nghỉ phải ngắn hơn ca.')}
            </Text>
          )}
          <Textarea label="Mô tả" autosize minRows={2} maxLength={300} {...form.getInputProps('description')} />
          <NumberInput label="Thứ tự" description="Bỏ trống: xếp cuối danh sách." min={0} max={100000} allowDecimal={false} {...form.getInputProps('sortOrder')} />
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={close}>Hủy</Button>
            <ActionButton type="submit" loading={save.isPending} blockedReason={work != null && work <= 0 ? 'Thời gian nghỉ phải ngắn hơn ca.' : null}>
              {shift ? 'Lưu thay đổi' : 'Thêm ca'}
            </ActionButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ---------------- Danh mục chép từ BRAVO: chỉ xem ----------------

const NUMERIC = new Set(['int', 'bigint', 'smallint', 'tinyint', 'numeric', 'decimal', 'float', 'real', 'money']);
/** Cột mã số (CustomerId, CreatedBy, Color_Stt…) hiện nguyên số, không thêm dấu ngăn nghìn như số lượng */
const ID_COLUMN = /(Id|By|Stt)$/i;

function ExternalPane({ info }: { info: ExternalCatalog }) {
  const canSync = useCan('admin.sync:view');
  const [search, setSearch] = useState('');
  const debounced = search.trim();
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const q = useQuery({
    queryKey: [...KEY, 'external', info.code, debounced, page],
    queryFn: () => api<ExternalRows>(`/admin/catalogs/external/${encodeURIComponent(info.code)}/rows${qs({ page, pageSize, q: debounced || undefined })}`),
    placeholderData: keepPreviousData,
  });
  const columns = useMemo(() => q.data?.columns ?? [], [q.data?.columns]);
  const numeric = useMemo(() => columns.map((c) => NUMERIC.has(c.type)), [columns]);
  const idColumn = useMemo(() => columns.map((c) => ID_COLUMN.test(c.name)), [columns]);

  return (
    <>
      <PaneHead title={info.name} description={info.description}>
        <Group gap="lg" wrap="wrap">
          <Text size="sm">Nguồn <span className="mono">{info.sourceObject}</span></Text>
          <Text size="sm"><b>{fmtNum(info.rowCount ?? 0)}</b> dòng</Text>
          <Text size="sm">Chép lần cuối {when(info.lastSuccessAt)}</Text>
        </Group>
        <Alert variant="light" color="gray" icon={<IconLock size={16} />} py={8} role="note">
          Danh mục này lấy từ {info.system} nên chỉ xem được trên MES. Muốn sửa, sửa bên {info.system} rồi bấm Đồng bộ
          {canSync ? <> ở màn <Anchor component={Link} to="/admin/sync" size="sm">Đồng bộ dữ liệu</Anchor>.</> : ' (nhờ quản trị viên).'}
        </Alert>
        <SearchBox
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Tìm trong các cột chữ"
        />
      </PaneHead>
      <PaneError query={q} what="dữ liệu danh mục" />
      <div className="table-frame">
        <table className="dense-table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={c.name} className={numeric[i] ? 'num' : undefined}>
                  {c.key ? (
                    <Tooltip label="Khóa của danh mục">
                      <Group gap={4} wrap="nowrap" component="span"><IconKey size={12} aria-label="khóa" />{c.name}</Group>
                    </Tooltip>
                  ) : (
                    c.name
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {q.isPending && (
              <tr>
                <td>
                  <Stack gap={8} py={4} role="status" aria-label="Đang tải">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={14} w={480} maw="100%" />)}
                  </Stack>
                </td>
              </tr>
            )}
            {(q.data?.rows ?? []).map((r, ri) => (
              <tr key={ri}>
                {r.map((v, i) => (
                  <td key={columns[i]?.name ?? i} className={numeric[i] ? 'num' : columns[i]?.key ? 'mono' : undefined} title={typeof v === 'string' && v.length > 40 ? v : undefined}>
                    {v == null ? <span className="cell-empty">–</span> : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : typeof v === 'number' ? (idColumn[i] ? String(v) : fmtNum(v)) : <span className="cell-clip">{v}</span>}
                  </td>
                ))}
              </tr>
            ))}
            {q.isSuccess && q.data.rows.length === 0 && (
              debounced ? (
                <EmptyRow colSpan={Math.max(1, columns.length)} action={clearButton(() => { setSearch(''); setPage(1); })}>Không có dòng nào khớp “{debounced}”.</EmptyRow>
              ) : (
                <EmptyRow colSpan={Math.max(1, columns.length)}>Danh mục chưa có dữ liệu. Bấm Đồng bộ để chép từ BRAVO.</EmptyRow>
              )
            )}
          </tbody>
        </table>
        {q.data && <Pager page={page} pageSize={pageSize} total={q.data.total} onPage={setPage} />}
      </div>
    </>
  );
}
