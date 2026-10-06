import fc from 'fast-check';
import {
  computeBreakdown,
  computeVehicleFinancials,
  defaultAllocation,
  splitProfit,
  validateAllocation,
} from '../../domain/pnl';
import { PURCHASE_PRICE_CATEGORY } from '../../domain/categories';
import {
  makeExpense,
  makePurchase,
  makeSale,
  makeVehicle,
  resetIds,
  specExampleVehicle,
} from '../support/fixtures';

beforeEach(resetIds);

describe('investment breakdown — the specification worked example', () => {
  it('produces exactly the numbers in the spec', () => {
    const { expenses } = specExampleVehicle();
    const b = computeBreakdown(expenses);

    expect(b.purchasePriceCents).toBe(800_000); // $8,000
    expect(b.additionalInvestmentCents).toBe(255_000); // $2,550
    expect(b.totalInvestedCents).toBe(1_055_000); // $10,550
  });

  it('keeps purchase price out of the additional-investment lines', () => {
    const { expenses } = specExampleVehicle();
    const b = computeBreakdown(expenses);
    expect(b.lines.some((l) => l.categoryId === PURCHASE_PRICE_CATEGORY)).toBe(false);
    expect(b.lines).toHaveLength(7);
  });

  it('groups repeated categories and sorts by size', () => {
    const b = computeBreakdown([
      makePurchase('v', 500_000),
      makeExpense({ vehicleId: 'v', categoryId: 'PARTS', amountCents: 10_000 }),
      makeExpense({ vehicleId: 'v', categoryId: 'PARTS', amountCents: 15_000 }),
      makeExpense({ vehicleId: 'v', categoryId: 'TIRES', amountCents: 60_000 }),
    ]);
    expect(b.lines[0]).toEqual({ categoryId: 'TIRES', amountCents: 60_000, count: 1 });
    expect(b.lines[1]).toEqual({ categoryId: 'PARTS', amountCents: 25_000, count: 2 });
    expect(b.additionalInvestmentCents).toBe(85_000);
  });

  it('ignores soft-deleted expenses', () => {
    const b = computeBreakdown([
      makePurchase('v', 500_000),
      makeExpense({ vehicleId: 'v', amountCents: 10_000, deletedAt: '2026-02-01T00:00:00Z' }),
    ]);
    expect(b.totalInvestedCents).toBe(500_000);
  });

  it('counts an expense Fernando paid as full investment in the car', () => {
    // Who fronted the money is a question about Fernando's balance, not about
    // what the car cost. Blurring the two is how reimbursements double-count.
    const b = computeBreakdown([
      makePurchase('v', 500_000),
      makeExpense({ vehicleId: 'v', categoryId: 'TIRES', amountCents: 50_000, paidBy: 'FERNANDO' }),
    ]);
    expect(b.totalInvestedCents).toBe(550_000);
  });

  it('handles a vehicle with no expenses at all', () => {
    const b = computeBreakdown([]);
    expect(b).toEqual({
      purchasePriceCents: 0,
      additionalInvestmentCents: 0,
      totalInvestedCents: 0,
      lines: [],
    });
  });
});

