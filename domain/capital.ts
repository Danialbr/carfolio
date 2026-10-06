/**
 * BUSINESS CAPITAL & CASH — the model behind "available business funds".
 *
 * Four quantities are kept strictly apart, because blurring any two of them is
 * how a business stops knowing what it actually has:
 *
 *   PROTECTED CAPITAL   Daniel's principal. Only a capital contribution or a
 *                       capital withdrawal changes it. Selling a car at a
 *                       profit does NOT increase it; taking a distribution does
 *                       NOT decrease it.
 *   RETAINED EARNINGS   Profit the business has kept: Daniel's realized shares
 *                       minus what he has distributed to himself.
 *   OWED TO FERNANDO    A liability, not equity. His profit shares and his
 *                       out-of-pocket expenses, less what he has been paid.
 *   CASH ON HAND        Actual money available. Everything else is derived.
 *
 * These are tied together by one accounting identity, which holds after every
 * possible sequence of operations:
 *
 *     cash + capitalDeployed + inventoryAtCost
 *         === protectedCapital + retainedEarnings + owedToFernando
 *
 * `verifyIdentity()` checks it, and a property test hammers it with randomized
 * histories. If a future change to the money model is wrong, that equation
 * breaks — which is a far better early-warning system than eyeballing a
 * dashboard.
 */

import { type Cents, sumCents } from './money';
import type {
  CapitalEvent,
  Distribution,
  Expense,
  FernandoEntry,
  InventoryItem,
  Sale,
  Vehicle,
} from './types';

export interface BusinessInput {
  vehicles: readonly Vehicle[];
  /** All expenses across all vehicles. */
  expenses: readonly Expense[];
  sales: readonly Sale[];
  capitalEvents: readonly CapitalEvent[];
  distributions: readonly Distribution[];
  fernandoEntries: readonly FernandoEntry[];
  inventory: readonly InventoryItem[];
}

export interface BusinessPosition {
  /** Sum of contributions less withdrawals. Never moved by profit. */
  protectedCapitalCents: Cents;
  /** Total invested in vehicles not yet sold — money currently tied up in metal. */
  capitalDeployedCents: Cents;
  /** Total invested in vehicles that have sold — principal that came back. */
  capitalReturnedCents: Cents;
  /** Daniel's realized profit shares, less distributions he has taken. */
  retainedEarningsCents: Cents;
  /** Sum of the reinvest decisions recorded at each sale. Should equal retained earnings. */
  cumulativeReinvestmentCents: Cents;
  totalDistributionsCents: Cents;
  /** Positive: Daniel owes Fernando. Negative: Fernando is carrying a loss forward. */
  owedToFernandoCents: Cents;
  inventoryValueCents: Cents;
  /** The money actually available to buy the next car. */
  cashOnHandCents: Cents;

  /** Totals across the whole history, for the dashboard. */
  totalInvestedCents: Cents;
  totalSalesCents: Cents;
  grossProfitCents: Cents;
}

function live<T extends { deletedAt: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.deletedAt == null);
}

