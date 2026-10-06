/**
 * PDF TEMPLATES — pure functions from data to an HTML string.
 *
 * Nothing here touches the device, the filesystem or expo-print. That is what
 * makes the reports snapshot-testable in plain node: a broken report is caught
 * in CI rather than discovered after it has already been sent to Fernando.
 *
 * The visual design is deliberately conservative — a printed financial
 * statement, not the app's dark UI. It is going to be read on someone else's
 * phone, forwarded, and possibly printed, so it is black on white with real
 * hierarchy and no reliance on colour to carry meaning.
 */

import { formatMoney, formatPercent, type Cents } from '../../domain/money';
import { formatDate, formatDayCount, type ISODate } from '../../domain/dates';
import { categoryLabel } from '../../domain/categories';
import { formatMileage, vehicleTitle } from '../../domain/vehicle';
import type { VehicleWithFinancials, PerformanceSummary, YearSummary } from '../../domain/analytics';
import type { BusinessPosition, FernandoAccount } from '../../domain/capital';
import type { Expense, FernandoEntry } from '../../domain/types';

/** Escapes user-entered text. Notes and buyer names end up inside HTML. */
function esc(value: string | null | undefined): string {
  if (value == null) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const money = (cents: Cents | null | undefined, signed = false) =>
  cents == null ? '—' : formatMoney(cents, { cents: true, signed });

const STYLES = `
  @page { margin: 44px 40px; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #14181C; font-size: 11.5px; line-height: 1.5; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .masthead { border-bottom: 2.5px solid #14181C; padding-bottom: 12px; margin-bottom: 22px;
    display: flex; justify-content: space-between; align-items: flex-end; }
  .brand { font-size: 19px; font-weight: 800; letter-spacing: -0.4px; }
  .brand span { font-weight: 400; color: #6B7783; }
  .issued { font-size: 9.5px; color: #6B7783; text-align: right; line-height: 1.45; }
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; margin: 0 0 4px; }
  .sub { font-size: 11.5px; color: #55606B; margin: 0 0 20px; }
  h2 { font-size: 9.5px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase;
    color: #6B7783; margin: 24px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #D9DEE3; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5.5px 0; vertical-align: top; }
  td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tr.line td { border-bottom: 1px solid #EDF0F3; }
  tr.total td { border-top: 1.5px solid #14181C; font-weight: 800; font-size: 13px; padding-top: 8px; }
  tr.sub-total td { border-top: 1px solid #C7CED5; font-weight: 700; }
  .muted { color: #6B7783; }
  .tiny { font-size: 9.5px; color: #6B7783; }
  .headline { border: 1.5px solid #14181C; border-radius: 6px; padding: 14px 16px; margin: 18px 0 6px; }
  .headline .label { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: #6B7783; }
  .headline .value { font-size: 27px; font-weight: 800; letter-spacing: -0.8px; margin-top: 2px;
    font-variant-numeric: tabular-nums; }
  .headline .meta { font-size: 10px; color: #55606B; margin-top: 5px; }
  .principal { background: #F6F3EA; border: 1px solid #C9B98C; border-radius: 5px;
    padding: 11px 13px; margin: 10px 0; }
  .grid { display: flex; gap: 10px; margin: 14px 0; }
  .tile { flex: 1; border: 1px solid #D9DEE3; border-radius: 5px; padding: 10px 11px; }
  .tile .label { font-size: 8.5px; letter-spacing: 0.8px; text-transform: uppercase; color: #6B7783; }
  .tile .value { font-size: 15px; font-weight: 800; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .pill { display: inline-block; border: 1px solid #A9B3BD; border-radius: 3px;
    padding: 1.5px 6px; font-size: 8.5px; font-weight: 700; letter-spacing: 0.6px;
    text-transform: uppercase; margin-right: 5px; }
  .note { background: #F5F7F9; border-left: 2.5px solid #A9B3BD; padding: 9px 12px;
    margin: 12px 0; font-size: 10.5px; color: #37414B; }
  footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #D9DEE3;
    font-size: 9px; color: #8B959F; display: flex; justify-content: space-between; }
`;

function shell(title: string, body: string, issuedOn: ISODate): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${STYLES}</style></head><body>
<div class="masthead">
  <div class="brand">Carfolio<span> · Vehicle Investment Report</span></div>
  <div class="issued">Issued ${formatDate(issuedOn)}<br>Prepared by Daniel</div>
</div>
${body}
<footer>
  <span>Carfolio — generated ${formatDate(issuedOn)}</span>
  <span>Figures reflect records at the time of generation</span>
</footer>
</body></html>`;
}

// ─── Vehicle report ─────────────────────────────────────────────────────────

export interface VehicleReportInput {
  row: VehicleWithFinancials;
  expenses: readonly Expense[];
  fernandoEntries: readonly FernandoEntry[];
  issuedOn: ISODate;
}

/**
 * One vehicle, complete. This is the document that gets sent to Fernando, so
 * on an ASSOCIATED car it has to stand on its own: what was spent, what it
 * sold for, how the halves were computed, and what he is owed.
 */
export function vehicleReportHtml(input: VehicleReportInput): string {
  const { row, expenses, fernandoEntries, issuedOn } = input;
  const { vehicle, financials, sale } = row;
  const { breakdown } = financials;

  /**
   * Ordered by date, then largest cost first within a day, then category name.
   *
   * Every key is content, never the record id: ids are generated per install,
   * so ordering by them would make the same deal print in a different order on
   * a different device — and would make this document unsnapshot-testable.
   */
  const additional = expenses
    .filter((e) => e.deletedAt == null && e.categoryId !== 'PURCHASE_PRICE')
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        b.amountCents - a.amountCents ||
        categoryLabel(a.categoryId).localeCompare(categoryLabel(b.categoryId)),
    );

  const purchaseRow = expenses.find(
    (e) => e.deletedAt == null && e.categoryId === 'PURCHASE_PRICE',
  );

  const relatedEntries = fernandoEntries.filter(
    (e) => e.deletedAt == null && e.vehicleId === vehicle.id,
  );

  const sold = financials.sold && sale != null;
  const profit = financials.grossProfitCents;

  const headline = sold
    ? `<div class="headline">
        <div class="label">${(profit ?? 0) >= 0 ? 'Gross profit' : 'Gross loss'}</div>
        <div class="value">${money(profit, true)}</div>
        <div class="meta">ROI ${formatPercent(financials.roi)} · held ${formatDayCount(financials.daysHeld)} · sold ${formatDate(sale.saleDate)}</div>
      </div>`
    : `<div class="headline">
        <div class="label">Total invested to date</div>
        <div class="value">${money(financials.totalInvestedCents)}</div>
        <div class="meta">Still in the garage · ${formatDayCount(financials.daysHeld)} held</div>
      </div>`;

  const breakdownRows = additional
    .map(
      (e) => `<tr class="line">
        <td>${esc(categoryLabel(e.categoryId))}${
          e.description ? `<div class="tiny">${esc(e.description)}</div>` : ''
        }</td>
        <td class="r muted">${formatDate(e.date)}</td>
        <td class="r muted">${e.paidBy === 'FERNANDO' ? 'Fernando' : e.paidBy === 'BUSINESS' ? 'Business' : 'Daniel'}</td>
        <td class="r">${money(e.amountCents)}</td>
      </tr>`,
    )
    .join('');

  const saleSection = sold
    ? `<h2>Sale</h2>
    <table>
      <tr class="line"><td>Sale date</td><td class="r">${formatDate(sale.saleDate)}</td></tr>
      ${sale.buyerName ? `<tr class="line"><td>Buyer</td><td class="r">${esc(sale.buyerName)}</td></tr>` : ''}
      ${vehicle.mileageOut != null ? `<tr class="line"><td>Mileage at sale</td><td class="r">${formatMileage(vehicle.mileageOut)}</td></tr>` : ''}
      <tr class="line"><td>Sale price</td><td class="r">${money(sale.salePriceCents)}</td></tr>
      <tr class="line"><td class="muted">Less total invested</td><td class="r muted">${money(-financials.totalInvestedCents)}</td></tr>
      <tr class="total"><td>${(profit ?? 0) >= 0 ? 'Gross profit' : 'Gross loss'}</td><td class="r">${money(profit, true)}</td></tr>
    </table>

    <h2>Profit allocation</h2>
    <table>
      <tr class="line">
        <td><strong>Daniel</strong><div class="tiny">${vehicle.type === 'MYSELF' ? '100% — worked alone' : '50% share'}</div></td>
        <td class="r"><strong>${money(sale.danielShareCents, true)}</strong></td>
      </tr>
      ${
        vehicle.type === 'ASSOCIATED'
          ? `<tr class="line">
              <td><strong>Fernando</strong><div class="tiny">50% share${
                sale.fernandoShareCents < 0 ? ' — loss carried against future profit' : ''
              }</div></td>
              <td class="r"><strong>${money(sale.fernandoShareCents, true)}</strong></td>
            </tr>`
          : ''
      }
      ${
        sale.danielShareCents > 0
          ? `<tr><td colspan="2" class="tiny" style="padding-top:10px">OF DANIEL'S SHARE</td></tr>
             <tr class="line"><td class="muted">Reinvested in the business</td><td class="r">${money(sale.reinvestCents)}</td></tr>
             <tr class="line"><td class="muted">Distributed</td><td class="r">${money(sale.distributeCents)}</td></tr>`
          : ''
      }
    </table>
    ${
      vehicle.type === 'ASSOCIATED'
        ? `<div class="note">Fernando's share is calculated on the gross profit after every cost
             above. It is his in full at the point of sale and is not affected by how Daniel
             chooses to allocate his own half.</div>`
        : ''
    }`
    : `<div class="note">This vehicle has not been sold yet. The figures above reflect money
         invested to date.</div>`;

  const fernandoSection =
    relatedEntries.length > 0
      ? `<h2>Fernando — entries for this vehicle</h2>
      <table>
        ${relatedEntries
          .map(
            (e) => `<tr class="line">
              <td>${e.kind === 'PROFIT_SHARE' ? 'Profit share' : e.kind === 'REIMBURSEMENT' ? 'Reimbursement — paid out of pocket' : 'Payment'}
                ${e.notes ? `<div class="tiny">${esc(e.notes)}</div>` : ''}</td>
              <td class="r muted">${formatDate(e.date)}</td>
              <td class="r">${money(e.amountCents, true)}</td>
            </tr>`,
          )
          .join('')}
        <tr class="sub-total">
          <td colspan="2">Net for this vehicle</td>
          <td class="r">${money(relatedEntries.reduce((s, e) => s + e.amountCents, 0), true)}</td>
        </tr>
      </table>`
      : '';

  const body = `
  <h1>${esc(vehicleTitle(vehicle))}</h1>
  <p class="sub">
    <span class="pill">${vehicle.type === 'MYSELF' ? 'Myself' : 'Associated'}</span>
    <span class="pill">${sold ? 'Sold' : 'In garage'}</span>
    ${vehicle.vin ? `VIN ${esc(vehicle.vin)}` : 'No VIN on record'}
  </p>

  ${headline}

  <h2>Vehicle</h2>
  <table>
    <tr class="line"><td>Year / Make / Model / Trim</td><td class="r">${esc(vehicleTitle(vehicle))}</td></tr>
    <tr class="line"><td>VIN</td><td class="r">${vehicle.vin ? esc(vehicle.vin) : '—'}</td></tr>
    <tr class="line"><td>Mileage at purchase</td><td class="r">${formatMileage(vehicle.mileageIn)}</td></tr>
    <tr class="line"><td>Mileage at sale</td><td class="r">${formatMileage(vehicle.mileageOut)}</td></tr>
    <tr class="line"><td>Purchase date</td><td class="r">${formatDate(vehicle.purchaseDate)}</td></tr>
    <tr class="line"><td>Sale date</td><td class="r">${sale ? formatDate(sale.saleDate) : '—'}</td></tr>
    <tr class="line"><td>Days held</td><td class="r">${formatDayCount(financials.daysHeld)}</td></tr>
  </table>

  <h2>Investment breakdown</h2>
  <table>
    <tr class="line">
      <td><strong>Purchase price</strong></td>
      <td class="r muted">${purchaseRow ? formatDate(purchaseRow.date) : ''}</td>
      <td class="r muted">${purchaseRow ? (purchaseRow.paidBy === 'FERNANDO' ? 'Fernando' : purchaseRow.paidBy === 'BUSINESS' ? 'Business' : 'Daniel') : ''}</td>
      <td class="r"><strong>${money(breakdown.purchasePriceCents)}</strong></td>
    </tr>
    <tr><td colspan="4" class="tiny" style="padding-top:12px">ADDITIONAL INVESTMENT</td></tr>
    ${breakdownRows || '<tr class="line"><td colspan="4" class="muted">No additional investment recorded.</td></tr>'}
    <tr class="sub-total">
      <td colspan="3">Additional investment</td>
      <td class="r">${money(breakdown.additionalInvestmentCents)}</td>
    </tr>
    <tr class="total">
      <td colspan="3">Total invested</td>
      <td class="r">${money(financials.totalInvestedCents)}</td>
    </tr>
  </table>

  ${saleSection}
  ${fernandoSection}

  ${vehicle.notes ? `<h2>Notes</h2><p>${esc(vehicle.notes)}</p>` : ''}
  ${sale && sale.notes ? `<h2>Sale notes</h2><p>${esc(sale.notes)}</p>` : ''}
  `;

  return shell(`${vehicleTitle(vehicle)} — Carfolio`, body, issuedOn);
}

// ─── Business summary ───────────────────────────────────────────────────────

export interface BusinessReportInput {
  year: number;
  yearSummary: YearSummary;
  allTime: PerformanceSummary;
  position: BusinessPosition;
  fernando: FernandoAccount;
  vehicles: readonly VehicleWithFinancials[];
  issuedOn: ISODate;
}

export function businessReportHtml(input: BusinessReportInput): string {
  const { year, yearSummary, allTime, position, fernando, vehicles, issuedOn } = input;

  // Content-based tie-breakers throughout, for the same reason as above: two
  // cars sold on one day must print in the same order on every device.
  const sold = vehicles
    .filter((v) => v.financials.sold)
    .sort(
      (a, b) =>
        (b.sale?.saleDate ?? '').localeCompare(a.sale?.saleDate ?? '') ||
        (b.financials.salePriceCents ?? 0) - (a.financials.salePriceCents ?? 0) ||
        vehicleTitle(a.vehicle).localeCompare(vehicleTitle(b.vehicle)),
    );

  const garage = vehicles
    .filter((v) => !v.financials.sold)
    .sort(
      (a, b) =>
        a.vehicle.purchaseDate.localeCompare(b.vehicle.purchaseDate) ||
        vehicleTitle(a.vehicle).localeCompare(vehicleTitle(b.vehicle)),
    );

  const historyRows = sold
    .map(
      (v) => `<tr class="line">
        <td>${esc(vehicleTitle(v.vehicle))}
          <div class="tiny">${v.vehicle.type === 'MYSELF' ? 'Myself' : 'Associated'} · sold ${v.sale ? formatDate(v.sale.saleDate) : ''}</div>
        </td>
        <td class="r">${money(v.financials.totalInvestedCents)}</td>
        <td class="r">${money(v.financials.salePriceCents)}</td>
        <td class="r"><strong>${money(v.financials.grossProfitCents, true)}</strong></td>
        <td class="r muted">${formatPercent(v.financials.roi)}</td>
        <td class="r muted">${v.financials.daysHeld ?? '—'}d</td>
      </tr>`,
    )
    .join('');

  const garageRows = garage
    .map(
      (v) => `<tr class="line">
        <td>${esc(vehicleTitle(v.vehicle))}
          <div class="tiny">${v.vehicle.type === 'MYSELF' ? 'Myself' : 'Associated'} · bought ${formatDate(v.vehicle.purchaseDate)}</div>
        </td>
        <td class="r">${money(v.financials.breakdown.purchasePriceCents)}</td>
        <td class="r">${money(v.financials.breakdown.additionalInvestmentCents)}</td>
        <td class="r"><strong>${money(v.financials.totalInvestedCents)}</strong></td>
        <td class="r muted">${v.financials.daysHeld ?? '—'}d</td>
      </tr>`,
    )
    .join('');

  const body = `
  <h1>Business summary</h1>
  <p class="sub">${year} year to date, with all-time performance</p>

  <div class="grid">
    <div class="tile"><div class="label">Gross profit ${year}</div><div class="value">${money(yearSummary.grossProfitCents, true)}</div></div>
    <div class="tile"><div class="label">Vehicles sold</div><div class="value">${yearSummary.vehiclesSold}</div></div>
    <div class="tile"><div class="label">Avg ROI</div><div class="value">${formatPercent(yearSummary.averageRoi)}</div></div>
    <div class="tile"><div class="label">Avg days</div><div class="value">${yearSummary.averageDaysToSell == null ? '—' : Math.round(yearSummary.averageDaysToSell)}</div></div>
  </div>

  <h2>Capital position</h2>
  <div class="principal">
    <table>
      <tr>
        <td><strong>Protected capital</strong>
          <div class="tiny">Principal. Not increased by profit, not reduced by distributions.</div>
        </td>
        <td class="r"><strong>${money(position.protectedCapitalCents)}</strong></td>
      </tr>
    </table>
  </div>
  <table>
    <tr class="line"><td>Available to invest</td><td class="r">${money(position.cashOnHandCents)}</td></tr>
    <tr class="line"><td>Deployed in vehicles</td><td class="r">${money(position.capitalDeployedCents)}</td></tr>
    <tr class="line"><td>Held as inventory</td><td class="r">${money(position.inventoryValueCents)}</td></tr>
    <tr class="line"><td>Retained in the business</td><td class="r">${money(position.retainedEarningsCents, true)}</td></tr>
    <tr class="line"><td>Cumulative reinvestment</td><td class="r">${money(position.cumulativeReinvestmentCents)}</td></tr>
    <tr class="line"><td>Total distributions</td><td class="r">${money(position.totalDistributionsCents)}</td></tr>
    <tr class="line"><td>${position.owedToFernandoCents >= 0 ? 'Owed to Fernando' : 'Fernando carrying'}</td><td class="r">${money(Math.abs(position.owedToFernandoCents))}</td></tr>
  </table>

  <h2>${year} — business</h2>
  <table>
    <tr class="line"><td>Vehicles purchased</td><td class="r">${yearSummary.vehiclesPurchased}</td></tr>
    <tr class="line"><td>Vehicles sold</td><td class="r">${yearSummary.vehiclesSold}</td></tr>
    <tr class="line"><td>Total investment</td><td class="r">${money(yearSummary.totalInvestedCents)}</td></tr>
    <tr class="line"><td>Total sales</td><td class="r">${money(yearSummary.totalSalesCents)}</td></tr>
    <tr class="line"><td>Average profit</td><td class="r">${money(yearSummary.averageProfitCents, true)}</td></tr>
    <tr class="line"><td>Average ROI</td><td class="r">${formatPercent(yearSummary.averageRoi)}</td></tr>
    <tr class="line"><td>Average days to sell</td><td class="r">${formatDayCount(yearSummary.averageDaysToSell)}</td></tr>
    <tr class="total"><td>Gross profit</td><td class="r">${money(yearSummary.grossProfitCents, true)}</td></tr>
  </table>

  <h2>${year} — Myself</h2>
  <table>
    <tr class="line"><td>Vehicles sold</td><td class="r">${yearSummary.myself.vehiclesSold}</td></tr>
    <tr class="line"><td>Investment</td><td class="r">${money(yearSummary.myself.totalInvestedCents)}</td></tr>
    <tr class="line"><td>ROI</td><td class="r">${formatPercent(yearSummary.myself.aggregateRoi)}</td></tr>
    <tr class="sub-total"><td>Profit (100% Daniel)</td><td class="r">${money(yearSummary.myself.totalGrossProfitCents, true)}</td></tr>
  </table>

  <h2>${year} — Associated</h2>
  <table>
    <tr class="line"><td>Vehicles sold</td><td class="r">${yearSummary.associated.vehiclesSold}</td></tr>
    <tr class="line"><td>Investment</td><td class="r">${money(yearSummary.associated.totalInvestedCents)}</td></tr>
    <tr class="line"><td>ROI</td><td class="r">${formatPercent(yearSummary.associated.aggregateRoi)}</td></tr>
    <tr class="line"><td>Total associated profit</td><td class="r">${money(yearSummary.associated.totalGrossProfitCents, true)}</td></tr>
    <tr class="line"><td>Daniel — 50%</td><td class="r">${money(yearSummary.associatedDanielCents, true)}</td></tr>
    <tr class="sub-total"><td>Fernando — 50%</td><td class="r">${money(yearSummary.associatedFernandoCents, true)}</td></tr>
  </table>

  <h2>Fernando — running balance</h2>
  <table>
    <tr class="line"><td>Profit share, all time</td><td class="r">${money(fernando.profitSharesCents, true)}</td></tr>
    <tr class="line"><td>Expenses he paid</td><td class="r">${money(fernando.reimbursementsDueCents)}</td></tr>
    <tr class="line"><td>Payments made to him</td><td class="r">${money(-fernando.paymentsMadeCents)}</td></tr>
    <tr class="total"><td>${fernando.balanceCents >= 0 ? 'Owed to Fernando' : 'Carried against future profit'}</td><td class="r">${money(Math.abs(fernando.balanceCents))}</td></tr>
  </table>

  <h2>All-time performance</h2>
  <table>
    <tr class="line"><td>Vehicles sold</td><td class="r">${allTime.vehiclesSold}</td></tr>
    <tr class="line"><td>Average purchase price</td><td class="r">${money(allTime.averagePurchasePriceCents)}</td></tr>
    <tr class="line"><td>Average additional investment</td><td class="r">${money(allTime.averageAdditionalInvestmentCents)}</td></tr>
    <tr class="line"><td>Average total investment</td><td class="r">${money(allTime.averageTotalInvestmentCents)}</td></tr>
    <tr class="line"><td>Average sale price</td><td class="r">${money(allTime.averageSalePriceCents)}</td></tr>
    <tr class="line"><td>Average gross profit</td><td class="r">${money(allTime.averageGrossProfitCents, true)}</td></tr>
    <tr class="line"><td>Average ROI per vehicle</td><td class="r">${formatPercent(allTime.averageRoi)}</td></tr>
    <tr class="line"><td>Return on money invested</td><td class="r">${formatPercent(allTime.aggregateRoi)}</td></tr>
    <tr class="line"><td>Average days to sell</td><td class="r">${formatDayCount(allTime.averageDaysToSell)}</td></tr>
    ${allTime.bestProfit ? `<tr class="line"><td>Best profit — ${esc(allTime.bestProfit.label)}</td><td class="r">${money(allTime.bestProfit.valueCents, true)}</td></tr>` : ''}
    ${allTime.worstProfit ? `<tr class="line"><td>Worst result — ${esc(allTime.worstProfit.label)}</td><td class="r">${money(allTime.worstProfit.valueCents, true)}</td></tr>` : ''}
    <tr class="total"><td>Gross profit, all time</td><td class="r">${money(allTime.totalGrossProfitCents, true)}</td></tr>
  </table>

  <h2>Vehicle history — sold (${sold.length})</h2>
  <table>
    <tr><td class="tiny">VEHICLE</td><td class="r tiny">INVESTED</td><td class="r tiny">SOLD</td><td class="r tiny">PROFIT</td><td class="r tiny">ROI</td><td class="r tiny">DAYS</td></tr>
    ${historyRows || '<tr class="line"><td colspan="6" class="muted">No vehicles sold yet.</td></tr>'}
  </table>

  <h2>In the garage (${garage.length})</h2>
  <table>
    <tr><td class="tiny">VEHICLE</td><td class="r tiny">PURCHASE</td><td class="r tiny">ADDITIONAL</td><td class="r tiny">TOTAL</td><td class="r tiny">DAYS</td></tr>
    ${garageRows || '<tr class="line"><td colspan="5" class="muted">The garage is empty.</td></tr>'}
  </table>
  `;

  return shell(`Business summary ${year} — Carfolio`, body, issuedOn);
}

// ─── Filenames ──────────────────────────────────────────────────────────────

/** Filenames people will see in Files and in a mail attachment. */
export function safeFilename(base: string): string {
  const cleaned = base
    .replace(/[^A-Za-z0-9 \-_]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return (cleaned || 'carfolio-report').slice(0, 80);
}
