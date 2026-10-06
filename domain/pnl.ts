/**
 * VEHICLE P&L — the workflow, in code.
 *
 *   PURCHASE → INVESTMENT BREAKDOWN → TOTAL INVESTED → SALE
 *            → GROSS PROFIT/LOSS → PROFIT ALLOCATION
 *
 * Everything here is derived. No total is ever stored on a vehicle row: a
 * stored total desynchronizes from its detail eventually — always — and the one
 * number the user must be able to trust without checking is the one at the
 * bottom of this file.
 */

import { type Cents, roi, splitHalf, sumCents } from './money';
import { type ISODate, daysBetween } from './dates';
import { isPurchaseCategory } from './categories';
import type { Expense, Sale, Vehicle, VehicleType } from './types';

// ─── Investment breakdown ───────────────────────────────────────────────────

export interface BreakdownLine {
  categoryId: string;
  amountCents: Cents;
  count: number;
}

export interface InvestmentBreakdown {
  /** Sum of expenses in the PURCHASE_PRICE category. Kept apart from everything else. */
  purchasePriceCents: Cents;
  /** Every other expense, summed. */
  additionalInvestmentCents: Cents;
  /** purchasePrice + additionalInvestment. */
  totalInvestedCents: Cents;
  /** Additional-investment lines only, grouped by category, largest first. */
  lines: BreakdownLine[];
}

/** Expenses that count toward a vehicle's cost: not soft-deleted, whoever paid. */
function liveExpenses(expenses: readonly Expense[]): Expense[] {
  return expenses.filter((e) => e.deletedAt == null);
}

/**
 * Note on `paidBy`: it never affects the vehicle's cost. If Fernando bought the
 * tires, the tires are still $500 of investment in the car — who fronted the
 * money is a question about Fernando's balance, not about what the car cost.
 * Keeping those two questions separate is what stops the reimbursement from
 * being counted twice.
 */
export function computeBreakdown(expenses: readonly Expense[]): InvestmentBreakdown {
  const live = liveExpenses(expenses);

  const purchase = live.filter((e) => isPurchaseCategory(e.categoryId));
  const additional = live.filter((e) => !isPurchaseCategory(e.categoryId));

  const byCategory = new Map<string, BreakdownLine>();
  for (const e of additional) {
    const existing = byCategory.get(e.categoryId);
    if (existing) {
      existing.amountCents += e.amountCents;
      existing.count += 1;
    } else {
      byCategory.set(e.categoryId, {
        categoryId: e.categoryId,
        amountCents: e.amountCents,
        count: 1,
      });
    }
  }

  const purchasePriceCents = sumCents(purchase.map((e) => e.amountCents));
  const additionalInvestmentCents = sumCents(additional.map((e) => e.amountCents));

  return {
    purchasePriceCents,
    additionalInvestmentCents,
    totalInvestedCents: purchasePriceCents + additionalInvestmentCents,
    lines: [...byCategory.values()].sort((a, b) => b.amountCents - a.amountCents),
  };
}

// ─── Profit split ───────────────────────────────────────────────────────────

export interface ProfitSplit {
  danielCents: Cents;
  fernandoCents: Cents;
}

/**
 * Split gross profit — or loss — by vehicle type.
 *
 * MYSELF: all of it is Daniel's. ASSOCIATED: half each, with any odd cent to
 * Daniel (see splitHalf). The rule is identical for losses, so a $2,000.01 loss
 * on an ASSOCIATED car puts -$1,000.01 on Daniel and -$1,000.00 on Fernando.
 * `danielCents + fernandoCents === grossCents` always holds, which is asserted
 * as a property test.
 */
export function splitProfit(grossCents: Cents, type: VehicleType): ProfitSplit {
  if (type === 'MYSELF') {
    return { danielCents: grossCents, fernandoCents: 0 };
  }
  const { first, second } = splitHalf(grossCents);
  return { danielCents: first, fernandoCents: second };
}

// ─── Full picture ───────────────────────────────────────────────────────────

export interface VehicleFinancials {
  vehicleId: string;
  type: VehicleType;
  breakdown: InvestmentBreakdown;
  /** Convenience mirror of breakdown.totalInvestedCents. */
  totalInvestedCents: Cents;

