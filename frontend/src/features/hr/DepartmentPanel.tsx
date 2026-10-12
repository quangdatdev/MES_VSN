import { Badge, Button, Checkbox, Group, NumberInput, Select, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconArrowBackUp, IconBuildingFactory2, IconLock, IconPencil, IconUsers } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ActionButton } from '../../components/ActionButton';
import { DateField } from '../../components/DateField';
import { api, ApiError } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { fmtDate, today } from '../../lib/format';
import { toastError, toastOk } from '../../lib/notify';
import { useCan } from '../../shell/permissions';
import { HR_KEYS, useDepartmentOptions, useManagerOptions } from './api';
import { DepartmentSelect, DissolvedBadge, Fact, FieldCell, Trail, WorkshopBadge } from './common';
import { ancestorsOf, subtreeIds, type FlatDept } from './tree';
import type { Department } from './types';

/** `seq`: số lượt bấm thêm, làm khóa của form (chọn lại đúng thao tác thêm thì form dựng lại từ đầu) */
export type PanelMode = { kind: 'view' } | { kind: 'edit' } | { kind: 'create'; parentId: number | null; typeId: number | null; seq: number };

const CODE = /^[A-Z0-9-]{1,20}$/;
const CODE_HINT = 'Chữ hoa không dấu, số, gạch ngang; tối đa 20 ký tự.';

/**
 * Bộ phận tích "Xưởng sản xuất" là chuyền may (phase 5.10). Tích, bỏ tích, đổi ĐVCS, giải thể, khôi phục chuyền làm đổi chuyền mà
 * Trưởng chuyền được thấy, nên máy chủ đòi thêm quyền sửa Phân quyền; giao diện chỉ khóa sẵn kèm lý do.
 */
const LINE_ADMIN = 'admin.permission:update';
const WORKSHOP_HINT = 'Hiện trong ô chọn Chuyền may của đơn vị cơ sở đã chọn.';
const WORKSHOP_NEED_ADMIN = 'Cần thêm quyền sửa Phân quyền: danh sách chuyền may quyết định Trưởng chuyền thấy dữ liệu nào.';
const WORKSHOP_NEED_BRANCH = 'Chọn đơn vị cơ sở trước: chuyền may phải thuộc một đơn vị cơ sở.';
const lineLock = (action: string) => `Bộ phận là chuyền may: ${action} cần thêm quyền sửa Phân quyền.`;
const LOCK_ICON = { verticalAlign: -2 } as const;
/** Ô lưới form co được (như .hr-cell) mà không mang luật ẩn mô tả của .hr-cell */
const GRID_CELL = { minWidth: 0 } as const;

interface Props {
  /** Phòng ban đang xem (null khi thêm phòng ban gốc mà chưa chọn gì) */
  dept: Department | null;
  /** Cả cây (để dựng đường dẫn, ô phòng ban cha, đếm phòng ban con) */
  items: Department[];
  mode: PanelMode;
  onMode: (mode: PanelMode) => void;
  onDirty: (dirty: boolean) => void;
  onPick: (id: number) => void;
  /** Lưu xong: trang chọn lại phòng ban vừa lưu, mở đường tới nó */
  onSaved: (dept: Department) => void;
}

