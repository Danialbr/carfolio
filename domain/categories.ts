/**
 * EXPENSE CATEGORIES
 *
 * Seeded from a fixed list and extensible by the user at runtime (custom rows
 * live in the database alongside these). Two things matter structurally:
 *
 *  1. PURCHASE_PRICE is a category like any other in storage — one ledger of
 *     expenses, one place a dollar can live — but it is flagged `isPurchase`,
 *     and every screen and report treats it separately. That satisfies both
 *     "keep one money spine" and "never blur purchase price into additional
 *     investment", which is the distinction the whole app is built around.
 *
 *  2. Categories carry a `group` so the investment breakdown can be sectioned
 *     without hard-coding an order into the UI.
 */

export type CategoryGroup =
  | 'ACQUISITION'
  | 'FEES_LEGAL'
  | 'TRANSPORT'
  | 'MECHANICAL'
  | 'COSMETIC'
  | 'HOLDING'
  | 'OTHER';

export interface CategoryDef {
  id: string;
  label: string;
  group: CategoryGroup;
  /** Exactly one category has this. It is the vehicle's purchase price. */
  isPurchase?: boolean;
}

/** The one category id the financial layer treats specially. */
export const PURCHASE_PRICE_CATEGORY = 'PURCHASE_PRICE';

export const GROUP_LABELS: Record<CategoryGroup, string> = {
  ACQUISITION: 'Acquisition',
  FEES_LEGAL: 'Fees & Legal',
  TRANSPORT: 'Transport',
  MECHANICAL: 'Mechanical',
  COSMETIC: 'Cosmetic',
  HOLDING: 'Holding',
  OTHER: 'Other',
};

export const GROUP_ORDER: readonly CategoryGroup[] = [
  'ACQUISITION',
  'FEES_LEGAL',
  'TRANSPORT',
  'MECHANICAL',
  'COSMETIC',
  'HOLDING',
  'OTHER',
];

export const DEFAULT_CATEGORIES: readonly CategoryDef[] = [
  { id: PURCHASE_PRICE_CATEGORY, label: 'Purchase Price', group: 'ACQUISITION', isPurchase: true },

  { id: 'AUCTION_FEE', label: 'Auction Fee', group: 'FEES_LEGAL' },
  { id: 'DEALER_FEE', label: 'Dealer Fee', group: 'FEES_LEGAL' },
  { id: 'TAX', label: 'Tax', group: 'FEES_LEGAL' },
  { id: 'TITLE', label: 'Title', group: 'FEES_LEGAL' },
  { id: 'REGISTRATION', label: 'Registration', group: 'FEES_LEGAL' },
  { id: 'INSPECTION', label: 'Inspection', group: 'FEES_LEGAL' },

  { id: 'TRANSPORTATION', label: 'Transportation', group: 'TRANSPORT' },
  { id: 'TOWING', label: 'Towing', group: 'TRANSPORT' },
  { id: 'GASOLINE', label: 'Gasoline', group: 'TRANSPORT' },

  { id: 'OIL_CHANGE', label: 'Oil Change', group: 'MECHANICAL' },
  { id: 'TIRES', label: 'Tires', group: 'MECHANICAL' },
  { id: 'BRAKES', label: 'Brakes', group: 'MECHANICAL' },
  { id: 'BATTERY', label: 'Battery', group: 'MECHANICAL' },
  { id: 'MECHANICAL_REPAIR', label: 'Mechanical Repair', group: 'MECHANICAL' },
  { id: 'ELECTRICAL_REPAIR', label: 'Electrical Repair', group: 'MECHANICAL' },
  { id: 'PARTS', label: 'Parts', group: 'MECHANICAL' },

  { id: 'BODY_REPAIR', label: 'Body Repair', group: 'COSMETIC' },
  { id: 'PAINT', label: 'Paint', group: 'COSMETIC' },
  { id: 'DETAILING', label: 'Detailing', group: 'COSMETIC' },

  { id: 'INSURANCE', label: 'Insurance', group: 'HOLDING' },
  { id: 'STORAGE', label: 'Storage', group: 'HOLDING' },

  { id: 'ADVERTISING', label: 'Advertising', group: 'OTHER' },
  { id: 'OTHER', label: 'Other', group: 'OTHER' },
];

const BY_ID = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c]));

export function findCategory(id: string): CategoryDef | undefined {
  return BY_ID.get(id);
}

/** Falls back to the raw id so a user-created category never renders as blank. */
export function categoryLabel(id: string, custom?: readonly CategoryDef[]): string {
  return BY_ID.get(id)?.label ?? custom?.find((c) => c.id === id)?.label ?? id;
}

export function isPurchaseCategory(id: string): boolean {
  return id === PURCHASE_PRICE_CATEGORY;
}

/** Categories offered when adding an expense — purchase price is set on the vehicle, not here. */
export function selectableCategories(custom: readonly CategoryDef[] = []): CategoryDef[] {
  return [...DEFAULT_CATEGORIES, ...custom].filter((c) => !c.isPurchase);
}
