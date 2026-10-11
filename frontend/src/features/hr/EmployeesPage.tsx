import { Button, Drawer, Group, SegmentedControl, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { IconBuildingCommunity, IconDownload, IconFileImport, IconPlus, IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { ActionButton } from '../../components/ActionButton';
import { WorkPage } from '../../components/WorkPage';
import { download } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { qs } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { pageOf, useUrlParams } from '../../lib/useUrlParams';
import { useCan } from '../../shell/permissions';
import { employeeParams, useEmployeeOptions, type EmployeeQuery } from './api';
import { LoadError, Splitter, useStoredSize } from './common';
import { DepartmentTree } from './DepartmentTree';
import { EmployeeImportModal } from './EmployeeImportModal';
import { EmployeeList } from './EmployeeList';
import { allowedTitles, EmployeePanel, type EmployeeMode } from './EmployeePanel';
import { ancestorsOf, subtreeIds } from './tree';
import type { JobTitleOption, PickDepartment } from './types';

const VIEW: EmployeeMode = { kind: 'view' };
const NO_DEPTS: PickDepartment[] = [];
const NO_TITLES: JobTitleOption[] = [];

/**
 * Thông tin nhân sự (hr.employee, ADR 0012): cây phòng ban và danh sách nhân viên bên trái, hồ sơ bên phải. Chọn phòng ban thì
 * danh sách gồm cả phòng ban con. Phòng ban, nhân viên, bộ lọc nằm trên URL (?dept=MÃ&emp=Id&q=…&title=…&status=…&page=…).
 */
export default function EmployeesPage() {
  const mobile = useMobile();
  const [params, patch] = useUrlParams();
  const options = useEmployeeOptions();
  const depts = options.data?.departments ?? NO_DEPTS;
  const byId = useMemo(() => new Map(depts.map((d) => [d.id, d])), [depts]);
  const deptCode = params.get('dept');
  const scope = useMemo(() => (deptCode ? (depts.find((d) => d.code === deptCode) ?? null) : null), [depts, deptCode]);
  // Phòng ban trên URL chỉ đổi ra Id khi có danh mục: chưa có thì chưa tải danh sách (khỏi tải cả công ty một lượt rồi bỏ)
  const scopeReady = !deptCode || !!options.data;
  const empId = Number(params.get('emp')) || null;
  const canCreate = useCan('hr.employee:create');
  const canExport = useCan('hr.employee:export');

  // Chữ tìm giữ ở state của trang (ô đọc state, không đọc thẳng URL: URL đổi trong startTransition nên về chậm một nhịp)
  const [q, setQ] = useState(() => params.get('q') ?? '');
  const filter: EmployeeQuery = {
    departmentId: scope?.id ?? null,
    q,
    jobTitleId: Number(params.get('title')) || null,
    status: Number(params.get('status')) || null,
    page: pageOf(params),
  };
  const setFilter = useCallback(
    (p: Partial<EmployeeQuery>) => {
      if (p.q !== undefined) setQ(p.q);
      patch({
        ...(p.q !== undefined ? { q: p.q.trim() } : {}),
        ...(p.jobTitleId !== undefined ? { title: p.jobTitleId } : {}),
        ...(p.status !== undefined ? { status: p.status } : {}),
        ...(p.page !== undefined ? { page: p.page > 1 ? p.page : null } : {}),
      });
    },
    [patch],
  );

  const [mode, setMode] = useState<EmployeeMode>(VIEW);
  // Mỗi lần bấm thêm là một form mới (bấm lại Thêm nhân viên, bỏ thay đổi thì form về trống)
  const createSeq = useRef(0);
  const [dirty, setDirty] = useState(false);
  useLeaveGuard(dirty);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<'list' | 'detail'>(empId ? 'detail' : 'list');
  const [drawer, setDrawer] = useState(false);
  const [deptSearch, setDeptSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const reveal = useCallback(
    (id: number) => {
      const path = ancestorsOf(byId, id);
      if (path.length) setExpanded((s) => ({ ...s, ...Object.fromEntries(path.map((p) => [String(p.id), true])) }));
    },
    [byId],
  );
  // Các nút thu gọn sẵn (cây dài); mở đường tới phòng ban trên URL khi có dữ liệu lần đầu
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || depts.length === 0) return;
    opened.current = true;
    if (scope) reveal(scope.id);
  }, [depts, scope, reveal]);

  const guard = (go: () => void) =>
    confirmDiscard(dirty, () => {
      setDirty(false);
      setMode(VIEW);
      go();
    });
  const pickDept = (id: number | null) =>
    guard(() => {
      const d = id == null ? null : byId.get(id);
      // Đổi phòng ban: bỏ nhân viên đang xem, về trang 1, giữ chữ tìm, tình trạng; chức danh lọc lại từ đầu
      patch({ dept: d?.code ?? null, emp: null, page: null, title: null });
      if (d) reveal(d.id);
      setDrawer(false);
    });
  const pickEmployee = (id: number) =>
    guard(() => {
      patch({ emp: id });
      if (mobile) setTab('detail');
    });
  const startCreate = () =>
    guard(() => {
      setMode({ kind: 'create', departmentId: scope?.isActive ? scope.id : null, seq: ++createSeq.current });
      if (mobile) setTab('detail');
    });

  // Chức danh để lọc: dùng được cho phòng ban đang chọn hoặc một phòng ban trong nhánh của nó
  const titles = useMemo(() => {
    const all = options.data?.jobTitles ?? NO_TITLES;
    if (!scope || !options.data) return all.filter((t) => t.isActive);
    const branch = subtreeIds(depts, scope.id);
    const up = allowedTitles(options.data, scope.id);
    return all.filter((t) => t.isActive && (up.includes(t) || (t.departmentId != null && branch.has(t.departmentId))));
  }, [options.data, depts, scope]);

  const exportFile = useMutation({
    mutationFn: () => download(`/hr/employees/export${qs(employeeParams(filter))}`, 'nhan-su.csv'),
    onError: (e) => toastError(e, 'Chưa xuất được file'),
  });

  const [width, setWidth] = useStoredSize('hr.employees.side', 380, 280, 720);
  const [treeHeight, setTreeHeight] = useStoredSize('hr.employees.tree', 260, 140, 700);
  const layout = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const editing = mode.kind !== 'view';

  const treeBlock = (
    <div className="hr-side-block">
      <div className="hr-side-head">
        <Text fw={700} size="sm" component="h2">
          Phòng ban
        </Text>
      </div>
      <div className="hr-side-tools">
        <DebouncedTextInput size="xs" placeholder="Tìm phòng ban" aria-label="Tìm phòng ban" leftSection={<IconSearch size={14} />} value={deptSearch} onChange={setDeptSearch} delay={150} />
      </div>
      <div className="hr-side-scroll">
        <UnstyledButton className="hr-all-row focus-ring" data-selected={!scope || undefined} aria-pressed={!scope} onClick={() => pickDept(null)}>
          <IconBuildingCommunity size={15} stroke={1.6} aria-hidden />
          Tất cả phòng ban
        </UnstyledButton>
        {options.isPending ? (
          <Stack gap={8} p="xs" aria-busy>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} h={16} w={`${85 - (i % 3) * 15}%`} />
            ))}
          </Stack>
        ) : !options.data ? (
          <div className="hr-tree-empty">
            <LoadError error={options.error} what="danh mục phòng ban" onRetry={() => options.refetch()} retrying={options.isFetching} />
          </div>
        ) : (
          <DepartmentTree
            items={depts}
            selectedId={scope?.id ?? null}
            onSelect={pickDept}
            expanded={expanded}
            onExpandedChange={setExpanded}
            search={deptSearch}
            label="Phòng ban để lọc nhân viên"
            empty={<Text size="sm" c="dimmed">{deptSearch.trim() ? `Không có phòng ban khớp “${deptSearch.trim()}”.` : 'Chưa có phòng ban nào.'}</Text>}
          />
        )}
      </div>
    </div>
  );

  const list = (
    <EmployeeList
      filter={filter}
      ready={scopeReady}
      onFilter={setFilter}
      scopeName={scope?.name ?? (scopeReady ? 'tất cả phòng ban' : deptCode!)}
      titles={titles}
      selectedId={empId}
      onSelect={pickEmployee}
      onClear={() => setFilter({ q: '', jobTitleId: null, status: null, page: 1 })}
    />
  );

  const panel = options.data ? (
    <EmployeePanel
      id={empId}
      options={options.data}
      mode={mode}
      onMode={(m) => {
        if (m.kind === 'view') setDirty(false);
        setMode(m);
      }}
      onDirty={setDirty}
      scope={scope}
      onCreate={startCreate}
      onClose={() => {
        patch({ emp: null });
        if (mobile) setTab('list');
      }}
      onSaved={(d, created) => {
        setMode(VIEW);
        setDirty(false);
        // Sửa: giữ bộ lọc, trang đang xem. Thêm: cây chuyển sang phòng ban của người vừa thêm, danh sách về trang 1 để thấy họ
        if (!created) return;
        const dept = depts.find((x) => x.code === d.departmentCode);
        patch({ emp: d.id, dept: dept?.code ?? null, page: null, title: null });
        if (dept) reveal(dept.id);
      }}
    />
  ) : options.isError ? (
    <div className="hr-panel">
      <LoadError error={options.error} what="danh mục phòng ban, chức danh" onRetry={() => options.refetch()} retrying={options.isFetching} />
    </div>
  ) : (
    <div className="hr-panel" aria-busy>
      <Skeleton h={200} />
    </div>
  );

  const actions = (
    <>
      {canCreate && (
        <Button variant={editing ? 'default' : 'filled'} leftSection={<IconPlus size={16} />} onClick={startCreate}>
          Thêm nhân viên
        </Button>
      )}
      {canCreate && options.data && (
        <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={() => setImporting(true)}>
          Nhập từ Excel
        </Button>
      )}
      {canExport && (
        <ActionButton variant="default" leftSection={<IconDownload size={16} />} loading={exportFile.isPending} blockedReason={scopeReady ? null : 'Đang tải danh mục phòng ban.'} onClick={() => exportFile.mutate()}>
          Xuất file
        </ActionButton>
      )}
    </>
  );

  return (
    <WorkPage
      title="Thông tin nhân sự"
      subtitle="Hồ sơ nhân viên theo sơ đồ tổ chức, dùng chung cho mọi nhà máy. Chọn phòng ban để xem nhân viên của phòng ban đó và các phòng ban con."
      aggregateNote={false}
      actions={actions}
    >
      {mobile ? (
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            value={tab}
            onChange={(v) => setTab(v as 'list' | 'detail')}
            data={[
              { value: 'list', label: 'Danh sách' },
              { value: 'detail', label: mode.kind === 'create' ? 'Thêm mới' : mode.kind === 'edit' ? 'Đang sửa' : 'Hồ sơ' },
            ]}
          />
          {/* Ẩn khung không xem chứ không gỡ: đổi tab giữa chừng không mất form đang nhập, vẫn chặn rời màn */}
          <div hidden={tab !== 'list'}>
            <div className="hr-side hr-side-mobile">
              <Group px="sm" pt="sm">
                <Button variant="default" size="xs" leftSection={<IconBuildingCommunity size={14} />} onClick={() => setDrawer(true)}>
                  Phòng ban: {scope?.name ?? 'Tất cả'}
                </Button>
              </Group>
              {list}
            </div>
          </div>
          <div hidden={tab !== 'detail'}>{panel}</div>
          <Drawer opened={drawer} onClose={() => setDrawer(false)} title="Chọn phòng ban" position="bottom" size="80%">
            {treeBlock}
          </Drawer>
        </Stack>
      ) : (
        <div className="hr-layout" ref={layout} style={{ ['--hr-side' as string]: `${width}px` }}>
          <aside className="hr-side hr-side-split" ref={sideRef} aria-label="Phòng ban và danh sách nhân viên" style={{ ['--hr-tree-h' as string]: `${treeHeight}px` }}>
            {treeBlock}
            <Splitter target={sideRef} cssVar="--hr-tree-h" orientation="horizontal" value={treeHeight} min={140} max={700} onCommit={setTreeHeight} label="Kéo để đổi chiều cao cây phòng ban" />
            {list}
          </aside>
          <Splitter target={layout} cssVar="--hr-side" orientation="vertical" value={width} min={280} max={720} onCommit={setWidth} label="Kéo để đổi độ rộng danh sách" />
          <section className="hr-main">{panel}</section>
        </div>
      )}
      {importing && options.data && <EmployeeImportModal fields={options.data.fields} onClose={() => setImporting(false)} />}
    </WorkPage>
  );
}
