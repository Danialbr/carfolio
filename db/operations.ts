/**
 * OPERATIONS — the writes that touch more than one table.
 *
 * Recording a sale creates a sale row, updates the vehicle, possibly posts
 * Fernando's share and possibly a distribution. Those either all happen or none
 * do. A crash between them would leave a deal that reconciles to nothing, and
 * with no cloud copy to fall back on there is nothing to repair it from — so
 * every one of these runs inside a transaction.
 *
 * What each operation *should* write is decided in domain/postings.ts. This
 * file's only job is to persist that decision atomically.
 */

import { eq } from 'drizzle-orm';

import type { Db } from './client';
import * as t from './schema';
import * as repos from './repos';
import { toExpense } from './mappers';
import { nowTimestamp, todayISO, type ISODate } from '../domain/dates';
import type { Cents } from '../domain/money';
import {
  drawFromInventory,
  paymentToFernando,
  postingsForSale,
  reimbursementForExpense,
  type PostingContext,
  type SaleInput,
} from '../domain/postings';
import type {
  CapitalEvent,
  Expense,
  InventoryItem,
  PaidBy,
  Vehicle,
  VehicleStatus,
  VehicleType,
} from '../domain/types';
import { newId } from './ids';

function ctx(): PostingContext {
  return { newId, now: nowTimestamp() };
}

export interface OperationResult<T = void> {
  ok: boolean;
  errors: string[];
  value: T | null;
}

const failure = <T>(errors: string[]): OperationResult<T> => ({ ok: false, errors, value: null });
const success = <T>(value: T): OperationResult<T> => ({ ok: true, errors: [], value });

// ─── Creating a vehicle ─────────────────────────────────────────────────────

export interface NewVehicleInput {
  year: number | null;
  make: string;
  model: string;
  trim: string;
  vin: string;
  mileageIn: number | null;
  purchaseDate: ISODate;
  type: VehicleType;
  purchasePriceCents: Cents;
  purchasePaidBy: PaidBy;
  estimatedSalePriceCents: Cents | null;
  notes: string;
  color?: string;
}

/**
 * A vehicle and its purchase price are created together.
 *
 * The purchase price is an expense in the PURCHASE_PRICE category rather than a
 * column on the vehicle — one ledger, one place a dollar can live — but it is
 * written here so a vehicle can never exist without one, and the UI always
 * presents it separately from additional investment.
 */
