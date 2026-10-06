/**
 * REPOSITORIES — the only code in the app that writes SQL.
 *
 * Every read filters out soft-deleted rows. Nothing here does arithmetic on
 * money: repositories fetch rows and hand them to domain/ to be reasoned about.
 * That separation is what keeps the financial logic testable without a database
 * and the database testable without a phone.
 */

import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import type { Db } from './client';
import * as t from './schema';
import {
  toCapitalEvent,
  toDistribution,
  toExpense,
  toFernandoEntry,
  toInventoryItem,
  toSale,
  toVehicle,
} from './mappers';
import { nowTimestamp } from '../domain/dates';
import type {
  CapitalEvent,
  Distribution,
  Expense,
  FernandoEntry,
  InventoryItem,
  Sale,
  Vehicle,
} from '../domain/types';

const alive = isNull;

/**
 * Every ordered query carries `id` as a final tie-break.
 *
 * Without it, rows sharing a date come back in whatever order SQLite happens to
 * produce, which is not stable: a list would quietly reshuffle between refreshes,
 * and an exported backup would not round-trip to an identical snapshot. Ids are
 * time-ordered, so this also puts same-day records in the order they were entered.
 */

// ─── Vehicles ───────────────────────────────────────────────────────────────

export function listVehicles(db: Db): Vehicle[] {
  return db
    .select()
    .from(t.vehicles)
    .where(alive(t.vehicles.deletedAt))
    .orderBy(desc(t.vehicles.purchaseDate), desc(t.vehicles.id))
    .all()
    .map(toVehicle);
}

export function getVehicle(db: Db, id: string): Vehicle | null {
  const row = db
    .select()
    .from(t.vehicles)
    .where(and(eq(t.vehicles.id, id), alive(t.vehicles.deletedAt)))
    .get();
  return row ? toVehicle(row) : null;
}

export function insertVehicle(db: Db, vehicle: Vehicle): void {
  db.insert(t.vehicles).values(vehicle).run();
}

export function updateVehicle(db: Db, id: string, patch: Partial<Vehicle>): void {
  const { id: _ignored, createdAt: _created, ...rest } = patch;
  db.update(t.vehicles)
    .set({ ...rest, updatedAt: nowTimestamp() })
    .where(eq(t.vehicles.id, id))
    .run();
}

/**
 * Soft delete, cascading to the vehicle's own records.
 *
 * Not a hard delete, and never a silent one: a sold vehicle carries a closed
 * deal and possibly a settled split with Fernando. The rows stay and stop
 * counting; the caller is expected to have confirmed with the user first.
 */
export function softDeleteVehicle(db: Db, id: string): void {
  const now = nowTimestamp();
  db.transaction((tx) => {
    tx.update(t.vehicles).set({ deletedAt: now, updatedAt: now }).where(eq(t.vehicles.id, id)).run();
    tx.update(t.expenses).set({ deletedAt: now, updatedAt: now }).where(eq(t.expenses.vehicleId, id)).run();
    tx.update(t.sales).set({ deletedAt: now, updatedAt: now }).where(eq(t.sales.vehicleId, id)).run();
    tx.update(t.fernandoEntries)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(t.fernandoEntries.vehicleId, id))
      .run();
    tx.update(t.distributions)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(t.distributions.vehicleId, id))
      .run();
    tx.update(t.photos).set({ deletedAt: now, updatedAt: now }).where(eq(t.photos.vehicleId, id)).run();
  });
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export function listExpenses(db: Db): Expense[] {
  return db
    .select()
    .from(t.expenses)
    .where(alive(t.expenses.deletedAt))
    .orderBy(desc(t.expenses.date), desc(t.expenses.id))
    .all()
    .map(toExpense);
}

export function listExpensesForVehicle(db: Db, vehicleId: string): Expense[] {
  return db
    .select()
    .from(t.expenses)
    .where(and(eq(t.expenses.vehicleId, vehicleId), alive(t.expenses.deletedAt)))
    .orderBy(asc(t.expenses.date), asc(t.expenses.id))
    .all()
    .map(toExpense);
}

export function getExpense(db: Db, id: string): Expense | null {
  const row = db
    .select()
    .from(t.expenses)
    .where(and(eq(t.expenses.id, id), alive(t.expenses.deletedAt)))
    .get();
  return row ? toExpense(row) : null;
}

// ─── Sales ──────────────────────────────────────────────────────────────────

export function listSales(db: Db): Sale[] {
  return db
    .select()
    .from(t.sales)
    .where(alive(t.sales.deletedAt))
    .orderBy(desc(t.sales.saleDate), desc(t.sales.id))
    .all()
    .map(toSale);
}

export function getSaleForVehicle(db: Db, vehicleId: string): Sale | null {
  const row = db
    .select()
    .from(t.sales)
    .where(and(eq(t.sales.vehicleId, vehicleId), alive(t.sales.deletedAt)))
    .get();
  return row ? toSale(row) : null;
}

// ─── Capital, distributions, Fernando ───────────────────────────────────────

export function listCapitalEvents(db: Db): CapitalEvent[] {
  return db
    .select()
    .from(t.capitalEvents)
    .where(alive(t.capitalEvents.deletedAt))
    .orderBy(desc(t.capitalEvents.date), desc(t.capitalEvents.id))
    .all()
    .map(toCapitalEvent);
}

