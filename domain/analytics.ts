/**
 * ANALYTICS — how efficiently the business is actually flipping cars.
 *
 * Every figure here is computed from sold vehicles only, because an average
 * that includes cars still sitting in the Garage is not an average of anything.
 * The one exception is `inGarage`, which is explicitly about them.
 */

import { type Cents, averageCents, averageRatio, roi, sumCents } from './money';
import { type ISODate, yearOf } from './dates';
import { computeVehicleFinancials, type VehicleFinancials } from './pnl';
import type { Expense, Sale, Vehicle, VehicleType } from './types';

export type TypeFilter = 'ALL' | VehicleType;

export interface VehicleWithFinancials {
  vehicle: Vehicle;
  financials: VehicleFinancials;
  sale: Sale | null;
}

/** Join vehicles to their expenses and sales once; every report reads this. */
export function buildVehicleIndex(
  vehicles: readonly Vehicle[],
  expenses: readonly Expense[],
  sales: readonly Sale[],
  today: ISODate,
): VehicleWithFinancials[] {
  const expensesByVehicle = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (e.deletedAt != null) continue;
    const list = expensesByVehicle.get(e.vehicleId);
    if (list) list.push(e);
    else expensesByVehicle.set(e.vehicleId, [e]);
  }

  const saleByVehicle = new Map<string, Sale>();
  for (const s of sales) {
    if (s.deletedAt == null) saleByVehicle.set(s.vehicleId, s);
  }

  return vehicles
    .filter((v) => v.deletedAt == null)
    .map((vehicle) => {
      const sale = saleByVehicle.get(vehicle.id) ?? null;
      return {
        vehicle,
        sale,
        financials: computeVehicleFinancials(
          vehicle,
          expensesByVehicle.get(vehicle.id) ?? [],
          sale,
          today,
        ),
      };
    });
}

export function filterByType(
  rows: readonly VehicleWithFinancials[],
  filter: TypeFilter,
): VehicleWithFinancials[] {
  if (filter === 'ALL') return [...rows];
  return rows.filter((r) => r.vehicle.type === filter);
}

/** Filter by the year a vehicle SOLD — the year its profit was realized. */
export function filterBySaleYear(
  rows: readonly VehicleWithFinancials[],
  year: number | null,
): VehicleWithFinancials[] {
  if (year == null) return [...rows];
  return rows.filter((r) => r.sale != null && yearOf(r.sale.saleDate) === year);
}

export interface Extreme {
  vehicleId: string;
  label: string;
  valueCents: Cents;
}

export interface ExtremeRatio {
  vehicleId: string;
  label: string;
  ratio: number;
}

export interface PerformanceSummary {
  vehiclesSold: number;
  vehiclesInGarage: number;
  totalVehicles: number;

  totalInvestedCents: Cents;
  totalSalesCents: Cents;
  totalGrossProfitCents: Cents;

  averagePurchasePriceCents: Cents | null;
  averageAdditionalInvestmentCents: Cents | null;
  averageTotalInvestmentCents: Cents | null;
  averageSalePriceCents: Cents | null;
  averageGrossProfitCents: Cents | null;
  averageRoi: number | null;
  averageDaysToSell: number | null;

  /**
   * Profit ÷ investment across the whole portfolio, which is NOT the mean of the
   * per-car ROIs. A $200 profit on a $400 car and a $1,000 profit on a $20,000
   * car average to 27.5% per car but returned 5.9% on the money. Both numbers
   * are shown, labelled differently, because they answer different questions.
   */
  aggregateRoi: number | null;

  bestProfit: Extreme | null;
  worstProfit: Extreme | null;
  bestRoi: ExtremeRatio | null;
  worstRoi: ExtremeRatio | null;

  /** Daniel's realized share across these vehicles. */
  danielProfitCents: Cents;
  /** Fernando's realized share — zero unless ASSOCIATED cars are in the set. */
  fernandoProfitCents: Cents;
}

function labelOf(row: VehicleWithFinancials): string {
  const { year, make, model } = row.vehicle;
  return [year != null ? String(year) : '', make, model]
    .filter((p) => p.trim() !== '')
    .join(' ')
    .trim();
}

