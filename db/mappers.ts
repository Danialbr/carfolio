/**
 * MAPPERS — the only place that knows how a database row is shaped.
 *
 * Rows come back with snake_case columns and loose types (SQLite has no enum);
 * the domain layer wants camelCase and precise unions. Every translation
 * happens here, so renaming a column or tightening a union touches one file and
 * nothing else in the app has to care.
 */

import type {
  CapitalEvent,
  CapitalEventKind,
  Distribution,
  Expense,
  FernandoEntry,
  FernandoEntryKind,
  InventoryItem,
  PaidBy,
  Sale,
  Vehicle,
  VehicleStatus,
  VehicleType,
} from '../domain/types';
import type {
  capitalEvents,
  distributions,
  expenses,
  fernandoEntries,
  inventoryItems,
  sales,
  vehicles,
} from './schema';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

/**
 * SQLite stores enums as plain text. If a row somehow holds an unknown value —
 * a hand-edited database, a backup from a future version — fall back to a safe
 * default rather than letting an impossible union value loose in the app, where
 * it would silently skip every `switch` branch.
 */
function asVehicleType(value: string): VehicleType {
  return value === 'ASSOCIATED' ? 'ASSOCIATED' : 'MYSELF';
}

const STATUSES: readonly string[] = ['PURCHASED', 'IN_REPAIR', 'READY', 'LISTED', 'SOLD'];
function asVehicleStatus(value: string): VehicleStatus {
  return (STATUSES.includes(value) ? value : 'PURCHASED') as VehicleStatus;
}

const PAYERS: readonly string[] = ['DANIEL', 'FERNANDO', 'BUSINESS'];
function asPaidBy(value: string): PaidBy {
  return (PAYERS.includes(value) ? value : 'DANIEL') as PaidBy;
}

const FERNANDO_KINDS: readonly string[] = ['PROFIT_SHARE', 'REIMBURSEMENT', 'PAYMENT'];
function asFernandoKind(value: string): FernandoEntryKind {
  return (FERNANDO_KINDS.includes(value) ? value : 'REIMBURSEMENT') as FernandoEntryKind;
}

function asCapitalKind(value: string): CapitalEventKind {
  return value === 'WITHDRAWAL' ? 'WITHDRAWAL' : 'CONTRIBUTION';
}

export function toVehicle(row: Row<typeof vehicles>): Vehicle {
  return {
    id: row.id,
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    vin: row.vin,
    mileageIn: row.mileageIn,
    mileageOut: row.mileageOut,
    purchaseDate: row.purchaseDate,
    saleDate: row.saleDate,
    type: asVehicleType(row.type),
    status: asVehicleStatus(row.status),
    estimatedSalePriceCents: row.estimatedSalePriceCents,
    notes: row.notes,
    color: row.color ?? '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toExpense(row: Row<typeof expenses>): Expense {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    categoryId: row.categoryId,
    amountCents: row.amountCents,
    date: row.date,
    description: row.description,
    paidBy: asPaidBy(row.paidBy),
    fromInventory: row.fromInventory,
    inventoryItemId: row.inventoryItemId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toSale(row: Row<typeof sales>): Sale {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    saleDate: row.saleDate,
    salePriceCents: row.salePriceCents,
    buyerName: row.buyerName,
    notes: row.notes,
    danielShareCents: row.danielShareCents,
    fernandoShareCents: row.fernandoShareCents,
    reinvestCents: row.reinvestCents,
    distributeCents: row.distributeCents,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toCapitalEvent(row: Row<typeof capitalEvents>): CapitalEvent {
  return {
    id: row.id,
    kind: asCapitalKind(row.kind),
    amountCents: row.amountCents,
    date: row.date,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toDistribution(row: Row<typeof distributions>): Distribution {
  return {
    id: row.id,
    amountCents: row.amountCents,
    date: row.date,
    vehicleId: row.vehicleId,
    reason: row.reason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toFernandoEntry(row: Row<typeof fernandoEntries>): FernandoEntry {
  return {
    id: row.id,
    kind: asFernandoKind(row.kind),
    amountCents: row.amountCents,
    date: row.date,
    sourceId: row.sourceId,
    vehicleId: row.vehicleId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

export function toInventoryItem(row: Row<typeof inventoryItems>): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unitCostCents: row.unitCostCents,
    purchaseCostCents: row.purchaseCostCents,
    purchaseDate: row.purchaseDate,
    supplier: row.supplier,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
