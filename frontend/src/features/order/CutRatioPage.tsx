import { Alert, Button, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCheck, IconLockOpen, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { DataGrid, type Column } from '../../components/DataGrid';
import { Pager } from '../../components/Pager';
import { DateField } from '../../components/DateField';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetNumber, sheetText, type SheetColumn } from '../../components/SheetGrid';
import { WorkPage } from '../../components/WorkPage';
import { api } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { useAfterClose } from '../../lib/afterClose';
import { useFieldPolicy } from '../../lib/fieldPolicy';
import { fmtNum, qs, sumOf } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { useStableByKey } from '../../lib/useStable';
import { toastError, toastOk } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import type { Paged } from '../../lib/types';
import { useCan } from '../../shell/permissions';
import { useSession } from '../../store/session';
import { emptyFilter, type CutStyle, type Po, type PoColorSize, type SalesOrder } from './api';
import { EmptyState, ExportButton, filterParams, IssueList, loadError, OrderFilters, PO_STATUS, readable, StatusBadge, useCanWrite, useCustomers, useUrlFilter } from './common';
import { pageOf, useClampPage, useUrlParams } from '../../lib/useUrlParams';
import { useColumnFilters, valuesLoader } from '../../lib/columnFilter';
import { blank, checkColorSize, signature, SIZE_RULE, type ColorSizeCheck, type EditRow } from './cutRatioRules';

const RESOURCE = 'order.po';

const STYLE_COLS: Column<CutStyle>[] = [
  { key: 'customerName', title: 'Khách hàng', field: 'customerName', filterKey: 'customerName', minWidth: 140, maxWidth: 220 },
  { key: 'styleCode', title: 'Mã hàng', field: 'styleCode', filterKey: 'styleCode', format: 'code' },
  { key: 'branchCode', title: 'Chi nhánh FOB', field: null, filterKey: 'branchCode' },
  { key: 'poCount', title: 'Số PO', format: 'number', field: null },
  { key: 'statusCode', title: 'Trạng thái', field: 'statusCode', render: (s) => <StatusBadge map={PO_STATUS} code={s.statusCode} /> },
];
const PO_COLS: Column<Po>[] = [
  { key: 'poCode', title: 'Mã PO', format: 'code', filterKey: 'poCode' },
  { key: 'poNumber', title: 'PO#', format: 'code', filterKey: 'poNumber' },
  { key: 'qty', title: 'Số lượng', format: 'number', filterKey: 'qty' },
  { key: 'syncedAt', title: 'Ngày đồng bộ', format: 'date', filterKey: 'syncedAt' },
  { key: 'shipDate', title: 'Ngày xuất hàng', format: 'date', filterKey: 'shipDate' },
  { key: 'destination', title: 'Đích đến', filterKey: 'destination' },
  { key: 'packingListCode', title: 'Mã PKL', filterKey: 'packingListCode' },
  { key: 'customsDeclarationNo', title: 'Số tờ khai', filterKey: 'customsDeclarationNo' },
  { key: 'statusCode', title: 'Trạng thái', filterKey: 'statusCode', filterLabel: (v) => PO_STATUS[v]?.label ?? String(v), render: (p) => <StatusBadge map={PO_STATUS} code={p.statusCode} /> },
  { key: 'createdAt', title: 'Ngày tạo', format: 'datetime', filterKey: 'createdAt' },
];
const NAMES = Object.fromEntries([...PO_COLS, ...STYLE_COLS].map((c) => [c.key, c.title]));
/** 100 dòng đầu mỗi lưới, mới tạo lên trước; xem thêm thì sang trang */
const PAGE_SIZE = 100;
const PICK_PO = 'Chọn một PO trong lưới trước';

let nextKey = 1;
const newRow = (): EditRow => ({ key: nextKey++, colorName: '', sizeName: '', qty: null });
const copyRow = (r: EditRow): EditRow => ({ ...r, key: nextKey++ });
const NO_POS: Po[] = [];
const NO_LINES: PoColorSize[] = [];

