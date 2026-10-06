/**
 * MONEY — integer cents, always.
 *
 * Every amount in Carfolio is a whole number of cents. No floats touch money,
 * anywhere, ever. `0.1 + 0.2 !== 0.3` is not an abstract concern in an app that
 * splits profits in half and sums a year of expenses: it is how a P&L quietly
 * stops matching a bank account.
 *
 * The only places a decimal string exists are the edges: parseAmount() on the
 * way in, formatMoney() on the way out.
 */

/** A whole number of cents. Negative means money leaving. */
export type Cents = number;

export const ZERO: Cents = 0;

/** Guards against NaN/Infinity/fractional cents entering the model. */
export function isValidCents(n: unknown): n is Cents {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

export function assertCents(n: unknown, label = 'amount'): Cents {
  if (!isValidCents(n)) {
    throw new TypeError(`${label} must be an integer number of cents, got: ${String(n)}`);
  }
  return n;
}

export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const v of values) total += assertCents(v);
  return total;
}

export function absCents(n: Cents): Cents {
  return n < 0 ? -n : n;
}

/**
 * Parse whatever the user typed into integer cents.
 *
 * Handles both decimal conventions AND the thousands separators the app itself
 * prints — the user re-types "$10,550.00" straight off the screen, and
 * parseFloat("10,550") returns 10.
 *
 *  - comma AND dot  → the LAST one is the decimal: "1,050.50" and "1.050,50" → 105050
 *  - only commas    → decimal only if ONE comma with 1-2 digits after:
 *                     "167,5" → 16750   but   "10,000" → 1000000
 *  - only dots      → one dot is decimal (US): "0.75" → 75
 *                     several are European thousands: "1.050.500" → 105050000
 *
 * The conversion to cents is done on the digit STRINGS, never by multiplying a
 * float by 100 — `19.99 * 100` is 1998.9999999999998, which truncates to a cent
 * short. Returns 0 for empty or unparseable input.
 */
export function parseAmount(raw: string | number | null | undefined): Cents {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return 0;
    // A number arriving here is a whole-currency value (e.g. from a slider).
    // Round half away from zero so 0.005 → 1 cent, not 0.
    return roundHalfAwayFromZero(raw * 100);
  }
  if (raw == null) return 0;

  let s = String(raw).trim().replace(/[\s$_]/g, '');
  const negative = s.startsWith('-') || (s.startsWith('(') && s.endsWith(')'));
  s = s.replace(/[^0-9.,]/g, '');
  if (s === '') return 0;

  const commas = (s.match(/,/g) ?? []).length;
  const dots = (s.match(/\./g) ?? []).length;

  let decimalAt: number;
  if (commas > 0 && dots > 0) {
    decimalAt = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  } else if (commas > 0) {
    decimalAt = commas === 1 && /,\d{1,2}$/.test(s) ? s.lastIndexOf(',') : -1;
  } else if (dots > 0) {
    decimalAt = dots === 1 ? s.lastIndexOf('.') : -1;
  } else {
    decimalAt = -1;
  }

  const wholePart = (decimalAt === -1 ? s : s.slice(0, decimalAt)).replace(/[.,]/g, '');
  const fracRaw = decimalAt === -1 ? '' : s.slice(decimalAt + 1).replace(/[.,]/g, '');

  if (wholePart === '' && fracRaw === '') return 0;

  const whole = wholePart === '' ? 0 : Number(wholePart);
  if (!Number.isFinite(whole)) return 0;

  // Two cent digits, with the third rounding the second. String work only.
  const frac2 = (fracRaw + '00').slice(0, 2);
  const thirdDigit = fracRaw.length > 2 ? Number(fracRaw[2]) : 0;
  let cents = whole * 100 + Number(frac2);
  if (thirdDigit >= 5) cents += 1;

  if (!Number.isSafeInteger(cents)) return 0;
  return negative ? -cents : cents;
}

/** Round half away from zero — the convention people expect for money. */
export function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

export interface FormatMoneyOptions {
  /** Show cents even when they are .00. Default: false (whole dollars read faster). */
  cents?: boolean;
  /** Prefix positive values with '+'. Useful for profit figures. Default: false. */
  signed?: boolean;
  /** Omit the '$'. Default: false. */
  bare?: boolean;
}

