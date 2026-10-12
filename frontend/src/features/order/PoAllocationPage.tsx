import { Anchor, Button, Group, Select, Stack, Text } from '@mantine/core';
import { IconCloudDownload, IconFilterOff, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBranchName } from '../../components/BranchName';
import { ColumnFilterNote } from '../../components/ColumnFilter';
import { DataGrid, Masked, type Column } from '../../components/DataGrid';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { WorkPage } from '../../components/WorkPage';
import { api } from '../../lib/api';
import { MASK, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { fmtDateTime } from '../../lib/format';
import { useCan } from '../../shell/permissions';
import { emptyFilter, type OrderFilter, type PoAllocation, type PoAllocationPage } from './api';
import { EmptyState, ExportButton, readable, usePagedList } from './common';

const RESOURCE = 'order.poallocation';
const PATH = '/order/po-allocations';
/** Tên nguồn ở màn Đồng bộ dữ liệu (SyncSource.Name của OSM.OSMData) */
const SOURCE_NAME = 'Phân bổ PO theo nhà máy (OSM)';

// Thứ tự cột theo view OSM: thông tin đơn hàng trước, nhà máy sau
const COLUMNS: Column<PoAllocation>[] = [
  { key: 'brand', title: 'Brand', filterKey: 'brand', sortKey: 'brand' },
  { key: 'season', title: 'Season', filterKey: 'season', sortKey: 'season' },
  { key: 'po', title: 'PO', filterKey: 'po', sortKey: 'po', format: 'code' },
  { key: 'so', title: 'SO', filterKey: 'so', sortKey: 'so', format: 'code' },
  { key: 'shipMode', title: 'Ship mode', filterKey: 'shipMode', sortKey: 'shipMode' },
  { key: 'styleName', title: 'Style name', filterKey: 'styleName', sortKey: 'styleName', minWidth: 160, maxWidth: 260 },
  { key: 'styleNo', title: 'Style No', filterKey: 'styleNo', sortKey: 'styleNo', format: 'code', maxWidth: 260 },
  { key: 'color', title: 'Màu', filterKey: 'color', sortKey: 'color', maxWidth: 200 },
  { key: 'etdActual', title: 'ETD-Actual', filterKey: 'etdActual', sortKey: 'etdActual', format: 'date' },
  { key: 'etdRevised', title: 'ETD-Revised', filterKey: 'etdRevised', sortKey: 'etdRevised', format: 'date' },
  { key: 'factoryName', title: 'Nhà máy SX', filterKey: 'factoryName', sortKey: 'factoryName' },
  { key: 'branchCode', title: 'Đơn vị cơ sở', filterKey: 'branchCode', sortKey: 'branchCode' },
];
const NAMES = Object.fromEntries(COLUMNS.map((c) => [c.key, c.title]));
const NO_STRINGS: string[] = [];
/** Cùng thứ tự với máy chủ (po-allocation.service.ts): cột mặc định là cột đầu tiên người xem được xem nguyên giá trị */
const SORT_PRIORITY = ['etdRevised', 'etdActual', 'brand', 'season', 'po', 'so', 'shipMode', 'styleName', 'styleNo', 'color', 'factoryName', 'branchCode'];

type Level = ReturnType<FieldPolicy['level']>;

/**
 * Cột Đơn vị cơ sở hiện tên ĐVCS (rê chuột thấy mã), kể cả chữ trong popup lọc; nhà máy chưa gắn ĐVCS thì "–" như ô trống
 * khác. Không dùng withBranchNames: hàm đó coi mọi dòng đều có ĐVCS. ĐVCS suy ra từ Nhà máy SX nên theo cả mức của cột đó
 * (`factoryLevel`, máy chủ cũng làm vậy): Ẩn thì không có cột, Che thì không lọc, không sắp xếp được.
 */
function withBranchColumn(branchName: (code: string | null | undefined) => string, factoryLevel: Level): Column<PoAllocation>[] {
  return COLUMNS.flatMap((c): Column<PoAllocation>[] => {
    if (c.key !== 'branchCode') return [c];
    if (factoryLevel === 'HIDDEN') return [];
    const blind = factoryLevel === 'MASKED';
    return [
      {
        ...c,
        filterKey: blind ? undefined : c.filterKey,
        sortKey: blind ? undefined : c.sortKey,
        filterLabel: (v) => branchName(String(v)),
        render: (r) => {
          if (r.branchCode === MASK) return <Masked />;
          if (!r.branchCode) return <span className="cell-empty">–</span>;
          const name = branchName(r.branchCode);
          return name !== r.branchCode ? <span title={r.branchCode}>{name}</span> : name;
        },
      },
    ];
  });
}

/** Brand, Season để chọn ở dải lọc (cột bị Ẩn hoặc Che thì máy chủ trả rỗng, dải lọc không hiện ô đó) */
function useOptions() {
  const can = useCan(`${RESOURCE}:view`);
  const q = useQuery({
    queryKey: ['order', 'po-allocations', 'options'],
    queryFn: () => api<{ brands: string[]; seasons: string[] }>(`${PATH}/options`),
    enabled: can,
    staleTime: 60_000,
  });
  return { brands: q.data?.brands ?? NO_STRINGS, seasons: q.data?.seasons ?? NO_STRINGS };
}

interface FilterProps {
  value: OrderFilter;
  onChange: (f: OrderFilter) => void;
  policy: FieldPolicy;
  columns: { names: string[]; onClear: () => void };
}

/**
 * Dải lọc theo cột của OSM. Dùng chung bộ lọc trên URL với các lưới Đơn hàng: `customer` là Brand, `style` là mã hàng (Style No
 * hoặc Style name), `q` là PO hoặc SO. Ngày ETD lọc bằng mũi tên trên tiêu đề cột (gõ "10/2026" để chọn cả tháng).
 */
function PoAllocationFilters({ value, onChange, policy, columns }: FilterProps) {
  const { brands, seasons } = useOptions();
  const set = (patch: Partial<OrderFilter>) => onChange({ ...value, ...patch });
  const dirty = Object.values(value).some(Boolean) || columns.names.length > 0;
  return (
    <Group gap="sm" align="flex-end" wrap="wrap" className="filter-bar">
      {readable(policy, 'brand') && (
        <Select label="Brand" placeholder="Tất cả" data={brands} value={value.customer || null} onChange={(v) => set({ customer: v ?? '' })} searchable clearable nothingFoundMessage="Không có brand nào khớp" w={180} />
      )}
      {readable(policy, 'season') && <Select label="Season" placeholder="Tất cả" data={seasons} value={value.season || null} onChange={(v) => set({ season: v ?? '' })} searchable clearable w={130} />}
      {(readable(policy, 'styleNo') || readable(policy, 'styleName')) && (
        <DebouncedTextInput label="Mã hàng" placeholder="Style No hoặc Style name" leftSection={<IconSearch size={14} />} value={value.style} onChange={(v) => set({ style: v })} w={210} />
      )}
      {(readable(policy, 'po') || readable(policy, 'so')) && <DebouncedTextInput label="PO, SO" placeholder="Gõ một phần số PO hoặc SO" value={value.q} onChange={(v) => set({ q: v })} w={210} />}
      <ColumnFilterNote names={columns.names} />
      {dirty && (
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconFilterOff size={15} />}
          onClick={() => {
            onChange(emptyFilter);
            columns.onClear();
          }}
        >
          Xóa lọc
        </Button>
      )}
    </Group>
  );
}

