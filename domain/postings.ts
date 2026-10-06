/**
 * POSTINGS — the write-rules, as pure functions.
 *
 * Recording a sale is not one row. It is a sale, possibly a Fernando profit
 * entry, and possibly a distribution, all of which must be created together or
 * not at all. Deciding *what* those rows are is a financial question, so it
 * lives here in domain/ and is tested exhaustively; the repository layer's only
 * job is to write whatever this returns inside a transaction.
 *
 * Keeping it in one place is also what makes double-counting structurally
 * impossible rather than merely unlikely: there is exactly one function that
 * can create a reimbursement, and it derives it from the expense that caused it.
 */

import type { ISODate, ISOTimestamp } from './dates';
import type { Cents } from './money';
import { computeBreakdown, splitProfit, validateAllocation } from './pnl';
import type {
  Distribution,
  Expense,
  FernandoEntry,
  InventoryItem,
  Sale,
  Vehicle,
} from './types';

export interface PostingContext {
  newId: () => string;
  now: ISOTimestamp;
}

// ─── Expenses ───────────────────────────────────────────────────────────────

/**
 * The reimbursement that an expense does or doesn't create.
 *
 * Exactly one entry, carrying `sourceId = expense.id`. The database puts a
 * unique index on (kind, sourceId), so even a double-tapped save button cannot
 * produce two reimbursements for one expense — the guarantee is enforced by the
 * schema, not by remembering to check.
 */
export function reimbursementForExpense(
  expense: Expense,
  ctx: PostingContext,
): FernandoEntry | null {
  if (expense.paidBy !== 'FERNANDO') return null;
  if (expense.deletedAt != null) return null;

  return {
    id: ctx.newId(),
    kind: 'REIMBURSEMENT',
    amountCents: expense.amountCents,
    date: expense.date,
    sourceId: expense.id,
    vehicleId: expense.vehicleId,
    notes: expense.description,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  };
}

// ─── Sale ───────────────────────────────────────────────────────────────────

export interface SaleInput {
  vehicle: Vehicle;
  /** Every live expense on the vehicle — used to compute total invested. */
  expenses: readonly Expense[];
  saleDate: ISODate;
  salePriceCents: Cents;
  buyerName: string;
  mileageOut: number | null;
  notes: string;
  /** Applies to Daniel's share only. Must sum to it exactly. */
  reinvestCents: Cents;
  distributeCents: Cents;
}

export interface SalePostings {
  ok: boolean;
  errors: string[];
  sale: Sale | null;
  /** Fernando's 50% of an ASSOCIATED result. Null for MYSELF, or when the split is zero. */
  fernandoEntry: FernandoEntry | null;
  /** Created only when Daniel takes some of his share out. */
  distribution: Distribution | null;
  /** Preview figures, so the UI can show the same numbers it is about to write. */
  totalInvestedCents: Cents;
  grossProfitCents: Cents;
  danielShareCents: Cents;
  fernandoShareCents: Cents;
}

/**
 * Everything a sale writes, computed in one place.
 *
 * Note the ordering that matters: Fernando's share is taken off the gross FIRST
 * and posted to his balance, and only Daniel's remaining half is offered to the
 * reinvest/distribute decision. That is the rule that keeps "reinvestment" from
 * quietly meaning "spending money that is owed to somebody else".
 */
