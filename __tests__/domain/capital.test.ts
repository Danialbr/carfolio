import {
  computeBusinessPosition,
  computeFernandoAccount,
  verifyIdentity,
} from '../../domain/capital';
import { postingsForSale, reimbursementForExpense, paymentToFernando } from '../../domain/postings';
import type { PostingContext } from '../../domain/postings';
import {
  makeCapitalEvent,
  makeExpense,
  makeInventoryItem,
  makePurchase,
  makeVehicle,
  resetIds,
} from '../support/fixtures';

beforeEach(resetIds);

let seq = 0;
const ctx = (): PostingContext => ({
  newId: () => `p-${(seq += 1)}`,
  now: '2026-06-01T00:00:00.000Z',
});

const EMPTY = {
  vehicles: [],
  expenses: [],
  sales: [],
  capitalEvents: [],
  distributions: [],
  fernandoEntries: [],
  inventory: [],
};

describe('the protected-capital worked example from the specification', () => {
  // Initial capital $30,000. Invest $10,000 into a vehicle. It sells for
  // $13,000. $10,000 is returned capital; $3,000 is profit. The original
  // $30,000 must be untouched throughout.
  const capital = makeCapitalEvent({ amountCents: 3_000_000 });
  const vehicle = makeVehicle({ id: 'v1', type: 'MYSELF' });
  const purchase = makePurchase('v1', 1_000_000);

  it('shows capital deployed while the car is in the Garage', () => {
    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [vehicle],
      expenses: [purchase],
      capitalEvents: [capital],
    });

    expect(p.protectedCapitalCents).toBe(3_000_000);
    expect(p.capitalDeployedCents).toBe(1_000_000);
    expect(p.capitalReturnedCents).toBe(0);
    expect(p.cashOnHandCents).toBe(2_000_000); // $20,000 left to buy the next car
    expect(p.retainedEarningsCents).toBe(0);
    expect(verifyIdentity(p).ok).toBe(true);
  });

  it('returns the capital and books only the profit on sale', () => {
    const postings = postingsForSale(
      {
        vehicle,
        expenses: [purchase],
        saleDate: '2026-03-01',
        salePriceCents: 1_300_000,
        buyerName: 'Buyer',
        mileageOut: null,
        notes: '',
        reinvestCents: 300_000,
        distributeCents: 0,
      },
      ctx(),
    );

    expect(postings.ok).toBe(true);
    expect(postings.grossProfitCents).toBe(300_000); // $3,000
    expect(postings.danielShareCents).toBe(300_000);

    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [{ ...vehicle, status: 'SOLD' }],
      expenses: [purchase],
      sales: [postings.sale!],
      capitalEvents: [capital],
    });

    // The $30,000 principal is exactly where it was. Profit is separate.
    expect(p.protectedCapitalCents).toBe(3_000_000);
    expect(p.retainedEarningsCents).toBe(300_000);
    expect(p.capitalReturnedCents).toBe(1_000_000);
    expect(p.capitalDeployedCents).toBe(0);
    expect(p.cashOnHandCents).toBe(3_300_000); // $33,000
    expect(verifyIdentity(p).ok).toBe(true);
  });

  it('leaves principal untouched when profit is distributed out', () => {
    const postings = postingsForSale(
      {
        vehicle,
        expenses: [purchase],
        saleDate: '2026-03-01',
        salePriceCents: 1_300_000,
        buyerName: '',
        mileageOut: null,
        notes: '',
        reinvestCents: 150_000,
        distributeCents: 150_000,
      },
      ctx(),
    );

    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [{ ...vehicle, status: 'SOLD' }],
      expenses: [purchase],
      sales: [postings.sale!],
      capitalEvents: [capital],
      distributions: [postings.distribution!],
    });

    expect(p.protectedCapitalCents).toBe(3_000_000); // unchanged, as promised
    expect(p.totalDistributionsCents).toBe(150_000);
    expect(p.retainedEarningsCents).toBe(150_000);
    expect(p.cumulativeReinvestmentCents).toBe(150_000);
    expect(p.cashOnHandCents).toBe(3_150_000);
    expect(verifyIdentity(p).ok).toBe(true);
  });
});

