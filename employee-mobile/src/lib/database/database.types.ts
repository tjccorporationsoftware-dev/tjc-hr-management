export type SyncJobStatus = 'pending' | 'processing' | 'retry' | 'failed';

export interface AppMetadataRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export interface LocalDraftRow {
  id: string;
  draftType: string;
  schemaVersion: number;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface SyncJobRow {
  id: string;
  jobType: string;
  payloadJson: string;
  idempotencyKey: string | null;
  status: SyncJobStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalDatabase {
  readonly kind: 'memory' | 'sqlite';
  readonly schemaVersion: number;

  getMetadata(key: string): Promise<AppMetadataRecord | null>;
  upsertMetadata(record: AppMetadataRecord): Promise<void>;
  deleteMetadata(key: string): Promise<void>;

  getDraft(id: string): Promise<LocalDraftRow | null>;
  listDrafts(draftType?: string): Promise<LocalDraftRow[]>;
  upsertDraft(record: LocalDraftRow): Promise<void>;
  deleteDraft(id: string): Promise<void>;
  deleteExpiredDrafts(referenceTime: string): Promise<number>;

  getSyncJob(id: string): Promise<SyncJobRow | null>;
  listSyncJobs(statuses?: SyncJobStatus[]): Promise<SyncJobRow[]>;
  upsertSyncJob(record: SyncJobRow): Promise<void>;
  deleteSyncJob(id: string): Promise<void>;
}

export type SqlBindValue = string | number | null;

export interface MigrationExecutor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, parameters?: SqlBindValue[]): Promise<void>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  withExclusiveTransactionAsync(task: (transaction: MigrationExecutor) => Promise<void>): Promise<void>;
}

export interface DatabaseMigration {
  version: number;
  name: string;
  up(database: MigrationExecutor): Promise<void>;
}
