/**
 * APP STATE
 *
 * One snapshot of the whole database, re-read after every write.
 *
 * That sounds wasteful and is not: the entire dataset is one person's car deals
 * — a few thousand rows at the outside — and reading it costs a millisecond.
 * What it buys is worth far more than the millisecond: every figure on every
 * screen is derived from the same consistent view of the data, so the dashboard
 * and the vehicle detail page can never disagree with each other, and there is
 * no cache to invalidate and no chance of a stale total.
 *
 * All derived numbers are computed in domain/ from this snapshot. Nothing is
 * stored twice.
 */

import { create } from 'zustand';

import type { Db } from '../db/client';
import { persist } from '../db/persist';
import { readMeta, readSnapshot, writeMeta, LAST_BACKUP_KEY, type Snapshot } from '../db/repos';
import { isValidISODate, nowTimestamp, todayISO, type ISODate } from '../domain/dates';
import { backupStatus, type BackupStatus } from '../domain/backupStatus';
import {
  buildVehicleIndex,
  type VehicleWithFinancials,
  type TypeFilter,
} from '../domain/analytics';
import {
  computeBusinessPosition,
  computeFernandoAccount,
  verifyIdentity,
  type BusinessPosition,
  type FernandoAccount,
  type IdentityCheck,
} from '../domain/capital';

const EMPTY_SNAPSHOT: Snapshot = {
  vehicles: [],
  expenses: [],
  sales: [],
  capitalEvents: [],
  distributions: [],
  fernandoEntries: [],
  inventory: [],
};

export type BootStatus = 'starting' | 'migrating' | 'ready' | 'failed';

interface AppState {
  db: Db | null;
  status: BootStatus;
  bootError: string | null;
  /** Recomputed on every refresh so "days held" is right after midnight. */
  today: ISODate;

  snapshot: Snapshot;
  vehicles: VehicleWithFinancials[];
  /** Pre-sorted views. Stable identities — see derive(). */
  garage: VehicleWithFinancials[];
  history: VehicleWithFinancials[];
  sold: VehicleWithFinancials[];
  position: BusinessPosition;
  fernando: FernandoAccount;
  integrity: IdentityCheck;

  /**
   * When the user last exported a backup. With no cloud copy behind this app,
   * how long ago this was is a genuinely important number, so it lives in state
   * and is surfaced rather than buried in a settings screen.
   */
  lastExportAt: ISODate | null;
  /** Whether work exists in only one place. Drives the prompt on the dashboard. */
  backup: BackupStatus;

  /** UI-only state. Kept here so filters survive navigation. */
  typeFilter: TypeFilter;
  yearFilter: number | null;

  attach: (db: Db) => void;
  setStatus: (status: BootStatus, error?: string) => void;
  refresh: () => void;
  setLastExportAt: (date: ISODate | null) => void;
  setTypeFilter: (filter: TypeFilter) => void;
  setYearFilter: (year: number | null) => void;
}

/**
 * Everything derived, computed ONCE per refresh and stored.
 *
 * The sorted lists live in state rather than being produced by selectors, and
 * that is not an optimisation — it is a correctness requirement.
 *
 * zustand reads through `useSyncExternalStore`, which compares the value a
 * selector returns against the previous one by identity. A selector like
 * `s => s.vehicles.filter(...).sort(...)` builds a NEW array every single call,
 * so React sees a changed value on every render and re-renders forever:
 * "Maximum update depth exceeded". Computing them here means a selector is just
 * a field read, and its identity only changes when the data actually changes.
 */
function derive(snapshot: Snapshot, today: ISODate, lastExportAt: ISODate | null) {
  const vehicles = buildVehicleIndex(snapshot.vehicles, snapshot.expenses, snapshot.sales, today);
  // Computed once and shared — this used to run twice per refresh.
  const position = computeBusinessPosition(snapshot);

  return {
    snapshot,
    today,
    vehicles,
    garage: sortGarage(vehicles),
    history: sortHistory(vehicles),
    sold: sortSold(vehicles),
    position,
    fernando: computeFernandoAccount(snapshot.fernandoEntries),
    integrity: verifyIdentity(position),
    lastExportAt,
    // Whether the person is carrying work that exists in exactly one place.
    backup: backupStatus(lastExportAt, snapshot, today),
  };
}

