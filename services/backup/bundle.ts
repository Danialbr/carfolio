/**
 * BACKUP — the pure half: building a bundle, validating one, and restoring it.
 *
 * Deliberately free of expo-file-system, expo-sharing and expo-document-picker.
 * Those live in ./files.ts. The split is what lets the round-trip test — the
 * most valuable test in this app — run in plain node against a real SQLite
 * database, instead of needing a device.
 *
 * With no server behind this app, an export file is the ONLY thing standing
 * between Daniel and total loss. Uninstalling the app, losing the phone, or a
 * corrupted database all end the same way without one. So this module is built
 * to a higher standard than the rest of the app:
 *
 *   · The bundle is schema-versioned, and a bundle from a NEWER version is
 *     refused outright rather than half-applied.
 *   · Import is validated in full BEFORE anything is written. A malformed file
 *     fails with a list of reasons and changes nothing.
 *   · Import takes an automatic pre-import snapshot first, so an import that
 *     was a mistake can be undone.
 *   · The whole restore runs in one transaction.
 *   · Import REPLACES rather than merges. Merging two divergent copies of a
 *     financial history is a conflict-resolution project, and a wrong merge is
 *     worse than no merge — it produces a plausible set of wrong numbers.
 */


import type { Db } from '../../db/client';
import * as t from '../../db/schema';
import type { Snapshot } from '../../db/repos';
import { nowTimestamp } from '../../domain/dates';


/**
 * Bump this ONLY when the bundle's shape changes in a way older code cannot
 * read. The importer refuses anything higher than it knows about.
 */
export const BUNDLE_VERSION = 1;

export interface Bundle {
  format: 'carfolio-backup';
  version: number;
  exportedAt: string;
  /** A cheap integrity signal — not security, just "did this file arrive whole". */
  counts: Record<string, number>;
  data: Snapshot;
}

// ─── Export ─────────────────────────────────────────────────────────────────

export function buildBundle(snapshot: Snapshot): Bundle {
  return {
    format: 'carfolio-backup',
    version: BUNDLE_VERSION,
    exportedAt: nowTimestamp(),
    counts: {
      vehicles: snapshot.vehicles.length,
      expenses: snapshot.expenses.length,
      sales: snapshot.sales.length,
      capitalEvents: snapshot.capitalEvents.length,
      distributions: snapshot.distributions.length,
      fernandoEntries: snapshot.fernandoEntries.length,
      inventory: snapshot.inventory.length,
    },
    data: snapshot,
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

export interface Validation {
  ok: boolean;
  errors: string[];
  bundle: Bundle | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkTable(
  data: Record<string, unknown>,
  key: string,
  required: readonly string[],
  errors: string[],
): void {
  const rows = data[key];
  if (!Array.isArray(rows)) {
    errors.push(`"${key}" is missing or is not a list.`);
    return;
  }
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isObject(row)) {
      errors.push(`${key}[${i}] is not a record.`);
      return;
    }
    for (const field of required) {
      if (!(field in row)) {
        errors.push(`${key}[${i}] is missing "${field}".`);
        return;
      }
    }
  }
}

/**
 * Everything is checked before anything is written.
 *
 * This is deliberately strict. A backup file is the one input to this app that
 * did not come from its own UI, and a partially-applied import of a bad file
 * would leave a database that looks fine and is wrong.
 */
export function validateBundle(raw: unknown): Validation {
  const errors: string[] = [];

  if (!isObject(raw)) {
    return { ok: false, errors: ['That file is not a Carfolio backup.'], bundle: null };
  }
  if (raw.format !== 'carfolio-backup') {
    return { ok: false, errors: ['That file is not a Carfolio backup.'], bundle: null };
  }

  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: ['This backup has no usable version number.'], bundle: null };
  }
  if (version > BUNDLE_VERSION) {
    // Refusing forward is the whole point: half-reading a newer format would
    // silently drop whatever it added.
    return {
      ok: false,
      errors: [
        `This backup was made by a newer version of Carfolio (format ${version}, this app reads ${BUNDLE_VERSION}). Update the app before restoring it.`,
      ],
      bundle: null,
    };
  }

  if (!isObject(raw.data)) {
    return { ok: false, errors: ['This backup has no data in it.'], bundle: null };
  }
  const data = raw.data;

  checkTable(data, 'vehicles', ['id', 'purchaseDate', 'type', 'status'], errors);
  checkTable(data, 'expenses', ['id', 'vehicleId', 'categoryId', 'amountCents', 'date'], errors);
  checkTable(data, 'sales', ['id', 'vehicleId', 'saleDate', 'salePriceCents'], errors);
  checkTable(data, 'capitalEvents', ['id', 'kind', 'amountCents', 'date'], errors);
  checkTable(data, 'distributions', ['id', 'amountCents', 'date'], errors);
  checkTable(data, 'fernandoEntries', ['id', 'kind', 'amountCents', 'date'], errors);
  checkTable(data, 'inventory', ['id', 'name', 'quantity', 'purchaseCostCents'], errors);

  if (errors.length > 0) return { ok: false, errors, bundle: null };

  // Referential sanity: an expense pointing at a vehicle that is not in the
  // file would violate the foreign key and abort the restore mid-transaction.
  const snapshot = data as unknown as Snapshot;
  const vehicleIds = new Set(snapshot.vehicles.map((v) => v.id));
  const orphanExpenses = snapshot.expenses.filter((e) => !vehicleIds.has(e.vehicleId));
  if (orphanExpenses.length > 0) {
    errors.push(`${orphanExpenses.length} expense(s) refer to a vehicle that is not in the file.`);
  }
  const orphanSales = snapshot.sales.filter((s) => !vehicleIds.has(s.vehicleId));
  if (orphanSales.length > 0) {
    errors.push(`${orphanSales.length} sale(s) refer to a vehicle that is not in the file.`);
  }

  if (errors.length > 0) return { ok: false, errors, bundle: null };

  return { ok: true, errors: [], bundle: raw as unknown as Bundle };
}

// ─── Import ─────────────────────────────────────────────────────────────────

/**
 * Replace everything with the contents of a bundle.
 *
 * Order matters inside the transaction: children are deleted before parents and
 * parents inserted before children, or the foreign keys reject it halfway.
 */
export function restoreBundle(db: Db, bundle: Bundle): { ok: boolean; error: string | null } {
  try {
    db.transaction((tx) => {
      // Delete children first.
      tx.delete(t.inventoryUsages).run();
      tx.delete(t.photos).run();
      tx.delete(t.fernandoEntries).run();
      tx.delete(t.distributions).run();
      tx.delete(t.sales).run();
      tx.delete(t.expenses).run();
      tx.delete(t.inventoryItems).run();
      tx.delete(t.capitalEvents).run();
      tx.delete(t.vehicles).run();

      const d = bundle.data;
      // Parents first.
      if (d.vehicles.length) tx.insert(t.vehicles).values(d.vehicles).run();
      if (d.inventory.length) tx.insert(t.inventoryItems).values(d.inventory).run();
      if (d.expenses.length) tx.insert(t.expenses).values(d.expenses).run();
      if (d.sales.length) tx.insert(t.sales).values(d.sales).run();
      if (d.capitalEvents.length) tx.insert(t.capitalEvents).values(d.capitalEvents).run();
      if (d.distributions.length) tx.insert(t.distributions).values(d.distributions).run();
      if (d.fernandoEntries.length) tx.insert(t.fernandoEntries).values(d.fernandoEntries).run();
    });
    return { ok: true, error: null };
  } catch (error) {
    // The transaction rolled back; the database is exactly as it was.
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
