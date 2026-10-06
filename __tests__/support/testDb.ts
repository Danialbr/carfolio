/**
 * An in-memory database for tests, running THE SAME generated migrations the
 * phone runs.
 *
 * This is the point of the whole arrangement: migrations are exercised on every
 * CI run rather than first discovered on the user's device, where a failure
 * means an app that will not open and no cloud copy to restore from.
 *
 * better-sqlite3 here, expo-sqlite in the app. Both drivers are synchronous and
 * both speak the same SQL, so repositories are written once against a shared
 * `Db` type and neither knows which one it has.
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

import { schema } from '../../db/schema';
import type { Db } from '../../db/client';

export interface TestDb {
  db: Db;
  raw: Database.Database;
  close: () => void;
}

export function createTestDb(): TestDb {
  const raw = new Database(':memory:');
  // The app sets both of these on every open; tests must match or they are not
  // testing the same database. foreign_keys especially: SQLite ships with
  // enforcement OFF, which would let these tests pass on data the app rejects.
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  const db = drizzle(raw, { schema }) as unknown as Db;
  migrate(db as never, { migrationsFolder: path.join(__dirname, '../../drizzle') });

  return { db, raw, close: () => raw.close() };
}
