import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { SOURCES, render, type Col } from '../scripts/sync-gen';

// Không cần database. Thủ tục chép của mỗi nguồn trong migration MES_Sync mới nhất phải đúng bằng đầu ra hiện tại của
// sync-gen.ts: sửa script sinh mà quên sinh migration mới (--procs-only) thì test này báo.
const dir = resolve(__dirname, '../migrations/MES_Sync');

/** Dựng lại cấu trúc cột từ bảng tạm #src trong thủ tục đã sinh */
function colsFrom(section: string): Col[] {
  const def = /CREATE TABLE #src \(\n([\s\S]*?)\n {2}\);/.exec(section)?.[1];
  if (!def) throw new Error('Không thấy #src');
  return def.split(',\n').map((line) => {
    const m = /^\s*\[([^\]]+)\] ([A-Z0-9]+)(?:\(([^)]*)\))?(?: COLLATE (\S+))? NULL$/.exec(line);
    if (!m) throw new Error(`Không đọc được cột: ${line}`);
    const [, name, upper, args, collation] = m;
    const type = upper.toLowerCase();
    let len = 0;
    let precision = 0;
    let scale = 0;
    if (type === 'nvarchar' || type === 'nchar') len = args === 'MAX' ? -1 : Number(args) * 2;
    else if (['varchar', 'char', 'varbinary', 'binary'].includes(type)) len = args === 'MAX' ? -1 : Number(args);
    else if (type === 'decimal' || type === 'numeric') [precision, scale] = args.split(',').map((x) => Number(x.trim()));
    else if (['datetime2', 'time', 'datetimeoffset'].includes(type)) scale = Number(args);
    return { name, type, len, precision, scale, collation: collation ?? null };
  });
}

const procOf = (text: string, proc: string) => {
  const at = text.lastIndexOf(`CREATE OR ALTER PROCEDURE ${proc}\n`);
  return at < 0 ? null : text.slice(at, text.indexOf('\nGO', at));
};

describe('Migration MES_Sync khớp với sync-gen.ts', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const texts = files.map((f) => readFileSync(resolve(dir, f), 'utf8').replace(/\r\n/g, '\n'));

  it.each(SOURCES.map((s) => [s.view]))('%s: thủ tục mới nhất trong migration đúng bằng đầu ra hiện tại', (view) => {
    const src = SOURCES.find((s) => s.view === view)!;
    const proc = `bravo.[usp_Sync_${view.replace(/^v/, '')}]`;
    // Migration cuối cùng có thủ tục này là bản đang chạy trên database
    const latest = [...texts].reverse().map((t) => procOf(t, proc)).find((p) => p !== null);
    expect(latest).toBeTruthy();
    const generated = procOf(render(src, colsFrom(latest!), 0, 'BRAVO', { procsOnly: true }), proc);
    expect(latest).toBe(generated);
  });
});
