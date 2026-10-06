/**
 * Deterministic builders for test data.
 *
 * Every layer tests against these same shapes, so a bug found anywhere has an
 * obvious unit test to write. Ids are sequential rather than random: a failing
 * snapshot should be readable, and a flaky test caused by its own fixtures is
 * worse than no test.
 */

import type {
  CapitalEvent,
  Distribution,
  Expense,
  FernandoEntry,
  InventoryItem,
  Sale,
  Vehicle,
  VehicleType,
} from '../../domain/types';
import { PURCHASE_PRICE_CATEGORY } from '../../domain/categories';

let counter = 0;
export function resetIds(): void {
  counter = 0;
}
export function nextId(prefix = 'id'): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

const TS = '2026-01-01T00:00:00.000Z';

export function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: nextId('veh'),
    year: 2018,
    make: 'Toyota',
    model: 'Camry',
    trim: 'SE',
    vin: '',
    mileageIn: 84_120,
    mileageOut: null,
    purchaseDate: '2026-01-10',
    saleDate: null,
    type: 'MYSELF' as VehicleType,
    status: 'PURCHASED',
    estimatedSalePriceCents: null,
    notes: '',
    color: '',
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  } as Vehicle;
}

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: nextId('exp'),
    vehicleId: 'veh-1',
    categoryId: 'PARTS',
    amountCents: 10_000,
    date: '2026-01-15',
    description: '',
    paidBy: 'DANIEL',
    fromInventory: false,
    inventoryItemId: null,
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}

/** The purchase price, which is an expense in the special category. */
export function makePurchase(vehicleId: string, amountCents: number, date = '2026-01-10'): Expense {
  return makeExpense({
    vehicleId,
    categoryId: PURCHASE_PRICE_CATEGORY,
    amountCents,
    date,
    description: 'Purchase price',
  });
}

export function makeSale(overrides: Partial<Sale> = {}): Sale {
  const salePriceCents = overrides.salePriceCents ?? 1_300_000;
  return {
    id: nextId('sale'),
    vehicleId: 'veh-1',
    saleDate: '2026-03-01',
    salePriceCents,
    buyerName: 'Buyer',
    notes: '',
    danielShareCents: 0,
    fernandoShareCents: 0,
    reinvestCents: 0,
    distributeCents: 0,
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}

export function makeCapitalEvent(overrides: Partial<CapitalEvent> = {}): CapitalEvent {
  return {
    id: nextId('cap'),
    kind: 'CONTRIBUTION',
    amountCents: 3_000_000,
    date: '2026-01-01',
    notes: 'Initial capital',
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}

export function makeDistribution(overrides: Partial<Distribution> = {}): Distribution {
  return {
    id: nextId('dist'),
    amountCents: 100_000,
    date: '2026-03-02',
    vehicleId: null,
    reason: '',
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}

export function makeFernandoEntry(overrides: Partial<FernandoEntry> = {}): FernandoEntry {
  return {
    id: nextId('fer'),
    kind: 'PROFIT_SHARE',
    amountCents: 150_000,
    date: '2026-03-01',
    sourceId: null,
    vehicleId: null,
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}

export function makeInventoryItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: nextId('inv'),
    name: 'Motor oil 5W-30',
    category: 'Fluids',
    quantity: 12,
    unitCostCents: 800,
    purchaseCostCents: 9_600,
    purchaseDate: '2026-01-05',
    supplier: '',
    notes: '',
    createdAt: TS,
    updatedAt: TS,
    deletedAt: null,
    ...overrides,
  };
}

/**
 * The worked example from the specification, as data.
 *
 *   Purchase price      $8,000
 *   Auction fee           $600
 *   Title/registration    $250
 *   Transportation        $400
 *   Gas                   $100
 *   Repairs               $850
 *   Detailing             $150
 *   Parts                 $200
 *   ─────────────────────────────
 *   Additional          $2,550
 *   Total invested     $10,550
 */
export function specExampleVehicle(type: VehicleType = 'MYSELF') {
  const vehicle = makeVehicle({ id: 'spec-veh', type });
  const expenses = [
    makePurchase('spec-veh', 800_000),
    makeExpense({ vehicleId: 'spec-veh', categoryId: 'AUCTION_FEE', amountCents: 60_000 }),
    makeExpense({ vehicleId: 'spec-veh', categoryId: 'TITLE', amountCents: 25_000 }),
    makeExpense({ vehicleId: 'spec-veh', categoryId: 'TRANSPORTATION', amountCents: 40_000 }),
    makeExpense({ vehicleId: 'spec-veh', categoryId: 'GASOLINE', amountCents: 10_000 }),
    makeExpense({ vehicleId: 'spec-veh', categoryId: 'MECHANICAL_REPAIR', amountCents: 85_000 }),
    makeExpense({ vehicleId: 'spec-veh', categoryId: 'DETAILING', amountCents: 15_000 }),
    makeExpense({ vehicleId: 'spec-veh', categoryId: 'PARTS', amountCents: 20_000 }),
  ];
  return { vehicle, expenses };
}