export function computeBusinessPosition(input: BusinessInput): BusinessPosition {
  const vehicles = live(input.vehicles);
  const expenses = live(input.expenses);
  const sales = live(input.sales);
  const capitalEvents = live(input.capitalEvents);
  const distributions = live(input.distributions);
  const fernandoEntries = live(input.fernandoEntries);
  const inventory = live(input.inventory);

  const soldVehicleIds = new Set(sales.map((s) => s.vehicleId));
  const knownVehicleIds = new Set(vehicles.map((v) => v.id));

  // Expenses belonging to a soft-deleted vehicle must not count anywhere.
  const relevantExpenses = expenses.filter((e) => knownVehicleIds.has(e.vehicleId));

  const investedByVehicle = new Map<string, Cents>();
  for (const e of relevantExpenses) {
    investedByVehicle.set(e.vehicleId, (investedByVehicle.get(e.vehicleId) ?? 0) + e.amountCents);
  }

  let capitalDeployedCents = 0;
  let capitalReturnedCents = 0;
  for (const v of vehicles) {
    const invested = investedByVehicle.get(v.id) ?? 0;
    if (soldVehicleIds.has(v.id)) capitalReturnedCents += invested;
    else capitalDeployedCents += invested;
  }

  const protectedCapitalCents = sumCents(
    capitalEvents.map((c) => (c.kind === 'CONTRIBUTION' ? c.amountCents : -c.amountCents)),
  );

  const totalSalesCents = sumCents(sales.map((s) => s.salePriceCents));
  const totalInvestedCents = capitalDeployedCents + capitalReturnedCents;
  const grossProfitCents = totalSalesCents - capitalReturnedCents;

  const danielRealizedCents = sumCents(sales.map((s) => s.danielShareCents));
  const totalDistributionsCents = sumCents(distributions.map((d) => d.amountCents));
  const retainedEarningsCents = danielRealizedCents - totalDistributionsCents;
  const cumulativeReinvestmentCents = sumCents(sales.map((s) => s.reinvestCents));

  const owedToFernandoCents = sumCents(fernandoEntries.map((f) => f.amountCents));

  // Inventory is valued as "what it cost, less what has been drawn out of it".
  // Every draw is an expense flagged fromInventory, so the two sides are exact
  // complements of each other and no rounding can open a gap between them.
  const inventoryPurchasesCents = sumCents(inventory.map((i) => i.purchaseCostCents));
  const inventoryDrawnCents = sumCents(
    relevantExpenses.filter((e) => e.fromInventory).map((e) => e.amountCents),
  );
  const inventoryValueCents = inventoryPurchasesCents - inventoryDrawnCents;

  // ── Cash, computed from actual movements ─────────────────────────────────
  // Two exclusions carry the whole reimbursement guarantee:
  //   · an expense Fernando paid never leaves Daniel's cash — it becomes a
  //     liability instead, and only the PAYMENT entry moves cash;
  //   · an expense drawn from inventory never leaves cash either — the cash
  //     left when the stock was bought.
  // Miss either one and the same dollar is spent twice.
  const cashExpensesCents = sumCents(
    relevantExpenses
      .filter((e) => e.paidBy !== 'FERNANDO' && !e.fromInventory)
      .map((e) => e.amountCents),
  );

  const fernandoPaymentsCents = sumCents(
    fernandoEntries.filter((f) => f.kind === 'PAYMENT').map((f) => -f.amountCents),
  );

  const cashOnHandCents =
    protectedCapitalCents +
    totalSalesCents -
    cashExpensesCents -
    totalDistributionsCents -
    fernandoPaymentsCents -
    inventoryPurchasesCents;

  return {
    protectedCapitalCents,
    capitalDeployedCents,
    capitalReturnedCents,
    retainedEarningsCents,
    cumulativeReinvestmentCents,
    totalDistributionsCents,
    owedToFernandoCents,
    inventoryValueCents,
    cashOnHandCents,
    totalInvestedCents,
    totalSalesCents,
    grossProfitCents,
  };
}

export interface IdentityCheck {
  ok: boolean;
  /** assets − claims. Zero when the books balance. */
  discrepancyCents: Cents;
  assetsCents: Cents;
  claimsCents: Cents;
}

/**
 * The books balance, or they don't.
 *
 *     cash + deployed + inventory  ===  protectedCapital + retained + owedToFernando
 *
 * Surface a non-zero discrepancy in Settings rather than hiding it. A number
 * that silently stops adding up is worse than one that visibly complains.
 */
export function verifyIdentity(p: BusinessPosition): IdentityCheck {
  const assetsCents = p.cashOnHandCents + p.capitalDeployedCents + p.inventoryValueCents;
  const claimsCents =
    p.protectedCapitalCents + p.retainedEarningsCents + p.owedToFernandoCents;
  const discrepancyCents = assetsCents - claimsCents;
  return { ok: discrepancyCents === 0, discrepancyCents, assetsCents, claimsCents };
}

// ─── Fernando's account ─────────────────────────────────────────────────────

export interface FernandoAccount {
  /** Positive: Daniel owes Fernando. Negative: losses carried against future profit. */
  balanceCents: Cents;
  profitSharesCents: Cents;
  reimbursementsDueCents: Cents;
  paymentsMadeCents: Cents;
  /** Reimbursements not yet covered by payments, for the "owed" list. */
  unsettledReimbursementCount: number;
}

export function computeFernandoAccount(entries: readonly FernandoEntry[]): FernandoAccount {
  const rows = live(entries);
  const profitSharesCents = sumCents(
    rows.filter((r) => r.kind === 'PROFIT_SHARE').map((r) => r.amountCents),
  );
  const reimbursementsDueCents = sumCents(
    rows.filter((r) => r.kind === 'REIMBURSEMENT').map((r) => r.amountCents),
  );
  const paymentsMadeCents = sumCents(
    rows.filter((r) => r.kind === 'PAYMENT').map((r) => -r.amountCents),
  );

  return {
    balanceCents: profitSharesCents + reimbursementsDueCents - paymentsMadeCents,
    profitSharesCents,
    reimbursementsDueCents,
    paymentsMadeCents,
    unsettledReimbursementCount: rows.filter((r) => r.kind === 'REIMBURSEMENT').length,
  };
}