function colorSizeColumns(bad: ColorSizeCheck['bad']): SheetColumn<EditRow>[] {
  return [
    sheetText<EditRow>('colorName', 'Màu SP', { required: true, minWidth: 160, grow: 2, error: (r) => bad.color.has(r.key) }),
    sheetText<EditRow>('sizeName', 'Cỡ sản phẩm', { required: true, minWidth: 110, error: (r) => bad.size.has(r.key) }),
    sheetNumber<EditRow>('qty', 'Số lượng', { required: true, minWidth: 110, error: (r) => bad.qty.has(r.key) }),
  ];
}

/** Lưới nhập màu cỡ của PO (sửa tỷ lệ, thêm PO): dán thẳng ba cột Màu, Cỡ, Số lượng từ Excel; ô sai tô đỏ. */
function useColorSizeSheet(rows: EditRow[]) {
  const check = useMemo(() => checkColorSize(rows), [rows]);
  // Lưới vẽ lại mọi ô khi nhận cột mới: chỉ dựng lại khi tập ô lỗi đổi (dòng trùng nằm ở dòng khác dòng vừa sửa)
  const cols = useRef<{ sig: string; columns: SheetColumn<EditRow>[] } | null>(null);
  if (cols.current?.sig !== check.sig) cols.current = { sig: check.sig, columns: colorSizeColumns(check.bad) };
  return { check, columns: cols.current.columns };
}

/** Thông báo các dòng màu cỡ chưa lưu được */
function ColorSizeIssues({ check }: { check: ColorSizeCheck }) {
  if (check.issues.length === 0) return null;
  return (
    <Alert className="sheet-issues" color="red" variant="light" icon={<IconAlertCircle size={16} />} py={6}>
      Sửa các ô tô đỏ trước khi lưu (dòng trống hoàn toàn được bỏ qua):
      <IssueList items={check.issues} />
      {check.badSize && (
        <Text size="xs" mt={4}>
          {SIZE_RULE}
        </Text>
      )}
    </Alert>
  );
}

interface Editing {
  po: Po;
  /** Màu cỡ lúc bắt đầu sửa */
  rows: EditRow[];
}

/**
 * Khung sửa tỷ lệ của một PO: giữ các dòng đang sửa trong chính nó, nên gõ một ô không vẽ lại cả trang (hai lưới mã hàng,
 * PO bên cạnh). Báo lên trang mỗi khi trạng thái "đã đổi" bật hoặc tắt, để trang hỏi lại khi chọn mã hàng, PO khác.
 */
function ColorSizeEditor({ po, initial, saving, onDirtyChange, onCancel, onSave }: {
  po: Po;
  initial: EditRow[];
  saving: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onCancel: () => void;
  onSave: (lines: ColorSizeCheck['lines']) => void;
}) {
  const [rows, setRows] = useState(initial);
  const [base] = useState(() => signature(initial));
  const { check, columns } = useColorSizeSheet(rows);
  const dirty = signature(rows) !== base;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const saveBlocked = check.issues.length > 0 ? 'Sửa các dòng được nêu trong thông báo đỏ trước khi lưu' : !dirty ? 'Chưa có thay đổi nào' : null;
  return (
    <>
      <div className="pane-title">
        <span>
          Chi tiết màu cỡ sản phẩm{' '}
          <Text span size="xs" c="dimmed" fw={400}>
            PO {po.poNumber}
            {check.total !== null && `, tổng ${fmtNum(check.total)}`}, đang sửa
          </Text>
        </span>
      </div>
      <ColorSizeIssues check={check} />
      <SheetGrid label="Sửa màu cỡ" value={rows} onChange={setRows} columns={columns} rowKey={(r) => r.key} createRow={newRow} duplicateRow={copyRow} />
      <Group justify="flex-end" gap="xs" mt={8}>
        <Button variant="default" onClick={() => confirmDiscard(dirty, onCancel)}>
          Hủy
        </Button>
        <ActionButton loading={saving} blockedReason={saveBlocked} onClick={() => onSave(check.lines)}>
          Lưu thay đổi
        </ActionButton>
      </Group>
    </>
  );
}