/** Lần chép dữ liệu OSM gần nhất: màn đọc bản chép, không đọc thẳng OSM, nên người xem cần biết dữ liệu mới tới lúc nào */
function SyncedAt({ at }: { at: string | null | undefined }) {
  if (!at) return null;
  return (
    <Group gap={6} wrap="nowrap" c="dimmed" title={`Dữ liệu chép từ OSM, mới tới lần đồng bộ này. Muốn mới hơn, chạy đồng bộ nguồn "${SOURCE_NAME}".`}>
      <IconCloudDownload size={16} stroke={1.7} aria-hidden />
      <Text size="sm">Đồng bộ OSM lúc {fmtDateTime(at)}</Text>
    </Group>
  );
}

/** Lưới rỗng khi chưa đồng bộ nguồn OSM lần nào: chỉ cách có dữ liệu. Nguồn đang tắt (máy chủ chưa khai database OSM) thì nhờ IT */
function NotSynced({ sourceActive }: { sourceActive: boolean }) {
  const canSync = useCan('admin.sync:update');
  return (
    <Stack align="center" gap={6} maw={460}>
      <span>Chưa có dữ liệu phân bổ PO từ OSM.</span>
      <Text size="sm" c="dimmed" ta="center">
        {!sourceActive ? (
          <span title="Khai DB_OSM_APP_NAME (và DB_OSM_APP_SERVER) trong backend/.env rồi chạy npm run migrate">
            Máy chủ chưa được cấu hình để lấy dữ liệu này từ OSM. Nhờ bộ phận IT cấu hình rồi đồng bộ.
          </span>
        ) : canSync ? (
          <>
            Vào{' '}
            <Anchor component={Link} to="/admin/sync" size="sm">
              Đồng bộ dữ liệu
            </Anchor>
            , chạy nguồn "{SOURCE_NAME}" rồi mở lại màn này.
          </>
        ) : (
          <>Nhờ quản trị viên chạy đồng bộ nguồn "{SOURCE_NAME}".</>
        )}
      </Text>
    </Stack>
  );
}

