import * as SQLite from 'expo-sqlite';

import { LOCAL_DATABASE_NAME } from './database.constants';
import type {
  AppMetadataRecord,
  LocalDatabase,
  LocalDraftRow,
  MigrationExecutor,
  SqlBindValue,
  SyncJobRow,
  SyncJobStatus,
} from './database.types';
import { runDatabaseMigrations } from './migration-runner';

interface AppMetadataSqlRow {
  key: string;
  value: string;
  updated_at: string;
}

interface LocalDraftSqlRow {
  id: string;
  draft_type: string;
  schema_version: number;
  payload_json: string;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
}

interface SyncJobSqlRow {
  id: string;
  job_type: string;
  payload_json: string;
  idempotency_key: string | null;
  status: SyncJobStatus;
  attempt_count: number;
  next_retry_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

function mapMetadata(row: AppMetadataSqlRow): AppMetadataRecord {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updated_at,
  };
}

function mapDraft(row: LocalDraftSqlRow): LocalDraftRow {
  return {
    id: row.id,
    draftType: row.draft_type,
    schemaVersion: row.schema_version,
    payloadJson: row.payload_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function mapSyncJob(row: SyncJobSqlRow): SyncJobRow {
  return {
    id: row.id,
    jobType: row.job_type,
    payloadJson: row.payload_json,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    attemptCount: row.attempt_count,
    nextRetryAt: row.next_retry_at,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createMigrationExecutor(
  database: SQLite.SQLiteDatabase,
): MigrationExecutor {
  return {
    execAsync: (sql) => database.execAsync(sql),
    async runAsync(sql, parameters = []) {
      await database.runAsync(sql, parameters);
    },
    getFirstAsync: <T,>(sql: string) => database.getFirstAsync<T>(sql),
    withExclusiveTransactionAsync: async (task) => {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await task(createMigrationExecutor(transaction));
      });
    },
  };
}

class SQLiteLocalDatabase implements LocalDatabase {
  readonly kind = 'sqlite' as const;

  constructor(
    private readonly database: SQLite.SQLiteDatabase,
    readonly schemaVersion: number,
  ) {}

  async getMetadata(key: string): Promise<AppMetadataRecord | null> {
    const row = await this.database.getFirstAsync<AppMetadataSqlRow>(
      'SELECT key, value, updated_at FROM app_metadata WHERE key = ?',
      [key],
    );

    return row ? mapMetadata(row) : null;
  }

  async upsertMetadata(record: AppMetadataRecord): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [record.key, record.value, record.updatedAt],
    );
  }

  async deleteMetadata(key: string): Promise<void> {
    await this.database.runAsync('DELETE FROM app_metadata WHERE key = ?', [key]);
  }

  async getDraft(id: string): Promise<LocalDraftRow | null> {
    const row = await this.database.getFirstAsync<LocalDraftSqlRow>(
      `SELECT id, draft_type, schema_version, payload_json, created_at, updated_at, expires_at
       FROM local_drafts
       WHERE id = ?`,
      [id],
    );

    return row ? mapDraft(row) : null;
  }

  async listDrafts(draftType?: string): Promise<LocalDraftRow[]> {
    const rows = draftType
      ? await this.database.getAllAsync<LocalDraftSqlRow>(
          `SELECT id, draft_type, schema_version, payload_json, created_at, updated_at, expires_at
           FROM local_drafts
           WHERE draft_type = ?
           ORDER BY updated_at DESC`,
          [draftType],
        )
      : await this.database.getAllAsync<LocalDraftSqlRow>(
          `SELECT id, draft_type, schema_version, payload_json, created_at, updated_at, expires_at
           FROM local_drafts
           ORDER BY updated_at DESC`,
        );

    return rows.map(mapDraft);
  }

  async upsertDraft(record: LocalDraftRow): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO local_drafts (
         id, draft_type, schema_version, payload_json, created_at, updated_at, expires_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         draft_type = excluded.draft_type,
         schema_version = excluded.schema_version,
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at,
         expires_at = excluded.expires_at`,
      [
        record.id,
        record.draftType,
        record.schemaVersion,
        record.payloadJson,
        record.createdAt,
        record.updatedAt,
        record.expiresAt,
      ],
    );
  }

  async deleteDraft(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM local_drafts WHERE id = ?', [id]);
  }

  async deleteExpiredDrafts(referenceTime: string): Promise<number> {
    const result = await this.database.runAsync(
      'DELETE FROM local_drafts WHERE expires_at IS NOT NULL AND expires_at <= ?',
      [referenceTime],
    );

    return result.changes;
  }

  async getSyncJob(id: string): Promise<SyncJobRow | null> {
    const row = await this.database.getFirstAsync<SyncJobSqlRow>(
      `SELECT id, job_type, payload_json, idempotency_key, status, attempt_count,
              next_retry_at, last_error_code, last_error_message, created_at, updated_at
       FROM sync_jobs
       WHERE id = ?`,
      [id],
    );

    return row ? mapSyncJob(row) : null;
  }

  async listSyncJobs(statuses?: SyncJobStatus[]): Promise<SyncJobRow[]> {
    if (!statuses?.length) {
      const rows = await this.database.getAllAsync<SyncJobSqlRow>(
        `SELECT id, job_type, payload_json, idempotency_key, status, attempt_count,
                next_retry_at, last_error_code, last_error_message, created_at, updated_at
         FROM sync_jobs
         ORDER BY created_at ASC`,
      );

      return rows.map(mapSyncJob);
    }

    const placeholders = statuses.map(() => '?').join(', ');
    const rows = await this.database.getAllAsync<SyncJobSqlRow>(
      `SELECT id, job_type, payload_json, idempotency_key, status, attempt_count,
              next_retry_at, last_error_code, last_error_message, created_at, updated_at
       FROM sync_jobs
       WHERE status IN (${placeholders})
       ORDER BY created_at ASC`,
      statuses as SqlBindValue[],
    );

    return rows.map(mapSyncJob);
  }

  async upsertSyncJob(record: SyncJobRow): Promise<void> {
    await this.database.runAsync(
      `INSERT INTO sync_jobs (
         id, job_type, payload_json, idempotency_key, status, attempt_count,
         next_retry_at, last_error_code, last_error_message, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         job_type = excluded.job_type,
         payload_json = excluded.payload_json,
         idempotency_key = excluded.idempotency_key,
         status = excluded.status,
         attempt_count = excluded.attempt_count,
         next_retry_at = excluded.next_retry_at,
         last_error_code = excluded.last_error_code,
         last_error_message = excluded.last_error_message,
         updated_at = excluded.updated_at`,
      [
        record.id,
        record.jobType,
        record.payloadJson,
        record.idempotencyKey,
        record.status,
        record.attemptCount,
        record.nextRetryAt,
        record.lastErrorCode,
        record.lastErrorMessage,
        record.createdAt,
        record.updatedAt,
      ],
    );
  }

  async deleteSyncJob(id: string): Promise<void> {
    await this.database.runAsync('DELETE FROM sync_jobs WHERE id = ?', [id]);
  }
}

let databasePromise: Promise<LocalDatabase> | null = null;

async function openAndPrepareDatabase(): Promise<LocalDatabase> {
  const sqliteDatabase = await SQLite.openDatabaseAsync(LOCAL_DATABASE_NAME);

  await sqliteDatabase.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  const schemaVersion = await runDatabaseMigrations(
    createMigrationExecutor(sqliteDatabase),
  );

  return new SQLiteLocalDatabase(sqliteDatabase, schemaVersion);
}

export function getDatabase(): Promise<LocalDatabase> {
  databasePromise ??= openAndPrepareDatabase().catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

export async function initializeDatabase(): Promise<LocalDatabase> {
  return getDatabase();
}

export function resetDatabaseForTests(): void {
  databasePromise = null;
}
