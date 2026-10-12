import { AppException } from '../src/common/app.exception';
import type { LineSource } from '../src/platform/org/line-source';
import { OrgService, type LineInfo } from '../src/platform/org/org.service';

// Phase 5.10 (task 5.10.7): OrgService lấy chuyền từ nguồn do module đăng ký (HrLineSource), không cần database.
// Bài chạy qua API thật (/me/lines theo ĐVCS, A00, bỏ tích, giải thể) ở hr.spec.ts.

const line = (code: string, branchCode = 'A01', isActive = true): LineInfo => ({ code, name: `Chuyền ${code}`, branchCode, isActive, workshopCode: null, workshopName: null });

/** Nguồn giả: đọc chậm theo yêu cầu để thử lần đọc chen giữa lúc ghi */
function fakeSource(initial: LineInfo[]) {
  const state = { data: initial, slow: false, loads: 0, release: () => {} };
  const source: LineSource = {
    loadLines: () => {
      state.loads++;
      const snapshot = state.data;
      if (!state.slow) return Promise.resolve(snapshot);
      return new Promise((resolve) => (state.release = () => resolve(snapshot)));
    },
  };
  return { state, source };
}

describe('OrgService: nguồn chuyền đăng ký từ module', () => {
  it('chưa có nguồn đăng ký thì không có chuyền nào (đóng an toàn)', async () => {
    const org = new OrgService();
    expect(await org.lines('A01')).toEqual([]);
    expect(await org.lines('A00', true)).toEqual([]);
    expect(await org.activeLineCodes()).toEqual(new Set());
  });

  it('chuyền theo ĐVCS, A00 lấy mọi ĐVCS; chuyền ngừng chỉ có khi includeInactive; assertLine đòi đang dùng, đúng ĐVCS', async () => {
    const org = new OrgService();
    org.registerSource(fakeSource([line('L1'), line('L2', 'A01', false), line('L3', 'A02')]).source);
    expect((await org.lines('A01')).map((l) => l.code)).toEqual(['L1']);
    expect((await org.lines('A01', false, { includeInactive: true })).map((l) => l.code)).toEqual(['L1', 'L2']);
    expect((await org.lines('A00', true)).map((l) => l.code)).toEqual(['L1', 'L3']);
    expect(await org.activeLineCodes()).toEqual(new Set(['L1', 'L3']));
    await expect(org.assertLine('A01', 'L1')).resolves.toMatchObject({ code: 'L1' });
    await expect(org.assertLine('A01', 'L2')).rejects.toBeInstanceOf(AppException);
    await expect(org.assertLine('A01', 'L3')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('cache ngắn; invalidate thì đọc lại ngay', async () => {
    const org = new OrgService();
    const { state, source } = fakeSource([line('L1')]);
    org.registerSource(source);
    await org.lines('A01');
    await org.lines('A01');
    expect(state.loads).toBe(1);
    state.data = [];
    org.invalidate();
    expect(await org.lines('A01')).toEqual([]);
    expect(state.loads).toBe(2);
  });

  it('lần đọc bắt đầu trước khi bỏ tích (invalidate) không ghi danh sách cũ vào cache', async () => {
    const org = new OrgService();
    const { state, source } = fakeSource([line('L1')]);
    org.registerSource(source);
    state.slow = true;
    const pending = org.activeLineCodes();
    // Bỏ tích L1 trong lúc lần đọc trên chưa xong
    state.data = [];
    org.invalidate();
    state.release();
    expect(await pending).toEqual(new Set(['L1']));
    state.slow = false;
    expect(await org.activeLineCodes()).toEqual(new Set());
  });

  it('nhiều request cùng lúc chờ chung một lần đọc nguồn', async () => {
    const org = new OrgService();
    const { state, source } = fakeSource([line('L1'), line('L2', 'A02')]);
    org.registerSource(source);
    state.slow = true;
    const a = org.lines('A01');
    const b = org.activeLineCodes();
    const c = org.lineNamer();
    state.release();
    expect((await a).map((l) => l.code)).toEqual(['L1']);
    expect(await b).toEqual(new Set(['L1', 'L2']));
    expect((await c)('L2')).toBe('Chuyền L2');
    expect(state.loads).toBe(1);
  });

  it('nguồn lỗi: lỗi đi tới bên gọi (không thành danh sách rỗng hay cũ), không giữ trong cache, lần sau đọc lại', async () => {
    const org = new OrgService();
    let fail = true;
    org.registerSource({
      loadLines: async () => {
        if (fail) throw new Error('Mất kết nối MES_Hr (giả lập)');
        return [line('L1')];
      },
    });
    await expect(org.activeLineCodes()).rejects.toThrow('Mất kết nối MES_Hr');
    await expect(org.lines('A01')).rejects.toThrow('Mất kết nối MES_Hr');
    await expect(org.assertLine('A01', 'L1')).rejects.toThrow('Mất kết nối MES_Hr');
    fail = false;
    expect(await org.activeLineCodes()).toEqual(new Set(['L1']));
  });

  it('lineNamer tra tên trên mọi ĐVCS, kể cả chuyền đã ngừng; mã không còn là chuyền thì kèm "(chuyền cũ)"', async () => {
    const org = new OrgService();
    org.registerSource(fakeSource([line('L1'), line('L2', 'A01', false), line('L3', 'A02')]).source);
    const name = await org.lineNamer();
    expect(name('L1')).toBe('Chuyền L1');
    expect(name('L2')).toBe('Chuyền L2');
    // Chuyền đã chuyển sang ĐVCS khác: dữ liệu cũ ở A01 vẫn hiện đúng tên
    expect(name('L3')).toBe('Chuyền L3');
    expect(name('A01-L99')).toBe('A01-L99 (chuyền cũ)');
  });
});
