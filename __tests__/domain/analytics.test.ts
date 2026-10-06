import {
  activeYears,
  buildVehicleIndex,
  filterBySaleYear,
  filterByType,
  monthlyProfit,
  summarize,
  summarizeYear,
} from '../../domain/analytics';
import { makeExpense, makePurchase, makeSale, makeVehicle, resetIds } from '../support/fixtures';
import type { VehicleType } from '../../domain/types';

beforeEach(resetIds);

const TODAY = '2026-06-01';

/** A car bought for `buy`, with `extra` of work, sold for `sell`. */
function deal(
  id: string,
  buy: number,
  extra: number,
  sell: number | null,
  type: VehicleType = 'MYSELF',
  dates: { purchase?: string; sale?: string } = {},
) {
  const vehicle = makeVehicle({
    id,
    type,
    status: sell == null ? 'PURCHASED' : 'SOLD',
    purchaseDate: dates.purchase ?? '2026-01-10',
  });
  const expenses = [
    makePurchase(id, buy, dates.purchase ?? '2026-01-10'),
    ...(extra > 0 ? [makeExpense({ vehicleId: id, amountCents: extra })] : []),
  ];
  const sale =
    sell == null
      ? null
      : makeSale({
          vehicleId: id,
          salePriceCents: sell,
          saleDate: dates.sale ?? '2026-02-16',
        });
  return { vehicle, expenses, sale };
}

function indexOf(...deals: ReturnType<typeof deal>[]) {
  return buildVehicleIndex(
    deals.map((d) => d.vehicle),
    deals.flatMap((d) => d.expenses),
    deals.map((d) => d.sale).filter((s): s is NonNullable<typeof s> => s != null),
    TODAY,
  );
}

describe('buildVehicleIndex', () => {
  it('joins each vehicle to its own expenses and sale', () => {
    const rows = indexOf(deal('a', 800_000, 255_000, 1_355_000), deal('b', 500_000, 0, null));
    expect(rows).toHaveLength(2);
    expect(rows[0]?.financials.totalInvestedCents).toBe(1_055_000);
    expect(rows[0]?.financials.grossProfitCents).toBe(300_000);
    expect(rows[1]?.financials.sold).toBe(false);
    expect(rows[1]?.financials.totalInvestedCents).toBe(500_000);
  });

  it('omits soft-deleted vehicles and expenses', () => {
    const rows = buildVehicleIndex(
      [makeVehicle({ id: 'gone', deletedAt: '2026-02-01T00:00:00Z' }), makeVehicle({ id: 'ok' })],
      [makePurchase('ok', 500_000), makeExpense({ vehicleId: 'ok', amountCents: 9_999, deletedAt: '2026-02-01T00:00:00Z' })],
      [],
      TODAY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.financials.totalInvestedCents).toBe(500_000);
  });
});

describe('summarize', () => {
  it('averages only sold vehicles', () => {
    // Two sold, one still in the Garage. The Garage car must not drag the
    // averages — an average that includes unsold cars is an average of nothing.
    const rows = indexOf(
      deal('a', 800_000, 200_000, 1_300_000),
      deal('b', 600_000, 200_000, 1_000_000),
      deal('c', 900_000, 100_000, null),
    );
    const s = summarize(rows);

    expect(s.vehiclesSold).toBe(2);
    expect(s.vehiclesInGarage).toBe(1);
    expect(s.totalVehicles).toBe(3);
    expect(s.averageTotalInvestmentCents).toBe(900_000);
    expect(s.averagePurchasePriceCents).toBe(700_000);
    expect(s.averageAdditionalInvestmentCents).toBe(200_000);
    expect(s.averageSalePriceCents).toBe(1_150_000);
    expect(s.averageGrossProfitCents).toBe(250_000);
    expect(s.totalGrossProfitCents).toBe(500_000);
  });

  it('distinguishes average per-car ROI from ROI on the money', () => {
    // $200 profit on a $400 car (50%) and $1,000 on a $20,000 car (5%).
    // Per car that averages 27.5%; on the money it is 5.9%. Both are true and
    // they answer different questions, so both are reported.
    const rows = indexOf(deal('small', 40_000, 0, 60_000), deal('big', 2_000_000, 0, 2_100_000));
    const s = summarize(rows);
    expect(s.averageRoi).toBeCloseTo(0.275, 3);
    expect(s.aggregateRoi).toBeCloseTo(0.0588, 4);
  });

  it('finds the best and worst deals', () => {
    const rows = indexOf(
      deal('win', 800_000, 0, 1_400_000),
      deal('lose', 900_000, 0, 700_000),
      deal('meh', 500_000, 0, 520_000),
    );
    const s = summarize(rows);
    expect(s.bestProfit?.vehicleId).toBe('win');
    expect(s.bestProfit?.valueCents).toBe(600_000);
    expect(s.worstProfit?.vehicleId).toBe('lose');
    expect(s.worstProfit?.valueCents).toBe(-200_000);
    expect(s.bestRoi?.vehicleId).toBe('win');
    expect(s.worstRoi?.vehicleId).toBe('lose');
  });

  it('splits realized profit between Daniel and Fernando', () => {
    const rows = indexOf(
      deal('mine', 800_000, 0, 1_100_000, 'MYSELF'),
      deal('ours', 800_000, 0, 1_200_000, 'ASSOCIATED'),
    );
    const s = summarize(rows);
    expect(s.danielProfitCents).toBe(300_000 + 200_000);
    expect(s.fernandoProfitCents).toBe(200_000);
  });

  it('returns nulls rather than NaN for an empty set', () => {
    const s = summarize([]);
    expect(s.vehiclesSold).toBe(0);
    expect(s.averageRoi).toBeNull();
    expect(s.averageGrossProfitCents).toBeNull();
    expect(s.averageDaysToSell).toBeNull();
    expect(s.aggregateRoi).toBeNull();
    expect(s.bestProfit).toBeNull();
    expect(s.totalGrossProfitCents).toBe(0);
  });

  it('averages days to sell', () => {
    const rows = indexOf(
      deal('a', 100_000, 0, 200_000, 'MYSELF', { purchase: '2026-01-01', sale: '2026-02-01' }), // 31
      deal('b', 100_000, 0, 200_000, 'MYSELF', { purchase: '2026-01-01', sale: '2026-01-15' }), // 14
    );
    expect(summarize(rows).averageDaysToSell).toBeCloseTo(22.5, 5);
  });
});