/**
 * "$10,550" · "$10,550.75" · "-$1,200" · "+$3,000"
 *
 * The minus sign goes BEFORE the dollar sign, not after it — "-$1,200" rather
 * than "$-1,200" — because that is how every statement the user has ever read
 * prints it.
 */
export function formatMoney(cents: Cents, options: FormatMoneyOptions = {}): string {
  const { cents: showCents = false, signed = false, bare = false } = options;
  const safe = isValidCents(cents) ? cents : 0;
  const negative = safe < 0;
  const magnitude = negative ? -safe : safe;

  const whole = Math.floor(magnitude / 100);
  const remainder = magnitude % 100;
  const needsCents = showCents || remainder !== 0;

  const groupedWhole = whole.toLocaleString('en-US');
  const body = needsCents ? `${groupedWhole}.${String(remainder).padStart(2, '0')}` : groupedWhole;

  const symbol = bare ? '' : '$';
  if (negative) return `-${symbol}${body}`;
  if (signed && safe > 0) return `+${symbol}${body}`;
  return `${symbol}${body}`;
}

/**
 * Compact form for dense tiles: "$10.5K", "$1.2M". Falls back to full below
 * $10K. `signed` prints an explicit + on positives, which is what lets a chart
 * summary state polarity without relying on colour.
 */
export function formatMoneyCompact(cents: Cents, options: { signed?: boolean } = {}): string {
  const safe = isValidCents(cents) ? cents : 0;
  const dollars = safe / 100;
  const magnitude = Math.abs(dollars);
  const sign = dollars < 0 ? '-' : options.signed && dollars > 0 ? '+' : '';
  /* eslint-disable no-restricted-syntax -- Display rounding of a value that is
     already derived, never an amount that gets stored or summed. The ban exists
     to stop toFixed() being used to compute money; abbreviating $10,550 as
     "$10.6K" for a dashboard tile is the opposite of that. */
  if (magnitude >= 1_000_000) return `${sign}$${(magnitude / 1_000_000).toFixed(1)}M`;
  if (magnitude >= 10_000) return `${sign}$${(magnitude / 1000).toFixed(1)}K`;
  /* eslint-enable no-restricted-syntax */
  return formatMoney(safe, { signed: options.signed });
}

/**
 * Split an amount exactly in half, giving any odd cent to the FIRST party.
 *
 * A $3,000.01 profit cannot be halved evenly. Somebody gets the cent, and it
 * must be the same somebody every time or the two halves stop summing to the
 * whole. By convention the extra cent goes to Daniel — he carries the capital
 * risk — and the same rule applies to losses, so Daniel also absorbs the extra
 * cent of a loss. `first + second === total` always holds.
 */
export function splitHalf(total: Cents): { first: Cents; second: Cents } {
  assertCents(total, 'total');
  const second = Math.trunc(total / 2);
  return { first: total - second, second };
}

/**
 * Return on investment as a RATIO (0.237 = 23.7%), or null when undefined.
 *
 * Null rather than Infinity or NaN when nothing was invested: the UI renders an
 * em-dash. A screen that prints "Infinity%" has lost the user's trust for every
 * other number on it too.
 */
export function roi(profitCents: Cents, investedCents: Cents): number | null {
  if (!isValidCents(profitCents) || !isValidCents(investedCents)) return null;
  if (investedCents <= 0) return null;
  return profitCents / investedCents;
}

/** "23.7%" · "-4.2%" · "—" for null. */
export function formatPercent(ratio: number | null, digits = 1): string {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  /* A percentage is not money, and nothing downstream re-parses this string
     back into an amount. */
  // eslint-disable-next-line no-restricted-syntax
  return `${(ratio * 100).toFixed(digits)}%`;
}

/** Mean of a list of cent amounts, rounded to the cent. Null for an empty list. */
export function averageCents(values: readonly Cents[]): Cents | null {
  if (values.length === 0) return null;
  return roundHalfAwayFromZero(sumCents(values) / values.length);
}

/** Mean of a list of ratios. Null for an empty list. */
export function averageRatio(values: readonly number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}
