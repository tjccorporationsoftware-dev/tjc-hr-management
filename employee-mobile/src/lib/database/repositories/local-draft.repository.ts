import { getDatabase } from '@/lib/database/database';

export interface LocalDraft<TPayload = unknown> {
  id: string;
  draftType: string;
  schemaVersion: number;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface SaveLocalDraftInput<TPayload = unknown> {
  id: string;
  draftType: string;
  schemaVersion: number;
  payload: TPayload;
  expiresAt?: string | null;
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

export const localDraftRepository = {
  async findById<TPayload = unknown>(id: string): Promise<LocalDraft<TPayload> | null> {
    const database = await getDatabase();
    const record = await database.getDraft(id);

    if (!record) {
      return null;
    }

    const { payloadJson, ...rest } = record;
    return {
      ...rest,
      payload: parsePayload<TPayload>(payloadJson),
    };
  },

  async list<TPayload = unknown>(draftType?: string): Promise<LocalDraft<TPayload>[]> {
    const database = await getDatabase();
    const records = await database.listDrafts(draftType);

    return records.map(({ payloadJson, ...record }) => ({
      ...record,
      payload: parsePayload<TPayload>(payloadJson),
    }));
  },

  async save<TPayload>(input: SaveLocalDraftInput<TPayload>): Promise<void> {
    if (!Number.isInteger(input.schemaVersion) || input.schemaVersion <= 0) {
      throw new Error('schemaVersion ของ Draft ต้องเป็นจำนวนเต็มที่มากกว่า 0');
    }

    const database = await getDatabase();
    const existing = await database.getDraft(input.id);
    const now = new Date().toISOString();

    await database.upsertDraft({
      id: input.id,
      draftType: input.draftType,
      schemaVersion: input.schemaVersion,
      payloadJson: serializePayload(input.payload),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      expiresAt: input.expiresAt ?? null,
    });
  },

  async remove(id: string): Promise<void> {
    const database = await getDatabase();
    await database.deleteDraft(id);
  },

  async removeExpired(referenceTime = new Date().toISOString()): Promise<number> {
    const database = await getDatabase();
    return database.deleteExpiredDrafts(referenceTime);
  },
};
