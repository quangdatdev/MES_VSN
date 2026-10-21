import { Alert, Badge, Group, Select, Skeleton, Stack, Text, Tooltip } from '@mantine/core';
import { IconArrowBackUp, IconDeviceFloppy, IconInfoCircle, IconShieldLock } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { WorkPage } from '../../components/WorkPage';
import { api, ApiError } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk, toastWarn } from '../../lib/notify';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { levelColor, LoadError } from './common';
import { useUrlParams } from '../../lib/useUrlParams';
import { LEVELS, type AccessLevel, type FieldPolicyMatrix, type ResourceFields } from './types';

/** Giá trị trong ô: mức khai báo cho vai trò, hoặc '' = không khai báo (theo mặc định của cột). */
type Cell = AccessLevel | '';
const key = (roleId: number, field: string) => `${roleId}|${field}`;
const roleOf = (k: string) => Number(k.split('|')[0]);
const NO_CHANGES: ReadonlyMap<string, Cell> = new Map();
const OWN_ROLE = 'Bạn đang giữ vai trò này nên không tự sửa được';
const LEVEL_DATA = LEVELS.map((l) => ({ value: l.value, label: l.label }));
const NORMAL_DATA = [{ value: '', label: 'Mặc định: Sửa được' }, ...LEVEL_DATA];
const SENSITIVE_DATA = [{ value: '', label: 'Mặc định: Ẩn' }, ...LEVEL_DATA];

interface PolicyCellProps {
  k: string;
  fieldName: string;
  roleName: string;
  value: Cell;
  isChanged: boolean;
  locked: boolean;
  sensitive: boolean;
  onChange: (k: string, v: Cell) => void;
}

/**
 * Một ô của bảng. Select của Mantine nặng (Combobox, Popover, bộ định vị) và bảng có số cột × số vai trò ô: memo để đổi
 * một ô chỉ vẽ lại ô đó. Màu chữ theo mức đặt bằng CSS theo `data-level` của ô.
 */
const PolicyCell = memo(function PolicyCell({ k, fieldName, roleName, value, isChanged, locked, sensitive, onChange }: PolicyCellProps) {
  return (
    <td data-changed={isChanged || undefined} data-level={value || undefined} className="policy-cell">
      <Select
        size="xs"
        aria-label={`${fieldName} với ${roleName}${isChanged ? ' (chưa lưu)' : ''}`}
        data={sensitive ? SENSITIVE_DATA : NORMAL_DATA}
        value={value}
        onChange={(v) => onChange(k, (v ?? '') as Cell)}
        allowDeselect={false}
        disabled={locked}
        // Ô đã đổi chưa lưu có dấu chấm: không chỉ dựa vào màu nền
        leftSection={isChanged ? <span aria-hidden style={{ fontWeight: 700 }}>•</span> : undefined}
        leftSectionWidth={isChanged ? 18 : undefined}
        classNames={{ input: 'policy-input' }}
      />
    </td>
  );
});

/**
 * Chính sách cột theo vai trò (L4, quyết định 3.7): mỗi màn hình một bảng cột × vai trò.
 * Không khai báo: cột thường là Sửa được, cột nhạy cảm là Ẩn. Người nhiều vai trò lấy mức mở nhất.
 */