describe('ASSOCIATED sale — allocation applies to Daniel’s share only', () => {
  const capital = makeCapitalEvent({ amountCents: 3_000_000 });
  const vehicle = makeVehicle({ id: 'v2', type: 'ASSOCIATED' });
  const purchase = makePurchase('v2', 1_000_000);

  it('posts Fernando’s half straight to his balance, before any allocation', () => {
    const postings = postingsForSale(
      {
        vehicle,
        expenses: [purchase],
        saleDate: '2026-03-01',
        salePriceCents: 1_300_000,
        buyerName: '',
        mileageOut: null,
        notes: '',
        // Daniel's share is $1,500 — NOT the full $3,000.
        reinvestCents: 75_000,
        distributeCents: 75_000,
      },
      ctx(),
    );

    expect(postings.ok).toBe(true);
    expect(postings.grossProfitCents).toBe(300_000);
    expect(postings.danielShareCents).toBe(150_000);
    expect(postings.fernandoShareCents).toBe(150_000);
    expect(postings.fernandoEntry?.kind).toBe('PROFIT_SHARE');
    expect(postings.fernandoEntry?.amountCents).toBe(150_000);

    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [{ ...vehicle, status: 'SOLD' }],
      expenses: [purchase],
      sales: [postings.sale!],
      capitalEvents: [capital],
      distributions: [postings.distribution!],
      fernandoEntries: [postings.fernandoEntry!],
    });

    expect(p.owedToFernandoCents).toBe(150_000);
    expect(p.retainedEarningsCents).toBe(75_000);
    // Cash still holds Fernando's $1,500 — it is a liability, not equity.
    expect(p.cashOnHandCents).toBe(3_225_000);
    expect(verifyIdentity(p).ok).toBe(true);
  });

  it('refuses to reinvest the full gross, because half of it is not Daniel’s', () => {
    const postings = postingsForSale(
      {
        vehicle,
        expenses: [purchase],
        saleDate: '2026-03-01',
        salePriceCents: 1_300_000,
        buyerName: '',
        mileageOut: null,
        notes: '',
        reinvestCents: 300_000, // the whole gross — not allowed
        distributeCents: 0,
      },
      ctx(),
    );
    expect(postings.ok).toBe(false);
    expect(postings.sale).toBeNull();
    expect(postings.errors.join(' ')).toMatch(/add up to your share/);
  });

  it('carries a loss forward against Fernando’s future profits', () => {
    const postings = postingsForSale(
      {
        vehicle,
        expenses: [purchase],
        saleDate: '2026-03-01',
        salePriceCents: 800_000, // $2,000 loss
        buyerName: '',
        mileageOut: null,
        notes: '',
        reinvestCents: 0,
        distributeCents: 0,
      },
      ctx(),
    );

    expect(postings.ok).toBe(true);
    expect(postings.grossProfitCents).toBe(-200_000);
    expect(postings.fernandoShareCents).toBe(-100_000);
    expect(postings.distribution).toBeNull();

    const account = computeFernandoAccount([postings.fernandoEntry!]);
    // Negative balance: no cash changes hands, it nets against the next win.
    expect(account.balanceCents).toBe(-100_000);
  });
});

describe('reimbursements cannot be counted twice', () => {
  it('does not spend Daniel’s cash on an expense Fernando paid', () => {
    const vehicle = makeVehicle({ id: 'v3', type: 'ASSOCIATED' });
    const purchase = makePurchase('v3', 800_000);
    const tires = makeExpense({
      id: 'exp-tires',
      vehicleId: 'v3',
      categoryId: 'TIRES',
      amountCents: 50_000,
      paidBy: 'FERNANDO',
    });
    const reimbursement = reimbursementForExpense(tires, ctx())!;

    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [vehicle],
      expenses: [purchase, tires],
      capitalEvents: [makeCapitalEvent({ amountCents: 3_000_000 })],
      fernandoEntries: [reimbursement],
    });

    // The tires are $500 of investment in the car...
    expect(p.capitalDeployedCents).toBe(850_000);
    // ...but Daniel's cash only moved for the $8,000 purchase.
    expect(p.cashOnHandCents).toBe(2_200_000);
    // ...and Fernando is owed the $500.
    expect(p.owedToFernandoCents).toBe(50_000);
    expect(verifyIdentity(p).ok).toBe(true);
  });

  it('moves cash only when Fernando is actually paid', () => {
    const vehicle = makeVehicle({ id: 'v4' });
    const tires = makeExpense({
      id: 'exp-t',
      vehicleId: 'v4',
      amountCents: 50_000,
      paidBy: 'FERNANDO',
    });
    const reimbursement = reimbursementForExpense(tires, ctx())!;
    const payment = paymentToFernando(50_000, '2026-04-01', 'Tires', ctx());

    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [vehicle],
      expenses: [tires],
      capitalEvents: [makeCapitalEvent({ amountCents: 3_000_000 })],
      fernandoEntries: [reimbursement, payment],
    });

    expect(p.owedToFernandoCents).toBe(0);
    expect(p.cashOnHandCents).toBe(2_950_000);
    expect(verifyIdentity(p).ok).toBe(true);
  });

  it('produces no reimbursement for expenses Daniel or the business paid', () => {
    expect(reimbursementForExpense(makeExpense({ paidBy: 'DANIEL' }), ctx())).toBeNull();
    expect(reimbursementForExpense(makeExpense({ paidBy: 'BUSINESS' }), ctx())).toBeNull();
    expect(
      reimbursementForExpense(
        makeExpense({ paidBy: 'FERNANDO', deletedAt: '2026-01-01T00:00:00Z' }),
        ctx(),
      ),
    ).toBeNull();
  });

  it('links every reimbursement to the expense that caused it', () => {
    const expense = makeExpense({ id: 'exp-99', paidBy: 'FERNANDO', amountCents: 12_345 });
    const r = reimbursementForExpense(expense, ctx())!;
    expect(r.sourceId).toBe('exp-99');
    expect(r.amountCents).toBe(12_345);
  });
});

