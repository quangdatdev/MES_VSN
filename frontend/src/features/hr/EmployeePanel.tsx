import { Badge, Button, Group, Select, Skeleton, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconLock, IconPencil, IconPlus } from '@tabler/icons-react';
import { useEffect, useMemo, type ReactNode } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { DateField } from '../../components/DateField';
import { PolicyHint } from '../../components/PolicyHint';
import { api, ApiError } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { fmtDate } from '../../lib/format';
import { toastError, toastOk } from '../../lib/notify';
import { useCan } from '../../shell/permissions';
import { HR_KEYS, useEmployee } from './api';
import { DepartmentSelect, Fact, LoadError } from './common';
import { initialOf } from './EmployeeList';
import type { EmployeeDetail, EmployeeField, EmployeeFieldGroup, EmployeeOptions, JobTitleOption, PickDepartment } from './types';

/** `seq`: số lượt bấm thêm, làm khóa của form (bấm lại Thêm nhân viên thì form dựng lại từ đầu) */
export type EmployeeMode = { kind: 'view' } | { kind: 'edit' } | { kind: 'create'; departmentId: number | null; seq: number };

const RESOURCE = 'hr.employee';
const GROUPS: EmployeeFieldGroup[] = ['general', 'timekeeping', 'personal', 'contact'];
const WIDE = new Set(['fullName', 'currentAddress']);
const CODE = /^[A-Z0-9._-]{1,30}$/;
const CODE_HINT = 'Chữ không dấu, số, dấu chấm, gạch dưới, gạch ngang; tối đa 30 ký tự.';
/** Như máy chủ: chỉ ký tự ASCII in được (cột VARCHAR làm mất dấu nếu có chữ tiếng Việt) */
const EMAIL = /^[!-?A-~]+@[!-?A-~]+\.[!-?A-~]+$/;
const BOOL = [
  { value: 'true', label: 'Có' },
  { value: 'false', label: 'Không' },
];

/**
 * Chức danh dùng được cho một phòng ban (như máy chủ kiểm): chức danh chung, và chức danh gắn với phòng ban đó hay một phòng ban
 * cha của nó. `keep`: chức danh đang có (đã ngừng dùng) vẫn hiện đúng tên.
 */
export function allowedTitles(options: Pick<EmployeeOptions, 'departments' | 'jobTitles'>, departmentId: number | null, keep?: number | null): JobTitleOption[] {
  const dept = options.departments.find((d) => d.id === departmentId);
  if (!dept) return [];
  const byId = new Map(options.departments.map((d) => [d.id, d]));
  return options.jobTitles.filter((t) => {
    if (t.id === keep) return true;
    if (!t.isActive) return false;
    if (t.departmentId == null) return true;
    const owner = byId.get(t.departmentId);
    return !!owner && dept.path.startsWith(owner.path);
  });
}

type FormValues = Record<string, string>;

/** Giá trị của hồ sơ sang chữ của form ('' là bỏ trống) */
function toForm(fields: EmployeeField[], d: EmployeeDetail | null, departmentId: number | null): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    const v = d?.[f.key];
    out[f.key] = v == null ? '' : typeof v === 'boolean' ? String(v) : String(v);
  }
  if (!d) {
    out.employmentStatus = '1';
    out.departmentId = departmentId == null ? '' : String(departmentId);
  }
  return out;
}

/** Chữ của form sang giá trị gửi máy chủ */
function fromForm(f: EmployeeField, v: string): string | number | boolean | null {
  const t = v.trim();
  if (t === '') return null;
  switch (f.type) {
    case 'code':
      return t.toUpperCase();
    case 'bool':
      return t === 'true';
    case 'gender':
    case 'status':
    case 'department':
    case 'jobTitle':
      return Number(t);
    default:
      return t;
  }
}

interface Props {
  id: number | null;
  options: EmployeeOptions;
  mode: EmployeeMode;
  onMode: (mode: EmployeeMode) => void;
  onDirty: (dirty: boolean) => void;
  /** `created`: vừa thêm mới (khác với lưu khi sửa) */
  onSaved: (d: EmployeeDetail, created: boolean) => void;
  /** Phòng ban đang chọn trên cây, để gợi ý thêm nhân viên vào đó */
  scope: PickDepartment | null;
  onCreate: () => void;
  /** Bỏ chọn nhân viên (nhân viên trên URL không còn) */
  onClose: () => void;
}

