import { Alert, Button, Group, List, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IconCircleCheck, IconDownload, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { ActionButton } from '../../components/ActionButton';
import { SheetGrid, sheetReadonly, sheetText, type SheetColumn } from '../../components/SheetGrid';
import { api } from '../../lib/api';
import { confirmDiscard } from '../../lib/confirm';
import { useFieldPolicy } from '../../lib/fieldPolicy';
import { useLeaveGuard } from '../../lib/leaveGuard';
import { toastError, toastOk, toastWarn } from '../../lib/notify';
import { useMobile } from '../../lib/useMobile';
import { HR_KEYS } from './api';
import type { EmployeeField, ImportCommitResult, ImportPreviewRow } from './types';

/** Một dòng của lưới nhập: chữ theo khóa trường, `_id` để giữ lỗi đúng dòng khi chèn, xóa, sắp lại */
export type ImportRow = Record<string, string> & { _id: string };

/** Khớp giới hạn máy chủ (IMPORT_MAX_ROWS): 500 dòng × 26 cột vừa giới hạn kích thước request */
export const IMPORT_MAX = 500;
const START_ROWS = 10;

let seq = 0;
const newRow = (): ImportRow => ({ _id: `r${++seq}` }) as ImportRow;
const isBlank = (r: ImportRow, keys: string[]) => keys.every((k) => !(r[k] ?? '').trim());

const BOM = String.fromCharCode(0xfeff);
/** Ô CSV: thêm ngoặc kép khi có dấu phẩy, ngoặc kép, xuống dòng */
const csvCell = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** File mẫu: dòng tiêu đề cùng thứ tự cột với lưới (kèm BOM để Excel đọc đúng tiếng Việt) */
export function templateCsv(fields: EmployeeField[]): string {
  return `${BOM}${fields.map((f) => csvCell(f.required ? `${f.label} *` : f.label)).join(',')}\r\n`;
}

function downloadTemplate(fields: EmployeeField[]) {
  const url = URL.createObjectURL(new Blob([templateCsv(fields)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mau-nhap-nhan-su.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Checked {
  errors: Record<string, string>;
  ok: boolean;
  header: boolean;
  resolved: ImportPreviewRow['resolved'];
}

/**
 * Nhập hồ sơ nhân viên bằng cách dán từ Excel (ADR 0012 mục 9): tải file mẫu, điền trong Excel, chép các dòng rồi dán vào lưới.
 * Kiểm tra: máy chủ đọc, dò phòng ban, chức danh và báo lỗi theo ô. Lưu: thêm các dòng hợp lệ (máy chủ kiểm lại), mỗi dòng độc
 * lập; dòng đã lưu rời khỏi lưới, dòng lỗi ở lại để sửa.
 */
export function EmployeeImportModal({ fields, onClose }: { fields: EmployeeField[]; onClose: () => void }) {
  const mobile = useMobile();
  const qc = useQueryClient();
  const policy = useFieldPolicy('hr.employee');
  // Cột không được sửa theo chính sách cột thì không đưa vào lưới (máy chủ từ chối cả lô nếu có)
  const cols = useMemo(() => fields.filter((f) => policy.editable(f.key)), [fields, policy]);
  const keys = useMemo(() => cols.map((f) => f.key), [cols]);
  const [rows, setRows] = useState<ImportRow[]>(() => Array.from({ length: START_ROWS }, newRow));
  const [checked, setChecked] = useState<Map<string, Checked>>(new Map());
  // Lỗi đã báo ứng với nội dung dòng lúc kiểm tra: sửa ô thì dòng về "chưa kiểm"
  const snapshot = useRef(new Map<string, string>());
  const filled = rows.filter((r) => !isBlank(r, keys));
  const dirty = filled.length > 0;
  useLeaveGuard(dirty);

  const sig = (r: ImportRow) => keys.map((k) => r[k] ?? '').join('\u0001');
  const stateOf = (r: ImportRow): Checked | undefined => (snapshot.current.get(r._id) === sig(r) ? checked.get(r._id) : undefined);
  const body = (list: ImportRow[]) => list.map((r) => Object.fromEntries(keys.filter((k) => (r[k] ?? '').trim()).map((k) => [k, r[k].trim()])));

  const preview = useMutation({
    mutationFn: (list: ImportRow[]) => api<{ rows: ImportPreviewRow[] }>('/hr/employees/import/preview', { method: 'POST', body: { rows: body(list) } }),
    onSuccess: (res, list) => {
      const next = new Map<string, Checked>();
      res.rows.forEach((p, i) => {
        const r = list[i];
        snapshot.current.set(r._id, sig(r));
        next.set(r._id, { errors: Object.fromEntries(p.errors.map((e) => [e.field, e.message])), ok: p.ok, header: p.header, resolved: p.resolved });
      });
      setChecked(next);
      const bad = res.rows.filter((p) => !p.ok && !p.header).length;
      if (!bad) toastOk(`${res.rows.filter((p) => p.ok).length} dòng hợp lệ, bấm Lưu để thêm.`, 'Đã kiểm tra');
    },
    onError: (e) => toastError(e, 'Chưa kiểm tra được'),
  });

  const commit = useMutation({
    mutationFn: (list: ImportRow[]) => api<ImportCommitResult>('/hr/employees/import/commit', { method: 'POST', body: { rows: body(list) } }),
    onSuccess: async (res, list) => {
      const saved = new Set(res.results.filter((r) => r.ok).map((r) => list[r.index]._id));
      const left = rows.filter((r) => !saved.has(r._id) && !isBlank(r, keys));
      setRows(left.length ? left : Array.from({ length: START_ROWS }, newRow));
      void qc.invalidateQueries({ queryKey: HR_KEYS.employees });
      void qc.invalidateQueries({ queryKey: HR_KEYS.departments });
      if (res.created) toastOk(`Đã thêm ${res.created} nhân viên.`);
      if (res.failed) toastWarn(`${res.failed} dòng chưa thêm được (trùng mã do người khác vừa thêm, hoặc dữ liệu đã đổi). Xem lỗi ngay trên lưới.`, 'Còn dòng lỗi', true);
      // Kiểm tra lại các dòng còn lại để hiện lỗi theo ô
      if (left.length) preview.mutate(left);
      else setChecked(new Map());
    },
    onError: (e) => toastError(e, 'Chưa lưu được'),
  });

  const runCheck = () => {
    if (!filled.length) return;
    if (filled.length > IMPORT_MAX) {
      toastWarn(`Mỗi lần nhập tối đa ${IMPORT_MAX} dòng, lưới đang có ${filled.length} dòng. Chia làm nhiều lần.`, 'Quá nhiều dòng');
      return;
    }
    preview.mutate(filled);
  };
  const valid = filled.filter((r) => stateOf(r)?.ok);
  const unchecked = filled.filter((r) => !stateOf(r));
  const bad = filled.filter((r) => {
    const s = stateOf(r);
    return s && !s.ok && !s.header;
  });

  const columns = useMemo<SheetColumn<ImportRow>[]>(
    () => [
      ...cols.map((f) =>
        sheetText<ImportRow>(f.key, f.label, {
          required: f.required && f.key !== 'employmentStatus',
          minWidth: f.key === 'fullName' || f.key === 'currentAddress' ? 200 : f.type === 'date' ? 120 : 140,
          error: (r) => !!stateOf(r)?.errors[f.key],
        }),
      ),
      sheetReadonly<ImportRow>(
        'Kết quả kiểm tra',
        (r) => {
          const s = stateOf(r);
          if (isBlank(r, keys)) return '';
          if (!s) return <span className="hr-import-wait">Chưa kiểm</span>;
          if (s.header) return <span className="hr-import-wait">Dòng tiêu đề, bỏ qua</span>;
          if (s.ok) return <span className="hr-import-ok">Hợp lệ{s.resolved.departmentName ? `, ${s.resolved.departmentName}` : ''}</span>;
          return <span className="hr-import-bad">{Object.keys(s.errors).length} lỗi</span>;
        },
        (r) => {
          const s = stateOf(r);
          return s ? (s.ok ? 'Hợp lệ' : Object.values(s.errors).join(' ')) : '';
        },
        { minWidth: 200 },
      ),
    ],
    // stateOf đọc checked và snapshot: tính lại cột khi kết quả kiểm tra đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cols, checked, keys],
  );

  const close = () => confirmDiscard(dirty, onClose, 'Các dòng đã dán chưa lưu sẽ mất.');
  const busy = preview.isPending || commit.isPending;
  const label = new Map(cols.map((f) => [f.key, f.label]));

  return (
    // Esc trong lưới là thoát sửa ô, bỏ vùng chọn: không để nó đóng popup
    <Modal opened onClose={close} closeOnEscape={false} size="calc(100vw - 64px)" fullScreen={mobile} title="Nhập nhân viên từ Excel">
      <Stack gap="sm" className="hr-import">
        <Alert variant="light" color="link" icon={<IconInfoCircle size={16} />} py={8}>
          <Group justify="space-between" gap="sm" wrap="wrap">
            <Text size="sm" maw={720}>
              Tải file mẫu, điền trong Excel, chép các dòng dữ liệu rồi chọn ô đầu của lưới và nhấn Ctrl+V. Phòng ban, chức danh ghi
              theo mã hoặc tên; ngày dạng dd/mm/yyyy; tình trạng bỏ trống là đang làm việc. Mỗi lần tối đa {IMPORT_MAX} dòng.
            </Text>
            <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} onClick={() => downloadTemplate(cols)}>
              Tải file mẫu
            </Button>
          </Group>
        </Alert>
        <div className="hr-import-grid">
          <SheetGrid<ImportRow>
            label="Lưới nhập nhân viên"
            value={rows}
            onChange={setRows}
            columns={columns}
            rowKey={(r) => r._id}
            createRow={newRow}
            duplicateRow={(r) => ({ ...r, _id: newRow()._id })}
            hint="Dán từ Excel: chọn ô đầu rồi Ctrl+V (dán cả dòng tiêu đề cũng được, dòng đó được bỏ qua). Ô đỏ là ô có lỗi, xem danh sách lỗi bên dưới."
          />
        </div>
        {bad.length > 0 && (
          <ScrollArea.Autosize mah={140} type="auto" className="hr-import-errors">
            <List size="sm" spacing={2}>
              {bad.map((r) => {
                const s = stateOf(r)!;
                return (
                  <List.Item key={r._id}>
                    <b>Dòng {rows.indexOf(r) + 1}</b>
                    {r.code ? ` (${r.code})` : ''}: {Object.entries(s.errors).map(([k, m]) => `${label.get(k) ?? k}: ${m}`).join(' ')}
                  </List.Item>
                );
              })}
            </List>
          </ScrollArea.Autosize>
        )}
        <Group justify="space-between" gap="sm" wrap="wrap">
          <Text size="sm" c="dimmed">
            {filled.length === 0
              ? 'Chưa có dòng nào.'
              : `${filled.length} dòng: ${valid.length} hợp lệ, ${bad.length} có lỗi${unchecked.length ? `, ${unchecked.length} chưa kiểm` : ''}.`}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={close}>
              {dirty ? 'Hủy' : 'Đóng'}
            </Button>
            <ActionButton variant={valid.length && !unchecked.length ? 'default' : 'filled'} loading={preview.isPending} blockedReason={filled.length ? (busy ? 'Đang xử lý.' : null) : 'Dán dữ liệu vào lưới trước.'} onClick={runCheck}>
              Kiểm tra
            </ActionButton>
            <ActionButton
              variant={valid.length && !unchecked.length ? 'filled' : 'default'}
              leftSection={<IconCircleCheck size={15} />}
              loading={commit.isPending}
              blockedReason={unchecked.length ? 'Có dòng chưa kiểm tra (hoặc vừa sửa): bấm Kiểm tra trước.' : valid.length ? (busy ? 'Đang xử lý.' : null) : 'Chưa có dòng hợp lệ nào.'}
              onClick={() => commit.mutate(valid)}
            >
              {valid.length ? `Lưu ${valid.length} dòng hợp lệ` : 'Lưu'}
            </ActionButton>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