describe('splitProfit', () => {
  it('gives Daniel everything on a MYSELF vehicle', () => {
    expect(splitProfit(300_000, 'MYSELF')).toEqual({ danielCents: 300_000, fernandoCents: 0 });
    expect(splitProfit(-300_000, 'MYSELF')).toEqual({ danielCents: -300_000, fernandoCents: 0 });
  });

  it('splits an ASSOCIATED vehicle 50/50', () => {
    expect(splitProfit(300_000, 'ASSOCIATED')).toEqual({
      danielCents: 150_000,
      fernandoCents: 150_000,
    });
  });

  it('splits an ASSOCIATED LOSS 50/50 as well', () => {
    expect(splitProfit(-200_000, 'ASSOCIATED')).toEqual({
      danielCents: -100_000,
      fernandoCents: -100_000,
    });
  });

  it('gives the odd cent to Daniel, in both directions', () => {
    expect(splitProfit(300_001, 'ASSOCIATED')).toEqual({
      danielCents: 150_001,
      fernandoCents: 150_000,
    });
    expect(splitProfit(-200_001, 'ASSOCIATED')).toEqual({
      danielCents: -100_001,
      fernandoCents: -100_000,
    });
  });

  it('always sums back to the gross, for any amount and type', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50_000_000, max: 50_000_000 }),
        fc.constantFrom('MYSELF' as const, 'ASSOCIATED' as const),
        (gross, type) => {
          const { danielCents, fernandoCents } = splitProfit(gross, type);
          expect(danielCents + fernandoCents).toBe(gross);
        },
      ),
    );
  });
});

describe('computeVehicleFinancials', () => {
  const today = '2026-02-16';

  it('computes a full sold MYSELF deal', () => {
    const { vehicle, expenses } = specExampleVehicle('MYSELF');
    const sale = makeSale({ vehicleId: vehicle.id, salePriceCents: 1_355_000, saleDate: '2026-02-16' });
    const f = computeVehicleFinancials(vehicle, expenses, sale, today);

    expect(f.sold).toBe(true);
    expect(f.totalInvestedCents).toBe(1_055_000);
    expect(f.salePriceCents).toBe(1_355_000);
    expect(f.grossProfitCents).toBe(300_000); // $3,000
    expect(f.split).toEqual({ danielCents: 300_000, fernandoCents: 0 });
    expect(f.roi).toBeCloseTo(0.28436, 5);
    expect(f.daysHeld).toBe(37);
  });

  it('splits a sold ASSOCIATED deal', () => {
    const { vehicle, expenses } = specExampleVehicle('ASSOCIATED');
    const sale = makeSale({ vehicleId: vehicle.id, salePriceCents: 1_355_000 });
    const f = computeVehicleFinancials(vehicle, expenses, sale, today);
    expect(f.split).toEqual({ danielCents: 150_000, fernandoCents: 150_000 });
  });

  it('reports a loss without special-casing it', () => {
    const { vehicle, expenses } = specExampleVehicle('ASSOCIATED');
    const sale = makeSale({ vehicleId: vehicle.id, salePriceCents: 855_000 });
    const f = computeVehicleFinancials(vehicle, expenses, sale, today);
    expect(f.grossProfitCents).toBe(-200_000);
    expect(f.split).toEqual({ danielCents: -100_000, fernandoCents: -100_000 });
    expect(f.roi).toBeCloseTo(-0.18957, 5);
  });

  it('counts days held to TODAY while the car is in the Garage', () => {
    const { vehicle, expenses } = specExampleVehicle();
    const f = computeVehicleFinancials(vehicle, expenses, null, '2026-02-16');
    expect(f.sold).toBe(false);
    expect(f.daysHeld).toBe(37);
    expect(f.grossProfitCents).toBeNull();
    expect(f.roi).toBeNull();
    expect(f.split).toBeNull();
  });

  it('projects estimated profit for a Garage vehicle', () => {
    const { vehicle, expenses } = specExampleVehicle();
    const withEstimate = { ...vehicle, estimatedSalePriceCents: 1_300_000 };
    const f = computeVehicleFinancials(withEstimate, expenses, null, today);
    expect(f.estimatedSalePriceCents).toBe(1_300_000);
    expect(f.estimatedProfitCents).toBe(245_000);
    expect(f.estimatedRoi).toBeCloseTo(0.23223, 5);
  });

  it('drops the estimate once the car has actually sold', () => {
    const { vehicle, expenses } = specExampleVehicle();
    const withEstimate = { ...vehicle, estimatedSalePriceCents: 1_300_000 };
    const sale = makeSale({ vehicleId: vehicle.id, salePriceCents: 1_355_000 });
    const f = computeVehicleFinancials(withEstimate, expenses, sale, today);
    expect(f.estimatedSalePriceCents).toBeNull();
  });

  it('ignores a soft-deleted sale, putting the car back in the Garage', () => {
    const { vehicle, expenses } = specExampleVehicle();
    const sale = makeSale({ vehicleId: vehicle.id, deletedAt: '2026-03-05T00:00:00Z' });
    const f = computeVehicleFinancials(vehicle, expenses, sale, today);
    expect(f.sold).toBe(false);
    expect(f.grossProfitCents).toBeNull();
  });

  it('reports how much of the investment Fernando fronted', () => {
    const vehicle = makeVehicle({ id: 'v', type: 'ASSOCIATED' });
    const expenses = [
      makePurchase('v', 800_000),
      makeExpense({ vehicleId: 'v', categoryId: 'TIRES', amountCents: 50_000, paidBy: 'FERNANDO' }),
      makeExpense({ vehicleId: 'v', categoryId: 'PARTS', amountCents: 20_000, paidBy: 'DANIEL' }),
    ];
    const f = computeVehicleFinancials(vehicle, expenses, null, today);
    expect(f.fernandoPaidCents).toBe(50_000);
    expect(f.totalInvestedCents).toBe(870_000);
  });

  it('returns null ROI rather than Infinity for a zero-cost vehicle', () => {
    const vehicle = makeVehicle({ id: 'v' });
    const sale = makeSale({ vehicleId: 'v', salePriceCents: 100_000 });
    const f = computeVehicleFinancials(vehicle, [], sale, today);
    expect(f.grossProfitCents).toBe(100_000);
    expect(f.roi).toBeNull();
  });
});

