/**
 * THE ACCOUNTING IDENTITY, under randomized histories.
 *
 *     cash + capitalDeployed + inventoryAtCost
 *         === protectedCapital + retainedEarnings + owedToFernando
 *
 * This is the single most valuable test in the app. It doesn't check that any
 * particular number is right; it checks that the money model is internally
 * consistent after ANY sequence of operations the app can perform. If a future
 * change makes a dollar appear or vanish — a reimbursement counted twice, an
 * inventory draw charged to cash again, Fernando's share reinvested by mistake
 * — this fails, without anyone having had to imagine that specific bug.
 *
 * The scenarios are built with domain/postings.ts, the same functions the app
 * writes through. That is deliberate: the test validates the real write-rules
 * rather than a reimplementation of them that could drift.
 */

import fc from 'fast-check';
import { computeBusinessPosition, verifyIdentity, computeFernandoAccount } from '../../domain/capital';
import {
  drawFromInventory,
  paymentToFernando,
  postingsForSale,
  reimbursementForExpense,
  type PostingContext,
} from '../../domain/postings';
import { PURCHASE_PRICE_CATEGORY } from '../../domain/categories';
import { splitProfit } from '../../domain/pnl';
import type {
  CapitalEvent,
  Distribution,
  Expense,
  FernandoEntry,
  InventoryItem,
  PaidBy,
  Sale,
  Vehicle,
  VehicleType,
} from '../../domain/types';

const NOW = '2026-06-01T00:00:00.000Z';

interface Op {
  kind: 'capital' | 'buy' | 'expense' | 'sell' | 'stock' | 'draw' | 'payFernando';
  a: number;
  b: number;
  type: VehicleType;
  paidBy: PaidBy;
  distributeRatio: number;
}

