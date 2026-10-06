/**
 * DATABASE CLIENT — WEB
 *
 * Metro picks this file over client.ts for the web build, so every repository,
 * every operation and every screen is unchanged: they still get a synchronous
 * drizzle handle over real SQLite.
 *
 * How it works, and why this shape:
 *
 *   SQLite itself is sql.js — the actual C library compiled to WebAssembly. The
 *   same SQL, the same types, the same integer arithmetic as on the phone. Not
 *   a re-implementation over IndexedDB, which would have meant two versions of
 *   every query and two ways for the money maths to disagree.
 *
 *   sql.js holds the database in memory, so it must be written somewhere after
 *   every change. The whole file is serialised to IndexedDB, which for this
 *   app's data is a few hundred kilobytes and takes single-digit milliseconds.
 *   IndexedDB rather than localStorage because localStorage is strings only and
 *   caps out around 5 MB.
 *
 *   Saving is debounced and, crucially, also flushed on `pagehide`: iOS Safari
 *   can freeze a backgrounded tab without warning, and an unflushed write would
 *   be a sale that silently never happened.
 *
 * Durability, stated honestly: an installed home-screen web app gets persistent
 * storage, and this asks for it explicitly. It is still the browser's storage —
 * deleting the icon deletes the data, and it is not in the iCloud device
 * backup. That is exactly why Settings → Backup exists and why the app nags
 * about it.
 */

import { drizzle } from 'drizzle-orm/sql-js';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';

import { schema } from './schema';
import { WEB_MIGRATIONS } from './webMigrations';

export const DATABASE_NAME = 'carfolio.db';


export type Db = BaseSQLiteDatabase<'sync', any, typeof schema>;

const IDB_NAME = 'carfolio-store';
const IDB_STORE = 'files';
const IDB_KEY = 'carfolio.db';

