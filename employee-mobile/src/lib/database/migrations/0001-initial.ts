import type { DatabaseMigration } from '@/lib/database/database.types';

export const initialMigration: DatabaseMigration = {
  version: 1,
  name: 'initial_local_storage',
  async up(database) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_drafts (
        id TEXT PRIMARY KEY NOT NULL,
        draft_type TEXT NOT NULL,
        schema_version INTEGER NOT NULL CHECK (schema_version > 0),
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_local_drafts_type_updated_at
        ON local_drafts (draft_type, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_local_drafts_expires_at
        ON local_drafts (expires_at)
        WHERE expires_at IS NOT NULL;

      CREATE TABLE IF NOT EXISTS sync_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        job_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        idempotency_key TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'retry', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
        next_retry_at TEXT,
        last_error_code TEXT,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_jobs_idempotency_key
        ON sync_jobs (idempotency_key)
        WHERE idempotency_key IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_sync_jobs_status_next_retry
        ON sync_jobs (status, next_retry_at, created_at);
    `);
  },
};