/** Runs a script of operations exactly the way the app would, then returns the books. */
function runScenario(ops: readonly Op[]) {
  let seq = 0;
  const ctx: PostingContext = { newId: () => `id-${(seq += 1)}`, now: NOW };

  const vehicles: Vehicle[] = [];
  const expenses: Expense[] = [];
  const sales: Sale[] = [];
  const capitalEvents: CapitalEvent[] = [];
  const distributions: Distribution[] = [];
  const fernandoEntries: FernandoEntry[] = [];
  const inventory: InventoryItem[] = [];

  const drawnByItem = new Map<string, number>();

  const unsold = () => vehicles.filter((v) => v.status !== 'SOLD');
  const expensesFor = (id: string) => expenses.filter((e) => e.vehicleId === id);

  for (const op of ops) {
    switch (op.kind) {
      case 'capital': {
        capitalEvents.push({
          id: ctx.newId(),
          kind: 'CONTRIBUTION',
          amountCents: op.a,
          date: '2026-01-01',
          notes: '',
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        });
        break;
      }

      case 'buy': {
        const id = ctx.newId();
        vehicles.push({
          id,
          year: 2018,
          make: 'Make',
          model: 'Model',
          trim: '',
          vin: '',
          mileageIn: null,
          mileageOut: null,
          purchaseDate: '2026-01-10',
          saleDate: null,
          type: op.type,
          status: 'PURCHASED',
          estimatedSalePriceCents: null,
          notes: '',
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        });
        expenses.push({
          id: ctx.newId(),
          vehicleId: id,
          categoryId: PURCHASE_PRICE_CATEGORY,
          amountCents: op.a,
          date: '2026-01-10',
          description: '',
          paidBy: 'DANIEL',
          fromInventory: false,
          inventoryItemId: null,
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        });
        break;
      }

      case 'expense': {
        const targets = unsold();
        if (targets.length === 0) break;
        const vehicle = targets[op.b % targets.length] as Vehicle;
        const expense: Expense = {
          id: ctx.newId(),
          vehicleId: vehicle.id,
          categoryId: 'PARTS',
          amountCents: op.a,
          date: '2026-01-20',
          description: '',
          paidBy: op.paidBy,
          fromInventory: false,
          inventoryItemId: null,
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        };
        expenses.push(expense);
        // The ONLY place a reimbursement can be created.
        const reimbursement = reimbursementForExpense(expense, ctx);
        if (reimbursement) fernandoEntries.push(reimbursement);
        break;
      }

      case 'sell': {
        const targets = unsold();
        if (targets.length === 0) break;
        const vehicle = targets[op.b % targets.length] as Vehicle;
        const vehicleExpenses = expensesFor(vehicle.id);
        const invested = vehicleExpenses.reduce((s, e) => s + e.amountCents, 0);
        const gross = op.a - invested;
        const { danielCents } = splitProfit(gross, vehicle.type);

        // Allocate Daniel's share; a loss allocates nothing.
        const distribute =
          danielCents > 0 ? Math.floor(danielCents * op.distributeRatio) : 0;
        const reinvest = danielCents > 0 ? danielCents - distribute : 0;

        const postings = postingsForSale(
          {
            vehicle,
            expenses: vehicleExpenses,
            saleDate: '2026-03-01',
            salePriceCents: op.a,
            buyerName: '',
            mileageOut: null,
            notes: '',
            reinvestCents: reinvest,
            distributeCents: distribute,
          },
          ctx,
        );

        if (!postings.ok || !postings.sale) break;
        sales.push(postings.sale);
        if (postings.fernandoEntry) fernandoEntries.push(postings.fernandoEntry);
        if (postings.distribution) distributions.push(postings.distribution);
        vehicle.status = 'SOLD';
        vehicle.saleDate = postings.sale.saleDate;
        break;
      }

      case 'stock': {
        const units = Math.max(1, op.b % 20);
        const unitCost = Math.max(1, op.a % 5000);
        inventory.push({
          id: ctx.newId(),
          name: 'Supply',
          category: 'Supplies',
          quantity: units,
          unitCostCents: unitCost,
          purchaseCostCents: units * unitCost,
          purchaseDate: '2026-01-05',
          supplier: '',
          notes: '',
          createdAt: NOW,
          updatedAt: NOW,
          deletedAt: null,
        });
        break;
      }

      case 'draw': {
        const stocked = inventory.filter((i) => i.quantity > 0);
        const targets = unsold();
        if (stocked.length === 0 || targets.length === 0) break;
        const item = stocked[op.b % stocked.length] as InventoryItem;
        const vehicle = targets[op.a % targets.length] as Vehicle;
        const quantity = Math.max(1, (op.a % item.quantity) || item.quantity);

        const draw = drawFromInventory(
          item,
          vehicle.id,
          quantity,
          '2026-02-01',
          drawnByItem.get(item.id) ?? 0,
          ctx,
        );
        if (!draw.ok || !draw.expense || !draw.updatedItem) break;
        expenses.push(draw.expense);
        drawnByItem.set(item.id, (drawnByItem.get(item.id) ?? 0) + draw.amountCents);
        item.quantity = draw.updatedItem.quantity;
        break;
      }

      case 'payFernando': {
        fernandoEntries.push(paymentToFernando(op.a, '2026-04-01', '', ctx));
        break;
      }
    }
  }

  return { vehicles, expenses, sales, capitalEvents, distributions, fernandoEntries, inventory };
}

const opArb: fc.Arbitrary<Op> = fc.record({
  kind: fc.constantFrom(
    'capital',
    'buy',
    'expense',
    'expense',
    'sell',
    'stock',
    'draw',
    'payFernando',
  ) as fc.Arbitrary<Op['kind']>,
  a: fc.integer({ min: 1, max: 5_000_000 }),
  b: fc.integer({ min: 0, max: 50 }),
  type: fc.constantFrom('MYSELF', 'ASSOCIATED') as fc.Arbitrary<VehicleType>,
  paidBy: fc.constantFrom('DANIEL', 'FERNANDO', 'BUSINESS') as fc.Arbitrary<PaidBy>,
  distributeRatio: fc.constantFrom(0, 0.25, 0.5, 1),
});

