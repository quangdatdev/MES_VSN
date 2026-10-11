import { Button, Checkbox, Menu, SegmentedControl, Skeleton, Stack, Text } from '@mantine/core';
import { IconChevronDown, IconPlus, IconSearch } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { WorkPage } from '../../components/WorkPage';
import { confirmDiscard } from '../../lib/confirm';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { useMobile } from '../../lib/useMobile';
import { useUrlParams } from '../../lib/useUrlParams';
import { useCan } from '../../shell/permissions';
import { useDepartmentTree } from './api';
import { LoadError, Splitter, useStoredSize } from './common';
import { DepartmentPanel, type PanelMode } from './DepartmentPanel';
import { DepartmentTree } from './DepartmentTree';
import { ancestorsOf } from './tree';
import type { Department } from './types';

const NO_DEPTS: Department[] = [];
const VIEW: PanelMode = { kind: 'view' };

/**
 * Sơ đồ tổ chức (hr.orgchart, ADR 0012): cây phòng ban bên trái, thông tin phòng ban đang chọn bên phải. Thêm phòng ban con hoặc
 * cùng cấp bằng chuột phải, nút ba chấm trên cây hoặc nút Thêm phòng ban. Phòng ban đang chọn nằm trên URL (?dept=MÃ).
 */
