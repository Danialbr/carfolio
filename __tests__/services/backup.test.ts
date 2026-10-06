/**
 * BACKUP ROUND-TRIP — the single most valuable test in this app.
 *
 * There is no server. If export→import loses or mangles anything, the user's
 * only copy of their financial history is silently wrong, and they will not
 * find out until they need it. So this suite proves the loop closes exactly:
 * export a populated database, wipe it, import, and assert every table is
 * byte-for-byte what it was.
 */

import { createTestDb, type TestDb } from '../support/testDb';
import * as ops from '../../db/operations';
import * as repos from '../../db/repos';
import {
  BUNDLE_VERSION,
  buildBundle,
  restoreBundle,
  validateBundle,
  type Bundle,
} from '../../services/backup/bundle';
import { computeBusinessPosition, verifyIdentity } from '../../domain/capital';

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
  vin: '1HGCM82633A004352',
  mileageIn: 84_120,
  purchaseDate: '2026-01-10',
  type: 'MYSELF' as const,
  purchasePriceCents: 800_000,
  purchasePaidBy: 'DANIEL' as const,
  estimatedSalePriceCents: null,
  notes: 'Bought at auction',
};

/**
 * Fixtures must fail loudly. A rejected write here would silently shrink the
 * dataset and quietly weaken every test that depends on it.
 */
function expectOk(result: { ok: boolean; errors: string[] }) {
  if (!result.ok) throw new Error(`Fixture write was rejected: ${result.errors.join('; ')}`);
  return result;
}

/** A database with something of everything in it, including the awkward cases. */
function populate() {
  ops.addCapital(h.db, 3_000_000, '2026-01-01', 'Initial capital');

  const mine = ops.createVehicle(h.db, baseVehicle).value!;
  const ours = ops.createVehicle(h.db, {
    ...baseVehicle,
    make: 'Honda',
    model: 'Accord',
    vin: '',
    type: 'ASSOCIATED',
    purchasePriceCents: 600_000,
  }).value!;
  const garage = ops.createVehicle(h.db, {
    ...baseVehicle,
    make: 'Ford',
    model: 'Focus',
    vin: '',
    purchasePriceCents: 450_000,
  }).value!;

  ops.addExpense(h.db, {
    vehicleId: mine.id, categoryId: 'PARTS', amountCents: 45_099,
    date: '2026-01-20', description: 'Brake pads & rotors', paidBy: 'DANIEL',
  });
  // Fernando out of pocket — must survive the round trip with its reimbursement.
  ops.addExpense(h.db, {
    vehicleId: ours.id, categoryId: 'TIRES', amountCents: 50_000,
    date: '2026-01-22', description: 'Tires', paidBy: 'FERNANDO',
  });

  const item = ops.addInventoryItem(h.db, {
    name: 'Motor oil 5W-30', category: 'Fluids', quantity: 12,
    unitCostCents: 833, purchaseDate: '2026-01-05', supplier: 'NAPA', notes: '',
  }).value!;
  ops.drawInventory(h.db, item.id, garage.id, 3, '2026-01-25');

  // An odd-cent profit on an associated car, to prove the split survives exactly.
  // Invested 650,000; sold for 950,001 → gross 300,001 → Daniel 150,001 (he
  // takes the odd cent), Fernando 150,000. Daniel's half is what gets allocated.
  expectOk(
    ops.recordSale(h.db, {
      vehicleId: ours.id, saleDate: '2026-03-01', salePriceCents: 950_001,
      buyerName: 'A. Buyer', mileageOut: 88_400, notes: 'Sold quickly',
      reinvestCents: 75_001, distributeCents: 75_000,
    }),
  );
  // Invested 845,099; sold for 1,150,000 → gross 304,901, all Daniel's.
  expectOk(
    ops.recordSale(h.db, {
      vehicleId: mine.id, saleDate: '2026-02-16', salePriceCents: 1_150_000,
      buyerName: '', mileageOut: null, notes: '',
      reinvestCents: 304_901, distributeCents: 0,
    }),
  );

  ops.payFernando(h.db, 100_000, '2026-03-05', 'Partial settlement');
  ops.addDistribution(h.db, 50_000, '2026-03-10', 'Owner draw');
}