export default function FieldPoliciesPage() {
  const qc = useQueryClient();
  const canEdit = useCan('admin.fieldpolicy:update');
  // Lấy nguyên mảng từ store rồi mới map: selector trả mảng mới mỗi lần sẽ làm zustand render lặp vô hạn
  const roles = useSession((s) => s.roles);
  const myRoles = useMemo(() => roles.map((r) => r.code), [roles]);
  const resources = useQuery({ queryKey: ['admin', 'resource-fields'], queryFn: () => api<ResourceFields[]>('/admin/resource-fields') });
  const [params, setUrl] = useUrlParams();
  const urlScreen = Number(params.get('screen')) || null;
  const resourceId = resources.data?.some((r) => r.id === urlScreen) ? urlScreen : (resources.data?.[0]?.id ?? null);

  const matrix = useQuery({
    queryKey: ['admin', 'field-policies', resourceId],
    queryFn: () => api<FieldPolicyMatrix>(`/admin/field-policies?resourceId=${resourceId}`),
    enabled: resourceId !== null,
  });
  const initial = useMemo(() => {
    const m = new Map<string, Cell>();
    for (const p of matrix.data?.policies ?? []) m.set(key(p.roleId, p.fieldCode), p.accessLevel);
    return m;
  }, [matrix.data]);
  // Bản nháp chỉ giữ các ô đã đổi, gắn với màn hình đang xem: tải lại dữ liệu sau khi lưu một phần không xóa phần chưa lưu
  const [draftState, setDraftState] = useState<{ resourceId: number | null; cells: ReadonlyMap<string, Cell> }>({ resourceId: null, cells: NO_CHANGES });
  const draft = draftState.resourceId === resourceId ? draftState.cells : NO_CHANGES;
  // Hàm ổn định cho các ô (memo): đọc mức đã lưu và màn đang xem qua ref. Gán sau khi vẽ xong: đổi màn đi qua
  // startTransition, lượt vẽ dở của màn mới không được làm ô vừa đổi rơi vào màn đó
  const latest = useRef({ initial, resourceId });
  useLayoutEffect(() => {
    latest.current = { initial, resourceId };
  });
  const setCell = useCallback(
    (k: string, v: Cell) =>
      setDraftState((s) => {
        const { initial: saved, resourceId: rid } = latest.current;
        const next = new Map(s.resourceId === rid ? s.cells : NO_CHANGES);
        if ((saved.get(k) ?? '') === v) next.delete(k);
        else next.set(k, v);
        return { resourceId: rid, cells: next };
      }),
    [],
  );
  const resetDraft = () => setDraftState({ resourceId, cells: NO_CHANGES });

  const changed = [...draft.entries()].filter(([k, v]) => (initial.get(k) ?? '') !== v);
  const changedKeys = new Set(changed.map(([k]) => k));
  const [saving, setSaving] = useState(false);
  useLeaveGuard(changed.length > 0);

  async function save() {
    const data = matrix.data;
    if (!data || !changed.length) return;
    setSaving(true);
    const byRole = new Map<number, { fieldCode: string; accessLevel: AccessLevel | null }[]>();
    for (const [k, v] of changed) {
      const [, fieldCode] = k.split('|');
      byRole.set(roleOf(k), [...(byRole.get(roleOf(k)) ?? []), { fieldCode, accessLevel: v || null }]);
    }
    const nameOf = (id: number) => data.roles.find((r) => r.id === id)?.name ?? `#${id}`;
    const done = new Set<number>();
    const failed: { roleId: number; error: unknown }[] = [];
    try {
      // Lưu từng vai trò; một vai trò lỗi không chặn các vai trò sau
      for (const [roleId, policies] of byRole) {
        try {
          await api(`/admin/roles/${roleId}/field-policies`, { method: 'PUT', body: { resourceId: data.resource.id, policies } });
          done.add(roleId);
        } catch (error) {
          failed.push({ roleId, error });
        }
      }
      await qc.invalidateQueries({ queryKey: ['admin', 'field-policies'] });
      // Chỉ bỏ khỏi bản nháp các vai trò đã lưu xong; vai trò lỗi giữ nguyên trên bảng để sửa rồi lưu tiếp
      setDraftState((s) => (s.resourceId !== data.resource.id ? s : { resourceId: s.resourceId, cells: new Map([...s.cells].filter(([k]) => !done.has(roleOf(k)))) }));
    } finally {
      setSaving(false);
    }
    if (!failed.length) {
      toastOk(`Đã lưu ${changed.length} thay đổi của màn ${data.resource.name}. Người dùng thấy kết quả ở lần tải kế tiếp, không cần đăng nhập lại.`);
    } else if (!done.size && failed.length === 1) {
      toastError(failed[0].error, 'Chưa lưu được');
    } else {
      const why = (e: unknown) => (e instanceof ApiError ? e.message : 'không kết nối được máy chủ');
      toastWarn(
        `${done.size ? `Đã lưu: ${[...done].map(nameOf).join(', ')}. ` : ''}Chưa lưu: ${failed.map((f) => `${nameOf(f.roleId)} (${why(f.error)})`).join(', ')}. Phần chưa lưu vẫn giữ trên bảng.`,
        done.size ? 'Mới lưu được một phần' : 'Chưa lưu được',
      );
    }
  }

  function pickScreen(v: string | null) {
    const next = v ? Number(v) : null;
    if (next === resourceId) return;
    confirmDiscard(
      changed.length > 0,
      () => {
        setDraftState({ resourceId: next, cells: NO_CHANGES });
        setUrl({ screen: next });
      },
      `Bạn đã đổi ${changed.length} ô của màn ${matrix.data?.resource.name ?? 'này'} nhưng chưa lưu.`,
    );
  }

  const data = matrix.data;
  const loading = resources.isPending || (resourceId !== null && matrix.isPending);
  return (
    <WorkPage
      aggregateNote={false}
      title="Chính sách cột"
      subtitle="Chọn màn hình, đặt mức cho từng cột theo vai trò. Backend lọc cột trước khi trả dữ liệu, kể cả khi xuất file."
      actions={
        <>
          {canEdit && (
            <ActionButton variant="default" leftSection={<IconArrowBackUp size={15} />} blockedReason={changed.length ? null : 'Chưa có thay đổi nào.'} onClick={() => confirmDiscard(true, resetDraft, 'Mọi ô đã đổi trở lại như lần lưu gần nhất.')}>
              Hoàn tác
            </ActionButton>
          )}
          <ActionButton
            leftSection={<IconDeviceFloppy size={15} />}
            blockedReason={!canEdit ? 'Bạn chỉ có quyền xem chính sách cột, không sửa được.' : changed.length ? null : 'Chưa có thay đổi nào để lưu.'}
            loading={saving}
            onClick={save}
          >
            Lưu {changed.length ? `${changed.length} thay đổi` : ''}
          </ActionButton>
        </>
      }
      filters={
        <Group gap="md" align="flex-end" wrap="wrap">
          <Select
            label="Màn hình"
            placeholder={resources.isPending ? 'Đang tải…' : undefined}
            data={(resources.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
            value={resourceId ? String(resourceId) : null}
            onChange={pickScreen}
            allowDeselect={false}
            w={260}
            maw="100%"
          />
          <Group gap={6} wrap="wrap" pb={4}>
            {LEVELS.map((l) => (
              <Tooltip key={l.value} label={l.hint} events={{ hover: true, focus: true, touch: true }}>
                <Badge variant="light" color={levelColor(l.value)} size="lg" style={{ cursor: 'help' }} tabIndex={0} aria-label={`${l.label}: ${l.hint}`} className="focus-ring">
                  {l.label}
                </Badge>
              </Tooltip>
            ))}
          </Group>
        </Group>
      }
    >
      {resources.isError && <LoadError mb={0} error={resources.error} what="danh sách màn hình" onRetry={() => void resources.refetch()} retrying={resources.isFetching} />}
      {matrix.isError && <LoadError mb={0} error={matrix.error} what="chính sách cột của màn này" onRetry={() => void matrix.refetch()} retrying={matrix.isFetching} />}
      <Alert variant="light" color="link" icon={<IconInfoCircle size={16} />} py={6}>
        Ô để trống là theo mặc định: cột thường Sửa được, cột nhạy cảm Ẩn. Người có nhiều vai trò lấy mức mở nhất. Muốn cho riêng một người (có hạn dùng), vào Người dùng, mục Phân quyền chi tiết.
      </Alert>
      {resources.isSuccess && resources.data.length === 0 ? (
        <Text c="dimmed" size="sm">Chưa có màn hình nào đăng ký cột.</Text>
      ) : (
        <div className="grid-wrap" data-fill>
          <div className="grid-scroll">
            <table className="grid" aria-label="Chính sách cột theo vai trò" aria-busy={loading || undefined}>
              <thead>
                <tr>
                  {/* Cột đầu dính trái khi bảng cuộn ngang (nhiều vai trò): luôn thấy đang đặt cho cột nào */}
                  <th style={{ minWidth: 220, left: 0, zIndex: 2 }}>Cột</th>
                  {data?.roles.map((r) => (
                    <th key={r.id} style={{ minWidth: 150 }}>
                      {r.name}
                      {myRoles.includes(r.code) && (
                        <Tooltip label={OWN_ROLE} events={{ hover: true, focus: true, touch: true }}>
                          <span tabIndex={0} role="img" aria-label={OWN_ROLE} className="focus-ring" style={{ display: 'inline-flex', borderRadius: 2 }}>
                            <IconShieldLock size={13} className="grid-head-lock" aria-hidden />
                          </span>
                        </Tooltip>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.fields.map((f) => (
                  <tr key={f.code}>
                    <td title={f.code} style={{ position: 'sticky', left: 0, zIndex: 1 }}>
                      <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={600}>{f.name}</Text>
                        {f.isSensitive && <Badge size="xs" color="red" variant="light">Nhạy cảm</Badge>}
                      </Group>
                    </td>
                    {data.roles.map((r) => {
                      const k = key(r.id, f.code);
                      return (
                        <PolicyCell
                          key={r.id}
                          k={k}
                          fieldName={f.name}
                          roleName={r.name}
                          value={draft.get(k) ?? initial.get(k) ?? ''}
                          isChanged={changedKeys.has(k)}
                          locked={!canEdit || myRoles.includes(r.code) || saving}
                          sensitive={f.isSensitive}
                          onChange={setCell}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && (
              <Stack gap={8} p="sm" role="status" aria-label="Đang tải">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={28} />)}
              </Stack>
            )}
            {data && data.fields.length === 0 && (
              <Text c="dimmed" size="sm" p="lg">Màn hình này chưa có cột nào để đặt chính sách.</Text>
            )}
            {data && data.fields.length > 0 && data.roles.length === 0 && (
              <Text c="dimmed" size="sm" p="lg">Chưa có vai trò nào đang dùng. Thêm vai trò ở màn Vai trò.</Text>
            )}
          </div>
        </div>
      )}
    </WorkPage>
  );
}