let instance: Db | null = null;
let raw: SqlJsDatabase | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/* ── IndexedDB, wrapped in promises ───────────────────────────────────────── */

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readBytes(): Promise<Uint8Array | null> {
  const db = await openStore();
  try {
    return await new Promise<Uint8Array | null>((resolve, reject) => {
      const request = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
      request.onsuccess = () => resolve((request.result as Uint8Array | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function writeBytes(bytes: Uint8Array): Promise<void> {
  const db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/* ── Lifecycle ────────────────────────────────────────────────────────────── */

/**
 * Loads the WebAssembly build and restores the saved database. Must finish
 * before openDatabase() is called, which is why the root layout awaits it.
 * On native the same export is a no-op, so the boot sequence is identical.
 */
export async function prepareDatabase(): Promise<void> {
  if (raw) return;

  const SQL = await initSqlJs({ wasmBinary: await loadWasm() });

  const saved = await readBytes().catch(() => null);
  raw = saved ? new SQL.Database(saved) : new SQL.Database();

  raw.run('PRAGMA foreign_keys = ON;');
  runMigrations(raw);
  writeWorldSummary(raw);

  // Ask the browser to keep this data rather than evict it under pressure.
  // Granted for installed home-screen apps; harmless if declined.
  void navigator.storage?.persist?.().catch(() => undefined);

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => flush());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  if (!saved) await persistNow();
}

/**
 * Fetches the WebAssembly build ourselves rather than letting sql.js resolve it.
 * Its own `locateFile` is unreliable once the module has been through a bundler
 * — the URL it derives is relative to the current route, so opening the app at
 * /vehicle/new asks for /vehicle/sql-wasm.wasm and gets the index page back.
 * An absolute fetch has one answer at every route. It is served from this app's
 * own origin, and the service worker caches it, so it works with no signal.
 */
async function loadWasm(): Promise<ArrayBuffer> {
  const response = await fetch(`${process.env.EXPO_BASE_URL ?? ''}/sql-wasm.wasm`);
  if (!response.ok) throw new Error(`The database engine could not be loaded (${response.status}).`);
  return response.arrayBuffer();
}

/**
 * Applies any migration this database has not seen. The applied tags live in
 * SQLite itself, so the check survives a reload and a restored backup.
 */
function runMigrations(db: SqlJsDatabase): void {
  db.run('CREATE TABLE IF NOT EXISTS __migrations (tag TEXT PRIMARY KEY, applied_at TEXT NOT NULL);');
  const applied = new Set<string>();
  const rows = db.exec('SELECT tag FROM __migrations;');
  for (const value of rows[0]?.values ?? []) applied.add(String(value[0]));

  for (const migration of WEB_MIGRATIONS) {
    if (applied.has(migration.tag)) continue;
    db.run('BEGIN;');
    try {
      for (const statement of migration.statements) db.run(statement);
      db.run('INSERT INTO __migrations (tag, applied_at) VALUES (?, ?);', [
        migration.tag,
        // A migration timestamp, not a business date — the ban on toISOString()
        // exists to stop a sale being filed under yesterday, which this is not.
        // eslint-disable-next-line no-restricted-syntax
        new Date().toISOString(),
      ]);
      db.run('COMMIT;');
    } catch (error) {
      db.run('ROLLBACK;');
      throw error;
    }
  }
}

/** Web migrates inside prepareDatabase(); this exists so callers match. */
export async function migrateDatabase(): Promise<void> {}

export function openDatabase(): Db {
  if (instance) return instance;
  if (!raw) {
    throw new Error('prepareDatabase() must finish before openDatabase() on web.');
  }
  instance = drizzle(raw, { schema }) as unknown as Db;
  return instance;
}

/** The raw handle. Backup reads the bytes straight out of it. */
export function getRawConnection(): SqlJsDatabase {
  if (!raw) throw new Error('Database is not open.');
  return raw;
}

export function closeDatabase(): void {
  flush();
  raw?.close();
  raw = null;
  instance = null;
}

/* ── Persistence ──────────────────────────────────────────────────────────── */

async function persistNow(): Promise<void> {
  if (!raw) return;
  writeWorldSummary(raw);
  await writeBytes(raw.export());
}

/**
 * A small read-only summary for Arizona Industries (the 3D world). It lives in
 * the same browser storage, so the world can show real inventory and sales
 * without opening this database. Numbers only — no VINs, buyers or notes.
 */
function writeWorldSummary(db: SqlJsDatabase): void {
  try {
    const rows = (sql: string): Record<string, unknown>[] => {
      const r = db.exec(sql);
      if (!r.length) return [];
      const { columns, values } = r[0]!;
      return values.map((v: unknown[]) => Object.fromEntries(columns.map((c: string, i: number) => [c, v[i]])));
    };
    const vehicles = rows(`SELECT v.id, v.year, v.make, v.model, v.trim, v.status, v.type, v.color, v.purchase_date AS purchaseDate,
        v.estimated_sale_price_cents AS estCents,
        COALESCE((SELECT SUM(e.amount_cents) FROM expenses e WHERE e.vehicle_id = v.id AND e.deleted_at IS NULL AND e.category_id = 'PURCHASE_PRICE'), 0) AS buyCents,
        COALESCE((SELECT SUM(e.amount_cents) FROM expenses e WHERE e.vehicle_id = v.id AND e.deleted_at IS NULL AND e.category_id <> 'PURCHASE_PRICE'), 0) AS extraCents
      FROM vehicles v WHERE v.deleted_at IS NULL`);
    const sales = rows(`SELECT s.vehicle_id AS vehicleId, s.sale_date AS date, s.sale_price_cents AS priceCents, s.daniel_share_cents AS mineCents
      FROM sales s WHERE s.deleted_at IS NULL`);
    const expenses = rows(`SELECT e.vehicle_id AS vehicleId, e.category_id AS category, e.description, e.amount_cents AS cents, e.date
      FROM expenses e WHERE e.deleted_at IS NULL AND e.category_id <> 'PURCHASE_PRICE' ORDER BY e.date DESC LIMIT 20`);
    const one = (sql: string): number => Number((rows(sql)[0]?.n as number | null) ?? 0);
    const totals = {
      contributedCents: one(`SELECT SUM(amount_cents) AS n FROM capital_events WHERE deleted_at IS NULL AND kind = 'CONTRIBUTION'`),
      withdrawnCents: one(`SELECT SUM(amount_cents) AS n FROM capital_events WHERE deleted_at IS NULL AND kind = 'WITHDRAWAL'`),
      distributedCents: one(`SELECT SUM(amount_cents) AS n FROM distributions WHERE deleted_at IS NULL`),
      owedToFernandoCents: one(`SELECT SUM(amount_cents) AS n FROM fernando_entries WHERE deleted_at IS NULL`),
      inventoryItems: one(`SELECT COUNT(*) AS n FROM inventory_items WHERE deleted_at IS NULL AND quantity > 0`),
      inventoryValueCents: one(`SELECT SUM(quantity * unit_cost_cents) AS n FROM inventory_items WHERE deleted_at IS NULL`),
    };
    localStorage.setItem('carfolio.world', JSON.stringify({ v: 2, at: new Date().toISOString(), vehicles, sales, expenses, totals }));
  } catch {
    // The world is a nice-to-have; never let it break a save.
  }
}

/**
 * Called after every write. Debounced by a beat so a sale that touches four
 * tables serialises once rather than four times; `flush()` covers the case
 * where the app disappears before that beat elapses.
 */
export function persist(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persistNow();
  }, 120);
}

export function flush(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  void persistNow();
}

/** Replaces the database wholesale — the restore-from-backup path. */
export async function replaceDatabase(bytes: Uint8Array): Promise<void> {
  const SQL = await initSqlJs({ wasmBinary: await loadWasm() });
  raw?.close();
  raw = new SQL.Database(bytes);
  raw.run('PRAGMA foreign_keys = ON;');
  runMigrations(raw);
  instance = null;
  await persistNow();
}