export function summarize(rows: readonly VehicleWithFinancials[]): PerformanceSummary {
  const sold = rows.filter((r) => r.financials.sold);
  const garage = rows.filter((r) => !r.financials.sold);

  const purchasePrices = sold.map((r) => r.financials.breakdown.purchasePriceCents);
  const additional = sold.map((r) => r.financials.breakdown.additionalInvestmentCents);
  const totals = sold.map((r) => r.financials.totalInvestedCents);
  const salePrices = sold.map((r) => r.financials.salePriceCents ?? 0);
  const profits = sold.map((r) => r.financials.grossProfitCents ?? 0);
  const rois = sold.map((r) => r.financials.roi).filter((v): v is number => v != null);
  const days = sold.map((r) => r.financials.daysHeld).filter((v): v is number => v != null);

  const totalInvestedSold = sumCents(totals);
  const totalSales = sumCents(salePrices);
  const totalProfit = sumCents(profits);

  let bestProfit: Extreme | null = null;
  let worstProfit: Extreme | null = null;
  let bestRoi: ExtremeRatio | null = null;
  let worstRoi: ExtremeRatio | null = null;

  for (const row of sold) {
    const profit = row.financials.grossProfitCents;
    if (profit != null) {
      const candidate = { vehicleId: row.vehicle.id, label: labelOf(row), valueCents: profit };
      if (bestProfit == null || profit > bestProfit.valueCents) bestProfit = candidate;
      if (worstProfit == null || profit < worstProfit.valueCents) worstProfit = candidate;
    }
    const r = row.financials.roi;
    if (r != null) {
      const candidate = { vehicleId: row.vehicle.id, label: labelOf(row), ratio: r };
      if (bestRoi == null || r > bestRoi.ratio) bestRoi = candidate;
      if (worstRoi == null || r < worstRoi.ratio) worstRoi = candidate;
    }
  }

  const danielProfitCents = sumCents(sold.map((r) => r.financials.split?.danielCents ?? 0));
  const fernandoProfitCents = sumCents(sold.map((r) => r.financials.split?.fernandoCents ?? 0));

  return {
    vehiclesSold: sold.length,
    vehiclesInGarage: garage.length,
    totalVehicles: rows.length,

    totalInvestedCents: sumCents(rows.map((r) => r.financials.totalInvestedCents)),
    totalSalesCents: totalSales,
    totalGrossProfitCents: totalProfit,

    averagePurchasePriceCents: averageCents(purchasePrices),
    averageAdditionalInvestmentCents: averageCents(additional),
    averageTotalInvestmentCents: averageCents(totals),
    averageSalePriceCents: averageCents(salePrices),
    averageGrossProfitCents: averageCents(profits),
    averageRoi: averageRatio(rois),
    averageDaysToSell:
      days.length === 0 ? null : days.reduce((a, b) => a + b, 0) / days.length,
    aggregateRoi: roi(totalProfit, totalInvestedSold),

    bestProfit,
    worstProfit,
    bestRoi,
    worstRoi,

    danielProfitCents,
    fernandoProfitCents,
  };
}

// ─── Year-to-date ───────────────────────────────────────────────────────────

export interface YearSummary {
  year: number;
  vehiclesPurchased: number;
  vehiclesSold: number;
  totalInvestedCents: Cents;
  totalSalesCents: Cents;
  grossProfitCents: Cents;
  averageProfitCents: Cents | null;
  averageRoi: number | null;
  averageDaysToSell: number | null;

  myself: PerformanceSummary;
  associated: PerformanceSummary;
  /** Daniel's half of the associated profit. */
  associatedDanielCents: Cents;
  /** Fernando's half. */
  associatedFernandoCents: Cents;
}

export function summarizeYear(
  rows: readonly VehicleWithFinancials[],
  year: number,
): YearSummary {
  const soldThisYear = rows.filter(
    (r) => r.sale != null && yearOf(r.sale.saleDate) === year,
  );
  const purchasedThisYear = rows.filter((r) => yearOf(r.vehicle.purchaseDate) === year);

  const overall = summarize(soldThisYear);
  const myself = summarize(soldThisYear.filter((r) => r.vehicle.type === 'MYSELF'));
  const associated = summarize(soldThisYear.filter((r) => r.vehicle.type === 'ASSOCIATED'));

  return {
    year,
    vehiclesPurchased: purchasedThisYear.length,
    vehiclesSold: soldThisYear.length,
    totalInvestedCents: overall.totalInvestedCents,
    totalSalesCents: overall.totalSalesCents,
    grossProfitCents: overall.totalGrossProfitCents,
    averageProfitCents: overall.averageGrossProfitCents,
    averageRoi: overall.averageRoi,
    averageDaysToSell: overall.averageDaysToSell,
    myself,
    associated,
    associatedDanielCents: associated.danielProfitCents,
    associatedFernandoCents: associated.fernandoProfitCents,
  };
}

/** Every year that has activity, newest first — drives the year picker. */
export function activeYears(rows: readonly VehicleWithFinancials[]): number[] {
  const years = new Set<number>();
  for (const r of rows) {
    const purchased = yearOf(r.vehicle.purchaseDate);
    if (purchased != null) years.add(purchased);
    if (r.sale != null) {
      const soldYear = yearOf(r.sale.saleDate);
      if (soldYear != null) years.add(soldYear);
    }
  }
  return [...years].sort((a, b) => b - a);
}

/** Monthly realized profit for the analytics chart. Index 0 is January. */
export function monthlyProfit(
  rows: readonly VehicleWithFinancials[],
  year: number,
): Cents[] {
  const months = new Array<Cents>(12).fill(0);
  for (const r of rows) {
    if (r.sale == null || r.financials.grossProfitCents == null) continue;
    const parts = /^(\d{4})-(\d{2})/.exec(r.sale.saleDate);
    if (!parts || Number(parts[1]) !== year) continue;
    const monthIndex = Number(parts[2]) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      months[monthIndex] = (months[monthIndex] as number) + r.financials.grossProfitCents;
    }
  }
  return months;
}
