import { DATABASE_SCHEMA_VERSION_KEY } from './database.constants';
import type { MigrationExecutor } from './database.types';
import { databaseMigrations, latestDatabaseVersion } from './migrations';

interface UserVersionRow {
  user_version: number;
}

export class DatabaseMigrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DatabaseMigrationError';
  }
}

function assertMigrationOrder() {
  let previousVersion = 0;

  for (const migration of databaseMigrations) {
    if (!Number.isInteger(migration.version) || migration.version <= previousVersion) {
      throw new DatabaseMigrationError(
        `ลำดับ Migration ไม่ถูกต้องที่เวอร์ชัน ${migration.version}`,
      );
    }

    previousVersion = migration.version;
  }
}

export async function runDatabaseMigrations(database: MigrationExecutor): Promise<number> {
  assertMigrationOrder();

  const versionRow = await database.getFirstAsync<UserVersionRow>('PRAGMA user_version');
  let currentVersion = versionRow?.user_version ?? 0;

  if (currentVersion > latestDatabaseVersion) {
    throw new DatabaseMigrationError(
      `ฐานข้อมูลในเครื่องเป็นเวอร์ชัน ${currentVersion} แต่แอปรองรับถึงเวอร์ชัน ${latestDatabaseVersion}`,
    );
  }

  for (const migration of databaseMigrations) {
    if (migration.version <= currentVersion) {
      continue;
    }

    try {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await migration.up(transaction);

        const appliedAt = new Date().toISOString();
        await transaction.runAsync(
          `INSERT INTO app_metadata (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`,
          [DATABASE_SCHEMA_VERSION_KEY, String(migration.version), appliedAt],
        );

        await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      throw new DatabaseMigrationError(
        `ไม่สามารถอัปเกรดฐานข้อมูลเป็นเวอร์ชัน ${migration.version} (${migration.name})`,
        { cause: error },
      );
    }

    currentVersion = migration.version;
  }

  return currentVersion;
}