type Act = { kind: 'confirm' | 'unconfirm' | 'delete'; po: Po } | { kind: 'save'; po: Po; lines: ColorSizeCheck['lines'] };

/**
 * Màn "Cập nhật tỷ lệ cắt": lọc → bấm một mã hàng thì nạp danh sách PO → bấm một PO thì nạp chi tiết màu cỡ.
 * Sửa tỷ lệ (màu cỡ) khi PO chưa xác nhận; Xác nhận khóa tỷ lệ cho khâu cắt.
 */
export default function CutRatioPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const { customers } = useCustomers();
  // Bộ lọc, Người lập, mã hàng và PO đang chọn nằm trên URL: tải lại trang vẫn mở đúng chỗ
  const [url, patch] = useUrlParams();
  const { filter, setFilter, filtered } = useUrlFilter(url, patch);
  const mine = url.get('mine') === '1';
  const styleId = Number(url.get('so')) || null;
  const poId = Number(url.get('po')) || null;
  const [edit, setEdit] = useState<Editing | null>(null);
  // Khung sửa báo lên khi có thay đổi chưa lưu (chữ đang gõ nằm trong khung, không ở trang)
  const [editDirty, setEditDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const canWrite = useCanWrite(`${RESOURCE}:update`);
  const canDelete = useCanWrite(`${RESOURCE}:delete`);
  const canAddPo = useCanWrite(`${RESOURCE}:create`);
  // Thêm PO cần đọc khách hàng, mã hàng từ Thông tin đơn hàng
  const canViewOrders = useCan('order.allocation:view');
  const canCreate = canAddPo && canViewOrders;
  const p = filterParams(filter);
  // Lưới mã hàng (trang page, lọc theo cột cf) và lưới PO (trang ppage, lọc theo cột pcf) phân trang, lọc riêng
  const styleCols = useColumnFilters(url, patch);
  const poCols = useColumnFilters(url, patch, 'pcf', 'ppage');
  const page = pageOf(url);
  const poPage = pageOf(url, 'ppage');
  const rawStyleParams = { shipFrom: p.shipFrom, shipTo: p.shipTo, customer: p.customer, style: p.style, createdBy: mine ? 'me' : undefined, cf: styleCols.param };
  const styleParams = useStableByKey(rawStyleParams, JSON.stringify(rawStyleParams));
  const loadStyleValues = useMemo(() => valuesLoader('/order/cut-ratio/styles', styleParams), [styleParams]);

  const styles = useQuery({
    queryKey: ['order', 'cut-styles', branch?.code, page, styleParams],
    queryFn: () => api<Paged<CutStyle>>(`/order/cut-ratio/styles${qs({ ...styleParams, page, pageSize: PAGE_SIZE })}`),
    placeholderData: keepPreviousData,
  });
  useClampPage(styles.data, page, PAGE_SIZE, (n) => patch({ page: n > 1 ? n : null }));
  // Mã hàng, PO đang chọn lấy từ danh sách hiện tại: đổi lọc, đổi trang mà không còn trong lưới thì coi như chưa chọn.
  // Danh sách PO và màu cỡ gọi song song theo mã trên URL (mở link, F5 không phải chờ ba lượt nối tiếp); chỉ hiện khi
  // mã hàng, PO còn trong lưới. Máy chủ vẫn lọc theo nhà máy và phạm vi.
  const style = styles.data?.items.find((s) => s.salesOrderId === styleId) ?? null;
  const rawPoParams = { salesOrderId: styleId ?? undefined, cf: poCols.param };
  const poParams = useStableByKey(rawPoParams, JSON.stringify(rawPoParams));
  const loadPoValues = useMemo(() => valuesLoader('/order/cut-ratio/pos', poParams), [poParams]);
  const pos = useQuery({
    queryKey: ['order', 'cut-pos', poPage, poParams],
    queryFn: () => api<Paged<Po>>(`/order/cut-ratio/pos${qs({ ...poParams, page: poPage, pageSize: PAGE_SIZE })}`),
    enabled: styleId !== null,
    placeholderData: keepPreviousData,
  });
  useClampPage(style ? pos.data : undefined, poPage, PAGE_SIZE, (n) => patch({ ppage: n > 1 ? n : null }));
  const poItems = (style && pos.data?.items) || NO_POS;
  const po = poItems.find((x) => x.id === poId) ?? null;
  const detail = useQuery({
    queryKey: ['order', 'cut-colors', poId],
    queryFn: () => api<{ po: Po; lines: PoColorSize[] }>(`/order/cut-ratio/pos/${poId}/color-sizes`),
    enabled: poId !== null && styleId !== null,
  });
  // Đang sửa thì giữ PO đang sửa (kể cả khi đổi lọc làm PO đó rời khỏi lưới), không thì PO đang chọn
  const currentPo = edit?.po ?? (po ? (detail.data?.po ?? po) : null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['order'] });
  const refreshAfterClose = useAfterClose(refresh);

  useLeaveGuard(editDirty);
  const stopEdit = useCallback(() => setEdit(null), []);
  // Đang sửa tỷ lệ mà chọn mã hàng, PO khác: có thay đổi thì hỏi trước khi bỏ
  const leaveEdit = (go: () => void) =>
    confirmDiscard(editDirty, () => {
      setEdit(null);
      go();
    }, 'Tỷ lệ đang sửa của PO này chưa được lưu và sẽ mất.');
  const pickStyle = (s: CutStyle) => {
    if (s.salesOrderId !== styleId) leaveEdit(() => patch({ so: s.salesOrderId, po: null, ppage: null, pcf: null }));
  };
  const pickPo = (x: Po) => {
    if (x.id !== (edit?.po.id ?? poId)) leaveEdit(() => patch({ po: x.id }));
  };
  const clearAll = () => setFilter(emptyFilter, { mine: null, cf: null, pcf: null, page: null, ppage: null });

  const act = useMutation({
    mutationFn: async (a: Act) => {
      if (a.kind === 'delete') return api(`/order/cut-ratio/pos/${a.po.id}`, { method: 'DELETE' });
      if (a.kind === 'save') return api(`/order/cut-ratio/pos/${a.po.id}/color-sizes`, { method: 'PUT', body: { lines: a.lines } });
      return api(`/order/cut-ratio/pos/${a.po.id}/${a.kind}`, { method: 'POST' });
    },
    onSuccess: (_r, a) => {
      const no = a.po.poNumber;
      const msg = {
        confirm: `Đã xác nhận tỷ lệ cắt PO ${no}.`,
        unconfirm: `Đã hủy xác nhận PO ${no}. Có thể sửa tỷ lệ.`,
        delete: `Đã xóa PO ${no}.`,
        save: `Đã lưu tỷ lệ cắt PO ${no}.`,
      }[a.kind];
      toastOk(msg, a.kind === 'delete' ? 'Đã xóa' : 'Đã lưu');
      if (a.kind === 'delete') patch({ po: null });
      if (a.kind === 'save') setEdit(null);
      void refresh();
    },
    onError: (e, a) => toastError(e, a.kind === 'save' ? 'Chưa lưu được' : a.kind === 'delete' ? 'Chưa xóa được' : undefined),
  });
  const busy = (kind: Act['kind']) => act.isPending && act.variables?.kind === kind;

  const confirmed = currentPo?.statusCode === 'CONFIRMED';
  const lines = (po && detail.data?.lines) || NO_LINES;
  // Số lượng bị Che thì không có tổng (không hiện "tổng 0")
  const poTotal = sumOf(lines.map((l) => l.qty));
  const statusCode = currentPo?.statusCode ?? 'DRAFT';
  const viewCols = useMemo<Column<PoColorSize>[]>(
    () => [
      { key: 'colorName', title: 'Màu SP', field: null },
      { key: 'sizeName', title: 'Cỡ sản phẩm', field: null },
      { key: 'qty', title: 'Số lượng', format: 'number' },
      { key: 'status', title: 'Trạng thái', field: null, render: () => <StatusBadge map={PO_STATUS} code={statusCode} /> },
    ],
    [statusCode],
  );
  const styleColumns = useMemo(
    // Chi nhánh FOB của đơn hàng: đơn của ĐVCS khác vẫn sửa được tỷ lệ khi PO đã vào kế hoạch của đơn vị này (quyết định 7.2, 7.4)
    () => withBranchNames(STYLE_COLS, branchName),
    [branchName],
  );

  const startEdit = () => {
    if (!currentPo) return;
    const rows = lines.map((l) => ({ key: nextKey++, colorName: l.colorName, sizeName: l.sizeName, qty: typeof l.qty === 'number' ? l.qty : null }));
    setEdit({ po: currentPo, rows });
  };
  // Mọi PO trên màn đều sửa được ở đơn vị này (trong kế hoạch của đơn vị, hoặc nhập tay ở đây); PO đã vào kế hoạch thì không xóa
  const inPlan = !!(currentPo && poItems.find((x) => x.id === currentPo.id)?.inPlan);
  const editBlocked = !currentPo
    ? PICK_PO
    : !policy.editable('qty')
      ? 'Bạn chỉ được xem cột Số lượng nên không sửa được tỷ lệ'
      : confirmed
        ? 'PO đã xác nhận, hủy xác nhận trước khi sửa'
        : detail.isLoading
          ? 'Đang tải màu cỡ…'
          : !detail.isSuccess
            ? 'Chưa tải được màu cỡ của PO này'
            : null;
  const confirmBlocked = !currentPo
    ? PICK_PO
    : confirmed
      ? 'PO đã xác nhận'
      : detail.isLoading
        ? 'Đang tải màu cỡ…'
        : !detail.isSuccess
          ? 'Chưa tải được màu cỡ của PO này'
          : lines.length === 0
            ? 'PO chưa có màu cỡ, sửa tỷ lệ trước'
            : null;

  return (
    <WorkPage
      title="Cập nhật tỷ lệ cắt"
      subtitle={
        branch?.isAggregate
          ? 'Có PO đã đưa vào kế hoạch xuất hàng của mọi đơn vị cơ sở và PO nhập tay. Chế độ tổng hợp chỉ xem; sửa tỷ lệ ở đơn vị đã lập kế hoạch.'
          : `Chỉ có PO đã đưa vào kế hoạch xuất hàng của ${branchName(branch?.code)} và PO nhập tay ở đây. Chọn mã hàng, chọn PO rồi sửa số lượng theo màu cỡ; PO đã xác nhận bị khóa để khâu cắt dùng.`
      }
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={`/order/cut-ratio/pos/export${qs({ salesOrderId: style?.salesOrderId, shipFrom: p.shipFrom, shipTo: p.shipTo, customer: p.customer, style: p.style, cf: style ? poCols.param : undefined })}`} fileName="ty-le-cat.csv" />
        </>
      }
      filters={
        <OrderFilters
          policy={policy}
          value={filter}
          onChange={(f) => setFilter(f, { page: null, ppage: null })}
          customers={customers}
          extra={
            <Select
              label="Người lập"
              data={[{ value: 'all', label: 'Tất cả' }, { value: 'me', label: 'PO do tôi lập' }]}
              value={mine ? 'me' : 'all'}
              onChange={(v) => patch({ mine: v === 'me' ? 1 : null, page: null, ppage: null })}
              allowDeselect={false}
              w={150}
            />
          }
          extraActive={mine}
          onClearExtra={() => patch({ mine: null })}
          columns={{
            names: [
              ...Object.keys(styleCols.filters).filter((k) => readable(policy, k)).map((k) => `${NAMES[k] ?? k} (mã hàng)`),
              ...Object.keys(poCols.filters).filter((k) => readable(policy, k)).map((k) => `${NAMES[k] ?? k} (PO)`),
            ],
            onClear: () => patch({ cf: null, pcf: null, page: null, ppage: null }),
          }}
        />
      }
    >
      <div className="split-pane">
        <div className="pane">
          <div className="pane-title">Danh sách mã hàng <Text span size="xs" c="dimmed" fw={400}>{fmtNum(styles.data?.total ?? 0)} mã</Text></div>
          <DataGrid
            label="Danh sách mã hàng"
            fill
            dense
            columns={styleColumns}
            rows={styles.data?.items ?? []}
            rowKey={(s) => s.salesOrderId}
            policy={policy}
            loading={styles.isFetching}
            error={loadError(styles.error, 'Không tải được danh sách mã hàng.')}
            onRetry={() => void styles.refetch()}
            indexOffset={(page - 1) * PAGE_SIZE}
            columnFilters={styleCols.filters}
            onColumnFilter={styleCols.setFilter}
            loadValues={loadStyleValues}
            selectedKey={style?.salesOrderId}
            onRowClick={pickStyle}
            empty={<EmptyState filtered={filtered || mine || styleCols.active} what="mã hàng" onClear={clearAll} hint="Chưa có PO nào trong kế hoạch xuất hàng của đơn vị này. Lập kế hoạch ở Kế hoạch xuất hàng, PO đã chọn sẽ hiện ở đây." />}
            footer={styles.data && <Pager page={page} pageSize={PAGE_SIZE} total={styles.data.total} onPage={(n) => patch({ page: n > 1 ? n : null })} />}
          />
        </div>
        <div className="split-stack">
          <div className="pane">
            <div className="pane-title">
              <span>
                Danh sách PO {style && <Text span size="xs" c="dimmed" fw={400}>của {style.styleCode}</Text>}
              </span>
              {canCreate && style && (
                <ActionButton size="xs" variant="default" leftSection={<IconPlus size={14} />} onClick={() => setAdding(true)}>
                  Thêm PO
                </ActionButton>
              )}
            </div>
            <DataGrid
              label="Danh sách PO"
              fill
              dense
              columns={PO_COLS}
              rows={poItems}
              rowKey={(x) => x.id}
              policy={policy}
              loading={pos.isFetching && !!style}
              error={style ? loadError(pos.error, 'Không tải được danh sách PO.') : null}
              onRetry={() => void pos.refetch()}
              indexOffset={(poPage - 1) * PAGE_SIZE}
              columnFilters={poCols.filters}
              onColumnFilter={poCols.setFilter}
              loadValues={loadPoValues}
              selectedKey={edit?.po.id ?? po?.id}
              onRowClick={pickPo}
              empty={
                style ? (
                  <EmptyState filtered={poCols.active} what="PO" onClear={poCols.clear} hint="Mã hàng này chưa có PO." />
                ) : (
                  'Bấm một mã hàng ở bên trái để xem PO.'
                )
              }
              footer={style && pos.data && <Pager page={poPage} pageSize={PAGE_SIZE} total={pos.data.total} onPage={(n) => patch({ ppage: n > 1 ? n : null })} />}
            />
          </div>
          <div className="pane">
            {edit ? (
              <ColorSizeEditor
                key={edit.po.id}
                po={edit.po}
                initial={edit.rows}
                saving={busy('save')}
                onDirtyChange={setEditDirty}
                onCancel={stopEdit}
                onSave={(saveLines) => act.mutate({ kind: 'save', po: edit.po, lines: saveLines })}
              />
            ) : (
              <>
                <div className="pane-title">
                  <span>
                    Chi tiết màu cỡ sản phẩm{' '}
                    {currentPo && (
                      <Text span size="xs" c="dimmed" fw={400}>
                        PO {currentPo.poNumber}
                        {poTotal !== null && `, tổng ${fmtNum(poTotal)}`}
                      </Text>
                    )}
                  </span>
                </div>
                <DataGrid
                  label="Chi tiết màu cỡ"
                  fill
                  dense
                  columns={viewCols}
                  rows={lines}
                  rowKey={(l) => l.id}
                  policy={policy}
                  loading={detail.isLoading && !!po}
                  error={po ? loadError(detail.error, 'Không tải được màu cỡ.') : null}
                  onRetry={() => void detail.refetch()}
                  empty={po ? 'PO này chưa có màu cỡ.' : 'Bấm một PO để xem màu cỡ.'}
                />
                <Group justify="flex-end" gap="xs" mt={8}>
                  {canWrite && (
                    <ActionButton variant="default" leftSection={<IconPencil size={15} />} blockedReason={editBlocked} onClick={startEdit}>
                      Sửa tỷ lệ
                    </ActionButton>
                  )}
                  {canDelete && (
                    <ActionButton
                      variant="default"
                      color="red"
                      leftSection={<IconTrash size={15} />}
                      blockedReason={!currentPo ? PICK_PO : inPlan ? 'PO đã nằm trong kế hoạch xuất hàng (có thể của đơn vị khác) nên không xóa được' : confirmed ? 'PO đã xác nhận, hủy xác nhận trước khi xóa' : null}
                      loading={busy('delete')}
                      onClick={() =>
                        currentPo &&
                        confirmAction({
                          title: `Xóa PO ${currentPo.poNumber}?`,
                          consequence: 'Xóa PO và toàn bộ màu cỡ của nó. PO đã nằm trong kế hoạch xuất hàng thì không xóa được. Không hoàn tác được.',
                          confirmLabel: 'Xóa PO',
                          onConfirm: () => act.mutate({ kind: 'delete', po: currentPo }),
                        })
                      }
                    >
                      Xóa PO
                    </ActionButton>
                  )}
                  {canWrite && (
                    <>
                      <ActionButton
                        variant="default"
                        leftSection={<IconLockOpen size={15} />}
                        blockedReason={!currentPo ? PICK_PO : !confirmed ? 'PO chưa xác nhận' : null}
                        loading={busy('unconfirm')}
                        onClick={() =>
                          currentPo &&
                          confirmAction({
                            title: `Hủy xác nhận PO ${currentPo.poNumber}?`,
                            consequence: 'Tỷ lệ cắt của PO mở lại để sửa; khâu cắt chưa dùng được tỷ lệ này cho đến khi xác nhận lại.',
                            confirmLabel: 'Hủy xác nhận',
                            cancelLabel: 'Giữ xác nhận',
                            danger: false,
                            onConfirm: () => act.mutate({ kind: 'unconfirm', po: currentPo }),
                          })
                        }
                      >
                        Hủy xác nhận
                      </ActionButton>
                      <ActionButton
                        leftSection={<IconCheck size={15} />}
                        blockedReason={confirmBlocked}
                        loading={busy('confirm')}
                        onClick={() => currentPo && act.mutate({ kind: 'confirm', po: currentPo })}
                      >
                        Xác nhận
                      </ActionButton>
                    </>
                  )}
                </Group>
              </>
            )}
          </div>
        </div>
      </div>
      {adding && style && <AddPoDialog style={style} onClose={() => setAdding(false)} onDone={refreshAfterClose} />}
    </WorkPage>
  );
}