/** Khung bên phải của Thông tin nhân sự: hồ sơ đang chọn (xem theo 4 nhóm), form thêm, sửa */
export function EmployeePanel({ id, options, mode, onMode, onDirty, onSaved, scope, onCreate, onClose }: Props) {
  const policy = useFieldPolicy(RESOURCE);
  const canCreate = useCan('hr.employee:create');
  const canUpdate = useCan('hr.employee:update');
  const detail = useEmployee(mode.kind === 'create' ? null : id);

  if (mode.kind === 'create') {
    return <EmployeeForm key={`new-${mode.seq}`} detail={null} departmentId={mode.departmentId} options={options} policy={policy} onCancel={() => onMode({ kind: 'view' })} onDirty={onDirty} onSaved={onSaved} />;
  }
  if (id == null) {
    return (
      <div className="hr-panel hr-panel-empty">
        <Text fw={600}>Chọn một nhân viên trong danh sách để xem hồ sơ.</Text>
        <Text size="sm" c="dimmed" maw={440}>
          Chọn phòng ban trên cây để xem nhân viên của phòng ban đó và mọi phòng ban con.
        </Text>
        {canCreate && (
          <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={onCreate}>
            {scope?.isActive ? `Thêm nhân viên vào ${scope.name}` : 'Thêm nhân viên'}
          </Button>
        )}
      </div>
    );
  }
  const d = detail.data;
  // Đang sửa mà tải lại hồ sơ lỗi (mạng chập chờn): giữ form, không thay bằng thông báo lỗi
  if (mode.kind === 'edit' && d) {
    return <EmployeeForm key={`edit-${d.id}`} detail={d} departmentId={null} options={options} policy={policy} onCancel={() => onMode({ kind: 'view' })} onDirty={onDirty} onSaved={onSaved} />;
  }
  if (detail.isError && !d) {
    if (detail.error instanceof ApiError && detail.error.status === 404) {
      return (
        <div className="hr-panel hr-panel-empty">
          <Text fw={600}>Không thấy nhân viên này.</Text>
          <Text size="sm" c="dimmed">
            Hồ sơ không còn hoặc bạn không được xem.
          </Text>
          <Button size="xs" variant="default" onClick={onClose}>
            Bỏ chọn
          </Button>
        </div>
      );
    }
    return (
      <div className="hr-panel">
        <LoadError error={detail.error} what="hồ sơ nhân viên" onRetry={() => detail.refetch()} retrying={detail.isFetching} />
      </div>
    );
  }
  if (!d) {
    return (
      <div className="hr-panel" aria-busy>
        <Group gap="md">
          <Skeleton circle h={52} />
          <Stack gap={6} style={{ flex: 1 }}>
            <Skeleton h={22} w="50%" />
            <Skeleton h={14} w="30%" />
          </Stack>
        </Group>
        <Skeleton h={160} mt="lg" />
      </div>
    );
  }
  const left = d.employmentStatus === 2;
  const names = Object.fromEntries(options.fields.map((f) => [f.key, f.label]));
  return (
    <article className="hr-panel" aria-labelledby="hr-emp-title">
      {detail.isError && <LoadError error={detail.error} what="hồ sơ nhân viên mới nhất" onRetry={() => detail.refetch()} retrying={detail.isFetching} />}
      <header className="hr-panel-head">
        <Group gap="md" wrap="nowrap" className="hr-panel-titles">
          <span className="hr-avatar hr-avatar-lg" aria-hidden>{initialOf(String(d.fullName ?? ''))}</span>
          <div style={{ minWidth: 0 }}>
            <Title order={2} id="hr-emp-title" className="hr-panel-title">
              {d.fullName}
            </Title>
            <Text size="sm" c="dimmed">
              {d.jobTitleName}, {d.departmentName}
            </Text>
            <Group gap={6} mt={4} wrap="wrap">
              <span className="mono hr-code">{d.code}</span>
              <Badge size="sm" variant="light" color={left ? 'gray' : 'teal'}>
                {left ? `Nghỉ việc${d.endDate ? ` từ ${fmtDate(String(d.endDate))}` : ''}` : 'Đang làm việc'}
              </Badge>
            </Group>
          </div>
        </Group>
        <Group gap="xs" className="hr-panel-actions">
          <PolicyHint policy={policy} names={names} />
          {canUpdate && (
            <Button variant="default" leftSection={<IconPencil size={15} />} onClick={() => onMode({ kind: 'edit' })}>
              Sửa
            </Button>
          )}
        </Group>
      </header>
      {GROUPS.map((g) => {
        const shown = options.fields.filter((f) => f.group === g && f.key in d);
        if (!shown.length) return null;
        return (
          <section key={g} className="hr-group" aria-labelledby={`hr-g-${g}`}>
            <h3 id={`hr-g-${g}`} className="hr-group-title">{options.groups[g]}</h3>
            <dl className="hr-facts">
              {shown.map((f) => (
                <Fact key={f.key} label={f.label} wide={WIDE.has(f.key)}>
                  {showValue(f, d, options)}
                </Fact>
              ))}
            </dl>
          </section>
        );
      })}
    </article>
  );
}

