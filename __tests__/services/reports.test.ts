/**
 * REPORT TEMPLATES
 *
 * The templates are pure functions from data to an HTML string, so they can be
 * asserted here without a device. That matters because a broken report is one
 * of the few bugs in this app that reaches somebody else: Fernando gets sent a
 * PDF, and a wrong number in it is a conversation, not a crash.
 *
 * Snapshots lock the whole document; the explicit assertions below them state
 * what must be true regardless of how the layout is restyled.
 */

import { createTestDb, type TestDb } from '../support/testDb';
import * as ops from '../../db/operations';
import * as repos from '../../db/repos';
import {
  businessReportHtml,
  safeFilename,
  vehicleReportHtml,
} from '../../services/reports/templates';
import { buildVehicleIndex, summarize, summarizeYear } from '../../domain/analytics';
import { computeBusinessPosition, computeFernandoAccount } from '../../domain/capital';

let h: TestDb;
beforeEach(() => {
  h = createTestDb();
});
afterEach(() => h.close());

const ISSUED = '2026-06-01';

const baseVehicle = {
  year: 2018,
  make: 'Toyota',
  model: 'Camry',
  trim: 'SE',
  vin: '1HGCM82633A004352',
  mileageIn: 84_120,
  purchaseDate: '2026-01-10',
  type: 'MYSELF' as const,
  purchasePriceCents: 800_000,
  purchasePaidBy: 'DANIEL' as const,
  estimatedSalePriceCents: null,
  notes: '',
};

/** The specification's worked example, sold for a $3,000 profit. */
function specDeal(type: 'MYSELF' | 'ASSOCIATED') {
  const vehicle = ops.createVehicle(h.db, { ...baseVehicle, type }).value!;
  for (const [categoryId, amountCents] of [
    ['AUCTION_FEE', 60_000], ['TITLE', 25_000], ['TRANSPORTATION', 40_000],
    ['GASOLINE', 10_000], ['MECHANICAL_REPAIR', 85_000], ['DETAILING', 15_000],
    ['PARTS', 20_000],
  ] as const) {
    ops.addExpense(h.db, {
      vehicleId: vehicle.id, categoryId, amountCents,
      date: '2026-01-20', description: '', paidBy: 'DANIEL',
    });
  }
  return vehicle;
}

function indexFor() {
  const s = repos.readSnapshot(h.db);
  return buildVehicleIndex(s.vehicles, s.expenses, s.sales, ISSUED);
}

function reportFor(vehicleId: string) {
  const s = repos.readSnapshot(h.db);
  const row = indexFor().find((r) => r.vehicle.id === vehicleId)!;
  return vehicleReportHtml({
    row,
    expenses: s.expenses.filter((e) => e.vehicleId === vehicleId),
    fernandoEntries: s.fernandoEntries,
    issuedOn: ISSUED,
  });
}

describe('vehicle report', () => {
  it('states the specification’s three investment figures', () => {
    const vehicle = specDeal('MYSELF');
    const html = reportFor(vehicle.id);

    // Purchase price, additional investment and total invested must all appear
    // as separate figures. Blurring them is the one thing the spec forbids.
    expect(html).toContain('Purchase price');
    expect(html).toContain('$8,000.00');
    expect(html).toContain('Additional investment');
    expect(html).toContain('$2,550.00');
    expect(html).toContain('Total invested');
    expect(html).toContain('$10,550.00');
  });

  it('shows the profit split on an associated sale', () => {
    const vehicle = specDeal('ASSOCIATED');
    ops.recordSale(h.db, {
      vehicleId: vehicle.id, saleDate: '2026-02-16', salePriceCents: 1_355_000,
      buyerName: 'A. Buyer', mileageOut: 88_400, notes: '',
      reinvestCents: 75_000, distributeCents: 75_000,
    });
    const html = reportFor(vehicle.id);

    expect(html).toContain('Gross profit');
    expect(html).toContain('$3,000.00');
    expect(html).toContain('Daniel');
    expect(html).toContain('Fernando');
    expect(html).toContain('+$1,500.00');
    // The explanation Fernando needs in order to trust the number.
    expect(html).toContain('is his in full at the point of sale');
  });

  it('shows 100% to Daniel and no Fernando row on a MYSELF sale', () => {
    const vehicle = specDeal('MYSELF');
    ops.recordSale(h.db, {
      vehicleId: vehicle.id, saleDate: '2026-02-16', salePriceCents: 1_355_000,
      buyerName: '', mileageOut: null, notes: '',
      reinvestCents: 300_000, distributeCents: 0,
    });
    const html = reportFor(vehicle.id);
    expect(html).toContain('100% — worked alone');
    expect(html).not.toContain('50% share');
  });

  it('labels a loss as a loss rather than a negative profit', () => {
    const vehicle = specDeal('ASSOCIATED');
    ops.recordSale(h.db, {
      vehicleId: vehicle.id, saleDate: '2026-02-16', salePriceCents: 855_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 0, distributeCents: 0,
    });
    const html = reportFor(vehicle.id);
    expect(html).toContain('Gross loss');
    expect(html).toContain('-$2,000.00');
    expect(html).toContain('loss carried against future profit');
  });

  it('says plainly when a vehicle has not sold', () => {
    const vehicle = specDeal('MYSELF');
    const html = reportFor(vehicle.id);
    expect(html).toContain('has not been sold yet');
    expect(html).toContain('In garage');
  });

  it('lists Fernando’s out-of-pocket expenses with their reimbursement', () => {
    const vehicle = ops.createVehicle(h.db, { ...baseVehicle, type: 'ASSOCIATED' }).value!;
    ops.addExpense(h.db, {
      vehicleId: vehicle.id, categoryId: 'TIRES', amountCents: 50_000,
      date: '2026-01-22', description: 'Tires', paidBy: 'FERNANDO',
    });
    const html = reportFor(vehicle.id);
    expect(html).toContain('Reimbursement — paid out of pocket');
    expect(html).toContain('$500.00');
  });

  it('escapes user text so a note cannot break the document', () => {
    const vehicle = ops.createVehicle(h.db, {
      ...baseVehicle,
      notes: '<script>alert("x")</script> & "quotes"',
    }).value!;
    const html = reportFor(vehicle.id);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });

  it('is a complete, well-formed HTML document', () => {
    const vehicle = specDeal('MYSELF');
    const html = reportFor(vehicle.id);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).toContain('Carfolio');
    // Stamped, so an issued report is identifiable as a snapshot of a moment.
    expect(html).toContain('June 1, 2026');
    // No unresolved template values ever reach the page.
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('[object Object]');
  });

  it('renders the same output for the same input', () => {
    const vehicle = specDeal('MYSELF');
    expect(reportFor(vehicle.id)).toBe(reportFor(vehicle.id));
  });

  it('matches its snapshot', () => {
    const vehicle = specDeal('ASSOCIATED');
    ops.recordSale(h.db, {
      vehicleId: vehicle.id, saleDate: '2026-02-16', salePriceCents: 1_355_000,
      buyerName: 'A. Buyer', mileageOut: 88_400, notes: 'Sold at asking price',
      reinvestCents: 75_000, distributeCents: 75_000,
    });
    // Ids and timestamps are not in the HTML, so this snapshot is stable.
    expect(reportFor(vehicle.id)).toMatchSnapshot();
  });
});