/** Khung bên phải của Sơ đồ tổ chức: xem thông tin phòng ban, sửa, thêm mới, giải thể, khôi phục */
export function DepartmentPanel({ dept, items, mode, onMode, onDirty, onPick, onSaved }: Props) {
  const canUpdate = useCan('hr.orgchart:update');
  const canChangeLines = useCan(LINE_ADMIN);
  const canViewEmployees = useCan('hr.employee:view');
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const qc = useQueryClient();

  const refresh = async (saved: Department) => {
    // Ô chọn Chuyền may (Xếp chuyền, Chuẩn bị SX) đọc /me/lines: đổi tên, cờ, ĐVCS, cha của bộ phận đều có thể đổi danh sách đó
    void qc.invalidateQueries({ queryKey: ['me', 'lines'] });
    await Promise.all([qc.invalidateQueries({ queryKey: HR_KEYS.departments }), qc.invalidateQueries({ queryKey: HR_KEYS.employeeOptions })]);
    onSaved(saved);
  };
  const dissolve = useMutation({
    mutationFn: (d: Department) => api<Department>(`/hr/departments/${d.id}/dissolve`, { method: 'POST', body: {} }),
    onSuccess: async (d) => {
      toastOk(`${d.name} đã giải thể từ ${fmtDate(d.dissolvedDate)}.`, 'Đã giải thể');
      await refresh(d);
    },
    onError: (e) => toastError(e, 'Chưa giải thể được'),
  });
  const restore = useMutation({
    mutationFn: (d: Department) => api<Department>(`/hr/departments/${d.id}/restore`, { method: 'POST', body: {} }),
    onSuccess: async (d) => {
      toastOk(`${d.name} đang dùng trở lại.`, 'Đã khôi phục');
      await refresh(d);
    },
    onError: (e) => toastError(e, 'Chưa khôi phục được'),
  });

  if (mode.kind === 'create' || (mode.kind === 'edit' && dept)) {
    return (
      <DepartmentForm
        key={mode.kind === 'edit' ? `e${dept!.id}` : `c${mode.seq}`}
        dept={mode.kind === 'edit' ? dept : null}
        mode={mode}
        items={items}
        canChangeLines={canChangeLines}
        onCancel={() => onMode({ kind: 'view' })}
        onDirty={onDirty}
        onSaved={refresh}
      />
    );
  }
  if (!dept) {
    return (
      <div className="hr-panel hr-panel-empty">
        <Text fw={600}>Chọn một phòng ban trên cây để xem thông tin.</Text>
        <Text size="sm" c="dimmed" maw={420}>
          Bấm chuột phải hoặc nút ba chấm trên một phòng ban để thêm phòng ban con hay cùng cấp.
        </Text>
      </div>
    );
  }

  const trail = ancestorsOf(byId, dept.id);
  const activeChildren = items.filter((i) => i.parentId === dept.id && i.isActive).length;
  const parent = dept.parentId == null ? null : byId.get(dept.parentId);
  const lineLocked = dept.isProductionWorkshop && !canChangeLines;
  const dissolveBlocked =
    activeChildren || dept.activeEmployees
      ? `Còn ${[activeChildren ? `${activeChildren} phòng ban con đang dùng` : null, dept.activeEmployees ? `${dept.activeEmployees} nhân viên đang làm việc` : null].filter(Boolean).join(' và ')}. Chuyển hoặc giải thể trước.`
      : lineLocked
        ? lineLock('giải thể')
        : null;
  const restoreBlocked = parent && !parent.isActive ? `Phòng ban cha ${parent.name} đã giải thể: khôi phục phòng ban cha trước.` : lineLocked ? lineLock('khôi phục') : null;
  const askDissolve = () =>
    confirmAction({
      title: `Giải thể ${dept.name}?`,
      consequence: `Phòng ban ngừng dùng từ hôm nay (${fmtDate(today())}): ẩn khỏi cây, không chọn được khi thêm nhân viên. Hồ sơ cũ vẫn giữ, khôi phục lại được.`,
      confirmLabel: 'Giải thể',
      onConfirm: () => dissolve.mutate(dept),
    });

  return (
    <article className="hr-panel" aria-labelledby="hr-dept-title">
      <header className="hr-panel-head">
        <div className="hr-panel-titles">
          <Trail items={trail} onPick={onPick} />
          <Title order={2} id="hr-dept-title" className="hr-panel-title">
            {dept.name}
          </Title>
          <Group gap={6} wrap="wrap">
            <span className="mono hr-code">{dept.code}</span>
            <Badge size="sm" variant="light" color="charcoal">{dept.typeName}</Badge>
            {dept.branchCode && (
              <Badge size="sm" variant="light" color="link" leftSection={<IconBuildingFactory2 size={12} />}>
                Đơn vị cơ sở {dept.branchCode}
              </Badge>
            )}
            {dept.isProductionWorkshop && <WorkshopBadge branchCode={dept.branchCode} />}
            {!dept.isActive && <DissolvedBadge date={dept.dissolvedDate} />}
          </Group>
        </div>
        {canUpdate && (
          <Group gap="xs" className="hr-panel-actions">
            <Button variant="default" leftSection={<IconPencil size={15} />} onClick={() => onMode({ kind: 'edit' })}>
              Sửa
            </Button>
            {dept.isActive ? (
              <ActionButton variant="default" color="red" blockedReason={dissolveBlocked} loading={dissolve.isPending} onClick={askDissolve}>
                Giải thể
              </ActionButton>
            ) : (
              <ActionButton variant="default" leftSection={<IconArrowBackUp size={15} />} blockedReason={restoreBlocked} loading={restore.isPending} onClick={() => restore.mutate(dept)}>
                Khôi phục
              </ActionButton>
            )}
          </Group>
        )}
      </header>

      <div className="hr-people">
        <IconUsers size={18} stroke={1.6} aria-hidden />
        <Text size="sm">
          <b>{dept.activeEmployees}</b> nhân viên đang làm trực tiếp trong phòng ban
          {activeChildren > 0 && <>, {activeChildren} phòng ban con</>}
        </Text>
        {canViewEmployees && (
          <Link className="hr-people-link" to={`/hr/employees?dept=${encodeURIComponent(dept.code)}`}>
            Xem nhân viên cả nhánh
          </Link>
        )}
      </div>

      <dl className="hr-facts">
        <Fact label="Tên tiếng Anh">{dept.nameEn}</Fact>
        <Fact label="Người quản lý">{dept.managerName && <>{dept.managerName} <span className="mono hr-code-soft">{dept.managerCode}</span></>}</Fact>
        <Fact label="Phòng ban cha">{parent?.name ?? (dept.parentId ? null : 'Không có (phòng ban gốc)')}</Fact>
        <Fact label="Ngày thành lập">{fmtDate(dept.establishedDate)}</Fact>
        {!dept.isActive && <Fact label="Ngày giải thể">{fmtDate(dept.dissolvedDate)}</Fact>}
        <Fact label="Thứ tự trong cùng cấp">{String(dept.sortOrder)}</Fact>
      </dl>
    </article>
  );
}

