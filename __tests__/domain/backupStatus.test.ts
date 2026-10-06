/**
 * The backup prompt is the only thing in this app that interrupts the user
 * without being asked, so the rule that fires it is worth pinning down: it must
 * stay silent when there is nothing to lose, and it must not stay silent when
 * there is.
 */

import { backupStatus } from '../../domain/backupStatus';
import type { BusinessInput } from '../../domain/capital';
import type { CapitalEvent, Expense, Vehicle } from '../../domain/types';

/** The audit columns every row carries. Irrelevant here, required by the type. */
const AUDIT = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null };

const EMPTY: BusinessInput = {
  vehicles: [],
  expenses: [],
  sales: [],
  capitalEvents: [],
  distributions: [],
  fernandoEntries: [],
  inventory: [],
};

function withCapital(dates: string[]): BusinessInput {
  return {
    ...EMPTY,
    capitalEvents: dates.map<CapitalEvent>((date, i) => ({
      id: `c${i}`,
      kind: 'CONTRIBUTION',
      amountCents: 100_000,
      date,
      notes: '',
      ...AUDIT,
    })),
  };
}

describe('silence when silence is right', () => {
  it('says nothing about an empty app, ever backed up or not', () => {
    expect(backupStatus(null, EMPTY, '2026-06-01').urgency).toBe('NONE');
    expect(backupStatus('2020-01-01', EMPTY, '2026-06-01').urgency).toBe('NONE');
    expect(backupStatus(null, EMPTY, '2026-06-01').message).toBeNull();
  });

  it('says nothing when everything predates the last backup', () => {
    const status = backupStatus('2026-06-01', withCapital(['2026-05-20']), '2026-06-02');
    expect(status.unsavedChanges).toBe(0);
    expect(status.urgency).toBe('NONE');
  });

  it('stays quiet for a couple of fresh records right after a backup', () => {
    const status = backupStatus('2026-06-01', withCapital(['2026-06-02']), '2026-06-03');
    expect(status.unsavedChanges).toBe(1);
    expect(status.urgency).toBe('NONE');
  });
});

describe('speaking up when there is something to lose', () => {
  it('treats never having backed up real data as overdue', () => {
    const status = backupStatus(null, withCapital(['2026-06-01']), '2026-06-02');
    expect(status.everBackedUp).toBe(false);
    expect(status.urgency).toBe('OVERDUE');
    expect(status.message).toMatch(/never/i);
  });

  it('suggests once a week has passed with unsaved work', () => {
    const status = backupStatus('2026-06-01', withCapital(['2026-06-05']), '2026-06-09');
    expect(status.daysSince).toBe(8);
    expect(status.urgency).toBe('SUGGESTED');
  });

  it('suggests on volume alone, before a week is up', () => {
    const dates = ['2026-06-02', '2026-06-02', '2026-06-03', '2026-06-03', '2026-06-04'];
    const status = backupStatus('2026-06-01', withCapital(dates), '2026-06-04');
    expect(status.unsavedChanges).toBe(5);
    expect(status.urgency).toBe('SUGGESTED');
  });

  it('escalates to overdue after a month', () => {
    const status = backupStatus('2026-05-01', withCapital(['2026-05-20']), '2026-06-05');
    expect(status.urgency).toBe('OVERDUE');
    expect(status.message).toMatch(/35 days ago/);
  });

  it('counts vehicles, sales and expenses, not just capital', () => {
    const input: BusinessInput = {
      ...EMPTY,
      vehicles: [
        {
          id: 'v1', year: 2018, make: 'Toyota', model: 'Camry', trim: '', vin: '',
          mileageIn: 1000, mileageOut: null, purchaseDate: '2026-06-05', saleDate: null,
          type: 'MYSELF', status: 'PURCHASED', estimatedSalePriceCents: null, notes: '', color: '',
          ...AUDIT,
        } satisfies Vehicle,
      ],
      expenses: [
        {
          id: 'e1', vehicleId: 'v1', categoryId: 'PARTS', amountCents: 5_000,
          date: '2026-06-06', description: '', paidBy: 'DANIEL',
          fromInventory: false, inventoryItemId: null,
          ...AUDIT,
        } satisfies Expense,
      ],
    };
    expect(backupStatus('2026-06-01', input, '2026-06-10').unsavedChanges).toBe(2);
  });

  it('writes singular and plural correctly', () => {
    const one = backupStatus('2026-06-01', withCapital(['2026-06-02']), '2026-06-20');
    expect(one.message).toMatch(/^1 record added/);
    const two = backupStatus('2026-06-01', withCapital(['2026-06-02', '2026-06-03']), '2026-06-20');
    expect(two.message).toMatch(/^2 records added/);
  });
});
