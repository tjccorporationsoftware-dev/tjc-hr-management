import { getDatabase } from '@/lib/database/database';
import type { SyncJobStatus } from '@/lib/database/database.types';

export interface SyncJob<TPayload = unknown> {
  id: string;
  jobType: string;
  payload: TPayload;
  idempotencyKey: string | null;
  status: SyncJobStatus;
  attemptCount: number;
  nextRetryAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueSyncJobInput<TPayload = unknown> {
  id: string;
  jobType: string;
  payload: TPayload;
  idempotencyKey?: string | null;
}

export interface UpdateSyncJobStateInput {
  id: string;
  status: SyncJobStatus;
  attemptCount: number;
  nextRetryAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}

function parsePayload<TPayload>(payloadJson: string): TPayload {
  return JSON.parse(payloadJson) as TPayload;
}

function serializePayload(payload: unknown): string {
  const payloadJson = JSON.stringify(payload);

  if (payloadJson === undefined) {
    throw new Error('Payload ต้องเป็นข้อมูลที่แปลงเป็น JSON ได้');
  }

  return payloadJson;
}

export const syncJobRepository = {
  async findById<TPayload = unknown>(id: string): Promise<SyncJob<TPayload> | null> {
    const database = await getDatabase();
    const record = await database.getSyncJob(id);

    if (!record) {
      return null;
    }

    const { payloadJson, ...rest } = record;
    return {
      ...rest,
      payload: parsePayload<TPayload>(payloadJson),
    };
  },

  async list<TPayload = unknown>(statuses?: SyncJobStatus[]): Promise<SyncJob<TPayload>[]> {
    const database = await getDatabase();
    const records = await database.listSyncJobs(statuses);

    return records.map(({ payloadJson, ...record }) => ({
      ...record,
      payload: parsePayload<TPayload>(payloadJson),
    }));
  },

  async enqueue<TPayload>(input: EnqueueSyncJobInput<TPayload>): Promise<void> {
    const database = await getDatabase();
    const existing = await database.getSyncJob(input.id);

    if (existing) {
      throw new Error(`Sync Job ${input.id} มีอยู่แล้ว`);
    }

    const now = new Date().toISOString();
    await database.upsertSyncJob({
      id: input.id,
      jobType: input.jobType,
      payloadJson: serializePayload(input.payload),
      idempotencyKey: input.idempotencyKey ?? null,
      status: 'pending',
      attemptCount: 0,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now,
    });
  },

  async updateState(input: UpdateSyncJobStateInput): Promise<void> {
    if (!Number.isInteger(input.attemptCount) || input.attemptCount < 0) {
      throw new Error('attemptCount ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    }

    const database = await getDatabase();
    const existing = await database.getSyncJob(input.id);

    if (!existing) {
      throw new Error(`ไม่พบ Sync Job ${input.id}`);
    }

    await database.upsertSyncJob({
      ...existing,
      status: input.status,
      attemptCount: input.attemptCount,
      nextRetryAt: input.nextRetryAt ?? null,
      lastErrorCode: input.lastErrorCode ?? null,
      lastErrorMessage: input.lastErrorMessage ?? null,
      updatedAt: new Date().toISOString(),
    });
  },

  async remove(id: string): Promise<void> {
    const database = await getDatabase();
    await database.deleteSyncJob(id);
  },
};