/** Longest-held first — that is the car costing money. */
function sortGarage(rows: readonly VehicleWithFinancials[]): VehicleWithFinancials[] {
  return rows
    .filter((v) => !v.financials.sold)
    .sort(
      (a, b) =>
        (b.financials.daysHeld ?? 0) - (a.financials.daysHeld ?? 0) ||
        b.financials.totalInvestedCents - a.financials.totalInvestedCents ||
        a.vehicle.id.localeCompare(b.vehicle.id),
    );
}

function sortHistory(rows: readonly VehicleWithFinancials[]): VehicleWithFinancials[] {
  return [...rows].sort(
    (a, b) =>
      b.vehicle.purchaseDate.localeCompare(a.vehicle.purchaseDate) ||
      b.vehicle.id.localeCompare(a.vehicle.id),
  );
}

function sortSold(rows: readonly VehicleWithFinancials[]): VehicleWithFinancials[] {
  return rows
    .filter((v) => v.financials.sold)
    .sort(
      (a, b) =>
        (b.sale?.saleDate ?? '').localeCompare(a.sale?.saleDate ?? '') ||
        b.vehicle.id.localeCompare(a.vehicle.id),
    );
}

export const useApp = create<AppState>((set, get) => ({
  db: null,
  status: 'starting',
  bootError: null,
  ...derive(EMPTY_SNAPSHOT, todayISO(), null),

  typeFilter: 'ALL',
  yearFilter: null,

  attach: (db) => {
    set({ db });
    get().refresh();
  },

  setLastExportAt: (lastExportAt) => {
    if (!lastExportAt) {
      set({ lastExportAt });
      return;
    }
    // Through withRefresh like every other write, which is what also flushes it
    // to storage. Writing the row directly left the date in memory only, and it
    // vanished on the next launch — so the app kept insisting no backup existed
    // seconds after one was made.
    withRefresh((db) => writeMeta(db, LAST_BACKUP_KEY, lastExportAt, nowTimestamp()));
  },

  setStatus: (status, error) => set({ status, bootError: error ?? null }),

  refresh: () => {
    const { db } = get();
    if (!db) return;
    // Read from the database rather than trusting the in-memory copy: the
    // export date has to survive a reload, which on the web build happens
    // every time the app is opened from the home screen.
    const lastExportAt = readMeta(db, LAST_BACKUP_KEY);
    set(derive(readSnapshot(db), todayISO(), isValidISODate(lastExportAt ?? '') ? lastExportAt : null));
  },

  setTypeFilter: (typeFilter) => set({ typeFilter }),
  setYearFilter: (yearFilter) => set({ yearFilter }),
}));

/**
 * Run a write and refresh in one step.
 *
 * Every mutation in the app goes through this, so no screen can forget to
 * refresh and leave the user looking at a number that is no longer true.
 */
export function withRefresh<T>(fn: (db: Db) => T): T | null {
  const { db, refresh } = useApp.getState();
  if (!db) return null;
  const result = fn(db);
  refresh();
  // No-op on the phone, where SQLite has already written to its file. On the
  // web build this is what moves the change out of memory and into storage, so
  // it belongs at the one place every write already funnels through.
  persist();
  return result;
}

// ─── Selectors ──────────────────────────────────────────────────────────────

/**
 * Selectors are field reads, never computations.
 *
 * Anything that builds a new array or object here would reintroduce the
 * infinite-render loop described above. If a screen needs a filtered slice,
 * it selects a stable field and narrows it in a `useMemo`.
 */

/** Bought and not yet sold, longest-held first. */
export function selectGarage(state: AppState): VehicleWithFinancials[] {
  return state.garage;
}

/** Everything ever entered, newest purchase first. */
export function selectHistory(state: AppState): VehicleWithFinancials[] {
  return state.history;
}

export function selectSold(state: AppState): VehicleWithFinancials[] {
  return state.sold;
}

export function selectVehicle(state: AppState, id: string): VehicleWithFinancials | null {
  return state.vehicles.find((v) => v.vehicle.id === id) ?? null;
}
