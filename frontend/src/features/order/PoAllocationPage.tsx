import { Alert, Anchor, Badge, Button, Group, Loader, Modal, Radio, Select, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconBuildingFactory2, IconCloudDownload, IconFilterOff, IconRefresh, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName } from '../../components/BranchName';
import { ColumnFilterNote } from '../../components/ColumnFilter';
import { DataGrid, Masked, type Column } from '../../components/DataGrid';
import { DebouncedTextInput } from '../../components/DebouncedInput';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { WorkPage } from '../../components/WorkPage';
import { EmptyState } from '../../components/EmptyState';
import { ExportButton } from '../../components/ExportButton';
import { useAfterClose } from '../../lib/afterClose';
import { api, ApiError } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { MASK, readable, useFieldPolicy, type FieldPolicy } from '../../lib/fieldPolicy';
import { fmtDateTime, fmtNum } from '../../lib/format';
import { toastOk } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { emptyFilter, usePagedList, type OrderFilter } from '../../lib/pagedList';
import { useCan, useCanWrite } from '../../shell/permissions';
import { useSession } from '../../store/session';
import type { PoAllocation, PoAllocationFactoryResult, PoAllocationOptions, PoAllocationPage, PoAllocationRefreshNotice } from './api';

const RESOURCE = 'order.poallocation';
const PATH = '/order/po-allocations';
/** Tên nguồn ở màn Đồng bộ dữ liệu (SyncSource.Name của OSM.OSMData) */
const SOURCE_NAME = 'Phân bổ PO theo nhà máy (OSM)';
/** Cột suy ra từ Nhà máy SX: theo cả mức của cột đó (máy chủ cũng tính như vậy) */
const FACTORY_DERIVED = ['branchCode', 'isFactoryManual', 'osmFactoryName', 'isInOsm'];
/** Vạch cam ở ô Nhà máy SX của dòng nhập tay: nhìn lướt cột là thấy giá trị nào do người dùng đặt (cam chỉ làm vạch) */
const MANUAL_BAR: CSSProperties = { borderLeft: '3px solid var(--brand)', paddingLeft: 6, display: 'inline-block' };
const SOFT: CSSProperties = { color: 'var(--app-ink-soft)' };

/** Nhà máy SX; dòng nhập tay mang vạch cam (cột Nhập tay nói bằng chữ, không chỉ bằng màu) */
function FactoryCell({ r }: { r: PoAllocation }) {
  if (r.factoryName == null) return <span className="cell-empty">–</span>;
  if (r.isFactoryManual !== true) return <>{r.factoryName}</>;
  return (
    <span style={MANUAL_BAR} title="Nhập tay: đồng bộ OSM lại vẫn giữ nhà máy này">
      {r.factoryName}
    </span>
  );
}

/** Dấu nhập tay; nhà máy theo OSM khi khác giá trị nhập tay; dòng chỉ còn vì nhập tay (OSM không còn khóa đó) */
function ManualCell({ r }: { r: PoAllocation }) {
  if (r.isFactoryManual !== true) return <span className="cell-empty">–</span>;
  const osm = r.osmFactoryName;
  return (
    <Group gap={6} wrap="nowrap">
      <Badge size="sm" variant="light" color="link">
        Nhập tay
      </Badge>
      {r.isInOsm === false ? (
        <Badge size="sm" variant="light" color="orange" title="OSM không còn dòng nào cùng SO, PO, Style No, Màu. Dòng được giữ vì đang nhập tay; chọn Theo OSM để bỏ.">
          Không còn trong OSM
        </Badge>
      ) : (
        // Vắng (cột bị Ẩn) hoặc bị Che thì không nói gì về nhà máy theo OSM
        osm !== undefined &&
        osm !== MASK &&
        osm !== r.factoryName && (
          <Text span size="xs" style={SOFT} title="Nhà máy SX theo OSM ở lần đồng bộ gần nhất">
            OSM: {osm ?? '–'}
          </Text>
        )
      )}
    </Group>
  );
}

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
  { key: 'factoryName', title: 'Nhà máy SX', filterKey: 'factoryName', sortKey: 'factoryName', render: (r) => <FactoryCell r={r} /> },
  {
    key: 'isFactoryManual',
    title: 'Nhập tay',
    filterKey: 'isFactoryManual',
    sortKey: 'isFactoryManual',
    filterLabel: (v) => (Number(v) === 1 ? 'Nhập tay' : 'Theo OSM'),
    render: (r) => <ManualCell r={r} />,
  },
  { key: 'branchCode', title: 'Đơn vị cơ sở', filterKey: 'branchCode', sortKey: 'branchCode' },
];
const NAMES = Object.fromEntries(COLUMNS.map((c) => [c.key, c.title]));
const NO_STRINGS: string[] = [];
const NO_FACTORIES: PoAllocationOptions['factories'] = [];
const NO_IDS: number[] = [];
const NO_ROWS: PoAllocation[] = [];
/** Cùng thứ tự với máy chủ (po-allocation.service.ts): cột mặc định là cột đầu tiên người xem được xem nguyên giá trị */
const SORT_PRIORITY = ['etdRevised', 'etdActual', 'brand', 'season', 'po', 'so', 'shipMode', 'styleName', 'styleNo', 'color', 'factoryName', 'branchCode', 'osmFactoryName', 'isFactoryManual', 'isInOsm'];
/** Lý do nút Đổi nhà máy SX bị khóa khi chưa tích dòng nào */
const PICK_ROWS = 'Tích chọn các dòng cần đổi trong lưới trước';

