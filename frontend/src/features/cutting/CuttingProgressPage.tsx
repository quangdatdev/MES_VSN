import { Alert, Button, Center, Group, Loader, Modal, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { useBranchName, withBranchNames } from '../../components/BranchName';
import { DataGrid, type Column } from '../../components/DataGrid';
import { DateField } from '../../components/DateField';
import { Pager } from '../../components/Pager';
import { PolicyHint } from '../../components/PolicyHint';
import { SheetGrid, sheetNumber, sheetReadonly, type SheetColumn } from '../../components/SheetGrid';
import { WorkPage } from '../../components/WorkPage';
import { useAfterClose } from '../../lib/afterClose';
import { api, ApiError } from '../../lib/api';
import { confirmAction, confirmDiscard } from '../../lib/confirm';
import { MASK, useFieldPolicy } from '../../lib/fieldPolicy';
import { fmtDate, fmtNum, sumOf } from '../../lib/format';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { useSession } from '../../store/session';
import { EmptyState, ExportButton, loadError, OrderFilters, PICK_ROW, StatusBadge, useCanWrite, useCustomers, usePagedList } from '../order/common';
import type { CuttingDetail, CuttingPlan } from './api';
import { changes, diffOf, keptOverPlan, liveCut, overPlan, raisedOverPlan, reapply, rowsOf, saveIssue, settle, type CutRow } from './cuttingProgressRules';

const RESOURCE = 'cutting.progress';

/** Trạng thái tính lúc đọc (quyết định 13.3) */
export const CUT_STATUS = {
  NOT_STARTED: { label: 'Chưa cắt', color: 'gray' },
  CUTTING: { label: 'Đang cắt', color: 'orange' },
  DONE: { label: 'Đã cắt đủ', color: 'teal' },
  SOURCE_DELETED: { label: 'Kế hoạch đã xóa', color: 'red' },
};

const COLUMNS: Column<CuttingPlan>[] = [
  { key: 'planNo', title: 'Số kế hoạch', filterKey: 'planNo', sortKey: 'planNo', format: 'code' },
  { key: 'branchCode', title: 'Chi nhánh', filterKey: 'branchCode', field: null },
  { key: 'customerName', title: 'Khách hàng', filterKey: 'customerName', sortKey: 'customerName', minWidth: 160, maxWidth: 240 },
  { key: 'styleCode', title: 'Mã hàng', filterKey: 'styleCode', sortKey: 'styleCode', format: 'code' },
  { key: 'productName', title: 'Tên sản phẩm', filterKey: 'productName', minWidth: 140, maxWidth: 240 },
  { key: 'poBuyDate', title: 'PO/Buy date', filterKey: 'poBuyDate', sortKey: 'poBuyDate' },
  { key: 'shipDate', title: 'Ngày xuất hàng', filterKey: 'shipDate', format: 'date', sortKey: 'shipDate' },
  { key: 'planQty', title: 'Số lượng KH', filterKey: 'planQty', format: 'number', sortKey: 'planQty' },
  { key: 'cutQty', title: 'Lũy kế cắt', filterKey: 'cutQty', format: 'number', sortKey: 'cutQty' },
  { key: 'diffQty', title: '+/-', filterKey: 'diffQty', format: 'number', sortKey: 'diffQty' },
  { key: 'lastCutDate', title: 'Ngày cắt gần nhất', filterKey: 'lastCutDate', format: 'date', sortKey: 'lastCutDate' },
  {
    key: 'statusCode',
    title: 'Trạng thái',
    filterKey: 'statusCode',
    filterLabel: (v) => CUT_STATUS[v as keyof typeof CUT_STATUS]?.label ?? String(v),
    sortKey: 'statusCode',
    render: (r) => <StatusBadge map={CUT_STATUS} code={String(r.statusCode)} />,
  },
  { key: 'createdAt', title: 'Ngày tạo kế hoạch', format: 'datetime', sortKey: 'createdAt', filterKey: 'createdAt' },
];
const NAMES = Object.fromEntries(COLUMNS.map((c) => [c.key, c.title]));

/**
 * Màn "Đồng bộ tiến độ cắt" (phase 5.14): mỗi dòng là một kế hoạch xuất hàng của ĐVCS (lập kế hoạch xong là có, không chờ xếp
 * chuyền); đúp chuột để nhập số cắt trong ngày theo màu cỡ.
 */
export default function CuttingProgressPage() {
  const qc = useQueryClient();
  const policy = useFieldPolicy(RESOURCE);
  const branch = useSession((s) => s.branch);
  const branchName = useBranchName();
  const { customers } = useCustomers();
  const list = usePagedList<CuttingPlan>('cutting-progress', '/cutting/progress');
  const columns = useMemo(() => withBranchNames(COLUMNS, branchName), [branchName]);
  const refreshAfterClose = useAfterClose(() => qc.invalidateQueries({ queryKey: ['order'] }));
  const canWrite = useCanWrite(`${RESOURCE}:update`);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const items = list.query.data?.items ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? null;
  const planSum = sumOf(items.map((r) => r.planQty));
  const cutSum = sumOf(items.map((r) => r.cutQty));

  return (
    <WorkPage
      title="Đồng bộ tiến độ cắt"
      subtitle={
        branch?.isAggregate
          ? 'Kế hoạch xuất hàng của mọi đơn vị cơ sở bạn được xem, chỉ đọc'
          : `Mỗi dòng là một kế hoạch xuất hàng của ${branchName(branch?.code)}. Đúp chuột một dòng để ${canWrite ? 'nhập' : 'xem'} số cắt theo ngày.`
      }
      actions={
        <>
          <PolicyHint policy={policy} names={NAMES} />
          <ExportButton resource={RESOURCE} path={list.exportPath} fileName="tien-do-cat.csv" />
          <ActionButton variant={canWrite ? undefined : 'default'} blockedReason={selected ? null : PICK_ROW} onClick={() => selected && setOpen(selected.id)}>
            {canWrite ? 'Nhập số cắt' : 'Xem số cắt'}
          </ActionButton>
        </>
      }
      filters={<OrderFilters policy={policy} value={list.filter} onChange={list.setFilter} customers={customers} statuses={CUT_STATUS} columns={list.columnsOf(NAMES, policy)} />}
    >
      <DataGrid
        label="Danh sách kế hoạch theo tiến độ cắt"
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
        {...list.grid}
        selectedKey={selected?.id}
        onRowClick={(r) => setSelectedId(r.id)}
        onRowDoubleClick={(r) => {
          setSelectedId(r.id);
          setOpen(r.id);
        }}
        empty={<EmptyState filtered={list.filtered} what="kế hoạch" onClear={list.clearFilter} hint="Chưa có kế hoạch xuất hàng nào. Lập kế hoạch ở màn Kế hoạch xuất hàng, kế hoạch sẽ hiện ở đây." />}
        footer={
          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={list.query.data?.total ?? 0}
            onPage={list.setPage}
            extra={
              planSum !== null && (
                <Text size="sm">
                  Trang này: SL kế hoạch <b>{fmtNum(planSum)}</b>
                  {cutSum !== null && (
                    <>
                      , đã cắt <b>{fmtNum(cutSum)}</b>
                    </>
                  )}
                </Text>
              )
            }
          />
        }
      />
      {open !== null && <CuttingModal planId={open} onClose={() => setOpen(null)} onSaved={refreshAfterClose} />}
    </WorkPage>
  );
}

/** Số đẹp của ô số lượng; ô bị Che hiện "***", không có thì để trống như ảnh mẫu */
const qtyText = (v: unknown) => (v === MASK ? MASK : typeof v === 'number' ? fmtNum(v) : '');
const textOf = (v: unknown) => (v === undefined || v === null ? '' : String(v));

/**
 * Popup một kế hoạch theo ảnh docs/screens/dong-bo-tien-do-cat.png: thông tin chung lấy từ kế hoạch, Ngày nhập liệu; mỗi màu cỡ có
 * Kế hoạch, Trong ngày (nhập, theo ngày đang chọn), Lũy kế (mọi ngày), +/- = Lũy kế − Kế hoạch. Đổi ngày chỉ đổi cột Trong ngày.
 */
function CuttingModal({ planId, onClose, onSaved }: { planId: number; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const mobile = useMobile();
  const policy = useFieldPolicy(RESOURCE);
  const aggregate = useSession((s) => !!s.branch?.isAggregate);
  // null: ngày máy chủ chọn (hôm nay theo giờ Việt Nam)
  const [date, setDate] = useState<string | null>(null);
  const key = ['order', 'cutting', planId, date];
  const fetchDetail = () => api<CuttingDetail>(`/cutting/progress/${planId}${date ? `?date=${date}` : ''}`);
  // Không tự tải lại khi quay lại cửa sổ hay có mạng lại: tải lại nền sẽ đè lên số đang nhập
  const detail = useQuery({ queryKey: key, queryFn: fetchDetail, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false });
  const plan = detail.data;
  const [rows, setRows] = useState<CutRow[]>([]);
  const [loaded, setLoaded] = useState<CuttingDetail | null>(null);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (!plan || !detail.isFetchedAfterMount || plan === loaded) return;
    setRows(rowsOf(plan));
    setLoaded(plan);
  }, [plan, loaded, detail.isFetchedAfterMount]);
  const ready = !!plan && plan === loaded;
  const canEdit = ready && plan.canEdit && policy.editable('dayQty');
  const dirty = canEdit && changes(rows).length > 0;
  useLeaveGuard(dirty);
  const finish = () => {
    onClose();
    if (changed) onSaved();
  };
  const close = () => confirmDiscard(dirty, finish);
  const styleText = typeof plan?.styleCode === 'string' && plan.styleCode !== MASK ? plan.styleCode : null;
  const title = plan ? (styleText ? `${styleText} (${textOf(plan.planNo)})` : textOf(plan.planNo)) : '';
  const shownDate = date ?? plan?.date ?? null;
  const today = plan?.today ?? null;

  const pickDate = (next: string) => {
    if (!next || next === shownDate) return;
    if (today && next > today) return;
    confirmDiscard(dirty, () => setDate(next), 'Số trong ngày bạn vừa nhập cho ngày đang xem chưa lưu sẽ mất.');
  };

  const save = useMutation({
    mutationFn: () => api<CuttingDetail>(`/cutting/progress/${planId}`, { method: 'PUT', body: { date: shownDate, items: changes(rows) } }),
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      setRows(rowsOf(res));
      setLoaded(res);
      setChanged(true);
      toastOk(`Đã lưu số cắt ngày ${fmtDate(res.date)} của ${title}.`, 'Đã lưu');
    },
    onError: (e) => {
      toastError(e, 'Chưa lưu được');
      // 422 có thể do Kế hoạch đã đổi khi popup đang mở (quyết định 13.7): tải lại để ô vượt hiện đúng, giữ số đang nhập
      if (e instanceof ApiError && e.status === 422) reloadPlan.mutate();
    },
  });

  // Tải lại Kế hoạch mà giữ số đang nhập: tăng kế hoạch xuất hàng ở màn khác rồi quay lại lưu, không phải đóng popup
  const reloadPlan = useMutation({
    mutationFn: fetchDetail,
    onSuccess: (res) => {
      qc.setQueryData(key, res);
      setRows((typed) => reapply(res, typed));
      setLoaded(res);
    },
    onError: (e) => toastError(e, 'Chưa tải lại được kế hoạch'),
  });

  const removeEntries = useMutation({
    mutationFn: () => api<{ removedDays: number; planRemoved: boolean }>(`/cutting/progress/${planId}/entries`, { method: 'DELETE' }),
    onSuccess: (res) => {
      toastOk(`Đã xóa số cắt ${res.removedDays} ngày của ${title}.`, 'Đã xóa số cắt');
      setChanged(true);
      if (res.planRemoved) {
        onClose();
        onSaved();
        return;
      }
      // Bỏ dữ liệu cũ trước khi tải lại: lưới không hiện lại số vừa xóa, nút Xóa số cắt không bấm lại được
      qc.removeQueries({ queryKey: key, exact: true });
      setLoaded(null);
      void detail.refetch();
    },
    onError: (e) => toastError(e, 'Chưa xóa được'),
  });
  const askRemove = () =>
    plan &&
    confirmAction({
      title: 'Xóa số cắt của kế hoạch?',
      consequence: (
        <>
          Xóa số cắt của <b>{title}</b> ở cả {plan.entryDays} ngày đã nhập
          {typeof plan.cutQty === 'number' && <> (Lũy kế {fmtNum(plan.cutQty)} sản phẩm)</>}. Không lấy lại được.
          {plan.sourceDeleted ? ' Kế hoạch xuất hàng đã bị xóa nên kế hoạch cũng rời khỏi màn này.' : ' Sau đó xóa được kế hoạch ở màn Kế hoạch xuất hàng.'}
        </>
      ),
      confirmLabel: 'Xóa số cắt',
      onConfirm: () => removeEntries.mutate(),
    });

  // Lưới nhập của thư viện chỉ đọc cột ở lần vẽ đầu: quyền sửa đọc qua ref
  const editRef = useRef(canEdit);
  editRef.current = canEdit;
  const editable = (r: CutRow) => editRef.current && !r.total && r.inPlan && !r.dayMasked;
  const change = (next: CutRow[]) => setRows((prev) => settle(next, prev, editable));
  const sheetCols = useMemo<SheetColumn<CutRow>[]>(() => {
    const cls = (r: CutRow, extra?: string) => [r.total ? 'cut-total' : r.inPlan ? undefined : 'cut-removed', extra].filter(Boolean).join(' ') || undefined;
    return [
      sheetReadonly<CutRow>('Màu', (r) => r.colorName, (r) => r.colorName, { minWidth: 160, grow: 2, className: (r) => cls(r) }),
      sheetReadonly<CutRow>('Cỡ', (r) => r.sizeName, (r) => r.sizeName, { minWidth: 110, grow: 1, className: (r) => cls(r) }),
      sheetReadonly<CutRow>('Kế hoạch', (r) => qtyText(r.planQty), (r) => (typeof r.planQty === 'number' ? r.planQty : null), { minWidth: 100, align: 'right', className: (r) => cls(r) }),
      sheetNumber<CutRow>('dayQty', 'Trong ngày', { minWidth: 110, disabled: (r) => !editable(r), className: (r) => cls(r, r.dayMasked ? 'cut-masked' : undefined) }),
      // Như ảnh mẫu: màu cỡ chưa cắt để trống ô Lũy kế (dòng Tổng vẫn hiện số)
      sheetReadonly<CutRow>('Lũy kế', (r) => (!r.total && liveCut(r) === 0 ? '' : qtyText(liveCut(r))), (r) => {
        const v = liveCut(r);
        return typeof v === 'number' ? v : null;
      }, { minWidth: 100, align: 'right', className: (r) => cls(r, overPlan(r) ? 'sheet-error' : undefined) }),
      sheetReadonly<CutRow>('+ / -', (r) => qtyText(diffOf(r)), (r) => {
        const v = diffOf(r);
        return typeof v === 'number' ? v : null;
      }, { minWidth: 90, align: 'right', className: (r) => cls(r, overPlan(r) ? 'sheet-error' : undefined) }),
    ];
    // Cột dựng một lần: quyền sửa đọc qua ref
  }, []);

  const info = (label: string, value: unknown) => <TextInput label={label} value={textOf(value)} readOnly className="field-readonly" />;
  const issue = ready ? saveIssue(rows) : 'Đang tải số cắt…';
  const removed = rows.filter((r) => !r.total && !r.inPlan).length;
  const overBefore = keptOverPlan(rows);
  const raised = canEdit && raisedOverPlan(rows).length > 0;

  return (
    // Esc trong lưới là thoát sửa ô: không để nó đóng popup khi đang nhập được
    <Modal opened onClose={close} closeOnEscape={!canEdit} size="min(1100px, 96vw)" fullScreen={mobile} title={`${canEdit ? 'Nhập số cắt' : 'Số cắt'}${title ? `: ${title}` : ''}`}>
      <Stack gap="sm">
        <div>
          <SimpleGrid cols={{ base: 2, sm: 3, md: 5 }} spacing="sm" verticalSpacing="xs">
            {info('Chi nhánh', plan?.branchName ?? plan?.branchCode)}
            {info('Khách hàng', plan?.customerName)}
            {info('Mã hàng', plan?.styleCode)}
            {info('PO/Buy Date', plan?.poBuyDate)}
            {info('Số lượng KH', plan ? qtyText(plan.planQty) : '')}
            <DateField label="Ngày nhập liệu" value={shownDate} onChange={pickDate} maxDate={today ?? undefined} clearable={false} required />
          </SimpleGrid>
        </div>
        {plan?.sourceDeleted && (
          <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />} py={6}>
            Kế hoạch xuất hàng này đã bị xóa. Số cắt đã nhập được giữ lại để xem; muốn bỏ hẳn kế hoạch khỏi màn này thì Xóa số cắt.
          </Alert>
        )}
        {ready && aggregate && !plan.sourceDeleted && (
          <Text size="sm" c="dimmed">
            Chế độ xem tổng hợp chỉ đọc. Chọn một đơn vị cơ sở cụ thể để nhập số cắt.
          </Text>
        )}
        {removed > 0 && (
          <Text size="sm" c="dimmed">
            {removed} màu cỡ đã bị bỏ khỏi kế hoạch xuất hàng nhưng còn số cắt: hiện ở cuối lưới, Kế hoạch 0, chỉ xem.
          </Text>
        )}
        {overBefore > 0 && (
          <Text size="sm" c="dimmed">
            {overBefore} màu cỡ có Lũy kế vượt Kế hoạch do kế hoạch xuất hàng đã giảm sau khi cắt: chỉ giảm được số đã nhập.
          </Text>
        )}
        <div style={{ height: mobile ? 'min(60vh, 520px)' : 'min(52vh, 500px)', minHeight: 260, display: 'flex', flexDirection: 'column' }}>
          {ready ? (
            <SheetGrid
              label="Số cắt theo màu cỡ"
              value={rows}
              onChange={change}
              columns={sheetCols}
              rowKey={(r) => r.key}
              rowLabel={(r) => (r.total ? '-' : undefined)}
              indexOffset={-1}
              hint={canEdit ? 'Nhập số cắt trong ngày của từng màu cỡ; để trống hoặc 0 là chưa cắt. Dán từ Excel: chọn ô đầu rồi Ctrl+V.' : undefined}
            />
          ) : (
            <Center h="100%">
              {detail.error ? (
                <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                  <Stack gap={6} align="flex-start">
                    {loadError(detail.error, 'Không tải được số cắt của kế hoạch.')}
                    <Button size="xs" variant="default" onClick={() => void detail.refetch()}>
                      Thử lại
                    </Button>
                  </Stack>
                </Alert>
              ) : (
                <Loader size="sm" aria-label="Đang tải số cắt" />
              )}
            </Center>
          )}
        </div>
        {raised && (
          <Group gap="xs" wrap="nowrap" justify="space-between">
            <Text size="sm" c="red">
              Lũy kế vượt Kế hoạch ở ô tô đỏ. Muốn cắt thêm, điều chỉnh Kế hoạch xuất hàng trước rồi tải lại; số đang nhập được giữ.
            </Text>
            <Button size="xs" variant="default" loading={reloadPlan.isPending} onClick={() => reloadPlan.mutate()} style={{ flexShrink: 0 }}>
              Tải lại kế hoạch
            </Button>
          </Group>
        )}
        <Group justify="space-between" gap="xs">
          <Group gap="xs">
            {canEdit && (
              <ActionButton loading={save.isPending} blockedReason={issue} onClick={() => save.mutate()}>
                Lưu lại
              </ActionButton>
            )}
            <Button variant="default" onClick={close}>
              {canEdit ? 'Hủy' : 'Đóng'}
            </Button>
          </Group>
          {plan?.canDelete && (
            <ActionButton variant="subtle" color="red" loading={removeEntries.isPending} blockedReason={dirty ? 'Lưu hoặc bỏ số đang nhập trước' : null} onClick={askRemove}>
              Xóa số cắt
            </ActionButton>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