export function postingsForSale(input: SaleInput, ctx: PostingContext): SalePostings {
  const errors: string[] = [];

  const totalInvestedCents = computeBreakdown(input.expenses).totalInvestedCents;
  const grossProfitCents = input.salePriceCents - totalInvestedCents;
  const { danielCents, fernandoCents } = splitProfit(grossProfitCents, input.vehicle.type);

  if (input.salePriceCents < 0) errors.push('Sale price cannot be negative.');
  if (input.vehicle.status === 'SOLD') errors.push('This vehicle has already been sold.');
  if (input.saleDate < input.vehicle.purchaseDate) {
    errors.push('The sale date cannot be before the purchase date.');
  }

  const allocation = validateAllocation({
    danielShareCents: danielCents,
    reinvestCents: input.reinvestCents,
    distributeCents: input.distributeCents,
  });
  errors.push(...allocation.errors);

  const preview = {
    totalInvestedCents,
    grossProfitCents,
    danielShareCents: danielCents,
    fernandoShareCents: fernandoCents,
  };

  if (errors.length > 0) {
    return { ok: false, errors, sale: null, fernandoEntry: null, distribution: null, ...preview };
  }

  const saleId = ctx.newId();
  const sale: Sale = {
    id: saleId,
    vehicleId: input.vehicle.id,
    saleDate: input.saleDate,
    salePriceCents: input.salePriceCents,
    buyerName: input.buyerName,
    notes: input.notes,
    danielShareCents: danielCents,
    fernandoShareCents: fernandoCents,
    reinvestCents: input.reinvestCents,
    distributeCents: input.distributeCents,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  };

  // A zero share posts nothing — an empty row on Fernando's statement is noise.
  const fernandoEntry: FernandoEntry | null =
    fernandoCents === 0
      ? null
      : {
          id: ctx.newId(),
          kind: 'PROFIT_SHARE',
          amountCents: fernandoCents,
          date: input.saleDate,
          sourceId: saleId,
          vehicleId: input.vehicle.id,
          notes: fernandoCents < 0 ? 'Loss share carried forward' : 'Profit share',
          createdAt: ctx.now,
          updatedAt: ctx.now,
          deletedAt: null,
        };

  const distribution: Distribution | null =
    input.distributeCents > 0
      ? {
          id: ctx.newId(),
          amountCents: input.distributeCents,
          date: input.saleDate,
          vehicleId: input.vehicle.id,
          reason: 'Profit distribution at sale',
          createdAt: ctx.now,
          updatedAt: ctx.now,
          deletedAt: null,
        }
      : null;

  return { ok: true, errors: [], sale, fernandoEntry, distribution, ...preview };
}

// ─── Paying Fernando ────────────────────────────────────────────────────────

/** A cash payment to Fernando. Always negative — it reduces what he is owed. */
export function paymentToFernando(
  amountCents: Cents,
  date: ISODate,
  notes: string,
  ctx: PostingContext,
): FernandoEntry {
  return {
    id: ctx.newId(),
    kind: 'PAYMENT',
    amountCents: -Math.abs(amountCents),
    date,
    sourceId: null,
    vehicleId: null,
    notes,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  };
}

// ─── Drawing stock from inventory ───────────────────────────────────────────

export interface InventoryDraw {
  ok: boolean;
  errors: string[];
  /** The vehicle expense the draw creates, flagged so it never spends cash twice. */
  expense: Expense | null;
  /** The item with its stock and remaining value reduced. */
  updatedItem: InventoryItem | null;
  amountCents: Cents;
}

/**
 * Move stock onto a vehicle.
 *
 * The cost lands on the vehicle but no cash moves — the cash left when the
 * stock was bought. `fromInventory: true` is what tells the cash model to skip
 * this expense, and it is the whole reason using a $6 bottle of oil doesn't get
 * charged to the bank account a second time.
 *
 * When a draw empties the lot, its amount is the item's entire remaining value
 * rather than quantity × unit cost. Those two can differ by a cent after enough
 * partial draws, and the difference would strand a phantom cent of inventory on
 * the books forever.
 */
export function drawFromInventory(
  item: InventoryItem,
  vehicleId: string,
  quantity: number,
  date: ISODate,
  alreadyDrawnCents: Cents,
  ctx: PostingContext,
): InventoryDraw {
  const errors: string[] = [];
  const remainingValue = item.purchaseCostCents - alreadyDrawnCents;

  if (!Number.isFinite(quantity) || quantity <= 0) errors.push('Quantity must be greater than zero.');
  if (quantity > item.quantity) {
    errors.push(`Only ${item.quantity} in stock.`);
  }

  if (errors.length > 0) {
    return { ok: false, errors, expense: null, updatedItem: null, amountCents: 0 };
  }

  const emptiesTheLot = quantity >= item.quantity;
  const amountCents = emptiesTheLot
    ? remainingValue
    : Math.min(Math.round(quantity * item.unitCostCents), remainingValue);

  const expense: Expense = {
    id: ctx.newId(),
    vehicleId,
    categoryId: 'PARTS',
    amountCents,
    date,
    description: `${item.name} ×${quantity}`,
    paidBy: 'BUSINESS',
    fromInventory: true,
    inventoryItemId: item.id,
    createdAt: ctx.now,
    updatedAt: ctx.now,
    deletedAt: null,
  };

  return {
    ok: true,
    errors: [],
    expense,
    updatedItem: { ...item, quantity: item.quantity - quantity, updatedAt: ctx.now },
    amountCents,
  };
}