describe('profit allocation', () => {
  it('accepts a split that adds up', () => {
    expect(
      validateAllocation({ danielShareCents: 300_000, reinvestCents: 150_000, distributeCents: 150_000 }),
    ).toEqual({ ok: true, errors: [] });
  });

  it('rejects a split that does not add up', () => {
    const r = validateAllocation({
      danielShareCents: 300_000,
      reinvestCents: 150_000,
      distributeCents: 100_000,
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/add up to your share/);
  });

  it('rejects negative amounts', () => {
    const r = validateAllocation({
      danielShareCents: 300_000,
      reinvestCents: -50_000,
      distributeCents: 350_000,
    });
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Reinvestment cannot be negative.');
  });

  it('allows nothing to be allocated on a losing sale', () => {
    expect(
      validateAllocation({ danielShareCents: -100_000, reinvestCents: 0, distributeCents: 0 }),
    ).toEqual({ ok: true, errors: [] });
  });

  it('refuses to allocate profit that does not exist', () => {
    const r = validateAllocation({
      danielShareCents: -100_000,
      reinvestCents: 50_000,
      distributeCents: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/no profit to allocate/);
  });

  it('defaults to keeping everything in the business', () => {
    expect(defaultAllocation(300_000)).toEqual({
      danielShareCents: 300_000,
      reinvestCents: 300_000,
      distributeCents: 0,
    });
    expect(defaultAllocation(-100_000)).toEqual({
      danielShareCents: -100_000,
      reinvestCents: 0,
      distributeCents: 0,
    });
  });

  it('never lets Fernando’s half be reinvested — allocation only sees Daniel’s share', () => {
    // On a $3,000 ASSOCIATED profit Fernando's $1,500 is his outright. The
    // allocation input is Daniel's $1,500, so the most that can be reinvested
    // is $1,500 — reinvesting $3,000 is not representable.
    const { danielCents } = splitProfit(300_000, 'ASSOCIATED');
    expect(danielCents).toBe(150_000);
    const tooMuch = validateAllocation({
      danielShareCents: danielCents,
      reinvestCents: 300_000,
      distributeCents: 0,
    });
    expect(tooMuch.ok).toBe(false);
  });
});
