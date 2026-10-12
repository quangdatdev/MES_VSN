import { Badge, Button, Modal, ScrollArea, Select, SimpleGrid, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { PageHeader } from '../../components/PageHeader';
import { Pager } from '../../components/Pager';
import { api } from '../../lib/api';
import { fmtDateTime } from '../../lib/format';
import type { Paged } from '../../lib/types';
import { useMobile } from '../../lib/useMobile';
import { EmptyRow, FilterBar, LoadError, SkeletonRows } from './common';
import { pageOf, useClampPage, useUrlParams } from '../../lib/useUrlParams';
import type { AuditRow } from './types';

const ENTITIES = [
  { value: 'SysUser', label: 'Người dùng' },
  { value: 'SysRole', label: 'Vai trò và quyền' },
  { value: 'SysBranch', label: 'Đơn vị cơ sở' },
  { value: 'SysProductionFactory', label: 'Nhà máy SX' },
  { value: 'SysUserRoleScope', label: 'Phạm vi' },
  { value: 'SysUserPermissionOverride', label: 'Ngoại lệ quyền' },
  { value: 'SysFieldPolicy', label: 'Chính sách cột' },
  { value: 'SalesOrder', label: 'Đơn hàng' },
  { value: 'SalesOrderPo', label: 'PO, tỷ lệ cắt' },
  { value: 'ShipmentPlan', label: 'Kế hoạch xuất hàng, xếp chuyền' },
  { value: 'ShipmentPlanLine', label: 'Phân bổ màu cỡ (dòng chuyền)' },
  { value: 'PoAllocation', label: 'Phân bổ PO' },
  { value: 'SyncRun', label: 'Đồng bộ dữ liệu' },
  // Danh mục xưởng, chuyền cũ (bỏ ở phase 5.10, chuyền nay là bộ phận ở Sơ đồ tổ chức): giữ để lọc, đọc nhật ký đã ghi
  { value: 'SysOrgUnit', label: 'Danh mục: xưởng, chuyền may (cũ)' },
  { value: 'SysScopeDimension', label: 'Chiều phạm vi' },
  { value: 'Department', label: 'Phòng ban, chuyền may' },
  { value: 'SysCatalogItem', label: 'Danh mục: đơn vị tính, loại đơn hàng…' },
  { value: 'SysShift', label: 'Danh mục: ca làm việc' },
  { value: 'Auth', label: 'Đăng nhập' },
];

const ACTION_TEXT: Record<string, string> = {
  LOGIN: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập sai',
  SELECT_BRANCH: 'Chọn đơn vị cơ sở',
  LOGOUT: 'Đăng xuất',
  USER_CREATE: 'Thêm người dùng',
  USER_UPDATE: 'Sửa người dùng',
  PASSWORD_RESET: 'Đặt lại mật khẩu',
  USER_ROLES: 'Gán vai trò',
  USER_BRANCHES: 'Gán đơn vị cơ sở, nhà máy SX',
  ROLE_CREATE: 'Thêm vai trò',
  ROLE_UPDATE: 'Sửa vai trò',
  ROLE_DELETE: 'Ngừng dùng vai trò',
  ROLE_PERMISSIONS: 'Đổi quyền vai trò',
  BRANCH_CREATE: 'Thêm đơn vị cơ sở',
  BRANCH_IMPORT: 'Cập nhật đơn vị cơ sở từ BRAVO',
  FACTORY_CREATE: 'Thêm nhà máy SX',
  FACTORY_UPDATE: 'Sửa nhà máy SX',
  BRANCH_UPDATE: 'Sửa đơn vị cơ sở',
  USER_ROLE_SCOPE: 'Đổi phạm vi',
  OVERRIDE_CREATE: 'Thêm ngoại lệ',
  OVERRIDE_UPDATE: 'Sửa ngoại lệ',
  OVERRIDE_DELETE: 'Gỡ ngoại lệ',
  ROLE_FIELD_POLICY: 'Đổi chính sách cột',
  USER_FIELD_POLICY_CREATE: 'Thêm cột riêng',
  USER_FIELD_POLICY_UPDATE: 'Sửa cột riêng',
  USER_FIELD_POLICY_DELETE: 'Gỡ cột riêng',
  CUT_RATIO_UPDATE: 'Cập nhật tỷ lệ cắt',
  CUT_RATIO_CONFIRM: 'Xác nhận tỷ lệ cắt',
  CUT_RATIO_UNCONFIRM: 'Hủy xác nhận tỷ lệ cắt',
  LINE_SCHEDULE: 'Xếp chuyền',
  COLOR_SIZE_ALLOCATE: 'Phân màu cỡ',
  PO_ALLOCATION_FACTORY: 'Đổi nhà máy SX (Phân bổ PO)',
  PO_ALLOCATION_REFRESH: 'Làm mới Phân bổ PO từ OSM',
  SYNC_START: 'Chạy đồng bộ',
  SEED: 'Nạp dữ liệu mẫu',
  DEMO_RESET: 'Đặt lại dữ liệu demo',
  BRAVO_LOAD: 'Nạp đơn hàng BRAVO',
  // Nhật ký của danh mục xưởng, chuyền cũ (trước phase 5.10): không còn ghi mới, giữ nhãn để đọc lịch sử
  LINE_CREATE: 'Thêm chuyền (danh mục cũ)',
  LINE_UPDATE: 'Sửa chuyền (danh mục cũ)',
  WORKSHOP_CREATE: 'Thêm xưởng (danh mục cũ)',
  WORKSHOP_UPDATE: 'Sửa xưởng (danh mục cũ)',
  ORG_UNIT_RETIRE: 'Ngừng xưởng, chuyền (danh mục cũ)',
  SCOPE_DIMENSION_UPDATE: 'Đổi chiều phạm vi',
  LINE_SET_CHANGE: 'Đổi chuyền may (phạm vi)',
  DISSOLVE: 'Giải thể phòng ban',
  RESTORE: 'Khôi phục phòng ban',
  CATALOG_ITEM_CREATE: 'Thêm mục danh mục',
  CATALOG_ITEM_UPDATE: 'Sửa mục danh mục',
  SHIFT_CREATE: 'Thêm ca làm việc',
  SHIFT_UPDATE: 'Sửa ca làm việc',
  CREATE: 'Thêm',
  UPDATE: 'Sửa',
  DELETE: 'Xóa',
};

const pretty = (s: string | null) => {
  if (!s) return '–';
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
};

const ENTITY_LABEL = new Map(ENTITIES.map((e) => [e.value, e.label]));
/** Cỡ trang dùng chung cho truy vấn, kéo về trang cuối và chân bảng */
const PAGE_SIZE = 100;

/** Nhãn tiếng Việt của đối tượng; loại chưa có nhãn thì hiện mã gốc. */
const entityText = (t: string) => ENTITY_LABEL.get(t) ?? t;

export default function AuditPage() {
  const mobile = useMobile();
  const [params, setUrl] = useUrlParams();
  const page = pageOf(params);
  // URL giữ nguyên chữ đã gõ (để ô tìm không bị sửa lại giữa lúc gõ); truy vấn dùng chữ đã cắt khoảng trắng
  const rawQuery = params.get('q') ?? '';
  const query = rawQuery.trim();
  const rawEntity = params.get('entity');
  const entity = rawEntity && ENTITY_LABEL.has(rawEntity) ? rawEntity : null;
  // Xóa bộ lọc dựng lại ô tìm: chữ đang gõ dở (chưa kịp lên URL) cũng mất theo
  const [searchKey, setSearchKey] = useState(0);
  const clearFilters = () => {
    setSearchKey((k) => k + 1);
    setUrl({ q: null, entity: null, page: null });
  };
  const [open, setOpen] = useState<AuditRow | null>(null);

  const log = useQuery({
    queryKey: ['admin', 'audit', page, query, entity],
    queryFn: () => api<Paged<AuditRow>>(`/admin/audit?page=${page}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(query)}${entity ? `&entityType=${encodeURIComponent(entity)}` : ''}`),
    placeholderData: keepPreviousData,
  });
  useClampPage(log.data, page, PAGE_SIZE, (p) => setUrl({ page: p === 1 ? null : p }));
  const rows = log.data?.items ?? [];

  return (
    <>
      <PageHeader title="Nhật ký hệ thống" subtitle="Ai đã làm gì, ở đơn vị cơ sở nào, lúc nào. Nhật ký chỉ ghi thêm, không sửa hay xóa được." />
      <FilterBar>
        {/* Ô tìm giữ chữ đang gõ; URL và truy vấn đổi khi ngừng gõ */}
        <DebouncedTextInput
          key={searchKey}
          placeholder="Tìm theo người, hành động, mã"
          leftSection={<IconSearch size={14} />}
          value={rawQuery}
          onChange={(v) => setUrl({ q: v, page: null })}
          w={300}
          maw="100%"
          aria-label="Tìm trong nhật ký"
        />
        <Select placeholder="Mọi loại đối tượng" clearable data={ENTITIES} value={entity} onChange={(v) => setUrl({ entity: v, page: null })} w={260} maw="100%" aria-label="Lọc theo đối tượng" />
      </FilterBar>
      {log.isError && <LoadError error={log.error} what="nhật ký" onRetry={() => void log.refetch()} retrying={log.isFetching} />}
      <div className="table-frame">
        <table className="dense-table">
          <thead><tr><th>Thời điểm</th><th>Người thực hiện</th><th>ĐVCS</th><th>Hành động</th><th>Đối tượng</th><th style={{ width: 80 }}>Chi tiết</th></tr></thead>
          <tbody>
            {log.isPending && <SkeletonRows cols={6} />}
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono">{fmtDateTime(r.eventAt, { seconds: true })}</td>
                <td>{r.username ?? '–'}</td>
                <td className="mono">{r.branchCode ?? '–'}</td>
                <td><Badge size="sm" variant="light" color={r.actionCode === 'LOGIN_FAILED' ? 'red' : 'gray'} title={r.actionCode}>{ACTION_TEXT[r.actionCode] ?? r.actionCode}</Badge></td>
                <td><span title={r.entityType}>{entityText(r.entityType)}</span>{r.entityId ? <span className="mono"> #{r.entityId}</span> : ''}</td>
                <td>
                  {(r.oldValue || r.newValue) && (
                    <Button size="compact-sm" variant="subtle" color="link" onClick={() => setOpen(r)}>
                      Xem
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {log.isSuccess && rows.length === 0 && (
              query || entity ? (
                <EmptyRow colSpan={6} action={<Button size="xs" variant="default" onClick={clearFilters}>Xóa bộ lọc</Button>}>
                  Không có bản ghi nào khớp bộ lọc.
                </EmptyRow>
              ) : (
                <EmptyRow colSpan={6}>Chưa có bản ghi nào.</EmptyRow>
              )
            )}
          </tbody>
        </table>
        {log.data && <Pager page={page} pageSize={PAGE_SIZE} total={log.data.total} onPage={(p) => setUrl({ page: p === 1 ? null : p })} />}
      </div>

      <Modal
        opened={!!open}
        onClose={() => setOpen(null)}
        title={open ? `${ACTION_TEXT[open.actionCode] ?? open.actionCode} – ${entityText(open.entityType)}` : ''}
        size="lg"
        fullScreen={mobile}
      >
        {open && (
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <div>
              <Text size="sm" fw={600} mb={4}>Trước</Text>
              <ScrollArea h={280} type="auto"><pre className="mono" style={{ margin: 0, fontSize: 12 }}>{pretty(open.oldValue)}</pre></ScrollArea>
            </div>
            <div>
              <Text size="sm" fw={600} mb={4}>Sau</Text>
              <ScrollArea h={280} type="auto"><pre className="mono" style={{ margin: 0, fontSize: 12 }}>{pretty(open.newValue)}</pre></ScrollArea>
            </div>
          </SimpleGrid>
        )}
      </Modal>
    </>
  );
}
