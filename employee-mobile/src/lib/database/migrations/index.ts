import type { DatabaseMigration } from '@/lib/database/database.types';

import { initialMigration } from './0001-initial';

export const databaseMigrations: readonly DatabaseMigration[] = [initialMigration];

export const latestDatabaseVersion =
  databaseMigrations.at(-1)?.version ?? 0;
