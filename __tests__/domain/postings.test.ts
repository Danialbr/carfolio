import { drawFromInventory, paymentToFernando, postingsForSale } from '../../domain/postings';
import type { PostingContext } from '../../domain/postings';
import {
  categoryLabel,
  findCategory,
  isPurchaseCategory,
  selectableCategories,
  DEFAULT_CATEGORIES,
  GROUP_ORDER,
  GROUP_LABELS,
} from '../../domain/categories';
import { makeInventoryItem, makePurchase, makeVehicle, resetIds } from '../support/fixtures';

beforeEach(resetIds);

let seq = 0;
const ctx = (): PostingContext => ({
  newId: () => `p-${(seq += 1)}`,
  now: '2026-06-01T00:00:00.000Z',
});

const baseSale = (over: Partial<Parameters<typeof postingsForSale>[0]> = {}) => ({
  vehicle: makeVehicle({ id: 'v', purchaseDate: '2026-01-10' }),
  expenses: [makePurchase('v', 800_000)],
  saleDate: '2026-03-01',
  salePriceCents: 1_000_000,
  buyerName: 'Buyer',
  mileageOut: 90_000,
  notes: '',
  reinvestCents: 200_000,
  distributeCents: 0,
  ...over,
});

describe('sale validation', () => {
  it('rejects a sale dated before the purchase', () => {
    const r = postingsForSale(baseSale({ saleDate: '2026-01-01' }), ctx());
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('The sale date cannot be before the purchase date.');
    expect(r.sale).toBeNull();
  });

  it('rejects a negative sale price', () => {
    const r = postingsForSale(
      baseSale({ salePriceCents: -100, reinvestCents: 0, distributeCents: 0 }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('Sale price cannot be negative.');
  });

  it('refuses to sell an already-sold vehicle twice', () => {
    const r = postingsForSale(
      baseSale({ vehicle: makeVehicle({ id: 'v', status: 'SOLD', purchaseDate: '2026-01-10' }) }),
      ctx(),
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('This vehicle has already been sold.');
  });

  it('still previews the numbers when validation fails, so the UI can show them', () => {
    const r = postingsForSale(baseSale({ saleDate: '2026-01-01' }), ctx());
    expect(r.totalInvestedCents).toBe(800_000);
    expect(r.grossProfitCents).toBe(200_000);
    expect(r.danielShareCents).toBe(200_000);
  });

  it('writes no distribution when nothing is taken out', () => {
    const r = postingsForSale(baseSale(), ctx());
    expect(r.ok).toBe(true);
    expect(r.distribution).toBeNull();
    expect(r.sale?.reinvestCents).toBe(200_000);
  });

  it('writes no Fernando entry for a MYSELF vehicle', () => {
    expect(postingsForSale(baseSale(), ctx()).fernandoEntry).toBeNull();
  });

  it('writes no Fernando entry for an exactly break-even ASSOCIATED sale', () => {
    // A zero-value row on his statement is noise, not information.
    const r = postingsForSale(
      baseSale({
        vehicle: makeVehicle({ id: 'v', type: 'ASSOCIATED', purchaseDate: '2026-01-10' }),
        salePriceCents: 800_000,
        reinvestCents: 0,
        distributeCents: 0,
      }),
      ctx(),
    );
    expect(r.ok).toBe(true);
    expect(r.grossProfitCents).toBe(0);
    expect(r.fernandoEntry).toBeNull();
  });

  it('labels a negative share as carried forward, not as a debt to collect', () => {
    const r = postingsForSale(
      baseSale({
        vehicle: makeVehicle({ id: 'v', type: 'ASSOCIATED', purchaseDate: '2026-01-10' }),
        salePriceCents: 600_000,
        reinvestCents: 0,
        distributeCents: 0,
      }),
      ctx(),
    );
    expect(r.fernandoEntry?.amountCents).toBe(-100_000);
    expect(r.fernandoEntry?.notes).toBe('Loss share carried forward');
  });

  it('links the sale, the profit entry and the distribution together', () => {
    const r = postingsForSale(
      baseSale({
        vehicle: makeVehicle({ id: 'v', type: 'ASSOCIATED', purchaseDate: '2026-01-10' }),
        salePriceCents: 1_000_000,
        reinvestCents: 50_000,
        distributeCents: 50_000,
      }),
      ctx(),
    );
    expect(r.fernandoEntry?.sourceId).toBe(r.sale?.id);
    expect(r.distribution?.vehicleId).toBe('v');
    expect(r.distribution?.amountCents).toBe(50_000);
  });
});

describe('paymentToFernando', () => {
  it('is always recorded as a negative entry, whatever sign is passed in', () => {
    expect(paymentToFernando(50_000, '2026-04-01', 'Tires', ctx()).amountCents).toBe(-50_000);
    expect(paymentToFernando(-50_000, '2026-04-01', '', ctx()).amountCents).toBe(-50_000);
  });
});

describe('drawFromInventory', () => {
  const item = () =>
    makeInventoryItem({ id: 'inv', quantity: 12, unitCostCents: 800, purchaseCostCents: 9_600 });

  it('charges the vehicle without spending cash again', () => {
    const d = drawFromInventory(item(), 'v', 2, '2026-02-01', 0, ctx());
    expect(d.ok).toBe(true);
    expect(d.amountCents).toBe(1_600);
    expect(d.expense?.fromInventory).toBe(true);
    expect(d.expense?.inventoryItemId).toBe('inv');
    expect(d.expense?.description).toBe('Motor oil 5W-30 ×2');
    expect(d.updatedItem?.quantity).toBe(10);
  });

  it('refuses to draw more than is in stock', () => {
    const d = drawFromInventory(item(), 'v', 20, '2026-02-01', 0, ctx());
    expect(d.ok).toBe(false);
    expect(d.errors[0]).toMatch(/Only 12 in stock/);
    expect(d.expense).toBeNull();
  });

  it('refuses a zero or negative quantity', () => {
    expect(drawFromInventory(item(), 'v', 0, '2026-02-01', 0, ctx()).ok).toBe(false);
    expect(drawFromInventory(item(), 'v', -3, '2026-02-01', 0, ctx()).ok).toBe(false);
    expect(drawFromInventory(item(), 'v', NaN, '2026-02-01', 0, ctx()).ok).toBe(false);
  });

  it('empties the lot exactly, leaving no phantom cent behind', () => {
    // A lot that does not divide evenly: $10.00 for 3 units is $3.33 each, and
    // three draws of $3.33 would strand a cent on the books forever. The final
    // draw takes whatever value is left instead.
    const odd = makeInventoryItem({ id: 'odd', quantity: 3, unitCostCents: 333, purchaseCostCents: 1_000 });
    const first = drawFromInventory(odd, 'v', 1, '2026-02-01', 0, ctx());
    expect(first.amountCents).toBe(333);

    const afterFirst = { ...odd, quantity: 2 };
    const second = drawFromInventory(afterFirst, 'v', 1, '2026-02-01', 333, ctx());
    expect(second.amountCents).toBe(333);

    const afterSecond = { ...odd, quantity: 1 };
    const last = drawFromInventory(afterSecond, 'v', 1, '2026-02-01', 666, ctx());
    expect(last.amountCents).toBe(334); // the remainder, not 333
    expect(last.updatedItem?.quantity).toBe(0);
    expect(333 + 333 + 334).toBe(1_000);
  });

  it('never draws more value than the lot has left', () => {
    const d = drawFromInventory(item(), 'v', 12, '2026-02-01', 9_000, ctx());
    expect(d.amountCents).toBe(600);
  });
});

describe('categories', () => {
  it('marks exactly one category as the purchase price', () => {
    const purchases = DEFAULT_CATEGORIES.filter((c) => c.isPurchase);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]?.id).toBe('PURCHASE_PRICE');
    expect(isPurchaseCategory('PURCHASE_PRICE')).toBe(true);
    expect(isPurchaseCategory('PARTS')).toBe(false);
  });

  it('covers every category named in the specification', () => {
    const required = [
      'PURCHASE_PRICE', 'AUCTION_FEE', 'DEALER_FEE', 'TAX', 'TITLE', 'REGISTRATION',
      'TRANSPORTATION', 'TOWING', 'GASOLINE', 'OIL_CHANGE', 'TIRES', 'BRAKES', 'BATTERY',
      'MECHANICAL_REPAIR', 'ELECTRICAL_REPAIR', 'BODY_REPAIR', 'PAINT', 'DETAILING',
      'PARTS', 'INSPECTION', 'INSURANCE', 'STORAGE', 'ADVERTISING', 'OTHER',
    ];
    for (const id of required) expect(findCategory(id)).toBeDefined();
  });

  it('keeps purchase price out of the expense-entry dropdown', () => {
    // It is set on the vehicle, not typed in as another expense — otherwise a
    // second purchase price could be added by accident.
    expect(selectableCategories().some((c) => c.isPurchase)).toBe(false);
  });

  it('includes user-created categories in the dropdown', () => {
    const custom = [{ id: 'WINDOW_TINT', label: 'Window Tint', group: 'COSMETIC' as const }];
    expect(selectableCategories(custom).some((c) => c.id === 'WINDOW_TINT')).toBe(true);
    expect(categoryLabel('WINDOW_TINT', custom)).toBe('Window Tint');
  });

  it('falls back to the raw id rather than rendering blank', () => {
    expect(categoryLabel('NEVER_SEEN')).toBe('NEVER_SEEN');
    expect(categoryLabel('TIRES')).toBe('Tires');
  });

  it('has a label for every group, and an order covering all of them', () => {
    const groups = new Set(DEFAULT_CATEGORIES.map((c) => c.group));
    for (const g of groups) {
      expect(GROUP_LABELS[g]).toBeTruthy();
      expect(GROUP_ORDER).toContain(g);
    }
  });
});