type Level = ReturnType<FieldPolicy['level']>;

/**
 * Cột suy ra từ Nhà máy SX (Đơn vị cơ sở, Nhập tay) theo cả mức của cột đó (`factoryLevel`): Ẩn thì không có cột, Che thì không
 * lọc, không sắp xếp được. Cột Đơn vị cơ sở hiện tên ĐVCS (rê chuột thấy mã), kể cả chữ trong popup lọc; nhà máy chưa gắn ĐVCS
 * thì "–" như ô trống khác. Không dùng withBranchNames: hàm đó coi mọi dòng đều có ĐVCS.
 */
function withFactoryColumns(branchName: (code: string | null | undefined) => string, factoryLevel: Level): Column<PoAllocation>[] {
  const blind = factoryLevel === 'MASKED';
  return COLUMNS.flatMap((c): Column<PoAllocation>[] => {
    if (!FACTORY_DERIVED.includes(c.key)) return [c];
    if (factoryLevel === 'HIDDEN') return [];
    const derived = { ...c, filterKey: blind ? undefined : c.filterKey, sortKey: blind ? undefined : c.sortKey };
    if (c.key !== 'branchCode') return [derived];
    return [
      {
        ...derived,
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

/** Brand, Season để chọn ở dải lọc, nhà máy đang dùng cho popup Đổi nhà máy SX (cột bị Ẩn hoặc Che thì máy chủ trả rỗng) */
function useOptions() {
  const can = useCan(`${RESOURCE}:view`);
  const q = useQuery({
    queryKey: ['order', 'po-allocations', 'options'],
    queryFn: () => api<PoAllocationOptions>(`${PATH}/options`),
    enabled: can,
    staleTime: 60_000,
  });
  return { brands: q.data?.brands ?? NO_STRINGS, seasons: q.data?.seasons ?? NO_STRINGS, factories: q.data?.factories ?? NO_FACTORIES };
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

/**
 * Lần làm mới theo OSM gần nhất không làm đủ (bảng chép rỗng, hoặc số dòng giảm bất thường nên giữ dòng không còn trong OSM): dữ liệu
 * trên lưới có thể chưa khớp OSM. Mọi thông tin là chữ (điện thoại không rê chuột được). Người chạy được đồng bộ thấy cách xử lý
 * (kiểm OSM, hoặc cho qua bằng cấu hình máy chủ); người khác chỉ được nhắc báo quản trị.
 */
function RefreshWarning({ notice }: { notice: PoAllocationRefreshNotice }) {
  const canSync = useCan('admin.sync:update');
  const at = fmtDateTime(notice.at);
  const empty = notice.reason === 'EMPTY';
  return (
    <Alert color="orange" variant="light" icon={<IconAlertTriangle size={16} />} py={8} mb="xs" maw={760} title={empty ? 'Dữ liệu OSM chưa được làm mới' : 'Dữ liệu OSM có thể chưa khớp'}>
      <Stack gap={4}>
        {empty ? (
          <span>Lần làm mới lúc {at} bị bỏ qua vì bảng chép OSM không có dòng nào; lưới vẫn là dữ liệu của lần trước.</span>
        ) : (
          <>
            <span>
              Lần làm mới lúc {at} giữ lại {fmtNum(notice.keptAbsent)} dòng không còn trong OSM vì số dòng giảm quá {notice.maxShrinkPercent}%. Lưới có thể có
              cả dòng cũ lẫn dòng mới của cùng PO cho tới lần làm mới đủ.
            </span>
            <Text size="sm" style={SOFT}>
              OSM có {fmtNum(notice.sourceRows)} dòng; lần làm mới đủ gần nhất có {fmtNum(notice.previousRows)} dòng.
            </Text>
          </>
        )}
        {!canSync ? (
          <span>Báo quản trị kiểm OSM.</span>
        ) : empty ? (
          <Text size="sm">Kiểm view OSM rồi chạy lại đồng bộ nguồn "{SOURCE_NAME}".</Text>
        ) : (
          <Text size="sm">
            Kiểm dữ liệu OSM rồi chạy lại đồng bộ. Nếu OSM thật sự bớt PO: đặt PO_ALLOCATION_MAX_SHRINK_PERCENT=100 trong cấu hình máy chủ, khởi động lại backend rồi
            đồng bộ lại (sau đó trả về giá trị cũ).
          </Text>
        )}
      </Stack>
    </Alert>
  );
}

/** "Đã chọn N dòng" ở chân lưới, kèm nút bỏ chọn */
function Picked({ count, onClear }: { count: number; onClear: () => void }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm">
        Đã chọn <b>{fmtNum(count)}</b> dòng
      </Text>
      <Button size="xs" variant="subtle" onClick={onClear}>
        Bỏ chọn
      </Button>
    </Group>
  );
}

type Mode = 'manual' | 'osm';

/**
 * Ô chọn nhà máy gom theo đơn vị cơ sở: ĐVCS đang làm việc trước, rồi ĐVCS khác theo tên, nhà máy chưa gắn ĐVCS cuối. Nhà máy
 * của ĐVCS nào cũng chọn được (máy chủ chỉ chặn dòng hiện thuộc nhà máy của ĐVCS khác).
 */
function factoryGroups(factories: PoAllocationOptions['factories'], current: string | undefined, branchName: (code: string | null | undefined) => string) {
  const codes = [...new Set(factories.map((f) => f.branchCode))].sort((a, b) => {
    const rank = (c: string | null) => (c === current ? 0 : c ? 1 : 2);
    return rank(a) - rank(b) || branchName(a).localeCompare(branchName(b), 'vi');
  });
  return codes.map((code) => ({
    group: code ? branchName(code) : 'Chưa gắn đơn vị cơ sở',
    items: factories.filter((f) => f.branchCode === code).map((f) => ({ value: f.code, label: f.name === f.code ? f.code : `${f.name} (${f.code})` })),
  }));
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Không kết nối được máy chủ. Thử lại sau.');

/**
 * Popup đổi Nhà máy SX cho các dòng đã tích: hỏi máy chủ trước số dòng sẽ bị áp (mọi dòng cùng SO, PO, Style No, Màu với dòng đã
 * chọn, kể cả dòng ở trang khác), rồi mới cho lưu. Máy chủ từ chối (dòng thuộc nhà máy của ĐVCS khác…) thì nói lý do ngay trong popup.
 */
function ChangeFactoryDialog({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: () => void }) {
  const mobile = useMobile();
  const branchName = useBranchName();
  const current = useSession((s) => s.branch?.code);
  const { factories } = useOptions();
  const groups = useMemo(() => factoryGroups(factories, current, branchName), [factories, current, branchName]);
  const [mode, setMode] = useState<Mode>('manual');
  const [factory, setFactory] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: ['order', 'po-allocations', 'factory-preview', ids],
    queryFn: () => api<PoAllocationFactoryResult>(`${PATH}/factory`, { method: 'PUT', body: { ids, dryRun: true } }),
    staleTime: 0,
    gcTime: 0,
  });
  const save = useMutation({
    mutationFn: () => api<PoAllocationFactoryResult>(`${PATH}/factory`, { method: 'PUT', body: { ids, factoryName: mode === 'osm' ? null : factory } }),
    onSuccess: (r) => {
      const name = factories.find((f) => f.code === factory)?.name ?? factory;
      toastOk(
        mode === 'osm'
          ? `Đã trả ${fmtNum(r.rows)} dòng về Nhà máy SX theo OSM.${r.removed ? ` Bỏ ${fmtNum(r.removed)} dòng không còn trong OSM.` : ''}`
          : `Đã đổi Nhà máy SX của ${fmtNum(r.rows)} dòng sang ${name}.`,
        'Đã đổi nhà máy SX',
      );
      onClose();
      onDone();
    },
  });
  const dirty = mode !== 'manual' || factory !== null;
  const close = () => confirmDiscard(dirty, onClose);
  const blocked = preview.isPending
    ? 'Đang đếm số dòng sẽ đổi'
    : preview.error
      ? 'Không đổi được các dòng này, xem lý do trong popup'
      : mode === 'manual' && !factory
        ? 'Chọn nhà máy SX mới'
        : null;

  return (
    <Modal opened onClose={close} size="md" fullScreen={mobile} title="Đổi nhà máy SX">
      <Stack gap="md">
        {preview.isPending ? (
          <Group gap={8}>
            <Loader size="xs" />
            <Text size="sm">Đang đếm số dòng sẽ đổi…</Text>
          </Group>
        ) : preview.error ? (
          <Alert color="red" variant="light" title="Không đổi được các dòng đã chọn" maw={520}>
            <Stack gap={8} align="flex-start">
              <span>{errorText(preview.error)}</span>
              <Button size="xs" variant="default" leftSection={<IconRefresh size={14} />} loading={preview.isFetching} onClick={() => void preview.refetch()}>
                Thử lại
              </Button>
            </Stack>
          </Alert>
        ) : (
          <div>
            <Text size="sm">
              Sẽ áp cho <b>{fmtNum(preview.data.rows)} dòng</b> ({fmtNum(preview.data.keys)} nhóm SO/PO/Style/Màu).
            </Text>
            <Text size="xs" mt={4} style={SOFT} maw={520}>
              Bạn chọn {fmtNum(ids.length)} dòng; mọi dòng cùng SO, PO, Style No, Màu với chúng đổi cùng lúc, kể cả dòng ở trang khác.
            </Text>
          </div>
        )}
        <Radio.Group label="Nhà máy SX mới" value={mode} onChange={(v) => setMode(v as Mode)}>
          <Stack gap={8} mt={6}>
            <Radio value="manual" label="Chọn nhà máy" description="Đồng bộ OSM lại vẫn giữ nhà máy đã chọn." />
            <Radio value="osm" label="Theo OSM (bỏ nhập tay)" description="Trở lại nhà máy theo OSM. Dòng không còn trong OSM sẽ bị bỏ." />
          </Stack>
        </Radio.Group>
        {mode === 'osm' && !!preview.data?.removable && (
          <Alert color="orange" variant="light" py={8} maw={520}>
            {fmtNum(preview.data.removable)} dòng nhập tay không còn trong OSM sẽ bị bỏ khỏi Phân bổ PO.
          </Alert>
        )}
        {mode === 'manual' && (
          <Select
            label="Nhà máy"
            placeholder="Gõ để tìm nhà máy"
            data={groups}
            value={factory}
            onChange={setFactory}
            searchable
            withAsterisk
            className="field-required"
            nothingFoundMessage="Không có nhà máy nào khớp"
          />
        )}
        {save.error && (
          <Alert color="red" variant="light" title="Chưa đổi được nhà máy SX" maw={520}>
            {errorText(save.error)}
          </Alert>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={close}>
            Hủy
          </Button>
          <ActionButton leftSection={<IconBuildingFactory2 size={15} />} loading={save.isPending} blockedReason={blocked} onClick={() => save.mutate()}>
            Đổi nhà máy SX
          </ActionButton>
        </Group>
      </Stack>
    </Modal>
  );
}

/**
 * Màn "Phân bổ PO": PO được phân cho nhà máy SX nào, theo OSM. Dữ liệu dùng chung toàn công ty. Người có quyền Sửa đổi được Nhà máy
 * SX của các dòng đã tích (đồng bộ OSM lại vẫn giữ); ở đơn vị tổng hợp chỉ xem.
 */
export default function PoAllocationPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branchName = useBranchName();
  const factoryLevel = policy.level('factoryName');
  // Cột suy ra từ Nhà máy SX: không xem được Nhà máy SX thì cũng không xem được chúng (máy chủ cũng tính như vậy)
  const factoryBlind = factoryLevel === 'HIDDEN' || factoryLevel === 'MASKED';
  const canRead = (f: string) => readable(policy, f) && !(FACTORY_DERIVED.includes(f) && factoryBlind);
  const firstReadable = SORT_PRIORITY.find(canRead);
  const defaultSort = firstReadable ? `${firstReadable}:${firstReadable.startsWith('etd') ? 'desc' : 'asc'}` : 'etdRevised:desc';
  // Câu nhắc chính sách cột kể cả các cột đi theo Nhà máy SX
  const hintPolicy = useMemo(() => {
    const derived = ['branchCode', 'isFactoryManual'];
    if (factoryLevel === 'HIDDEN') return { ...policy, hidden: [...policy.hidden, ...derived] };
    if (factoryLevel === 'MASKED') return { ...policy, masked: [...policy.masked, ...derived] };
    return policy;
  }, [policy, factoryLevel]);
  const columns = useMemo(() => withFactoryColumns(branchName, factoryLevel), [branchName, factoryLevel]);
  const list = usePagedList<PoAllocation>('po-allocations', PATH, defaultSort);
  const columnNote = list.columnsOf(NAMES, policy);
  if (factoryBlind) columnNote.names = columnNote.names.filter((n) => n !== NAMES.branchCode && n !== NAMES.isFactoryManual);
  const data = list.query.data as PoAllocationPage | undefined;
  const items = data?.items ?? NO_ROWS;
  // Trang đã tải mà máy chủ chưa từng chép nguồn này: hướng dẫn đồng bộ thay vì câu rỗng thường
  const notSynced = !!data && data.syncedAt === null;

  // Đổi Nhà máy SX: có quyền Sửa, không ở đơn vị tổng hợp, xem được Nhà máy SX; cột đó Chỉ đọc thì nút khóa kèm lý do
  const canWrite = useCanWrite(`${RESOURCE}:update`);
  const canChange = canWrite && !factoryBlind;
  const readonlyReason = factoryLevel === 'READONLY' ? 'Bạn chỉ được xem cột Nhà máy SX. Nhờ quản trị viên mở ở Chính sách cột nếu cần.' : null;
  // Dòng đã tích chỉ có hiệu lực ở trang, thứ tự, bộ lọc lúc tích: đổi trang, lọc là bỏ chọn (không đổi nhầm dòng không thấy)
  const context = `${list.exportPath}#${list.page}`;
  const [picked, setPicked] = useState<{ context: string; ids: number[] }>({ context: '', ids: NO_IDS });
  const checked = useMemo(() => {
    if (picked.context !== context) return NO_IDS;
    const visible = new Set(items.map((r) => r.id));
    return picked.ids.filter((id) => visible.has(id));
  }, [picked, context, items]);
  const [dialog, setDialog] = useState<number[] | null>(null);
  const refreshAfterClose = useAfterClose(() => qc.invalidateQueries({ queryKey: ['order', 'po-allocations'] }));

  return (
    <WorkPage
      title="Phân bổ PO"
      subtitle="PO được phân cho nhà máy sản xuất nào, theo OSM. Dữ liệu dùng chung toàn công ty; Đơn vị cơ sở lấy theo danh mục Nhà máy SX. Nhà máy SX đổi tay được, đồng bộ OSM lại vẫn giữ."
      actions={
        <>
          <SyncedAt at={data?.syncedAt} />
          <PolicyHint policy={hintPolicy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="phan-bo-po.csv" />
          {canChange && (
            <ActionButton leftSection={<IconBuildingFactory2 size={15} />} blockedReason={readonlyReason ?? (checked.length ? null : PICK_ROWS)} onClick={() => setDialog(checked)}>
              Đổi nhà máy SX
            </ActionButton>
          )}
        </>
      }
      filters={<PoAllocationFilters value={list.filter} onChange={list.setFilter} policy={policy} columns={columnNote} />}
    >
      {data?.lastRefresh && <RefreshWarning notice={data.lastRefresh} />}
      <DataGrid
        label="Phân bổ PO"
        fill
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        policy={policy}
        loading={list.query.isFetching}
        error={list.error}
        onRetry={() => void list.query.refetch()}
        indexOffset={(list.page - 1) * list.pageSize}
        sort={list.sort}
        onSort={list.setSort}
        {...(canChange && !readonlyReason ? { checked, onCheck: (keys: (string | number)[]) => setPicked({ context, ids: keys.map(Number) }) } : {})}
        {...list.grid}
        empty={notSynced ? <NotSynced sourceActive={data.sourceActive} /> : <EmptyState filtered={list.filtered} what="dòng phân bổ PO" onClear={list.clearFilter} hint="OSM chưa có dòng phân bổ PO nào." />}
        footer={
          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={data?.total ?? 0}
            onPage={list.setPage}
            extra={checked.length ? <Picked count={checked.length} onClear={() => setPicked({ context: '', ids: NO_IDS })} /> : null}
          />
        }
      />
      {dialog && (
        <ChangeFactoryDialog
          ids={dialog}
          onClose={() => setDialog(null)}
          onDone={() => {
            setPicked({ context: '', ids: NO_IDS });
            refreshAfterClose();
          }}
        />
      )}
    </WorkPage>
  );
}