describe('business report', () => {
  function build() {
    const s = repos.readSnapshot(h.db);
    const rows = indexFor();
    return businessReportHtml({
      year: 2026,
      yearSummary: summarizeYear(rows, 2026),
      allTime: summarize(rows),
      position: computeBusinessPosition(s),
      fernando: computeFernandoAccount(s.fernandoEntries),
      vehicles: rows,
      issuedOn: ISSUED,
    });
  }

  it('separates protected capital from everything else', () => {
    ops.addCapital(h.db, 3_000_000, '2026-01-01', 'Initial capital');
    const html = build();
    expect(html).toContain('Protected capital');
    expect(html).toContain('$30,000.00');
    expect(html).toContain('Not increased by profit, not reduced by distributions');
  });

  it('reports Myself and Associated separately, with the 50/50 split', () => {
    ops.addCapital(h.db, 5_000_000, '2026-01-01', '');
    const mine = specDeal('MYSELF');
    ops.recordSale(h.db, {
      vehicleId: mine.id, saleDate: '2026-02-16', salePriceCents: 1_355_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 300_000, distributeCents: 0,
    });
    const ours = specDeal('ASSOCIATED');
    ops.recordSale(h.db, {
      vehicleId: ours.id, saleDate: '2026-03-16', salePriceCents: 1_255_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 100_000, distributeCents: 0,
    });

    const html = build();
    expect(html).toContain('2026 — Myself');
    expect(html).toContain('2026 — Associated');
    expect(html).toContain('Profit (100% Daniel)');
    expect(html).toContain('Daniel — 50%');
    expect(html).toContain('Fernando — 50%');
    expect(html).toContain('Vehicle history — sold (2)');
  });

  it('survives an empty business without printing NaN', () => {
    const html = build();
    expect(html).toContain('The garage is empty');
    expect(html).toContain('No vehicles sold yet');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('Infinity');
  });

  it('matches its snapshot', () => {
    ops.addCapital(h.db, 3_000_000, '2026-01-01', 'Initial capital');
    const ours = specDeal('ASSOCIATED');
    ops.recordSale(h.db, {
      vehicleId: ours.id, saleDate: '2026-02-16', salePriceCents: 1_355_000,
      buyerName: 'A. Buyer', mileageOut: 88_400, notes: '',
      reinvestCents: 75_000, distributeCents: 75_000,
    });
    expect(build()).toMatchSnapshot();
  });
});

describe('safeFilename', () => {
  it('produces something a file system and a mail client both accept', () => {
    expect(safeFilename('2018 Toyota Camry SE')).toBe('2018-Toyota-Camry-SE');
    expect(safeFilename('Honda Accord / 50% "deal"')).toBe('Honda-Accord-50-deal');
    expect(safeFilename('   ')).toBe('carfolio-report');
    expect(safeFilename('!!!')).toBe('carfolio-report');
    expect(safeFilename('x'.repeat(200)).length).toBe(80);
  });
});
