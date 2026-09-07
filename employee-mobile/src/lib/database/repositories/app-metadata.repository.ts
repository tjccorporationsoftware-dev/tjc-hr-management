import { getDatabase } from '@/lib/database/database';

export const appMetadataRepository = {
  async get(key: string): Promise<string | null> {
    const database = await getDatabase();
    const record = await database.getMetadata(key);
    return record?.value ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    const database = await getDatabase();
    await database.upsertMetadata({
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  },

  async remove(key: string): Promise<void> {
    const database = await getDatabase();
    await database.deleteMetadata(key);
  },
};
