/**
 * DOMAIN TYPES — the shapes the financial layer reasons about.
 *
 * These are deliberately plain objects with no ORM types, no React types and no
 * methods. The repository layer maps database rows into these; every screen and
 * every calculation consumes these. That is what keeps domain/ testable in
 * milliseconds and what keeps a schema change from rippling into the UI.
 */

import type { Cents } from './money';
import type { ISODate, ISOTimestamp } from './dates';

/** Every record is identified by an app-generated id, created before it is stored. */
export type Id = string;

// ─── Vehicle ────────────────────────────────────────────────────────────────

/**
 * The only partnership distinction in the app.
 *   MYSELF     — Daniel works it alone. 100% of profit or loss is his.
 *   ASSOCIATED — worked with Fernando. Profit and loss split 50/50.
 * Daniel funds 100% of the capital in both cases.
 */
export type VehicleType = 'MYSELF' | 'ASSOCIATED';

/**
 * Where the car is in its life. SOLD is terminal and is only ever set by the
 * sale flow, which writes the sale row in the same transaction — a vehicle can
 * never be SOLD without a sale attached.
 */
export type VehicleStatus = 'PURCHASED' | 'IN_REPAIR' | 'READY' | 'LISTED' | 'SOLD';

export interface Vehicle {
  id: Id;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  vin: string;
  mileageIn: number | null;
  mileageOut: number | null;
  purchaseDate: ISODate;
  saleDate: ISODate | null;
  type: VehicleType;
  status: VehicleStatus;
  /** Optional target, used for estimated profit in the Garage. */
  estimatedSalePriceCents: Cents | null;
  notes: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

// ─── Expenses ───────────────────────────────────────────────────────────────

/** Who actually paid. Only FERNANDO creates a reimbursement liability. */
export type PaidBy = 'DANIEL' | 'FERNANDO' | 'BUSINESS';

export interface Expense {
  id: Id;
  vehicleId: Id;
  categoryId: string;
  amountCents: Cents;
  date: ISODate;
  description: string;
  paidBy: PaidBy;
  /**
   * True when this expense is stock drawn from Inventory rather than a fresh
   * purchase. The cost still lands on the vehicle, but NO cash moves — the cash
   * left when the inventory was bought. Without this flag, using a $6 bottle of
   * oil would be counted against the bank account twice.
   */
  fromInventory: boolean;
  /** Set when fromInventory is true, so stock can be restored if the expense is deleted. */
  inventoryItemId: Id | null;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

// ─── Sale ───────────────────────────────────────────────────────────────────

export interface Sale {
  id: Id;
  vehicleId: Id;
  saleDate: ISODate;
  salePriceCents: Cents;
  buyerName: string;
  notes: string;
  /** Daniel's share of gross profit, frozen at sale time. */
  danielShareCents: Cents;
  /** Fernando's share; always 0 for MYSELF vehicles. */
  fernandoShareCents: Cents;
  /** Of Daniel's share, the part kept in the business. reinvest + distribute === danielShare. */
  reinvestCents: Cents;
  /** Of Daniel's share, the part taken out. Mirrored by a Distribution row. */
  distributeCents: Cents;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

// ─── Capital ────────────────────────────────────────────────────────────────

/**
 * Protected principal. CONTRIBUTION adds, WITHDRAWAL returns principal.
 *
 * This is kept strictly apart from profit: a withdrawal here reduces the
 * protected capital figure, whereas a Distribution takes profit out and leaves
 * capital untouched. Conflating the two is how the "original capital" number
 * silently drifts.
 */
export type CapitalEventKind = 'CONTRIBUTION' | 'WITHDRAWAL';

export interface CapitalEvent {
  id: Id;
  kind: CapitalEventKind;
  amountCents: Cents;
  date: ISODate;
  notes: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

/** Profit taken out of the business by Daniel. Never touches protected capital. */
export interface Distribution {
  id: Id;
  amountCents: Cents;
  date: ISODate;
  /** The sale it came from, when it was created by the allocation step. */
  vehicleId: Id | null;
  reason: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

// ─── Fernando's account ─────────────────────────────────────────────────────

/**
 * One running balance for Fernando, combining the two things he can be owed.
 * Positive balance = Daniel owes Fernando.
 *
 *   PROFIT_SHARE   — his 50% of an ASSOCIATED sale. Negative on a loss, which
 *                    carries forward against his future profits rather than
 *                    being collected in cash.
 *   REIMBURSEMENT  — he paid a vehicle expense out of pocket.
 *   PAYMENT        — Daniel actually handed him money. Always negative.
 *
 * Each entry is generated by exactly one source record and carries that record's
 * id, which is what makes double-counting structurally impossible: an expense
 * can only ever produce one reimbursement row.
 */
export type FernandoEntryKind = 'PROFIT_SHARE' | 'REIMBURSEMENT' | 'PAYMENT';

export interface FernandoEntry {
  id: Id;
  kind: FernandoEntryKind;
  /** Signed. Positive increases what Daniel owes; PAYMENT is negative. */
  amountCents: Cents;
  date: ISODate;
  /** The expense (REIMBURSEMENT) or sale (PROFIT_SHARE) that produced this row. */
  sourceId: Id | null;
  vehicleId: Id | null;
  notes: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: Id;
  name: string;
  category: string;
  /** Units remaining in stock. Informational — it is NOT what values the asset. */
  quantity: number;
  unitCostCents: Cents;
  /**
   * The cash actually paid for this lot, fixed at purchase.
   *
   * The asset's remaining value is this minus what has been drawn onto
   * vehicles, rather than `quantity × unitCost`. Multiplying back out would
   * round independently on each side and drift a cent or two away from what
   * left the bank — enough to break the accounting identity in capital.ts.
   */
  purchaseCostCents: Cents;
  purchaseDate: ISODate;
  supplier: string;
  notes: string;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}

/** A draw of stock onto a vehicle. Mirrored by an Expense with fromInventory=true. */
export interface InventoryUsage {
  id: Id;
  inventoryItemId: Id;
  vehicleId: Id;
  quantity: number;
  /** Unit cost frozen at the moment of use, so later restocking can't rewrite history. */
  unitCostCents: Cents;
  date: ISODate;
  expenseId: Id;
  createdAt: ISOTimestamp;
  deletedAt: ISOTimestamp | null;
}