export function createVehicle(db: Db, input: NewVehicleInput): OperationResult<Vehicle> {
  const errors: string[] = [];
  if (input.make.trim() === '' && input.model.trim() === '') {
    errors.push('Enter at least a make or a model.');
  }
  if (input.purchasePriceCents < 0) errors.push('Purchase price cannot be negative.');
  if (errors.length > 0) return failure(errors);

  const now = nowTimestamp();
  const vehicle: Vehicle = {
    id: newId(),
    year: input.year,
    make: input.make.trim(),
    model: input.model.trim(),
    trim: input.trim.trim(),
    vin: input.vin.trim().toUpperCase(),
    mileageIn: input.mileageIn,
    mileageOut: null,
    purchaseDate: input.purchaseDate,
    saleDate: null,
    type: input.type,
    status: 'PURCHASED',
    estimatedSalePriceCents: input.estimatedSalePriceCents,
    notes: input.notes,
    color: input.color ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const purchase: Expense = {
    id: newId(),
    vehicleId: vehicle.id,
    categoryId: 'PURCHASE_PRICE',
    amountCents: input.purchasePriceCents,
    date: input.purchaseDate,
    description: 'Purchase price',
    paidBy: input.purchasePaidBy,
    fromInventory: false,
    inventoryItemId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

  const reimbursement = reimbursementForExpense(purchase, ctx());

  db.transaction((tx) => {
    tx.insert(t.vehicles).values(vehicle).run();
    tx.insert(t.expenses).values(purchase).run();
    if (reimbursement) tx.insert(t.fernandoEntries).values(reimbursement).run();
  });

  return success(vehicle);
}

// ─── Expenses ───────────────────────────────────────────────────────────────

export interface NewExpenseInput {
  vehicleId: string;
  categoryId: string;
  amountCents: Cents;
  date: ISODate;
  description: string;
  paidBy: PaidBy;
}

/**
 * Add an expense, and — only if Fernando paid it — the one reimbursement it
 * creates. Both in one transaction, so a reimbursement can never exist without
 * its expense or an expense without its reimbursement.
 */
export function addExpense(db: Db, input: NewExpenseInput): OperationResult<Expense> {
  const errors: string[] = [];
  if (input.amountCents === 0) errors.push('Enter an amount.');
  if (!repos.getVehicle(db, input.vehicleId)) errors.push('That vehicle no longer exists.');
  if (errors.length > 0) return failure(errors);

  const now = nowTimestamp();
  const expense: Expense = {
    id: newId(),
    vehicleId: input.vehicleId,
    categoryId: input.categoryId,
    amountCents: input.amountCents,
    date: input.date,
    description: input.description,
    paidBy: input.paidBy,
    fromInventory: false,
    inventoryItemId: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const reimbursement = reimbursementForExpense(expense, ctx());

  db.transaction((tx) => {
    tx.insert(t.expenses).values(expense).run();
    if (reimbursement) tx.insert(t.fernandoEntries).values(reimbursement).run();
  });

  return success(expense);
}

/**
 * Delete an expense, and reverse whatever it caused.
 *
 * If Fernando paid it, his reimbursement must go too — otherwise he stays owed
 * for a cost that no longer exists. If it was drawn from inventory, the stock
 * goes back on the shelf. Reversing every consequence is why this is one
 * function and not three call sites that have to remember.
 */
export function deleteExpense(db: Db, expenseId: string): OperationResult {
  const expense = repos.getExpense(db, expenseId);
  if (!expense) return failure(['That expense no longer exists.']);

  const now = nowTimestamp();
  db.transaction((tx) => {
    tx.update(t.expenses).set({ deletedAt: now, updatedAt: now }).where(eq(t.expenses.id, expenseId)).run();

    tx.update(t.fernandoEntries)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(t.fernandoEntries.sourceId, expenseId))
      .run();

    if (expense.fromInventory && expense.inventoryItemId) {
      const usage = tx
        .select()
        .from(t.inventoryUsages)
        .where(eq(t.inventoryUsages.expenseId, expenseId))
        .get();
      if (usage) {
        const item = tx
          .select()
          .from(t.inventoryItems)
          .where(eq(t.inventoryItems.id, usage.inventoryItemId))
          .get();
        if (item) {
          tx.update(t.inventoryItems)
            .set({ quantity: item.quantity + usage.quantity, updatedAt: now })
            .where(eq(t.inventoryItems.id, item.id))
            .run();
        }
        tx.update(t.inventoryUsages)
          .set({ deletedAt: now })
          .where(eq(t.inventoryUsages.id, usage.id))
          .run();
      }
    }
  });

  return success(undefined);
}

// ─── Vehicle status ─────────────────────────────────────────────────────────

/** Paint colour is cosmetic: it never touches money, so it can change any time. */
export function setVehicleColor(db: Db, vehicleId: string, color: string): OperationResult {
  db.update(t.vehicles).set({ color, updatedAt: nowTimestamp() }).where(eq(t.vehicles.id, vehicleId)).run();
  return success(undefined);
}

export function setVehicleStatus(
  db: Db,
  vehicleId: string,
  status: VehicleStatus,
): OperationResult {
  if (status === 'SOLD') {
    // SOLD is written only by recordSale, in the same transaction as the sale.
    return failure(['Mark a vehicle sold by recording the sale, not by changing its status.']);
  }
  const vehicle = repos.getVehicle(db, vehicleId);
  if (!vehicle) return failure(['That vehicle no longer exists.']);
  if (vehicle.status === 'SOLD') return failure(['This vehicle has already been sold.']);

  repos.updateVehicle(db, vehicleId, { status });
  return success(undefined);
}

// ─── Recording a sale ───────────────────────────────────────────────────────

export interface RecordSaleInput {
  vehicleId: string;
  saleDate: ISODate;
  salePriceCents: Cents;
  buyerName: string;
  mileageOut: number | null;
  notes: string;
  reinvestCents: Cents;
  distributeCents: Cents;
}

/**
 * The most consequential write in the app: up to four rows across four tables,
 * all or nothing.
 */
export function recordSale(db: Db, input: RecordSaleInput) {
  const vehicle = repos.getVehicle(db, input.vehicleId);
  if (!vehicle) return failure<null>(['That vehicle no longer exists.']);

  const expenses = repos.listExpensesForVehicle(db, input.vehicleId);
  const saleInput: SaleInput = {
    vehicle,
    expenses,
    saleDate: input.saleDate,
    salePriceCents: input.salePriceCents,
    buyerName: input.buyerName,
    mileageOut: input.mileageOut,
    notes: input.notes,
    reinvestCents: input.reinvestCents,
    distributeCents: input.distributeCents,
  };

  const postings = postingsForSale(saleInput, ctx());
  if (!postings.ok || !postings.sale) return failure<null>(postings.errors);

  const sale = postings.sale;
  const now = nowTimestamp();

  db.transaction((tx) => {
    tx.insert(t.sales).values(sale).run();
    tx.update(t.vehicles)
      .set({
        status: 'SOLD',
        saleDate: input.saleDate,
        mileageOut: input.mileageOut,
        updatedAt: now,
      })
      .where(eq(t.vehicles.id, input.vehicleId))
      .run();
    if (postings.fernandoEntry) tx.insert(t.fernandoEntries).values(postings.fernandoEntry).run();
    if (postings.distribution) tx.insert(t.distributions).values(postings.distribution).run();
  });

  return { ok: true, errors: [] as string[], value: sale };
}

/**
 * Undo a sale — the buyer's financing fell through, or the car came back.
 *
 * A reversal, never a deletion: the sale is soft-deleted along with everything
 * it created, and the vehicle returns to the Garage. Its history stays visible.
 */
export function reverseSale(db: Db, vehicleId: string): OperationResult {
  const sale = repos.getSaleForVehicle(db, vehicleId);
  if (!sale) return failure(['This vehicle has no sale to reverse.']);

  const now = nowTimestamp();
  db.transaction((tx) => {
    tx.update(t.sales).set({ deletedAt: now, updatedAt: now }).where(eq(t.sales.id, sale.id)).run();
    tx.update(t.fernandoEntries)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(t.fernandoEntries.sourceId, sale.id))
      .run();
    tx.update(t.distributions)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(t.distributions.vehicleId, vehicleId))
      .run();
    tx.update(t.vehicles)
      .set({ status: 'LISTED', saleDate: null, updatedAt: now })
      .where(eq(t.vehicles.id, vehicleId))
      .run();
  });

  return success(undefined);
}

