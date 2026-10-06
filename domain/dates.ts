/**
 * DATES — business dates are 'YYYY-MM-DD' strings in the user's LOCAL day.
 *
 * The single most common date bug in an app like this: using
 * `new Date().toISOString().slice(0, 10)` for "today". That returns UTC, so any
 * expense entered after ~7pm Central gets filed under tomorrow — and on the last
 * day of a month, under the wrong month, which quietly corrupts every YTD
 * figure. `todayISO()` exists so that call is never needed.
 *
 * Timestamps for audit (created/updated) are a different thing and DO use UTC
 * ISO-8601 — see nowTimestamp(). Business day and audit instant are not the
 * same concept and are never interchanged.
 */

/** A business date: 'YYYY-MM-DD' in local time. */
export type ISODate = string;

/** An audit instant: full ISO-8601 in UTC. */
export type ISOTimestamp = string;

/** Today, in the user's own timezone. Never derive this from toISOString(). */
export function todayISO(): ISODate {
  const d = new Date();
  return formatLocalDate(d);
}

export function formatLocalDate(d: Date): ISODate {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Audit timestamp. UTC is correct here — this is an instant, not a calendar day. */
export function nowTimestamp(): ISOTimestamp {
  /* This is the one legitimate use of toISOString() in the app. An audit
     timestamp IS an instant in UTC; the banned pattern is using it to derive a
     business CALENDAR DAY, which is what todayISO() above exists to prevent.
     The rule stays on everywhere else so the mistake cannot spread. */
  // eslint-disable-next-line no-restricted-syntax
  return new Date().toISOString();
}

export interface DateParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/**
 * Parse 'YYYY-MM-DD' WITHOUT constructing a Date.
 *
 * `new Date('2026-02-30')` does not throw — it silently rolls over to March 2nd.
 * Building a Date from unvalidated input is how an impossible date becomes a
 * plausible wrong one. Returns null instead.
 */
export function parseISODate(value: string | null | undefined): DateParts | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (year < 1900 || year > 2200) return null;

  return { year, month, day };
}

export function isValidISODate(value: string | null | undefined): boolean {
  return parseISODate(value) !== null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function yearOf(value: ISODate): number | null {
  return parseISODate(value)?.year ?? null;
}

/**
 * Whole days from `from` to `to`. Negative if `to` precedes `from`.
 *
 * Anchored at UTC midnight on both ends so the arithmetic is pure calendar days
 * — a DST boundary would otherwise make one day of the year 23 hours long and
 * round a 37-day hold down to 36.
 */
export function daysBetween(from: ISODate, to: ISODate): number | null {
  const a = parseISODate(from);
  const b = parseISODate(to);
  if (!a || !b) return null;
  const msA = Date.UTC(a.year, a.month - 1, a.day);
  const msB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((msB - msA) / 86_400_000);
}

/** Chronological compare, safe on 'YYYY-MM-DD' because the format sorts lexically. */
export function compareISODate(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isOnOrBefore(a: ISODate, b: ISODate): boolean {
  return compareISODate(a, b) <= 0;
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "March 14, 2026". Returns the raw string unchanged if it isn't a valid date. */
export function formatDate(value: ISODate): string {
  const p = parseISODate(value);
  if (!p) return value ?? '';
  return `${MONTHS_LONG[p.month - 1]} ${p.day}, ${p.year}`;
}

/** "Mar 14, 2026" — for list rows and tables. */
export function formatShortDate(value: ISODate): string {
  const p = parseISODate(value);
  if (!p) return value ?? '';
  return `${MONTHS_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

/** "March 2026" */
export function formatMonthYear(month: number, year: number): string {
  const name = MONTHS_SHORT[month - 1] ? MONTHS_LONG[month - 1] : String(month);
  return `${name} ${year}`;
}

/** "37 days" · "1 day" · "—" */
export function formatDayCount(days: number | null): string {
  if (days == null || !Number.isFinite(days)) return '—';
  const n = Math.round(days);
  return `${n} ${Math.abs(n) === 1 ? 'day' : 'days'}`;
}