describe('inventory does not spend cash twice', () => {
  it('charges cash at purchase and the vehicle at consumption', () => {
    const vehicle = makeVehicle({ id: 'v5' });
    const item = makeInventoryItem({ id: 'inv-1', quantity: 12, unitCostCents: 800, purchaseCostCents: 9_600 });
    const draw = makeExpense({
      vehicleId: 'v5',
      categoryId: 'PARTS',
      amountCents: 1_600,
      paidBy: 'BUSINESS',
      fromInventory: true,
      inventoryItemId: 'inv-1',
    });

    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [vehicle],
      expenses: [draw],
      capitalEvents: [makeCapitalEvent({ amountCents: 1_000_000 })],
      inventory: [{ ...item, quantity: 10 }],
    });

    // $96 left the bank when the oil was bought. Using two bottles moves $16
    // onto the car and takes $16 off the shelf — it does not spend $16 again.
    expect(p.cashOnHandCents).toBe(1_000_000 - 9_600);
    expect(p.inventoryValueCents).toBe(8_000);
    expect(p.capitalDeployedCents).toBe(1_600);
    expect(verifyIdentity(p).ok).toBe(true);
  });
});

describe('Fernando account', () => {
  it('nets profit shares, reimbursements and payments into one balance', () => {
    const entries = [
      { kind: 'PROFIT_SHARE' as const, amountCents: 150_000 },
      { kind: 'REIMBURSEMENT' as const, amountCents: 50_000 },
      { kind: 'PAYMENT' as const, amountCents: -120_000 },
      { kind: 'PROFIT_SHARE' as const, amountCents: -30_000 },
    ].map((e, i) => ({
      id: `f-${i}`,
      date: '2026-03-01',
      sourceId: null,
      vehicleId: null,
      notes: '',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      deletedAt: null,
      ...e,
    }));

    const account = computeFernandoAccount(entries);
    expect(account.profitSharesCents).toBe(120_000);
    expect(account.reimbursementsDueCents).toBe(50_000);
    expect(account.paymentsMadeCents).toBe(120_000);
    expect(account.balanceCents).toBe(50_000);
  });

  it('is empty when there is nothing on it', () => {
    expect(computeFernandoAccount([]).balanceCents).toBe(0);
  });
});

describe('data integrity', () => {
  it('reports a discrepancy rather than hiding it', () => {
    const broken = {
      protectedCapitalCents: 100,
      capitalDeployedCents: 0,
      capitalReturnedCents: 0,
      retainedEarningsCents: 0,
      cumulativeReinvestmentCents: 0,
      totalDistributionsCents: 0,
      owedToFernandoCents: 0,
      inventoryValueCents: 0,
      cashOnHandCents: 40,
      totalInvestedCents: 0,
      totalSalesCents: 0,
      grossProfitCents: 0,
    };
    const check = verifyIdentity(broken);
    expect(check.ok).toBe(false);
    expect(check.discrepancyCents).toBe(-60);
  });

  it('excludes soft-deleted records everywhere', () => {
    const p = computeBusinessPosition({
      ...EMPTY,
      vehicles: [makeVehicle({ id: 'gone', deletedAt: '2026-02-01T00:00:00Z' })],
      expenses: [makePurchase('gone', 500_000)],
      capitalEvents: [makeCapitalEvent({ amountCents: 1_000_000 })],
    });
    // Expenses on a deleted vehicle must not linger in deployed capital.
    expect(p.capitalDeployedCents).toBe(0);
    expect(p.cashOnHandCents).toBe(1_000_000);
    expect(verifyIdentity(p).ok).toBe(true);
  });
});