function showValue(f: EmployeeField, d: EmployeeDetail, options: EmployeeOptions): ReactNode {
  const v = d[f.key];
  if (v === MASK) {
    return (
      <span className="hr-masked" title="Bị che theo phân quyền của bạn">
        <IconLock size={12} aria-hidden /> ***
      </span>
    );
  }
  if (v == null || v === '') return null;
  switch (f.type) {
    case 'code':
      return <span className="mono">{String(v)}</span>;
    case 'date':
      return fmtDate(String(v));
    case 'bool':
      return v ? 'Có' : 'Không';
    case 'gender':
      return options.genders.find((g) => g.value === v)?.label ?? String(v);
    case 'status':
      return options.statuses.find((s) => s.value === v)?.label ?? String(v);
    case 'department':
      return d.departmentName;
    case 'jobTitle':
      return d.jobTitleName;
    default:
      return String(v);
  }
}

interface FormProps {
  detail: EmployeeDetail | null;
  departmentId: number | null;
  options: EmployeeOptions;
  policy: FieldPolicy;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onSaved: (d: EmployeeDetail, created: boolean) => void;
}

/** Form thêm, sửa hồ sơ. Chỉ gửi phần đã đổi và được sửa (chính sách cột); máy chủ kiểm lại mọi quy tắc. */
function EmployeeForm({ detail, departmentId, options, policy, onCancel, onDirty, onSaved }: FormProps) {
  const creating = !detail;
  const qc = useQueryClient();
  const fields = options.fields;
  // Cột Ẩn: không có trong hồ sơ, không hiện; thêm mới thì chỉ hiện cột được sửa
  const visible = useMemo(() => fields.filter((f) => (detail ? f.key in detail : policy.editable(f.key))), [fields, detail, policy]);
  const byKey = useMemo(() => new Map(fields.map((f) => [f.key, f])), [fields]);
  const form = useForm<FormValues>({
    initialValues: toForm(fields, detail, departmentId),
    validateInputOnBlur: true,
    validate: (v) => {
      const e: Record<string, string> = {};
      const need = (k: string, msg: string) => {
        if (byKey.get(k) && policy.editable(k) && !v[k]?.trim()) e[k] = msg;
      };
      need('code', 'Nhập mã nhân viên.');
      need('fullName', 'Nhập tên nhân viên.');
      need('gender', 'Chọn giới tính.');
      need('departmentId', 'Chọn phòng ban.');
      need('jobTitleId', 'Chọn chức danh.');
      need('employmentStatus', 'Chọn tình trạng.');
      if (v.code?.trim() && policy.editable('code') && !CODE.test(v.code.trim().toUpperCase())) e.code = CODE_HINT;
      if (v.timekeepingCode?.trim() && v.timekeepingCode !== MASK && !CODE.test(v.timekeepingCode.trim().toUpperCase())) e.timekeepingCode = CODE_HINT;
      if (v.email?.trim() && v.email !== MASK && !EMAIL.test(v.email.trim())) e.email = 'Email chưa đúng dạng (ví dụ ten@congty.vn), không dùng chữ có dấu.';
      if (v.employmentStatus === '1' && v.endDate) e.endDate = 'Đang làm việc thì chưa có ngày nghỉ việc.';
      if (v.startDate && v.endDate && v.endDate < v.startDate) e.endDate = 'Ngày nghỉ việc không được trước ngày bắt đầu làm việc.';
      return e;
    },
  });
  const dirty = form.isDirty();
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);

  const deptId = form.values.departmentId ? Number(form.values.departmentId) : null;
  const titles = useMemo(() => allowedTitles(options, deptId, detail ? Number(detail.jobTitleId) : null), [options, deptId, detail]);

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const initial = form.getInitialValues();
      const body: Record<string, unknown> = {};
      for (const f of fields) {
        if (!policy.editable(f.key) || (detail && !(f.key in detail))) continue;
        const next = fromForm(f, v[f.key] ?? '');
        if (creating) {
          if (next !== null) body[f.key] = next;
        } else if (next !== fromForm(f, initial[f.key] ?? '')) {
          body[f.key] = next;
        }
      }
      return creating ? api<EmployeeDetail>('/hr/employees', { method: 'POST', body }) : api<EmployeeDetail>(`/hr/employees/${detail.id}`, { method: 'PUT', body });
    },
    onSuccess: async (d) => {
      toastOk(creating ? `Đã thêm nhân viên ${d.fullName} (${d.code}).` : `Đã lưu hồ sơ ${d.fullName}.`);
      onDirty(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: HR_KEYS.employees }),
        qc.invalidateQueries({ queryKey: HR_KEYS.employee(d.id) }),
        // Số người đang làm trên cây phòng ban
        qc.invalidateQueries({ queryKey: HR_KEYS.departments }),
      ]);
      onSaved(d, creating);
    },
    onError: (e) => {
      const fieldErrors = e instanceof ApiError ? (e.details as { fields?: Record<string, string> } | null)?.fields : undefined;
      if (fieldErrors) form.setErrors(fieldErrors);
      toastError(e, creating ? 'Chưa thêm được nhân viên' : 'Chưa lưu được hồ sơ');
    },
  });

  const cancel = () => confirmDiscard(dirty, onCancel);
  const status = form.values.employmentStatus;

  // Ô chọn của Mantine chỉ xóa chữ đang hiện khi giá trị là null; chuỗi rỗng thì giữ nhãn cũ (chức danh vừa bị bỏ chọn vẫn hiện)
  const selectProps = (key: string) => {
    const p = form.getInputProps(key);
    return { ...p, value: form.values[key] || null, onChange: (v: string | null) => form.setFieldValue(key, v ?? '') };
  };

  const input = (f: EmployeeField) => {
    const editable = policy.editable(f.key);
    const masked = form.values[f.key] === MASK;
    const common = {
      label: f.label,
      withAsterisk: f.required && editable,
      readOnly: !editable || masked,
      className: [!editable || masked ? 'field-readonly' : f.required ? 'field-required' : undefined, WIDE.has(f.key) ? 'hr-span-2' : undefined].filter(Boolean).join(' ') || undefined,
      description: masked ? 'Bị che theo phân quyền của bạn.' : !editable ? 'Chỉ xem theo phân quyền của bạn.' : undefined,
    };
    // Ô bị Che: hiện *** dạng chữ (ô ngày, ô chọn không hiểu giá trị này)
    if (masked) return <TextInput key={f.key} {...common} value={MASK} />;
    switch (f.type) {
      case 'date': {
        const endLocked = f.key === 'endDate' && status !== '2';
        return (
          <DateField
            key={f.key}
            {...common}
            readOnly={common.readOnly || endLocked}
            className={endLocked ? 'field-readonly' : common.className}
            description={endLocked ? 'Chỉ nhập khi tình trạng là Nghỉ việc.' : common.description}
            value={form.values[f.key]}
            onChange={(v) => form.setFieldValue(f.key, v)}
            error={form.errors[f.key]}
          />
        );
      }
      case 'bool':
        return <Select key={f.key} {...common} data={BOOL} clearable placeholder="Chưa rõ" {...selectProps(f.key)} />;
      case 'gender':
        return <Select key={f.key} {...common} data={options.genders.map((g) => ({ value: String(g.value), label: g.label }))} allowDeselect={false} {...selectProps(f.key)} />;
      case 'status':
        return (
          <Select
            key={f.key}
            {...common}
            data={options.statuses.map((s) => ({ value: String(s.value), label: s.label }))}
            allowDeselect={false}
            {...selectProps(f.key)}
            onChange={(v: string | null) => {
              form.setFieldValue(f.key, v ?? '');
              // Đi làm lại thì bỏ ngày nghỉ việc
              if (v === '1') form.setFieldValue('endDate', '');
            }}
          />
        );
      case 'department':
        return (
          <DepartmentSelect
            key={f.key}
            {...common}
            departments={options.departments}
            value={deptId}
            onChange={(id) => {
              form.setFieldValue(f.key, id == null ? '' : String(id));
              // Chức danh không dùng được ở phòng ban mới thì bỏ chọn
              const keep = id != null && allowedTitles(options, id).some((t) => String(t.id) === form.values.jobTitleId);
              if (!keep) form.setFieldValue('jobTitleId', '');
            }}
            error={form.errors[f.key]}
            nothingFoundMessage="Không có phòng ban khớp."
          />
        );
      case 'jobTitle': {
        const noDept = deptId == null;
        return (
          <Select
            key={f.key}
            {...common}
            readOnly={common.readOnly || noDept}
            className={noDept ? 'field-readonly' : common.className}
            searchable
            data={titles.map((t) => ({ value: String(t.id), label: t.isActive ? t.name : `${t.name} (ngừng dùng)` }))}
            placeholder={noDept ? 'Chọn phòng ban trước' : undefined}
            description={noDept ? 'Chọn phòng ban trước.' : titles.length === 0 ? 'Phòng ban này và các phòng ban cha chưa có chức danh nào.' : common.description}
            nothingFoundMessage="Không có chức danh khớp."
            {...selectProps(f.key)}
          />
        );
      }
      default:
        return (
          <TextInput
            key={f.key}
            {...common}
            maxLength={f.max ?? undefined}
            placeholder={f.key === 'timekeepingCode' ? 'Bỏ trống: lấy theo mã nhân viên' : undefined}
            description={common.description ?? (f.key === 'code' && !creating ? 'Sửa được; không trùng với nhân viên khác.' : undefined)}
            {...form.getInputProps(f.key)}
            onChange={f.type === 'code' ? (e) => form.setFieldValue(f.key, e.currentTarget.value.toUpperCase()) : form.getInputProps(f.key).onChange}
          />
        );
    }
  };

  return (
    <form className="hr-panel" aria-labelledby="hr-emp-form-title" onSubmit={form.onSubmit((v) => save.mutate(v))}>
      <header className="hr-panel-head">
        <div className="hr-panel-titles">
          <Title order={2} id="hr-emp-form-title" className="hr-panel-title">
            {creating ? 'Thêm nhân viên' : `Sửa hồ sơ ${detail.fullName}`}
          </Title>
          <Text size="sm" c="dimmed">
            Ô vàng là bắt buộc.
          </Text>
        </div>
        <Group gap="xs" className="hr-panel-actions">
          <Button variant="default" onClick={cancel}>
            Hủy
          </Button>
          <ActionButton type="submit" loading={save.isPending} blockedReason={!creating && !dirty ? 'Chưa có thay đổi nào.' : null}>
            {creating ? 'Thêm nhân viên' : 'Lưu thay đổi'}
          </ActionButton>
        </Group>
      </header>
      {GROUPS.map((g) => {
        const list = visible.filter((f) => f.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="hr-group" aria-labelledby={`hr-fg-${g}`}>
            <h3 id={`hr-fg-${g}`} className="hr-group-title">{options.groups[g]}</h3>
            <div className="hr-form-grid">{list.map(input)}</div>
          </section>
        );
      })}
    </form>
  );
}