  sold: boolean;
  salePriceCents: Cents | null;
  /** salePrice − totalInvested. Null while unsold. */
  grossProfitCents: Cents | null;
  /** grossProfit ÷ totalInvested, as a ratio. Null while unsold or nothing invested. */
  roi: number | null;
  /** Daniel's and Fernando's shares of grossProfit. Null while unsold. */
  split: ProfitSplit | null;

  /** Purchase → sale for a sold car; purchase → today for one in the Garage. */
  daysHeld: number | null;

  /** Garage projections, present only when an estimated sale price is set. */
  estimatedSalePriceCents: Cents | null;
  estimatedProfitCents: Cents | null;
  estimatedRoi: number | null;

  /** Of the total invested, the part Fernando fronted and is owed back. */
  fernandoPaidCents: Cents;
}

export function computeVehicleFinancials(
  vehicle: Vehicle,
  expenses: readonly Expense[],
  sale: Sale | null,
  today: ISODate,
): VehicleFinancials {
  const breakdown = computeBreakdown(expenses);
  const totalInvestedCents = breakdown.totalInvestedCents;
  const live = liveExpenses(expenses);

  const fernandoPaidCents = sumCents(
    live.filter((e) => e.paidBy === 'FERNANDO').map((e) => e.amountCents),
  );

  const activeSale = sale && sale.deletedAt == null ? sale : null;
  const sold = activeSale !== null;

  const salePriceCents = activeSale ? activeSale.salePriceCents : null;
  const grossProfitCents = activeSale ? activeSale.salePriceCents - totalInvestedCents : null;
  const split = grossProfitCents !== null ? splitProfit(grossProfitCents, vehicle.type) : null;

  const daysHeld = activeSale
    ? daysBetween(vehicle.purchaseDate, activeSale.saleDate)
    : daysBetween(vehicle.purchaseDate, today);

  const estimate = vehicle.estimatedSalePriceCents;
  const estimatedProfitCents = !sold && estimate != null ? estimate - totalInvestedCents : null;

  return {
    vehicleId: vehicle.id,
    type: vehicle.type,
    breakdown,
    totalInvestedCents,
    sold,
    salePriceCents,
    grossProfitCents,
    roi: grossProfitCents !== null ? roi(grossProfitCents, totalInvestedCents) : null,
    split,
    daysHeld,
    estimatedSalePriceCents: sold ? null : estimate,
    estimatedProfitCents,
    estimatedRoi:
      estimatedProfitCents !== null ? roi(estimatedProfitCents, totalInvestedCents) : null,
    fernandoPaidCents,
  };
}

// ─── Allocation of Daniel's share ───────────────────────────────────────────

export interface AllocationPlan {
  danielShareCents: Cents;
  reinvestCents: Cents;
  distributeCents: Cents;
}

export interface AllocationValidation {
  ok: boolean;
  errors: string[];
}

/**
 * The reinvest/distribute decision applies to DANIEL'S SHARE ONLY.
 *
 * Fernando's half of an ASSOCIATED profit is his the moment the car sells; it
 * is posted straight to his balance and is never available to reinvest. You do
 * not get to reinvest someone else's money, and keeping that boundary hard is
 * what makes his number unambiguous at settlement time.
 *
 * On a loss there is nothing to allocate — the negative share simply reduces
 * retained earnings.
 */
export function validateAllocation(plan: AllocationPlan): AllocationValidation {
  const errors: string[] = [];
  const { danielShareCents, reinvestCents, distributeCents } = plan;

  if (reinvestCents < 0) errors.push('Reinvestment cannot be negative.');
  if (distributeCents < 0) errors.push('Distribution cannot be negative.');

  if (danielShareCents <= 0) {
    if (reinvestCents !== 0 || distributeCents !== 0) {
      errors.push('There is no profit to allocate on a break-even or losing sale.');
    }
  } else if (reinvestCents + distributeCents !== danielShareCents) {
    errors.push(
      `Reinvestment and distribution must add up to your share exactly ` +
        `(${reinvestCents} + ${distributeCents} ≠ ${danielShareCents} cents).`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/** Default when the user hasn't chosen: keep it all in the business. */
export function defaultAllocation(danielShareCents: Cents): AllocationPlan {
  if (danielShareCents <= 0) {
    return { danielShareCents, reinvestCents: 0, distributeCents: 0 };
  }
  return { danielShareCents, reinvestCents: danielShareCents, distributeCents: 0 };
}
