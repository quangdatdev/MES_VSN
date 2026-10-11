import 'reflect-metadata';
import { CatalogLookupService } from '../src/platform/catalog/catalog-lookup.service';

// Tên chi nhánh ở cột Chi nhánh (5.3.10): không cần DB, SysBranch và MES_Sync giả.
type Own = { Code: string; Name: string }[];
type Bravo = { BranchCode: string; TenChiNhanh: string | null }[];
const fakeDb = (rows: Own) => ({ selectFrom: () => ({ select: () => ({ where: () => ({ execute: async () => rows }) }) }) });
const make = (own: Own, bravo: () => Promise<Bravo>) => new CatalogLookupService(fakeDb(own) as any, { branchNames: bravo } as any);
const own: Own = [
  { Code: 'A01', Name: 'Nhà máy 1' },
  { Code: 'A02', Name: 'Nhà máy 2' },
  { Code: 'A03', Name: '  ' },
];

describe('Tên chi nhánh (CatalogLookupService.branchNames)', () => {
  it('lấy TenChiNhanh của BRAVO (bỏ khoảng trắng thừa, mã có khoảng trắng vẫn khớp); BRAVO trống thì tên ở Quản trị › Nhà máy; cả hai trống thì không có tên', async () => {
    const svc = make(own, async () => [
      { BranchCode: 'A01 ', TenChiNhanh: ' CN Một ' },
      { BranchCode: 'A02', TenChiNhanh: '   ' },
      { BranchCode: 'A03', TenChiNhanh: null },
    ]);
    expect([...(await svc.branchNames())]).toEqual([
      ['A01', 'CN Một'],
      ['A02', 'Nhà máy 2'],
    ]);
    // File xuất: mã không có tên thì ghi mã
    expect(await svc.withBranchNames([{ branchCode: 'A01' }, { branchCode: 'A03' }])).toEqual([
      { branchCode: 'A01', branchName: 'CN Một' },
      { branchCode: 'A03', branchName: 'A03' },
    ]);
  });

  it('dòng BRAVO không phải nhà máy của MES (mã lạ, đơn vị tổng hợp A00) không lọt vào', async () => {
    const svc = make(own, async () => [
      { BranchCode: 'A00', TenChiNhanh: 'Công ty' },
      { BranchCode: 'VP1', TenChiNhanh: 'Văn phòng' },
    ]);
    expect([...(await svc.branchNames()).keys()]).toEqual(['A01', 'A02']);
  });

  it('chưa đọc được MES_Sync thì dùng tên ở Quản trị › Nhà máy, không báo lỗi; chỉ cảnh báo một lần', async () => {
    const svc = make(own, async () => {
      throw new Error('MES_Sync chưa có');
    });
    const warn = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    expect([...(await svc.branchNames())]).toEqual([
      ['A01', 'Nhà máy 1'],
      ['A02', 'Nhà máy 2'],
    ]);
    svc.invalidateBranchNames();
    await svc.branchNames();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('các request đến cùng lúc dùng chung một lần đọc; có cache thì không đọc lại; sửa nhà máy thì đọc lại', async () => {
    let reads = 0;
    const svc = make(own, async () => {
      reads++;
      return [];
    });
    await Promise.all([svc.branchNames(), svc.branchNames(), svc.branchNames()]);
    await svc.branchNames();
    expect(reads).toBe(1);
    svc.invalidateBranchNames();
    await svc.branchNames();
    expect(reads).toBe(2);
  });

  it('lần đọc bắt đầu trước khi sửa nhà máy không ghi tên cũ vào cache', async () => {
    let reads = 0;
    let release: () => void = () => undefined;
    const svc = make(own, async () => {
      reads++;
      if (reads === 1) await new Promise<void>((r) => (release = r));
      return [];
    });
    const old = svc.branchNames();
    // Chờ lần đọc tới bước đọc MES_Sync rồi mới sửa nhà máy
    await new Promise((r) => setTimeout(r, 0));
    expect(reads).toBe(1);
    svc.invalidateBranchNames();
    release();
    await old;
    await svc.branchNames();
    expect(reads).toBe(2);
  });
});