// ─── Capital and distributions ──────────────────────────────────────────────

export function addCapital(
  db: Db,
  amountCents: Cents,
  date: ISODate,
  notes: string,
  kind: CapitalEvent['kind'] = 'CONTRIBUTION',
): OperationResult<CapitalEvent> {
  if (amountCents <= 0) return failure(['Enter an amount greater than zero.']);

  const now = nowTimestamp();
  const event: CapitalEvent = {
    id: newId(),
    kind,
    amountCents,
    date,
    notes,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  repos.insertCapitalEvent(db, event);
  return success(event);
}

export function addDistribution(
  db: Db,
  amountCents: Cents,
  date: ISODate,
  reason: string,
): OperationResult {
  if (amountCents <= 0) return failure(['Enter an amount greater than zero.']);
  const now = nowTimestamp();
  repos.insertDistribution(db, {
    id: newId(),
    amountCents,
    date,
    vehicleId: null,
    reason,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  return success(undefined);
}

export function payFernando(db: Db, amountCents: Cents, date: ISODate, notes: string): OperationResult {
  if (amountCents <= 0) return failure(['Enter an amount greater than zero.']);
  repos.insertFernandoEntry(db, paymentToFernando(amountCents, date, notes, ctx()));
  return success(undefined);
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export interface NewInventoryInput {
  name: string;
  category: string;
  quantity: number;
  unitCostCents: Cents;
  purchaseDate: ISODate;
  supplier: string;
  notes: string;
}

export function addInventoryItem(
  db: Db,
  input: NewInventoryInput,
): OperationResult<InventoryItem> {
  const errors: string[] = [];
  if (input.name.trim() === '') errors.push('Give the item a name.');
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    errors.push('Quantity must be a whole number greater than zero.');
  }
  if (input.unitCostCents < 0) errors.push('Unit cost cannot be negative.');
  if (errors.length > 0) return failure(errors);

  const now = nowTimestamp();
  const item: InventoryItem = {
    id: newId(),
    name: input.name.trim(),
    category: input.category,
    quantity: input.quantity,
    unitCostCents: input.unitCostCents,
    // Cash actually paid. Everything downstream values the lot from this.
    purchaseCostCents: input.quantity * input.unitCostCents,
    purchaseDate: input.purchaseDate,
    supplier: input.supplier,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  repos.insertInventoryItem(db, item);
  return success(item);
}

/** Move stock onto a vehicle: an expense on the car, no second hit to cash. */
export function drawInventory(
  db: Db,
  itemId: string,
  vehicleId: string,
  quantity: number,
  date: ISODate = todayISO(),
): OperationResult<Expense> {
  const item = repos.getInventoryItem(db, itemId);
  if (!item) return failure(['That inventory item no longer exists.']);
  if (!repos.getVehicle(db, vehicleId)) return failure(['That vehicle no longer exists.']);

  const alreadyDrawn = repos.inventoryDrawnCents(db, itemId);
  const draw = drawFromInventory(item, vehicleId, quantity, date, alreadyDrawn, ctx());
  if (!draw.ok || !draw.expense || !draw.updatedItem) return failure(draw.errors);

  const expense = draw.expense;
  const now = nowTimestamp();

  db.transaction((tx) => {
    tx.insert(t.expenses).values(expense).run();
    tx.update(t.inventoryItems)
      .set({ quantity: draw.updatedItem!.quantity, updatedAt: now })
      .where(eq(t.inventoryItems.id, itemId))
      .run();
    tx.insert(t.inventoryUsages)
      .values({
        id: newId(),
        inventoryItemId: itemId,
        vehicleId,
        quantity,
        unitCostCents: item.unitCostCents,
        date,
        expenseId: expense.id,
        createdAt: now,
        deletedAt: null,
      })
      .run();
  });

  return success(toExpense({ ...expense, fromInventory: true }));
}
