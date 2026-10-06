import {
  compareISODate,
  daysBetween,
  daysInMonth,
  formatDate,
  formatDayCount,
  formatLocalDate,
  formatMonthYear,
  formatShortDate,
  isValidISODate,
  parseISODate,
  todayISO,
  yearOf,
} from '../../domain/dates';

describe('todayISO', () => {
  it('uses the LOCAL day, not UTC', () => {
    // The bug this guards: at 8pm Central on Jan 31, toISOString() says Feb 1,
    // which files the expense in the wrong month and corrupts every YTD figure.
    const realDate = Date;
    // 2026-01-31 20:30 local time, whatever the runner's timezone is.
    const local = new realDate(2026, 0, 31, 20, 30, 0);
    jest.spyOn(global, 'Date').mockImplementation(() => local as unknown as Date);

    expect(todayISO()).toBe('2026-01-31');

    jest.restoreAllMocks();
    expect(new Date()).toBeInstanceOf(realDate);
  });

  it('matches formatLocalDate', () => {
    expect(formatLocalDate(new Date(2026, 8, 7))).toBe('2026-09-07');
    expect(formatLocalDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('parseISODate', () => {
  it('accepts real dates', () => {
    expect(parseISODate('2026-03-14')).toEqual({ year: 2026, month: 3, day: 14 });
  });

  it('rejects impossible dates instead of rolling them over', () => {
    // new Date('2026-02-30') silently becomes March 2nd. That is how an
    // impossible date becomes a plausible wrong one.
    expect(parseISODate('2026-02-30')).toBeNull();
    expect(parseISODate('2026-13-01')).toBeNull();
    expect(parseISODate('2026-00-10')).toBeNull();
    expect(parseISODate('2026-04-31')).toBeNull();
  });

  it('knows about leap years', () => {
    expect(parseISODate('2024-02-29')).not.toBeNull();
    expect(parseISODate('2026-02-29')).toBeNull();
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('rejects malformed input', () => {
    for (const bad of ['', '2026-3-14', '14/03/2026', 'yesterday', null, undefined, 42]) {
      expect(parseISODate(bad as never)).toBeNull();
    }
    expect(isValidISODate('2026-03-14')).toBe(true);
    expect(isValidISODate('nope')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-01-10', '2026-02-16')).toBe(37);
    expect(daysBetween('2026-01-10', '2026-01-10')).toBe(0);
    expect(daysBetween('2026-02-16', '2026-01-10')).toBe(-37);
  });

  it('is unaffected by daylight saving', () => {
    // US DST starts 2026-03-08. A local-midnight implementation would return 0
    // for this span because one of those days is 23 hours long.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
  });

  it('spans years correctly', () => {
    expect(daysBetween('2025-12-25', '2026-01-05')).toBe(11);
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366); // leap year
  });

  it('is null when either end is invalid', () => {
    expect(daysBetween('nope', '2026-01-01')).toBeNull();
    expect(daysBetween('2026-01-01', '2026-02-30')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats dates for people', () => {
    expect(formatDate('2026-03-14')).toBe('March 14, 2026');
    expect(formatShortDate('2026-03-14')).toBe('Mar 14, 2026');
    expect(formatMonthYear(3, 2026)).toBe('March 2026');
  });

  it('passes invalid input straight through rather than inventing a date', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
    expect(formatShortDate('2026-02-30')).toBe('2026-02-30');
  });

  it('pluralizes day counts', () => {
    expect(formatDayCount(37)).toBe('37 days');
    expect(formatDayCount(1)).toBe('1 day');
    expect(formatDayCount(0)).toBe('0 days');
    expect(formatDayCount(null)).toBe('—');
  });

  it('sorts and extracts', () => {
    expect(compareISODate('2026-01-01', '2026-02-01')).toBe(-1);
    expect(compareISODate('2026-02-01', '2026-01-01')).toBe(1);
    expect(compareISODate('2026-01-01', '2026-01-01')).toBe(0);
    expect(yearOf('2026-03-14')).toBe(2026);
    expect(yearOf('bad')).toBeNull();
  });
});