export function insertCapitalEvent(db: Db, event: CapitalEvent): void {
  db.insert(t.capitalEvents).values(event).run();
}

export function listDistributions(db: Db): Distribution[] {
  return db
    .select()
    .from(t.distributions)
    .where(alive(t.distributions.deletedAt))
    .orderBy(desc(t.distributions.date), desc(t.distributions.id))
    .all()
    .map(toDistribution);
}

export function insertDistribution(db: Db, distribution: Distribution): void {
  db.insert(t.distributions).values(distribution).run();
}

export function listFernandoEntries(db: Db): FernandoEntry[] {
  return db
    .select()
    .from(t.fernandoEntries)
    .where(alive(t.fernandoEntries.deletedAt))
    .orderBy(desc(t.fernandoEntries.date), desc(t.fernandoEntries.id))
    .all()
    .map(toFernandoEntry);
}

export function insertFernandoEntry(db: Db, entry: FernandoEntry): void {
  db.insert(t.fernandoEntries).values(entry).run();
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export function listInventory(db: Db): InventoryItem[] {
  return db
    .select()
    .from(t.inventoryItems)
    .where(alive(t.inventoryItems.deletedAt))
    .orderBy(asc(t.inventoryItems.name), asc(t.inventoryItems.id))
    .all()
    .map(toInventoryItem);
}

export function getInventoryItem(db: Db, id: string): InventoryItem | null {
  const row = db
    .select()
    .from(t.inventoryItems)
    .where(and(eq(t.inventoryItems.id, id), alive(t.inventoryItems.deletedAt)))
    .get();
  return row ? toInventoryItem(row) : null;
}

export function insertInventoryItem(db: Db, item: InventoryItem): void {
  db.insert(t.inventoryItems).values(item).run();
}

export function updateInventoryItem(db: Db, id: string, patch: Partial<InventoryItem>): void {
  const { id: _ignored, createdAt: _created, ...rest } = patch;
  db.update(t.inventoryItems)
    .set({ ...rest, updatedAt: nowTimestamp() })
    .where(eq(t.inventoryItems.id, id))
    .run();
}

/** Total value already drawn out of one lot — the complement of its remaining value. */
export function inventoryDrawnCents(db: Db, itemId: string): number {
  const rows = db
    .select()
    .from(t.expenses)
    .where(and(eq(t.expenses.inventoryItemId, itemId), alive(t.expenses.deletedAt)))
    .all();
  return rows.reduce((sum, row) => sum + row.amountCents, 0);
}

// ─── Whole-database read, for the dashboard and for backups ─────────────────

export interface Snapshot {
  vehicles: Vehicle[];
  expenses: Expense[];
  sales: Sale[];
  capitalEvents: CapitalEvent[];
  distributions: Distribution[];
  fernandoEntries: FernandoEntry[];
  inventory: InventoryItem[];
}

/**
 * Everything, in one pass.
 *
 * The whole dataset is a few thousand rows at most — one person flipping cars,
 * not a fleet — so reading it all and deriving figures in memory is both
 * simpler and faster than a dozen aggregate queries, and it means every metric
 * on screen comes from exactly the same consistent view of the data.
 */
export function readSnapshot(db: Db): Snapshot {
  return {
    vehicles: listVehicles(db),
    expenses: listExpenses(db),
    sales: listSales(db),
    capitalEvents: listCapitalEvents(db),
    distributions: listDistributions(db),
    fernandoEntries: listFernandoEntries(db),
    inventory: listInventory(db),
  };
}

// ─── App metadata ───────────────────────────────────────────────────────────

/**
 * One row per key. Used for the things that are about the app rather than the
 * business — the date of the last export, for instance — and deliberately kept
 * out of Snapshot so a backup bundle stays a record of the BUSINESS and not of
 * when it was last saved.
 */
export function readMeta(db: Db, key: string): string | null {
  const row = db.select().from(t.appMeta).where(eq(t.appMeta.key, key)).get();
  return row?.value ?? null;
}

export function writeMeta(db: Db, key: string, value: string, now: string): void {
  db.insert(t.appMeta)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({ target: t.appMeta.key, set: { value, updatedAt: now } })
    .run();
}

export const LAST_BACKUP_KEY = 'last_backup_at';

// ─── Custom categories ──────────────────────────────────────────────────────

export interface CustomCategoryRow {
  id: string;
  label: string;
  group: string;
}

export function listCustomCategories(db: Db): CustomCategoryRow[] {
  return db
    .select()
    .from(t.customCategories)
    .where(alive(t.customCategories.deletedAt))
    .orderBy(asc(t.customCategories.label), asc(t.customCategories.id))
    .all()
    .map((row) => ({ id: row.id, label: row.label, group: row.group }));
}

export function insertCustomCategory(db: Db, row: CustomCategoryRow): void {
  const now = nowTimestamp();
  db.insert(t.customCategories)
    .values({ ...row, createdAt: now, updatedAt: now, deletedAt: null })
    .run();
}

/**
 * Archives a user-created category rather than deleting it.
 *
 * Expenses store the category id, not a foreign key, so a hard delete would
 * leave historical expenses labelled with a bare id. Archiving keeps every past
 * record readable while removing the category from the picker.
 */
export function archiveCustomCategory(db: Db, id: string): void {
  const now = nowTimestamp();
  db.update(t.customCategories)
    .set({ deletedAt: now, updatedAt: now })
    .where(eq(t.customCategories.id, id))
    .run();
}
