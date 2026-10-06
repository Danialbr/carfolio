/**
 * Integration tests: real SQLite, real migrations, real transactions.
 */

import { createTestDb, type TestDb } from '../support/testDb';
import * as ops from '../../db/operations';
import * as repos from '../../db/repos';
import { computeBusinessPosition, verifyIdentity } from '../../domain/capital';
import { computeVehicleFinancials } from '../../domain/pnl';

let h: TestDb;
beforeEach(() => {
  h = createTestDb();
});
afterEach(() => h.close());

const baseVehicle = {
  year: 2018,
  make: 'Toyota',
  model: 'Camry',
  trim: 'SE',
  vin: '',
  mileageIn: 84_120,
  purchaseDate: '2026-01-10',
  type: 'MYSELF' as const,
  purchasePriceCents: 800_000,
  purchasePaidBy: 'DANIEL' as const,
  estimatedSalePriceCents: null,
  notes: '',
};

describe('migrations', () => {
  it('creates every table the app needs', () => {
    const tables = h.raw
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`)
      .all()
      .map((r) => (r as { name: string }).name);

    for (const expected of [
      'vehicles', 'expenses', 'sales', 'capital_events', 'distributions',
      'fernando_entries', 'inventory_items', 'inventory_usages',
      'custom_categories', 'photos', 'app_meta',
    ]) {
      expect(tables).toContain(expected);
    }
  });

  it('enforces foreign keys', () => {
    expect(h.raw.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(() =>
      h.raw
        .prepare(
          `INSERT INTO expenses (id, vehicle_id, category_id, amount_cents, date, description,
           paid_by, from_inventory, created_at, updated_at)
           VALUES ('x','no-such-vehicle','PARTS',100,'2026-01-01','','DANIEL',0,'t','t')`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });
});

describe('createVehicle', () => {
  it('writes the vehicle and its purchase price together', () => {
    const r = ops.createVehicle(h.db, baseVehicle);
    expect(r.ok).toBe(true);

    const vehicle = repos.getVehicle(h.db, r.value!.id)!;
    expect(vehicle.make).toBe('Toyota');
    expect(vehicle.status).toBe('PURCHASED');

    const expenses = repos.listExpensesForVehicle(h.db, vehicle.id);
    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.categoryId).toBe('PURCHASE_PRICE');
    expect(expenses[0]?.amountCents).toBe(800_000);
  });

  it('rejects a vehicle with no make and no model', () => {
    const r = ops.createVehicle(h.db, { ...baseVehicle, make: '', model: '' });
    expect(r.ok).toBe(false);
    expect(repos.listVehicles(h.db)).toHaveLength(0);
  });

  it('creates a reimbursement when Fernando fronted the purchase', () => {
    ops.createVehicle(h.db, { ...baseVehicle, purchasePaidBy: 'FERNANDO' });
    const entries = repos.listFernandoEntries(h.db);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('REIMBURSEMENT');
    expect(entries[0]?.amountCents).toBe(800_000);
  });
});

describe('expenses', () => {
  it('reproduces the specification’s investment breakdown end to end', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    const id = vehicle!.id;

    for (const [categoryId, amountCents] of [
      ['AUCTION_FEE', 60_000], ['TITLE', 25_000], ['TRANSPORTATION', 40_000],
      ['GASOLINE', 10_000], ['MECHANICAL_REPAIR', 85_000], ['DETAILING', 15_000],
      ['PARTS', 20_000],
    ] as const) {
      const r = ops.addExpense(h.db, {
        vehicleId: id, categoryId, amountCents, date: '2026-01-20',
        description: '', paidBy: 'DANIEL',
      });
      expect(r.ok).toBe(true);
    }

    const f = computeVehicleFinancials(
      repos.getVehicle(h.db, id)!,
      repos.listExpensesForVehicle(h.db, id),
      null,
      '2026-02-16',
    );
    expect(f.breakdown.purchasePriceCents).toBe(800_000);
    expect(f.breakdown.additionalInvestmentCents).toBe(255_000);
    expect(f.totalInvestedCents).toBe(1_055_000);
  });

  it('creates exactly one reimbursement for a Fernando-paid expense', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    ops.addExpense(h.db, {
      vehicleId: vehicle!.id, categoryId: 'TIRES', amountCents: 50_000,
      date: '2026-01-20', description: 'Tires', paidBy: 'FERNANDO',
    });
    const entries = repos.listFernandoEntries(h.db);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.amountCents).toBe(50_000);
  });

  it('makes a duplicate reimbursement impossible at the database level', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    const { value: expense } = ops.addExpense(h.db, {
      vehicleId: vehicle!.id, categoryId: 'TIRES', amountCents: 50_000,
      date: '2026-01-20', description: '', paidBy: 'FERNANDO',
    });

    // Simulate a double-tapped save or a retried write reaching the database.
    expect(() =>
      h.raw
        .prepare(
          `INSERT INTO fernando_entries (id, kind, amount_cents, date, source_id, notes, created_at, updated_at)
           VALUES ('dupe','REIMBURSEMENT',50000,'2026-01-20',?,'','t','t')`,
        )
        .run(expense!.id),
    ).toThrow(/UNIQUE/);

    expect(repos.listFernandoEntries(h.db)).toHaveLength(1);
  });

  it('removes the reimbursement when the expense is deleted', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    const { value: expense } = ops.addExpense(h.db, {
      vehicleId: vehicle!.id, categoryId: 'TIRES', amountCents: 50_000,
      date: '2026-01-20', description: '', paidBy: 'FERNANDO',
    });
    expect(repos.listFernandoEntries(h.db)).toHaveLength(1);

    // Otherwise Fernando stays owed for a cost that no longer exists.
    ops.deleteExpense(h.db, expense!.id);
    expect(repos.listFernandoEntries(h.db)).toHaveLength(0);
    expect(repos.listExpensesForVehicle(h.db, vehicle!.id)).toHaveLength(1); // purchase only
  });

  it('rejects an expense on a vehicle that no longer exists', () => {
    const r = ops.addExpense(h.db, {
      vehicleId: 'ghost', categoryId: 'PARTS', amountCents: 100,
      date: '2026-01-01', description: '', paidBy: 'DANIEL',
    });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/no longer exists/);
  });
});

describe('recordSale', () => {
  function soldDeal(type: 'MYSELF' | 'ASSOCIATED', salePriceCents: number, alloc = { reinvestCents: 0, distributeCents: 0 }) {
    const { value: vehicle } = ops.createVehicle(h.db, { ...baseVehicle, type });
    return {
      vehicle: vehicle!,
      result: ops.recordSale(h.db, {
        vehicleId: vehicle!.id,
        saleDate: '2026-02-16',
        salePriceCents,
        buyerName: 'Buyer',
        mileageOut: 85_000,
        notes: '',
        ...alloc,
      }),
    };
  }

  it('writes the sale, moves the vehicle to SOLD, and takes it out of the Garage', () => {
    const { vehicle, result } = soldDeal('MYSELF', 1_100_000, {
      reinvestCents: 300_000,
      distributeCents: 0,
    });
    expect(result.ok).toBe(true);

    const after = repos.getVehicle(h.db, vehicle.id)!;
    expect(after.status).toBe('SOLD');
    expect(after.saleDate).toBe('2026-02-16');
    expect(after.mileageOut).toBe(85_000);
    expect(repos.getSaleForVehicle(h.db, vehicle.id)?.salePriceCents).toBe(1_100_000);
  });

  it('posts Fernando’s half and creates the distribution, all in one transaction', () => {
    const { vehicle, result } = soldDeal('ASSOCIATED', 1_100_000, {
      reinvestCents: 75_000,
      distributeCents: 75_000,
    });
    expect(result.ok).toBe(true);

    const entries = repos.listFernandoEntries(h.db);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe('PROFIT_SHARE');
    expect(entries[0]?.amountCents).toBe(150_000);

    const distributions = repos.listDistributions(h.db);
    expect(distributions).toHaveLength(1);
    expect(distributions[0]?.amountCents).toBe(75_000);
    expect(distributions[0]?.vehicleId).toBe(vehicle.id);
  });

  it('writes NOTHING when the allocation is invalid', () => {
    // The whole point of the transaction: a rejected sale must not leave a
    // half-written deal behind.
    const { vehicle, result } = soldDeal('ASSOCIATED', 1_100_000, {
      reinvestCents: 300_000, // the full gross — half of it is Fernando's
      distributeCents: 0,
    });
    expect(result.ok).toBe(false);
    expect(repos.getSaleForVehicle(h.db, vehicle.id)).toBeNull();
    expect(repos.listFernandoEntries(h.db)).toHaveLength(0);
    expect(repos.listDistributions(h.db)).toHaveLength(0);
    expect(repos.getVehicle(h.db, vehicle.id)?.status).toBe('PURCHASED');
  });

  it('refuses to sell the same vehicle twice', () => {
    const { vehicle } = soldDeal('MYSELF', 1_100_000, { reinvestCents: 300_000, distributeCents: 0 });
    const second = ops.recordSale(h.db, {
      vehicleId: vehicle.id, saleDate: '2026-03-01', salePriceCents: 900_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 100_000, distributeCents: 0,
    });
    expect(second.ok).toBe(false);
    expect(second.errors).toContain('This vehicle has already been sold.');
  });

  it('records a loss with no distribution', () => {
    const { result } = soldDeal('ASSOCIATED', 600_000);
    expect(result.ok).toBe(true);
    expect(result.value?.danielShareCents).toBe(-100_000);
    expect(result.value?.fernandoShareCents).toBe(-100_000);
    expect(repos.listDistributions(h.db)).toHaveLength(0);
    // The loss carries against Fernando's future profits rather than being collected.
    expect(repos.listFernandoEntries(h.db)[0]?.amountCents).toBe(-100_000);
  });
});

describe('reverseSale', () => {
  it('returns the car to the Garage and undoes everything the sale created', () => {
    const { value: vehicle } = ops.createVehicle(h.db, { ...baseVehicle, type: 'ASSOCIATED' });
    ops.recordSale(h.db, {
      vehicleId: vehicle!.id, saleDate: '2026-02-16', salePriceCents: 1_100_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 0, distributeCents: 150_000,
    });
    expect(repos.listFernandoEntries(h.db)).toHaveLength(1);
    expect(repos.listDistributions(h.db)).toHaveLength(1);

    const r = ops.reverseSale(h.db, vehicle!.id);
    expect(r.ok).toBe(true);
    expect(repos.getSaleForVehicle(h.db, vehicle!.id)).toBeNull();
    expect(repos.listFernandoEntries(h.db)).toHaveLength(0);
    expect(repos.listDistributions(h.db)).toHaveLength(0);
    expect(repos.getVehicle(h.db, vehicle!.id)?.status).toBe('LISTED');
  });

  it('lets the car be sold again afterwards — the unique index is on LIVE sales', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    ops.recordSale(h.db, {
      vehicleId: vehicle!.id, saleDate: '2026-02-16', salePriceCents: 1_100_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 300_000, distributeCents: 0,
    });
    ops.reverseSale(h.db, vehicle!.id);

    const second = ops.recordSale(h.db, {
      vehicleId: vehicle!.id, saleDate: '2026-03-01', salePriceCents: 1_050_000,
      buyerName: 'Second buyer', mileageOut: null, notes: '', reinvestCents: 250_000, distributeCents: 0,
    });
    expect(second.ok).toBe(true);
    expect(repos.getSaleForVehicle(h.db, vehicle!.id)?.salePriceCents).toBe(1_050_000);
  });
});

describe('status', () => {
  it('moves through the working states', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    expect(ops.setVehicleStatus(h.db, vehicle!.id, 'IN_REPAIR').ok).toBe(true);
    expect(repos.getVehicle(h.db, vehicle!.id)?.status).toBe('IN_REPAIR');
  });

  it('refuses to set SOLD directly', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    const r = ops.setVehicleStatus(h.db, vehicle!.id, 'SOLD');
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/recording the sale/);
  });
});

describe('inventory', () => {
  it('charges the vehicle without spending cash a second time', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    const { value: item } = ops.addInventoryItem(h.db, {
      name: 'Motor oil 5W-30', category: 'Fluids', quantity: 12,
      unitCostCents: 800, purchaseDate: '2026-01-05', supplier: '', notes: '',
    });
    expect(item!.purchaseCostCents).toBe(9_600);

    const r = ops.drawInventory(h.db, item!.id, vehicle!.id, 2, '2026-01-20');
    expect(r.ok).toBe(true);
    expect(r.value?.amountCents).toBe(1_600);
    expect(r.value?.fromInventory).toBe(true);
    expect(repos.getInventoryItem(h.db, item!.id)?.quantity).toBe(10);
  });

  it('refuses to draw more than is in stock', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    const { value: item } = ops.addInventoryItem(h.db, {
      name: 'Wax', category: '', quantity: 2, unitCostCents: 1_500,
      purchaseDate: '2026-01-05', supplier: '', notes: '',
    });
    const r = ops.drawInventory(h.db, item!.id, vehicle!.id, 5);
    expect(r.ok).toBe(false);
    expect(repos.getInventoryItem(h.db, item!.id)?.quantity).toBe(2);
  });

  it('puts stock back when the draw is deleted', () => {
    const { value: vehicle } = ops.createVehicle(h.db, baseVehicle);
    const { value: item } = ops.addInventoryItem(h.db, {
      name: 'Wax', category: '', quantity: 5, unitCostCents: 1_500,
      purchaseDate: '2026-01-05', supplier: '', notes: '',
    });
    const draw = ops.drawInventory(h.db, item!.id, vehicle!.id, 2);
    expect(repos.getInventoryItem(h.db, item!.id)?.quantity).toBe(3);

    ops.deleteExpense(h.db, draw.value!.id);
    expect(repos.getInventoryItem(h.db, item!.id)?.quantity).toBe(5);
  });
});

describe('soft delete', () => {
  it('hides a vehicle and everything attached to it, without erasing history', () => {
    const { value: vehicle } = ops.createVehicle(h.db, { ...baseVehicle, type: 'ASSOCIATED' });
    ops.addExpense(h.db, {
      vehicleId: vehicle!.id, categoryId: 'TIRES', amountCents: 50_000,
      date: '2026-01-20', description: '', paidBy: 'FERNANDO',
    });

    repos.softDeleteVehicle(h.db, vehicle!.id);

    expect(repos.listVehicles(h.db)).toHaveLength(0);
    expect(repos.listExpenses(h.db)).toHaveLength(0);
    expect(repos.listFernandoEntries(h.db)).toHaveLength(0);
    // The rows are still there — nothing was destroyed.
    const count = h.raw.prepare('SELECT COUNT(*) AS n FROM expenses').get() as { n: number };
    expect(count.n).toBe(2);
  });
});

describe('the books balance after real database operations', () => {
  it('holds through a full lifecycle', () => {
    ops.addCapital(h.db, 3_000_000, '2026-01-01', 'Initial capital');

    const { value: mine } = ops.createVehicle(h.db, baseVehicle);
    const { value: ours } = ops.createVehicle(h.db, {
      ...baseVehicle, type: 'ASSOCIATED', purchasePriceCents: 600_000,
    });

    ops.addExpense(h.db, {
      vehicleId: mine!.id, categoryId: 'PARTS', amountCents: 45_000,
      date: '2026-01-20', description: '', paidBy: 'DANIEL',
    });
    ops.addExpense(h.db, {
      vehicleId: ours!.id, categoryId: 'TIRES', amountCents: 50_000,
      date: '2026-01-22', description: '', paidBy: 'FERNANDO',
    });

    const { value: item } = ops.addInventoryItem(h.db, {
      name: 'Oil', category: '', quantity: 10, unitCostCents: 800,
      purchaseDate: '2026-01-05', supplier: '', notes: '',
    });
    ops.drawInventory(h.db, item!.id, mine!.id, 3, '2026-01-25');

    ops.recordSale(h.db, {
      vehicleId: mine!.id, saleDate: '2026-02-16', salePriceCents: 1_150_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 200_000, distributeCents: 102_600,
    });
    ops.recordSale(h.db, {
      vehicleId: ours!.id, saleDate: '2026-03-01', salePriceCents: 800_000,
      buyerName: '', mileageOut: null, notes: '', reinvestCents: 75_000, distributeCents: 0,
    });

    ops.payFernando(h.db, 100_000, '2026-03-05', 'Partial settlement');
    ops.addDistribution(h.db, 50_000, '2026-03-10', 'Owner draw');

    const position = computeBusinessPosition(repos.readSnapshot(h.db));
    const check = verifyIdentity(position);
    expect(check.discrepancyCents).toBe(0);
    expect(check.ok).toBe(true);

    // And the principal is exactly where it started.
    expect(position.protectedCapitalCents).toBe(3_000_000);
  });
});
