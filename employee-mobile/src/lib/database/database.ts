import { DATABASE_SCHEMA_VERSION_KEY } from './database.constants';
import type {
  AppMetadataRecord,
  LocalDatabase,
  LocalDraftRow,
  SyncJobRow,
  SyncJobStatus,
} from './database.types';
import { latestDatabaseVersion } from './migrations';

function cloneMetadata(record: AppMetadataRecord): AppMetadataRecord {
  return { ...record };
}

function cloneDraft(record: LocalDraftRow): LocalDraftRow {
  return { ...record };
}

function cloneSyncJob(record: SyncJobRow): SyncJobRow {
  return { ...record };
}

class MemoryLocalDatabase implements LocalDatabase {
  readonly kind = 'memory' as const;
  readonly schemaVersion = latestDatabaseVersion;

  private readonly metadata = new Map<string, AppMetadataRecord>();
  private readonly drafts = new Map<string, LocalDraftRow>();
  private readonly syncJobs = new Map<string, SyncJobRow>();

  constructor() {
    const initializedAt = new Date().toISOString();
    this.metadata.set(DATABASE_SCHEMA_VERSION_KEY, {
      key: DATABASE_SCHEMA_VERSION_KEY,
      value: String(latestDatabaseVersion),
      updatedAt: initializedAt,
    });
  }

  async getMetadata(key: string): Promise<AppMetadataRecord | null> {
    const record = this.metadata.get(key);
    return record ? cloneMetadata(record) : null;
  }

  async upsertMetadata(record: AppMetadataRecord): Promise<void> {
    this.metadata.set(record.key, cloneMetadata(record));
  }

  async deleteMetadata(key: string): Promise<void> {
    this.metadata.delete(key);
  }

  async getDraft(id: string): Promise<LocalDraftRow | null> {
    const record = this.drafts.get(id);
    return record ? cloneDraft(record) : null;
  }

  async listDrafts(draftType?: string): Promise<LocalDraftRow[]> {
    return Array.from(this.drafts.values())
      .filter((record) => !draftType || record.draftType === draftType)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneDraft);
  }

  async upsertDraft(record: LocalDraftRow): Promise<void> {
    this.drafts.set(record.id, cloneDraft(record));
  }

  async deleteDraft(id: string): Promise<void> {
    this.drafts.delete(id);
  }

  async deleteExpiredDrafts(referenceTime: string): Promise<number> {
    let deletedCount = 0;

    for (const [id, record] of this.drafts.entries()) {
      if (record.expiresAt && record.expiresAt <= referenceTime) {
        this.drafts.delete(id);
        deletedCount += 1;
      }
    }

    return deletedCount;
  }

  async getSyncJob(id: string): Promise<SyncJobRow | null> {
    const record = this.syncJobs.get(id);
    return record ? cloneSyncJob(record) : null;
  }

  async listSyncJobs(statuses?: SyncJobStatus[]): Promise<SyncJobRow[]> {
    const statusSet = statuses ? new Set(statuses) : null;

    return Array.from(this.syncJobs.values())
      .filter((record) => !statusSet || statusSet.has(record.status))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(cloneSyncJob);
  }

  async upsertSyncJob(record: SyncJobRow): Promise<void> {
    if (record.idempotencyKey) {
      const duplicate = Array.from(this.syncJobs.values()).find(
        (item) =>
          item.id !== record.id && item.idempotencyKey === record.idempotencyKey,
      );

      if (duplicate) {
        throw new Error('พบ Idempotency Key ซ้ำในคิว Sync');
      }
    }

    this.syncJobs.set(record.id, cloneSyncJob(record));
  }

  async deleteSyncJob(id: string): Promise<void> {
    this.syncJobs.delete(id);
  }
}

let databasePromise: Promise<LocalDatabase> | null = null;

export function getDatabase(): Promise<LocalDatabase> {
  databasePromise ??= Promise.resolve(new MemoryLocalDatabase());
  return databasePromise;
}

export async function initializeDatabase(): Promise<LocalDatabase> {
  return getDatabase();
}

export function resetDatabaseForTests(): void {
  databasePromise = null;
}