/** Thêm PO tay (chưa đồng bộ BRAVO): PO#, đích đến, ngày xuất và lưới màu cỡ. */
function AddPoDialog({ style, onClose, onDone }: { style: CutStyle; onClose: () => void; onDone: () => void }) {
  const mobile = useMobile();
  const order = useQuery({ queryKey: ['order', 'sales-order', style.salesOrderId], queryFn: () => api<SalesOrder>(`/order/sales-orders/${style.salesOrderId}`) });
  // PO mới: trường không được sửa thì không có ô và không gửi lên (gửi cột chỉ đọc thì máy chủ từ chối cả lần lưu)
  const policy = useFieldPolicy(RESOURCE);
  const can = (f: string) => policy.editable(f);
  const blocked = ['poNumber', 'shipDate', 'qty'].filter((f) => !can(f));
  const blockedNames = blocked.map((f) => ({ poNumber: 'PO#', shipDate: 'ngày xuất hàng', qty: 'số lượng' })[f]).join(', ');
  const form = useForm({
    initialValues: { poNumber: '', destination: '', packingListCode: '', customsDeclarationNo: '', shipDate: style.shipDate ?? '' },
    validate: {
      poNumber: (v) => (/^[^\p{C}\p{Zl}\p{Zp}]{1,192}$/u.test(v.trim()) ? null : 'Nhập PO#, tối đa 192 ký tự, không xuống dòng'),
      shipDate: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? null : 'Chọn ngày xuất hàng'),
    },
  });
  // Bốn dòng trống để nhập hoặc dán từ Excel; không điền sẵn màu cỡ mẫu (trông như dữ liệu thật)
  const [rows, setRows] = useState<EditRow[]>(() => Array.from({ length: 4 }, newRow));
  const { check, columns } = useColorSizeSheet(rows);
  const dirty = form.isDirty() || rows.some((r) => !blank(r));
  useLeaveGuard(dirty);
  const close = () => confirmDiscard(dirty, onClose);
  const m = useMutation({
    mutationFn: (v: typeof form.values) =>
      api<Po>('/order/cut-ratio/pos', {
        method: 'POST',
        body: {
          salesOrderId: style.salesOrderId,
          poNumber: v.poNumber.trim(),
          destination: (can('destination') && v.destination.trim()) || undefined,
          packingListCode: (can('packingListCode') && v.packingListCode.trim()) || undefined,
          customsDeclarationNo: (can('customsDeclarationNo') && v.customsDeclarationNo.trim()) || undefined,
          shipDate: v.shipDate,
          lines: check.lines,
        },
      }),
    onSuccess: (r) => {
      toastOk(`Đã thêm PO ${r.poNumber} (${r.poCode}).`, 'Đã thêm');
      onClose();
      onDone();
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });
  const submitBlocked = blocked.length > 0
    ? `Bạn không được nhập ${blockedNames} nên chưa thêm được PO`
    : check.issues.length > 0
      ? 'Sửa các dòng được nêu trong thông báo đỏ trước khi lưu'
      : check.lines.length === 0
        ? 'Nhập ít nhất một dòng màu cỡ'
        : null;
  return (
    // Esc trong lưới là thoát sửa ô, bỏ vùng chọn: không để nó đóng popup
    <Modal opened onClose={close} closeOnEscape={false} size="lg" fullScreen={mobile} title={`Thêm PO cho ${style.styleCode}`}>
      <form onSubmit={form.onSubmit((v) => m.mutate(v))}>
        <Stack gap="sm">
          {blocked.length > 0 && (
            <Alert color="orange" variant="light" py={6}>
              Bạn không được nhập {blockedNames} nên chưa thêm được PO. Nhờ quản trị viên mở ở Chính sách cột nếu cần.
            </Alert>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput label="Khách hàng" value={order.data?.customerName ?? style.customerName} readOnly className="field-readonly" />
            <TextInput label="PO#" withAsterisk className="field-required" data-autofocus {...form.getInputProps('poNumber')} />
            <DateField label="Ngày xuất hàng" withAsterisk className="field-required" {...form.getInputProps('shipDate')} />
            {can('destination') && <TextInput label="Đích đến" placeholder="Ví dụ: Hamburg (DE)" {...form.getInputProps('destination')} />}
            {can('packingListCode') && <TextInput label="Mã PKL" {...form.getInputProps('packingListCode')} />}
            {can('customsDeclarationNo') && <TextInput label="Số tờ khai" {...form.getInputProps('customsDeclarationNo')} />}
          </SimpleGrid>
          <Group justify="space-between">
            <Text size="sm" fw={700}>Màu cỡ</Text>
            <Text size="sm">
              Tổng số lượng: <b>{fmtNum(check.total)}</b>
            </Text>
          </Group>
          <ColorSizeIssues check={check} />
          <div style={{ height: 320, display: 'flex', flexDirection: 'column' }}>
            <SheetGrid label="Màu cỡ của PO mới" value={rows} onChange={setRows} columns={columns} rowKey={(r) => r.key} createRow={newRow} duplicateRow={copyRow} />
          </div>
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>Hủy</Button>
            <ActionButton type="submit" loading={m.isPending} blockedReason={submitBlocked}>Thêm PO</ActionButton>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