describe('export → wipe → import', () => {
  it('restores every table exactly', () => {
    populate();
    const before = repos.readSnapshot(h.db);
    const bundle = buildBundle(before);

    // Wipe the way a fresh install would look.
    const empty = createTestDb();
    try {
      expect(repos.readSnapshot(empty.db).vehicles).toHaveLength(0);

      const restored = restoreBundle(empty.db, bundle);
      expect(restored.error).toBeNull();
      expect(restored.ok).toBe(true);

      const after = repos.readSnapshot(empty.db);
      expect(after).toEqual(before);
    } finally {
      empty.close();
    }
  });

  it('preserves the odd cent in an associated split', () => {
    populate();
    const before = repos.readSnapshot(h.db);
    const oddSale = before.sales.find((s) => s.salePriceCents === 950_001)!;
    // 950,001 − 650,000 = 300,001 gross → 150,001 / 150,000.
    expect(oddSale.danielShareCents + oddSale.fernandoShareCents).toBe(300_001);
    expect(oddSale.danielShareCents).toBe(150_001);

    const empty = createTestDb();
    try {
      restoreBundle(empty.db, buildBundle(before));
      const after = repos.readSnapshot(empty.db).sales.find((s) => s.id === oddSale.id)!;
      expect(after.danielShareCents).toBe(150_001);
      expect(after.fernandoShareCents).toBe(150_000);
    } finally {
      empty.close();
    }
  });

  it('leaves the restored books balanced', () => {
    populate();
    const bundle = buildBundle(repos.readSnapshot(h.db));

    const empty = createTestDb();
    try {
      restoreBundle(empty.db, bundle);
      const check = verifyIdentity(computeBusinessPosition(repos.readSnapshot(empty.db)));
      expect(check.discrepancyCents).toBe(0);
    } finally {
      empty.close();
    }
  });

  it('restores over existing data without leaving any of it behind', () => {
    populate();
    const bundle = buildBundle(repos.readSnapshot(h.db));

    const other = createTestDb();
    try {
      // Different data in the target — a real "restore onto a phone that
      // already has records" situation.
      ops.addCapital(other.db, 999_999, '2025-01-01', 'Wrong data');
      ops.createVehicle(other.db, { ...baseVehicle, make: 'Nissan', model: 'Altima' });
      expect(repos.readSnapshot(other.db).vehicles).toHaveLength(1);

      restoreBundle(other.db, bundle);
      const after = repos.readSnapshot(other.db);

      expect(after.vehicles).toHaveLength(3);
      expect(after.vehicles.some((v) => v.make === 'Nissan')).toBe(false);
      expect(after.capitalEvents).toHaveLength(1);
      expect(after.capitalEvents[0]?.amountCents).toBe(3_000_000);
    } finally {
      other.close();
    }
  });

  it('is idempotent — importing the same file twice changes nothing', () => {
    populate();
    const bundle = buildBundle(repos.readSnapshot(h.db));

    const target = createTestDb();
    try {
      restoreBundle(target.db, bundle);
      const once = repos.readSnapshot(target.db);
      restoreBundle(target.db, bundle);
      expect(repos.readSnapshot(target.db)).toEqual(once);
    } finally {
      target.close();
    }
  });

  it('survives a full JSON serialization round trip, not just an in-memory copy', () => {
    populate();
    const before = repos.readSnapshot(h.db);
    // This is what actually happens: the bundle is written to a file as text.
    const text = JSON.stringify(buildBundle(before));
    const parsed = JSON.parse(text) as unknown;

    const validation = validateBundle(parsed);
    expect(validation.errors).toEqual([]);
    expect(validation.ok).toBe(true);

    const target = createTestDb();
    try {
      restoreBundle(target.db, validation.bundle!);
      expect(repos.readSnapshot(target.db)).toEqual(before);
    } finally {
      target.close();
    }
  });

  it('handles an empty database', () => {
    const bundle = buildBundle(repos.readSnapshot(h.db));
    const target = createTestDb();
    try {
      const result = restoreBundle(target.db, bundle);
      expect(result.ok).toBe(true);
      expect(repos.readSnapshot(target.db).vehicles).toHaveLength(0);
    } finally {
      target.close();
    }
  });
});

describe('validation', () => {
  const good = (): Bundle => {
    populate();
    return buildBundle(repos.readSnapshot(h.db));
  };

  it('accepts a bundle it produced', () => {
    expect(validateBundle(good()).ok).toBe(true);
  });

  it('rejects things that are not backups', () => {
    for (const junk of [null, undefined, 42, 'hello', [], {}, { format: 'something-else' }]) {
      const r = validateBundle(junk);
      expect(r.ok).toBe(false);
      expect(r.bundle).toBeNull();
    }
  });

  it('REFUSES a bundle from a newer version rather than half-reading it', () => {
    // Half-applying a newer format would silently drop whatever it added, and
    // the user would have no way to tell.
    const bundle = { ...good(), version: BUNDLE_VERSION + 1 };
    const r = validateBundle(bundle);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/newer version/);
  });

  it('accepts an older version', () => {
    expect(validateBundle({ ...good(), version: 1 }).ok).toBe(true);
  });

  it('rejects a bundle with a missing table', () => {
    const bundle = good();
    const broken = { ...bundle, data: { ...bundle.data, sales: undefined } };
    const r = validateBundle(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/"sales" is missing/);
  });

  it('rejects rows that are missing required fields', () => {
    const bundle = good();
    const broken = {
      ...bundle,
      data: { ...bundle.data, vehicles: [{ id: 'x' }] },
    };
    const r = validateBundle(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/missing "purchaseDate"/);
  });

  it('catches expenses orphaned from their vehicle before the restore starts', () => {
    // These would violate the foreign key and abort a restore halfway through.
    const bundle = good();
    const broken = { ...bundle, data: { ...bundle.data, vehicles: [] } };
    const r = validateBundle(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/refer to a vehicle that is not in the file/);
  });

  it('changes nothing when the file is bad', () => {
    populate();
    const before = repos.readSnapshot(h.db);
    const r = validateBundle({ format: 'carfolio-backup', version: 1, data: {} });
    expect(r.ok).toBe(false);
    // Validation is pure — it cannot have touched the database.
    expect(repos.readSnapshot(h.db)).toEqual(before);
  });
});

describe('restore failure', () => {
  it('rolls back completely, leaving the database as it was', () => {
    populate();
    const before = repos.readSnapshot(h.db);

    // A bundle that passes validation but violates a constraint at insert time:
    // two live sales for one vehicle.
    const bundle = buildBundle(before);
    const firstSale = bundle.data.sales[0]!;
    const poisoned: Bundle = {
      ...bundle,
      data: {
        ...bundle.data,
        sales: [...bundle.data.sales, { ...firstSale, id: 'duplicate-sale' }],
      },
    };

    const result = restoreBundle(h.db, poisoned);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/UNIQUE/);

    // Everything is exactly where it was. A partial restore would be far worse
    // than a refused one.
    expect(repos.readSnapshot(h.db)).toEqual(before);
  });
});
