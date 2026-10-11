import type { ColumnType, Generated, Kysely } from 'kysely';

export type SyncMode = 'INCREMENTAL' | 'FULL';
export type SyncStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/** BIGINT về từ tedious dạng chuỗi */
type BigId = ColumnType<string, string | number, string | number>;

export interface SyncSourceTable {
  Id: Generated<number>;
  Code: string;
  Name: string;
  Description: string | null;
  SystemCode: string;
  GroupCode: string;
  SourceObject: string;
  SourceSynonym: string;
  TargetTable: string;
  ProcName: string;
  SyncModeCode: SyncMode;
  KeyColumns: string;
  OverlapMinutes: number;
  /** Giờ của nguồn (BRAVO), không phải UTC */
  WatermarkAt: Date | null;
  LastRunId: BigId | null;
  SortOrder: number;
  IsActive: boolean;
  IsSystem: boolean;
  CreatedAt: ColumnType<Date, never, never>;
  CreatedBy: number | null;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
}

export interface SyncRunTable {
  Id: ColumnType<string, never, never>;
  SyncSourceId: number;
  BatchId: string;
  ModeCode: SyncMode;
  StatusCode: SyncStatus;
  SinceAt: Date | null;
  PrevWatermarkAt: Date | null;
  NewWatermarkAt: Date | null;
  ReadCount: number | null;
  InsertedCount: number | null;
  UpdatedCount: number | null;
  DeletedCount: number | null;
  TargetCount: number | null;
  QueuedAt: ColumnType<Date, never, never>;
  StartedAt: Date | null;
  FinishedAt: Date | null;
  ErrorMessage: string | null;
  CreatedAt: ColumnType<Date, never, never>;
  CreatedBy: number | null;
  ModifiedAt: Date | null;
  ModifiedBy: number | null;
}

/** Danh mục chi nhánh chép từ BRAVO (nguồn BRAVO.DM_CHINHANH, MES_Sync/0002): BranchCode trùng mã nhà máy của MES */
export interface BravoBranchTable {
  BranchCode: string;
  MaChiNhanh: string | null;
  TenChiNhanh: string | null;
}

export interface SyncDatabase {
  SyncSource: SyncSourceTable;
  SyncRun: SyncRunTable;
  'bravo.DM_CHINHANH': BravoBranchTable;
}

export type SyncDb = Kysely<SyncDatabase>;