describe('accounting identity', () => {
  it('holds after any sequence of operations', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const books = runScenario(ops);
        const position = computeBusinessPosition(books);
        const check = verifyIdentity(position);

        if (!check.ok) {
          throw new Error(
            `Books do not balance. Off by ${check.discrepancyCents} cents.\n` +
              `assets ${check.assetsCents} = cash ${position.cashOnHandCents} ` +
              `+ deployed ${position.capitalDeployedCents} ` +
              `+ inventory ${position.inventoryValueCents}\n` +
              `claims ${check.claimsCents} = capital ${position.protectedCapitalCents} ` +
              `+ retained ${position.retainedEarningsCents} ` +
              `+ owedFernando ${position.owedToFernandoCents}`,
          );
        }
        return true;
      }),
      { numRuns: 400 },
    );
  });

  it('never lets protected capital drift from the contributions that made it', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 30 }), (ops) => {
        const books = runScenario(ops);
        const position = computeBusinessPosition(books);
        const contributed = books.capitalEvents.reduce((s, c) => s + c.amountCents, 0);
        // Selling cars, distributing profit and paying Fernando must never
        // move this number. Only a capital event can.
        expect(position.protectedCapitalCents).toBe(contributed);
      }),
      { numRuns: 200 },
    );
  });

  it('keeps Fernando’s balance equal to the sum of his entries', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 30 }), (ops) => {
        const books = runScenario(ops);
        const account = computeFernandoAccount(books.fernandoEntries);
        const position = computeBusinessPosition(books);
        expect(account.balanceCents).toBe(position.owedToFernandoCents);
      }),
      { numRuns: 200 },
    );
  });

  it('creates exactly one reimbursement per Fernando-paid expense', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 30 }), (ops) => {
        const books = runScenario(ops);
        const fernandoPaid = books.expenses.filter((e) => e.paidBy === 'FERNANDO');
        const reimbursements = books.fernandoEntries.filter((f) => f.kind === 'REIMBURSEMENT');

        expect(reimbursements).toHaveLength(fernandoPaid.length);
        // Every reimbursement traces back to a distinct expense.
        const sources = new Set(reimbursements.map((r) => r.sourceId));
        expect(sources.size).toBe(reimbursements.length);
        for (const r of reimbursements) {
          const source = fernandoPaid.find((e) => e.id === r.sourceId);
          expect(source).toBeDefined();
          expect(r.amountCents).toBe(source?.amountCents);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never reinvests more than Daniel’s own share', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 30 }), (ops) => {
        const books = runScenario(ops);
        for (const sale of books.sales) {
          expect(sale.reinvestCents + sale.distributeCents).toBe(
            Math.max(0, sale.danielShareCents),
          );
          expect(sale.danielShareCents + sale.fernandoShareCents).toBe(
            sale.salePriceCents -
              books.expenses
                .filter((e) => e.vehicleId === sale.vehicleId)
                .reduce((s, e) => s + e.amountCents, 0),
          );
        }
      }),
      { numRuns: 200 },
    );
  });

  it('never leaves phantom value in an emptied inventory lot', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 40 }), (ops) => {
        const books = runScenario(ops);
        const drawnByItem = new Map<string, number>();
        for (const e of books.expenses) {
          if (e.fromInventory && e.inventoryItemId) {
            drawnByItem.set(
              e.inventoryItemId,
              (drawnByItem.get(e.inventoryItemId) ?? 0) + e.amountCents,
            );
          }
        }
        for (const item of books.inventory) {
          const drawn = drawnByItem.get(item.id) ?? 0;
          const remainingValue = item.purchaseCostCents - drawn;
          expect(remainingValue).toBeGreaterThanOrEqual(0);
          if (item.quantity === 0) expect(remainingValue).toBe(0);
        }
      }),
      { numRuns: 300 },
    );
  });
});
