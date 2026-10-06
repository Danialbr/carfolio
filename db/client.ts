/**
 * DATABASE CLIENT
 *
 * One SQLite file, opened once. Two pragmas matter and are set every time,
 * because SQLite does not remember them for you:
 *
 *   journal_mode = WAL   Survives the app being killed mid-write. Without it a
 *                        crash during a sale can leave a half-written deal.
 *   foreign_keys = ON    SQLite ships with FK enforcement OFF by default. The
 *                        references in schema.ts are decorative until this runs.
 *
 * The same schema and the same generated migrations are used by the test client
 * (db/testClient.ts) under better-sqlite3, so migrations are exercised in CI
 * rather than first discovered on the user's phone.
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import * as SQLite from 'expo-sqlite';

import migrations from '../drizzle/migrations';
import { schema } from './schema';

export const DATABASE_NAME = 'carfolio.db';

/**
 * The database handle, written so repositories work against either driver.
 * expo-sqlite at runtime, better-sqlite3 in tests — both are synchronous.
 */
 
export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;

let instance: Db | null = null;
let rawConnection: SQLite.SQLiteDatabase | null = null;

export function openDatabase(): Db {
  if (instance) return instance;

  const connection = SQLite.openDatabaseSync(DATABASE_NAME, { enableChangeListener: true });
  connection.execSync('PRAGMA journal_mode = WAL;');
  connection.execSync('PRAGMA foreign_keys = ON;');

  rawConnection = connection;
  instance = drizzle(connection, { schema }) as unknown as Db;
  return instance;
}

/** The underlying expo-sqlite handle, for the migration hook and for backups. */
export function getRawConnection(): SQLite.SQLiteDatabase {
  if (!rawConnection) openDatabase();
  if (!rawConnection) throw new Error('Database is not open.');
  return rawConnection;
}

/**
 * Present so callers never branch on platform. The web client (client.web.ts)
 * has real work to do here — load WebAssembly, restore the saved bytes, write
 * after every change — while expo-sqlite is a file that is already there and
 * already durable. Keeping the shape identical is what lets the root layout,
 * the store and the backup screen be written once.
 */
export async function prepareDatabase(): Promise<void> {}

// persist()/flush() live in db/persist.ts — see the note there on why they are
// not exported from this file.

/**
 * Applies any pending migration. Web does the same job inside prepareDatabase()
 * against its own generated statement list; here drizzle's expo-sqlite migrator
 * reads the .sql files through Metro. One call site either way.
 */
export async function migrateDatabase(): Promise<void> {
  const connection = getRawConnection();
  await migrate(drizzle(connection, { schema }), migrations);
}

/** Used by restore-from-backup, which replaces the file underneath us. */
export function closeDatabase(): void {
  rawConnection?.closeSync();
  rawConnection = null;
  instance = null;
}