describe('filters', () => {
  const rows = () =>
    indexOf(
      deal('m1', 800_000, 0, 1_100_000, 'MYSELF', { sale: '2026-02-01' }),
      deal('a1', 800_000, 0, 1_200_000, 'ASSOCIATED', { sale: '2025-11-01' }),
      deal('g1', 500_000, 0, null),
    );

  it('filters by type', () => {
    expect(filterByType(rows(), 'ALL')).toHaveLength(3);
    expect(filterByType(rows(), 'MYSELF').map((r) => r.vehicle.id)).toEqual(['m1', 'g1']);
    expect(filterByType(rows(), 'ASSOCIATED').map((r) => r.vehicle.id)).toEqual(['a1']);
  });

  it('filters by the year the profit was realized', () => {
    expect(filterBySaleYear(rows(), 2026).map((r) => r.vehicle.id)).toEqual(['m1']);
    expect(filterBySaleYear(rows(), 2025).map((r) => r.vehicle.id)).toEqual(['a1']);
    expect(filterBySaleYear(rows(), null)).toHaveLength(3);
  });

  it('lists every year with activity, newest first', () => {
    expect(activeYears(rows())).toEqual([2026, 2025]);
    expect(activeYears([])).toEqual([]);
  });
});

describe('summarizeYear', () => {
  it('separates MYSELF and ASSOCIATED, and halves the associated profit', () => {
    const rows = indexOf(
      deal('m1', 800_000, 0, 1_100_000, 'MYSELF', { purchase: '2026-01-05', sale: '2026-03-01' }),
      deal('a1', 800_000, 0, 1_200_000, 'ASSOCIATED', { purchase: '2026-01-05', sale: '2026-04-01' }),
      deal('old', 500_000, 0, 700_000, 'MYSELF', { purchase: '2025-01-05', sale: '2025-06-01' }),
    );
    const y = summarizeYear(rows, 2026);

    expect(y.year).toBe(2026);
    expect(y.vehiclesPurchased).toBe(2);
    expect(y.vehiclesSold).toBe(2);
    expect(y.grossProfitCents).toBe(300_000 + 400_000);
    expect(y.myself.totalGrossProfitCents).toBe(300_000);
    expect(y.associated.totalGrossProfitCents).toBe(400_000);
    expect(y.associatedDanielCents).toBe(200_000);
    expect(y.associatedFernandoCents).toBe(200_000);
  });

  it('is empty and safe for a year with no activity', () => {
    const y = summarizeYear(indexOf(deal('a', 100_000, 0, 200_000)), 2019);
    expect(y.vehiclesSold).toBe(0);
    expect(y.grossProfitCents).toBe(0);
    expect(y.averageRoi).toBeNull();
  });
});

describe('monthlyProfit', () => {
  it('buckets realized profit by sale month', () => {
    const rows = indexOf(
      deal('a', 100_000, 0, 200_000, 'MYSELF', { sale: '2026-03-14' }),
      deal('b', 100_000, 0, 150_000, 'MYSELF', { sale: '2026-03-28' }),
      deal('c', 100_000, 0, 90_000, 'MYSELF', { sale: '2026-07-02' }),
    );
    const months = monthlyProfit(rows, 2026);
    expect(months).toHaveLength(12);
    expect(months[2]).toBe(150_000); // March: 100,000 + 50,000
    expect(months[6]).toBe(-10_000); // July: a loss
    expect(months[0]).toBe(0);
  });

  it('ignores other years and unsold cars', () => {
    const rows = indexOf(
      deal('a', 100_000, 0, 200_000, 'MYSELF', { sale: '2025-03-14' }),
      deal('b', 100_000, 0, null),
    );
    expect(monthlyProfit(rows, 2026).every((m) => m === 0)).toBe(true);
  });
});