/** Màn "Phân bổ PO": PO được phân cho nhà máy SX nào, theo OSM. Chỉ xem, dữ liệu dùng chung toàn công ty. */
export default function PoAllocationPage() {
  const policy = useFieldPolicy(RESOURCE);
  const branchName = useBranchName();
  const factoryLevel = policy.level('factoryName');
  // ĐVCS suy ra từ Nhà máy SX: không xem được Nhà máy SX thì cũng không xem được ĐVCS (máy chủ cũng tính như vậy)
  const factoryBlind = factoryLevel === 'HIDDEN' || factoryLevel === 'MASKED';
  const canRead = (f: string) => readable(policy, f) && !(f === 'branchCode' && factoryBlind);
  const firstReadable = SORT_PRIORITY.find(canRead);
  const defaultSort = firstReadable ? `${firstReadable}:${firstReadable.startsWith('etd') ? 'desc' : 'asc'}` : 'etdRevised:desc';
  // Câu nhắc chính sách cột kể cả cột ĐVCS đi theo Nhà máy SX
  const hintPolicy = useMemo(
    () => (factoryLevel === 'HIDDEN' ? { ...policy, hidden: [...policy.hidden, 'branchCode'] } : factoryLevel === 'MASKED' ? { ...policy, masked: [...policy.masked, 'branchCode'] } : policy),
    [policy, factoryLevel],
  );
  const columns = useMemo(() => withBranchColumn(branchName, factoryLevel), [branchName, factoryLevel]);
  const list = usePagedList<PoAllocation>('po-allocations', PATH, defaultSort);
  const columnNote = list.columnsOf(NAMES, policy);
  if (factoryBlind) columnNote.names = columnNote.names.filter((n) => n !== NAMES.branchCode);
  const data = list.query.data as PoAllocationPage | undefined;
  const items = data?.items ?? [];
  // Trang đã tải mà máy chủ chưa từng chép nguồn này: hướng dẫn đồng bộ thay vì câu rỗng thường
  const notSynced = !!data && data.syncedAt === null;

  return (
    <WorkPage
      title="Phân bổ PO"
      subtitle="PO được phân cho nhà máy sản xuất nào, theo OSM. Dữ liệu dùng chung toàn công ty, chỉ xem. Đơn vị cơ sở lấy theo danh mục Nhà máy SX."
      aggregateNote={false}
      actions={
        <>
          <SyncedAt at={data?.syncedAt} />
          <PolicyHint policy={hintPolicy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="phan-bo-po.csv" />
        </>
      }
      filters={<PoAllocationFilters value={list.filter} onChange={list.setFilter} policy={policy} columns={columnNote} />}
    >
      <DataGrid
        label="Phân bổ PO"
        fill
        columns={columns}
        rows={items}
        rowKey={(r) => r.rowNo}
        policy={policy}
        loading={list.query.isFetching}
        error={list.error}
        onRetry={() => void list.query.refetch()}
        indexOffset={(list.page - 1) * list.pageSize}
        sort={list.sort}
        onSort={list.setSort}
        {...list.grid}
        empty={notSynced ? <NotSynced sourceActive={data.sourceActive} /> : <EmptyState filtered={list.filtered} what="dòng phân bổ PO" onClear={list.clearFilter} hint="OSM chưa có dòng phân bổ PO nào." />}
        footer={<Pager page={list.page} pageSize={list.pageSize} total={data?.total ?? 0} onPage={list.setPage} />}
      />
    </WorkPage>
  );
}