export default function OrgChartPage() {
  const mobile = useMobile();
  const [params, patch] = useUrlParams();
  const showAll = params.get('all') === '1';
  const code = params.get('dept');
  const tree = useDepartmentTree(showAll);
  const items = tree.data?.items ?? NO_DEPTS;
  const byId = useMemo(() => new Map(items.map((d) => [d.id, d])), [items]);
  const selected = useMemo(() => (code ? (items.find((d) => d.code === code) ?? null) : null), [items, code]);
  const canCreate = useCan('hr.orgchart:create');

  const [mode, setMode] = useState<PanelMode>(VIEW);
  const [dirty, setDirty] = useState(false);
  useLeaveGuard(dirty);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<'tree' | 'detail'>(code ? 'detail' : 'tree');

  // Mở đường tới một phòng ban (sau khi chọn từ đường dẫn, sau khi lưu), giữ các nút người dùng đã mở
  const reveal = useCallback(
    (id: number) => {
      const path = ancestorsOf(byId, id);
      if (path.length) setExpanded((s) => ({ ...s, ...Object.fromEntries(path.map((p) => [String(p.id), true])) }));
    },
    [byId],
  );
  // Lần đầu có dữ liệu: mở các gốc và đường tới phòng ban trên URL
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || items.length === 0) return;
    opened.current = true;
    const roots = items.filter((d) => d.parentId == null || !byId.has(d.parentId));
    setExpanded(Object.fromEntries(roots.map((r) => [String(r.id), true])));
    if (selected) reveal(selected.id);
  }, [items, byId, selected, reveal]);

  const go = (d: Department | null) => {
    patch({ dept: d?.code ?? null });
    if (d) reveal(d.id);
    if (mobile && d) setTab('detail');
  };
  const pick = useCallback(
    (id: number) =>
      confirmDiscard(dirty, () => {
        setMode(VIEW);
        setDirty(false);
        const d = byId.get(id);
        patch({ dept: d?.code ?? null });
        if (d) reveal(d.id);
        if (mobile) setTab('detail');
      }),
    [dirty, byId, patch, reveal, mobile],
  );
  const startCreate = useCallback(
    (parentId: number | null, typeId: number | null) =>
      confirmDiscard(dirty, () => {
        setDirty(false);
        setMode({ kind: 'create', parentId, typeId });
        if (mobile) setTab('detail');
      }),
    [dirty, mobile],
  );
  const changeMode = (m: PanelMode) => {
    if (m.kind === 'view') setDirty(false);
    setMode(m);
  };

  const menu = useMemo(() => {
    if (!canCreate) return undefined;
    // Phòng ban đã giải thể không thêm con, cùng cấp được (cha của phòng ban cùng cấp có thể cũng đã giải thể); cấp cuối không có con
    return (d: Department) => (
      <>
        <Menu.Label>{d.name}</Menu.Label>
        <Menu.Item disabled={!d.isActive || d.isFinalLevel} onClick={() => startCreate(d.id, null)}>
          {d.isFinalLevel ? 'Thêm phòng ban con (loại cấp cuối, không có con)' : 'Thêm phòng ban con'}
        </Menu.Item>
        <Menu.Item disabled={!d.isActive} onClick={() => startCreate(d.parentId, d.departmentTypeId)}>
          Thêm phòng ban cùng cấp
        </Menu.Item>
        {!d.isActive && <Menu.Label>Phòng ban đã giải thể: khôi phục trước khi thêm.</Menu.Label>}
      </>
    );
  }, [canCreate, startCreate]);

  const [width, setWidth] = useStoredSize('hr.orgchart.side', 340, 260, 560);
  const layout = useRef<HTMLDivElement>(null);
  const editing = mode.kind !== 'view';

  const addButton = canCreate && (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button variant={editing ? 'default' : 'filled'} leftSection={<IconPlus size={16} />} rightSection={<IconChevronDown size={14} />}>
          Thêm phòng ban
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {selected?.isActive && !selected.isFinalLevel && <Menu.Item onClick={() => startCreate(selected.id, null)}>Phòng ban con của {selected.name}</Menu.Item>}
        {selected?.isActive && <Menu.Item onClick={() => startCreate(selected.parentId, selected.departmentTypeId)}>Cùng cấp với {selected.name}</Menu.Item>}
        <Menu.Item onClick={() => startCreate(null, null)}>Phòng ban gốc (không có cha)</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const side = (
    <aside className="hr-side" aria-label="Cây phòng ban">
      <div className="hr-side-head">
        <Text fw={700} size="sm" component="h2">
          Cây phòng ban
        </Text>
        {tree.data && <Text size="xs" c="dimmed">{items.filter((d) => d.isActive).length} phòng ban đang dùng</Text>}
      </div>
      <div className="hr-side-tools">
        <DebouncedTextInput size="xs" placeholder="Tìm phòng ban (tên hoặc mã)" aria-label="Tìm phòng ban" leftSection={<IconSearch size={14} />} value={search} onChange={setSearch} delay={150} />
      </div>
      <div className="hr-side-scroll">
        {tree.isError && <LoadError error={tree.error} what="sơ đồ tổ chức" onRetry={() => tree.refetch()} retrying={tree.isFetching} />}
        {tree.isPending ? (
          <Stack gap={8} p="xs" aria-busy>
            {Array.from({ length: 7 }, (_, i) => (
              <Skeleton key={i} h={18} w={`${90 - (i % 3) * 18}%`} ml={(i % 3) * 18} />
            ))}
          </Stack>
        ) : (
          <DepartmentTree
            items={items}
            selectedId={selected?.id ?? null}
            onSelect={pick}
            expanded={expanded}
            onExpandedChange={setExpanded}
            search={search}
            label="Sơ đồ tổ chức"
            menu={menu}
            empty={
              search.trim() ? (
                <Text size="sm" c="dimmed">Không có phòng ban khớp “{search.trim()}”.</Text>
              ) : (
                <Stack gap={6} align="flex-start">
                  <Text size="sm">Chưa có phòng ban nào.</Text>
                  {canCreate && <Button size="xs" variant="default" onClick={() => startCreate(null, null)}>Thêm phòng ban gốc</Button>}
                </Stack>
              )
            }
          />
        )}
      </div>
      <div className="hr-side-foot">
        <Checkbox
          size="sm"
          label="Hiện phòng ban đã giải thể"
          checked={showAll}
          onChange={(e) => patch({ all: e.currentTarget.checked ? '1' : null })}
        />
      </div>
    </aside>
  );

  const missing = !!code && !!tree.data && !selected && mode.kind === 'view';
  const panel = missing ? (
    <div className="hr-panel hr-panel-empty">
      <Text fw={600}>Không thấy phòng ban {code}.</Text>
      <Text size="sm" c="dimmed">
        {showAll ? 'Phòng ban không còn hoặc bạn không được xem.' : 'Có thể phòng ban đã giải thể: tích “Hiện phòng ban đã giải thể” để xem.'}
      </Text>
      {!showAll && <Button size="xs" variant="default" onClick={() => patch({ all: '1' })}>Hiện phòng ban đã giải thể</Button>}
    </div>
  ) : (
    <DepartmentPanel
      dept={selected}
      items={items}
      mode={mode}
      onMode={changeMode}
      onDirty={setDirty}
      onPick={pick}
      onSaved={(d) => {
        setMode(VIEW);
        setDirty(false);
        // Vừa giải thể mà đang ẩn phòng ban giải thể: về phòng ban cha
        if (!d.isActive && !showAll) go(d.parentId == null ? null : (byId.get(d.parentId) ?? null));
        else go(d);
      }}
    />
  );

  return (
    <WorkPage
      title="Sơ đồ tổ chức"
      subtitle="Cây phòng ban của công ty, dùng chung cho mọi nhà máy. Chuột phải hoặc nút ba chấm trên một phòng ban để thêm phòng ban con, cùng cấp."
      aggregateNote={false}
      actions={addButton}
    >
      {mobile ? (
        <Stack gap="sm">
          <SegmentedControl
            fullWidth
            value={tab}
            onChange={(v) => setTab(v as 'tree' | 'detail')}
            data={[
              { value: 'tree', label: 'Cây phòng ban' },
              { value: 'detail', label: editing ? (mode.kind === 'create' ? 'Thêm mới' : 'Đang sửa') : 'Thông tin' },
            ]}
          />
          {tab === 'tree' ? side : panel}
        </Stack>
      ) : (
        <div className="hr-layout" ref={layout} style={{ ['--hr-side' as string]: `${width}px` }}>
          {side}
          <Splitter target={layout} cssVar="--hr-side" orientation="vertical" value={width} min={260} max={560} onCommit={setWidth} label="Kéo để đổi độ rộng cây phòng ban" />
          <section className="hr-main">{panel}</section>
        </div>
      )}
    </WorkPage>
  );
}