interface FormProps {
  dept: Department | null;
  mode: Extract<PanelMode, { kind: 'edit' | 'create' }>;
  items: Department[];
  /** Có quyền sửa Phân quyền: tích, bỏ tích "Xưởng sản xuất", đổi ĐVCS của chuyền may */
  canChangeLines: boolean;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onSaved: (dept: Department) => Promise<void>;
}

/** Form thêm, sửa phòng ban (thay khung xem ngay tại chỗ) */
function DepartmentForm({ dept, mode, items, canChangeLines, onCancel, onDirty, onSaved }: FormProps) {
  const options = useDepartmentOptions();
  const creating = mode.kind === 'create';
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const form = useForm({
    initialValues: {
      code: dept?.code ?? '',
      name: dept?.name ?? '',
      nameEn: dept?.nameEn ?? '',
      departmentTypeId: dept ? String(dept.departmentTypeId) : mode.kind === 'create' && mode.typeId ? String(mode.typeId) : null,
      parentId: dept ? dept.parentId : mode.kind === 'create' ? mode.parentId : null,
      managerEmployeeId: dept?.managerEmployeeId ?? null,
      branchCode: dept?.branchCode ?? (mode.kind === 'create' && mode.parentId ? (byId.get(mode.parentId)?.branchCode ?? null) : null),
      establishedDate: dept?.establishedDate ?? '',
      sortOrder: (dept?.sortOrder ?? '') as number | '',
      isProductionWorkshop: dept?.isProductionWorkshop ?? false,
    },
    validateInputOnBlur: true,
    validate: {
      code: (v) => (!creating || CODE.test(v.trim().toUpperCase()) ? null : CODE_HINT),
      name: (v) => (v.trim() ? null : 'Nhập tên phòng ban.'),
      departmentTypeId: (v) => (v ? null : 'Chọn loại phòng ban.'),
      branchCode: (v, values) => (values.isProductionWorkshop && !v ? 'Bộ phận tích "Xưởng sản xuất" phải có đơn vị cơ sở.' : null),
    },
  });
  const dirty = form.isDirty();
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  const types = options.data?.types ?? [];
  const type = types.find((t) => String(t.id) === form.values.departmentTypeId);
  const hasChildren = !!dept && items.some((i) => i.parentId === dept.id);
  const typeError = type?.isFinalLevel && hasChildren ? `Loại ${type.name} là cấp cuối, mà phòng ban này đang có phòng ban con.` : null;
  // Phòng ban cha: không chọn chính nó, nhánh con của nó, phòng ban cấp cuối
  const own = useMemo(() => (dept ? subtreeIds(items, dept.id) : new Set<number>()), [dept, items]);
  const skip = useCallback((d: FlatDept) => own.has(d.id) || !!byId.get(d.id)?.isFinalLevel, [own, byId]);

  const save = useMutation({
    mutationFn: (v: typeof form.values) => {
      const body = {
        name: v.name.trim(),
        nameEn: v.nameEn.trim() || null,
        departmentTypeId: Number(v.departmentTypeId),
        parentId: v.parentId,
        managerEmployeeId: v.managerEmployeeId,
        branchCode: v.branchCode,
        establishedDate: v.establishedDate || null,
        ...(v.sortOrder === '' ? {} : { sortOrder: v.sortOrder }),
        isProductionWorkshop: v.isProductionWorkshop,
      };
      if (creating) return api<Department>('/hr/departments', { method: 'POST', body: { code: v.code.trim().toUpperCase(), ...body } });
      // Chỉ gửi phần đã đổi: máy chủ không phải kiểm lại cha, người quản lý khi không đụng tới
      const before: Record<string, unknown> = {
        name: dept!.name,
        nameEn: dept!.nameEn,
        departmentTypeId: dept!.departmentTypeId,
        parentId: dept!.parentId,
        managerEmployeeId: dept!.managerEmployeeId,
        branchCode: dept!.branchCode,
        establishedDate: dept!.establishedDate,
        sortOrder: dept!.sortOrder,
        isProductionWorkshop: dept!.isProductionWorkshop,
      };
      const changed = Object.fromEntries(Object.entries(body).filter(([k, x]) => x !== before[k]));
      return api<Department>(`/hr/departments/${dept!.id}`, { method: 'PUT', body: changed });
    },
    onSuccess: async (d) => {
      toastOk(creating ? `Đã thêm phòng ban ${d.name}.` : `Đã lưu phòng ban ${d.name}.`);
      onDirty(false);
      await onSaved(d);
    },
    onError: (e) => {
      if (creating && e instanceof ApiError && e.status === 409) form.setFieldError('code', e.message);
      toastError(e, creating ? 'Chưa thêm được phòng ban' : 'Chưa lưu được');
    },
  });

  const parentPath = form.values.parentId == null ? [] : [...ancestorsOf(byId, form.values.parentId), byId.get(form.values.parentId)].filter(Boolean);
  const factories = options.data?.factories ?? [];
  const cancel = () => confirmDiscard(dirty, onCancel);
  // Chuyền may: ĐVCS của bộ phận đang tích chỉ người có quyền sửa Phân quyền đổi được; ô tích khóa khi thiếu quyền, hoặc khi
  // chưa tích mà chưa chọn ĐVCS (đang tích mà xóa ĐVCS thì vẫn bỏ tích được)
  const branchLocked = !!dept?.isProductionWorkshop && !canChangeLines;
  const workshop = form.values.isProductionWorkshop;
  const workshopLock = !canChangeLines ? WORKSHOP_NEED_ADMIN : !workshop && !form.values.branchCode ? WORKSHOP_NEED_BRANCH : null;

  return (
    <form className="hr-panel" aria-labelledby="hr-dept-form-title" onSubmit={form.onSubmit((v) => (typeError ? undefined : save.mutate(v)))}>
      <header className="hr-panel-head">
        <div className="hr-panel-titles">
          <Text size="sm" c="dimmed">
            {parentPath.length ? `Thuộc ${parentPath.map((p) => p!.name).join(' › ')}` : 'Phòng ban gốc'}
          </Text>
          <Title order={2} id="hr-dept-form-title" className="hr-panel-title">
            {creating ? 'Thêm phòng ban' : `Sửa ${dept?.name}`}
          </Title>
        </div>
        <Group gap="xs" className="hr-panel-actions">
          <Button variant="default" onClick={cancel}>
            Hủy
          </Button>
          <ActionButton type="submit" loading={save.isPending} blockedReason={!creating && !dirty ? 'Chưa có thay đổi nào.' : typeError}>
            {creating ? 'Thêm phòng ban' : 'Lưu thay đổi'}
          </ActionButton>
        </Group>
      </header>
      <div className="hr-form-grid">
        <FieldCell hint={creating ? `${CODE_HINT} Không sửa được sau khi tạo.` : 'Mã nằm trong đường dẫn của cây nên không sửa được.'}>
          <TextInput
            label="Mã phòng ban"
            withAsterisk={creating}
            readOnly={!creating}
            className={creating ? 'field-required' : 'field-readonly'}
            maxLength={20}
            data-autofocus={creating || undefined}
            {...form.getInputProps('code')}
            onChange={(e) => form.setFieldValue('code', e.currentTarget.value.toUpperCase())}
          />
        </FieldCell>
        <FieldCell wide>
          <TextInput label="Tên phòng ban" withAsterisk className="field-required" maxLength={255} data-autofocus={!creating || undefined} {...form.getInputProps('name')} />
        </FieldCell>
        <FieldCell>
          <TextInput label="Tên tiếng Anh" maxLength={255} {...form.getInputProps('nameEn')} />
        </FieldCell>
        <FieldCell hint="Cấp cuối thì không thêm phòng ban con được.">
          <Select
            label="Loại phòng ban"
            withAsterisk
            className="field-required"
            data={types.filter((t) => t.isActive || String(t.id) === form.values.departmentTypeId).map((t) => ({ value: String(t.id), label: t.isFinalLevel ? `${t.name} (cấp cuối)` : t.name }))}
            allowDeselect={false}
            {...form.getInputProps('departmentTypeId')}
            error={form.errors.departmentTypeId ?? typeError}
          />
        </FieldCell>
        <FieldCell wide hint={!creating && hasChildren ? 'Chuyển sang cha khác thì cả nhánh con đi theo.' : 'Không có chính nó, các phòng ban con của nó và phòng ban cấp cuối.'}>
          <DepartmentSelect
            label="Phòng ban cha"
            placeholder="Không có (phòng ban gốc)"
            clearable
            departments={items}
            skip={skip}
            value={form.values.parentId}
            onChange={(id) => form.setFieldValue('parentId', id)}
            nothingFoundMessage="Không có phòng ban khớp."
          />
        </FieldCell>
        <ManagerSelect value={form.values.managerEmployeeId} current={dept} onChange={(id) => form.setFieldValue('managerEmployeeId', id)} />
        <FieldCell hint={branchLocked ? lineLock('đổi đơn vị cơ sở') : 'Phòng ban của một đơn vị cơ sở (bộ phận cắt, may...).'}>
          <Select
            label="Đơn vị cơ sở"
            placeholder="Không thuộc đơn vị cơ sở nào"
            clearable={!branchLocked}
            readOnly={branchLocked}
            className={branchLocked ? 'field-readonly' : undefined}
            data={factories.map((f) => ({ value: f.code, label: `${f.code} – ${f.name}` }))}
            {...form.getInputProps('branchCode')}
          />
        </FieldCell>
        <FieldCell>
          <DateField label="Ngày thành lập" value={form.values.establishedDate} onChange={(v) => form.setFieldValue('establishedDate', v)} />
        </FieldCell>
        <FieldCell hint="Số nhỏ đứng trước.">
          <NumberInput label="Thứ tự trong cùng cấp" min={0} max={1_000_000} allowDecimal={false} {...form.getInputProps('sortOrder')} />
        </FieldCell>
        {/* Ô tích có mô tả hiện sẵn (không qua FieldCell, nơi mô tả bị ẩn chỉ để trình đọc màn hình đọc): lý do khóa phải đọc
            được ngay, kể cả trên điện thoại */}
        <div className="hr-span-2" style={GRID_CELL}>
          <Checkbox
            label="Xưởng sản xuất"
            description={
              <>
                {WORKSHOP_HINT}
                {workshopLock && (
                  <>
                    <br />
                    <IconLock size={13} stroke={1.8} aria-hidden style={LOCK_ICON} /> {workshopLock}
                  </>
                )}
              </>
            }
            checked={workshop}
            disabled={!!workshopLock}
            onChange={(e) => {
              const on = e.currentTarget.checked;
              form.setFieldValue('isProductionWorkshop', on);
              if (!on) form.clearFieldError('branchCode');
            }}
          />
        </div>
      </div>
      {!creating && dept && !dept.isActive && (
        <Text size="sm" c="dimmed" mt="sm">
          Phòng ban đã giải thể ngày {fmtDate(dept.dissolvedDate)}. Dùng nút Khôi phục để dùng lại.
        </Text>
      )}
    </form>
  );
}

