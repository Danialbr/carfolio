import fc from 'fast-check';
import {
  absCents,
  averageCents,
  averageRatio,
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  isValidCents,
  parseAmount,
  roi,
  roundHalfAwayFromZero,
  splitHalf,
  sumCents,
} from '../../domain/money';

describe('parseAmount', () => {
  it('parses plain decimals into cents', () => {
    expect(parseAmount('8000')).toBe(800_000);
    expect(parseAmount('8000.50')).toBe(800_050);
    expect(parseAmount('0.75')).toBe(75);
    expect(parseAmount('.5')).toBe(50);
  });

  it('parses what the app itself printed, thousands separators and all', () => {
    expect(parseAmount('$10,550')).toBe(1_055_000);
    expect(parseAmount('$10,550.75')).toBe(1_055_075);
    expect(parseAmount('1,050.50')).toBe(105_050);
  });

  it('handles the European convention', () => {
    expect(parseAmount('1.050,50')).toBe(105_050);
    expect(parseAmount('1.050.500')).toBe(105_050_000);
    expect(parseAmount('167,5')).toBe(16_750);
  });

  it('treats a lone comma group as thousands, not a decimal', () => {
    expect(parseAmount('10,000')).toBe(1_000_000);
    expect(parseAmount('12,345,678')).toBe(1_234_567_800);
  });

  it('never loses a cent to floating point', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE-754. Truncating that is a cent
    // short on every single line item, which compounds across a year.
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('0.29')).toBe(29);
    expect(parseAmount('1234.56')).toBe(123_456);
  });

  it('rounds a third decimal place half away from zero', () => {
    expect(parseAmount('1.005')).toBe(101);
    expect(parseAmount('1.004')).toBe(100);
  });

  it('handles negatives, including accountant parentheses', () => {
    expect(parseAmount('-500')).toBe(-50_000);
    expect(parseAmount('(500)')).toBe(-50_000);
  });

  it('returns 0 for junk rather than NaN', () => {
    for (const input of ['', '   ', '.', '-', 'abc', null, undefined, NaN, Infinity]) {
      expect(parseAmount(input as never)).toBe(0);
    }
  });

  it('accepts numbers as whole-currency values', () => {
    expect(parseAmount(19.99)).toBe(1999);
    expect(parseAmount(0)).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats whole dollars without noise', () => {
    expect(formatMoney(1_055_000)).toBe('$10,550');
    expect(formatMoney(0)).toBe('$0');
  });

  it('shows cents when there are any', () => {
    expect(formatMoney(1_055_075)).toBe('$10,550.75');
    expect(formatMoney(5)).toBe('$0.05');
  });

  it('puts the minus before the dollar sign, the way a statement does', () => {
    expect(formatMoney(-120_000)).toBe('-$1,200');
    expect(formatMoney(-120_050)).toBe('-$1,200.50');
  });

  it('can force cents and signs', () => {
    expect(formatMoney(800_000, { cents: true })).toBe('$8,000.00');
    expect(formatMoney(300_000, { signed: true })).toBe('+$3,000');
    expect(formatMoney(0, { signed: true })).toBe('$0');
    expect(formatMoney(500, { bare: true })).toBe('5');
  });

  it('degrades to $0 rather than NaN on bad input', () => {
    expect(formatMoney(NaN as number)).toBe('$0');
    expect(formatMoney(1.5 as number)).toBe('$0');
  });
});

describe('formatMoneyCompact', () => {
  it('abbreviates only above ten thousand', () => {
    expect(formatMoneyCompact(950_000)).toBe('$9,500');
    expect(formatMoneyCompact(1_055_000)).toBe('$10.6K');
    expect(formatMoneyCompact(250_000_000)).toBe('$2.5M');
    expect(formatMoneyCompact(-1_200_000)).toBe('-$12.0K');
  });
});

describe('splitHalf', () => {
  it('splits an even amount cleanly', () => {
    expect(splitHalf(300_000)).toEqual({ first: 150_000, second: 150_000 });
  });

  it('gives the odd cent to the first party', () => {
    expect(splitHalf(300_001)).toEqual({ first: 150_001, second: 150_000 });
  });

  it('applies the same rule to losses — Daniel absorbs the extra cent both ways', () => {
    expect(splitHalf(-200_001)).toEqual({ first: -100_001, second: -100_000 });
  });

  it('always sums back to the original, for any amount', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100_000_000, max: 100_000_000 }), (total) => {
        const { first, second } = splitHalf(total);
        expect(first + second).toBe(total);
        // The halves never differ by more than the single odd cent.
        expect(Math.abs(Math.abs(first) - Math.abs(second))).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('roi', () => {
  it('computes a ratio', () => {
    expect(roi(300_000, 1_055_000)).toBeCloseTo(0.28436, 5);
  });

  it('is null rather than Infinity when nothing was invested', () => {
    expect(roi(300_000, 0)).toBeNull();
    expect(roi(300_000, -100)).toBeNull();
  });

  it('is null on invalid input', () => {
    expect(roi(NaN as number, 100)).toBeNull();
  });
});

describe('formatPercent', () => {
  it('renders an em-dash for undefined rather than NaN%', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Infinity)).toBe('—');
  });
  it('formats normally otherwise', () => {
    expect(formatPercent(0.237)).toBe('23.7%');
    expect(formatPercent(-0.042)).toBe('-4.2%');
  });
});

describe('helpers', () => {
  it('sums and averages', () => {
    expect(sumCents([100, 200, 300])).toBe(600);
    expect(sumCents([])).toBe(0);
    expect(averageCents([100, 200, 301])).toBe(200);
    expect(averageCents([])).toBeNull();
    expect(averageRatio([0.1, 0.3])).toBeCloseTo(0.2, 10);
    expect(averageRatio([])).toBeNull();
  });

  it('rejects fractional cents entering the model', () => {
    expect(isValidCents(100)).toBe(true);
    expect(isValidCents(100.5)).toBe(false);
    expect(isValidCents(NaN)).toBe(false);
    expect(() => sumCents([1.5])).toThrow(TypeError);
  });

  it('rounds half away from zero in both directions', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(absCents(-5)).toBe(5);
  });
});
