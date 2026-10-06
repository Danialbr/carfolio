/**
 * SELECTOR STABILITY
 *
 * zustand reads through `useSyncExternalStore`, which compares what a selector
 * returns against the previous value BY IDENTITY. A selector that builds a new
 * array each call — `s => s.vehicles.filter(...).sort(...)` — therefore looks
 * changed on every render, and React re-renders until it gives up with
 * "Maximum update depth exceeded". The app crashes on open.
 *
 * That is exactly what happened, and it is invisible to typecheck, lint and
 * every other test in this suite: the logic was correct, the identities were
 * not. These tests assert the property that was actually violated.
 */

import { createTestDb, type TestDb } from '../support/testDb';
import * as ops from '../../db/operations';
import { readSnapshot } from '../../db/repos';
import { useApp, selectGarage, selectHistory, selectSold, selectVehicle } from '../../state/store';

let h: TestDb;

beforeEach(() => {
  h = createTestDb();
  ops.addCapital(h.db, 3_000_000, '2026-01-01', 'Initial capital');

  const base = {
    year: 2018, make: 'Toyota', model: 'Camry', trim: 'SE', vin: '',
    mileageIn: 84_120, purchaseDate: '2026-01-10', type: 'MYSELF' as const,
    purchasePriceCents: 800_000, purchasePaidBy: 'DANIEL' as const,
    estimatedSalePriceCents: null, notes: '',
  };
  ops.createVehicle(h.db, base);
  ops.createVehicle(h.db, { ...base, make: 'Honda', model: 'Accord', type: 'ASSOCIATED' });
  const third = ops.createVehicle(h.db, { ...base, make: 'Ford', model: 'Focus' }).value!;
  ops.recordSale(h.db, {
    vehicleId: third.id, saleDate: '2026-02-16', salePriceCents: 1_100_000,
    buyerName: '', mileageOut: null, notes: '', reinvestCents: 300_000, distributeCents: 0,
  });

  useApp.getState().attach(h.db);
});

afterEach(() => h.close());

describe('selectors return a stable reference', () => {
  it('garage, history and sold do not change identity between reads', () => {
    const state = useApp.getState();

    // This is the assertion that would have caught the infinite render loop.
    expect(selectGarage(state)).toBe(selectGarage(state));
    expect(selectHistory(state)).toBe(selectHistory(state));
    expect(selectSold(state)).toBe(selectSold(state));

    // And across separate getState() calls, with no write in between.
    expect(selectGarage(useApp.getState())).toBe(selectGarage(useApp.getState()));
    expect(selectHistory(useApp.getState())).toBe(selectHistory(useApp.getState()));
  });

  it('every array a screen selects directly is a stable field, not a computation', () => {
    const a = useApp.getState();
    const b = useApp.getState();
    expect(a.vehicles).toBe(b.vehicles);
    expect(a.snapshot.expenses).toBe(b.snapshot.expenses);
    expect(a.snapshot.inventory).toBe(b.snapshot.inventory);
    expect(a.snapshot.fernandoEntries).toBe(b.snapshot.fernandoEntries);
    expect(a.position).toBe(b.position);
    expect(a.fernando).toBe(b.fernando);
    expect(a.integrity).toBe(b.integrity);
  });

  it('selectVehicle returns the same object for the same id', () => {
    const id = useApp.getState().vehicles[0]!.vehicle.id;
    expect(selectVehicle(useApp.getState(), id)).toBe(selectVehicle(useApp.getState(), id));
  });

  it('returns null for an unknown id rather than throwing', () => {
    expect(selectVehicle(useApp.getState(), 'nope')).toBeNull();
  });
});

describe('a write does produce new references', () => {
  it('refresh replaces the derived state', () => {
    // The flip side: if identities never changed, the UI would never update.
    const before = selectGarage(useApp.getState());

    ops.addExpense(h.db, {
      vehicleId: before[0]!.vehicle.id, categoryId: 'PARTS', amountCents: 5_000,
      date: '2026-01-20', description: '', paidBy: 'DANIEL',
    });
    useApp.getState().refresh();

    expect(selectGarage(useApp.getState())).not.toBe(before);
    // ...and stable again afterwards.
    expect(selectGarage(useApp.getState())).toBe(selectGarage(useApp.getState()));
  });
});

describe('the derived views are correct, not just stable', () => {
  it('splits sold and unsold, and sorts the garage by days held', () => {
    const state = useApp.getState();
    expect(state.garage).toHaveLength(2);
    expect(state.sold).toHaveLength(1);
    expect(state.history).toHaveLength(3);
    expect(state.garage.every((v) => !v.financials.sold)).toBe(true);
    expect(state.sold.every((v) => v.financials.sold)).toBe(true);

    const held = state.garage.map((v) => v.financials.daysHeld ?? 0);
    expect([...held].sort((a, b) => b - a)).toEqual(held);
  });

  it('computes the business position once and keeps the books balanced', () => {
    expect(useApp.getState().integrity.discrepancyCents).toBe(0);
    expect(useApp.getState().position.protectedCapitalCents).toBe(3_000_000);
  });

  it('matches what the database actually holds', () => {
    expect(useApp.getState().snapshot).toEqual(readSnapshot(h.db));
  });
});