/** Người quản lý: tìm trên máy chủ theo mã hoặc tên (không nạp hết nhân viên vào ô chọn) */
function ManagerSelect({ value, current, onChange }: { value: number | null; current: Department | null; onChange: (id: number | null) => void }) {
  const canSearch = useCan('hr.employee:view');
  const [opened, setOpened] = useState(false);
  const [term, setTerm] = useState('');
  const [q] = useDebouncedValue(term, 300);
  const managers = useManagerOptions(q, value, opened || value != null);
  const data = useMemo(() => {
    const list = (managers.data ?? []).map((m) => ({ value: String(m.id), label: `${m.code} – ${m.fullName}` }));
    // Người quản lý hiện tại có sẵn ngay (chưa tải danh sách, hoặc không có quyền xem hồ sơ nhân viên)
    if (current?.managerEmployeeId && !list.some((m) => m.value === String(current.managerEmployeeId))) {
      list.unshift({ value: String(current.managerEmployeeId), label: `${current.managerCode} – ${current.managerName}` });
    }
    return list;
  }, [managers.data, current]);
  return (
    <FieldCell hint={canSearch ? 'Nhân viên đang làm việc.' : 'Cần quyền xem Thông tin nhân sự để chọn người quản lý.'}>
      <Select
        label="Người quản lý"
        placeholder={canSearch ? 'Gõ mã hoặc tên để tìm' : 'Chưa chọn'}
        searchable
        clearable
        data={data}
        value={value == null ? null : String(value)}
        onChange={(v) => onChange(v ? Number(v) : null)}
        // Chọn xong, ô tự đặt chữ tìm bằng tên người vừa chọn: đó không phải chữ gõ, không gửi lên máy chủ để tìm
        onSearchChange={(text) => setTerm(data.some((m) => m.label === text) ? '' : text)}
        // Máy chủ đã lọc theo chữ gõ (không dấu): không lọc thêm ở trình duyệt
        filter={({ options }) => options}
        onDropdownOpen={() => setOpened(true)}
        nothingFoundMessage={managers.isFetching ? 'Đang tìm…' : 'Không có nhân viên đang làm khớp.'}
        readOnly={!canSearch}
        className={canSearch ? undefined : 'field-readonly'}
      />
    </FieldCell>
  );
}

