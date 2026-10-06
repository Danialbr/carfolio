import {
  canTransition,
  formatMileage,
  isInGarage,
  nextStatuses,
  normalizeVin,
  validateVin,
  vehicleTitle,
  vehicleTitleShort,
  vinShort,
} from '../../domain/vehicle';
import { makeVehicle, resetIds } from '../support/fixtures';

beforeEach(resetIds);

describe('VIN', () => {
  it('normalizes user input', () => {
    expect(normalizeVin(' 1hg cm826-33a004352 ')).toBe('1HGCM82633A004352');
  });

  it('accepts a VIN with a correct check digit', () => {
    expect(validateVin('1HGCM82633A004352')).toEqual({ ok: true, suspicious: false, message: null });
  });

  it('accepts an empty VIN — project cars and old vehicles genuinely have none', () => {
    expect(validateVin('')).toEqual({ ok: true, suspicious: false, message: null });
    expect(validateVin('   ')).toEqual({ ok: true, suspicious: false, message: null });
  });

  it('rejects the wrong length', () => {
    const r = validateVin('1HGCM8263');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/17 characters/);
  });

  it('rejects the letters a VIN can never contain', () => {
    const r = validateVin('1HGCM826I3A004352');
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/I, O or Q/);
  });

  it('warns rather than blocks on a failed check digit', () => {
    // A transposed character. Almost always a typo, but some rebuilt-title
    // vehicles carry VINs that legitimately fail, so this warns and saves.
    const r = validateVin('1HGCM82634A004352');
    expect(r.ok).toBe(true);
    expect(r.suspicious).toBe(true);
    expect(r.message).toMatch(/check digit/);
  });

  it('handles the X check digit', () => {
    expect(validateVin('1M8GDM9AXKP042788').suspicious).toBe(false);
  });

  it('shortens to the last six, the way people talk about cars', () => {
    expect(vinShort('1HGCM82633A004352')).toBe('004352');
    expect(vinShort('123')).toBe('123');
  });
});

describe('status machine', () => {
  it('allows the normal working moves', () => {
    expect(canTransition('PURCHASED', 'IN_REPAIR')).toBe(true);
    expect(canTransition('IN_REPAIR', 'READY')).toBe(true);
    expect(canTransition('READY', 'LISTED')).toBe(true);
  });

  it('allows going backwards — a buyer’s inspection sends a listed car back to the shop', () => {
    expect(canTransition('LISTED', 'IN_REPAIR')).toBe(true);
    expect(canTransition('IN_REPAIR', 'PURCHASED')).toBe(true);
  });

  it('never lets SOLD be set directly', () => {
    // SOLD is written only by the sale flow, in the same transaction as the
    // sale row, so a vehicle can never be sold without a sale behind it.
    for (const from of ['PURCHASED', 'IN_REPAIR', 'READY', 'LISTED'] as const) {
      expect(canTransition(from, 'SOLD')).toBe(false);
    }
  });

  it('makes SOLD terminal', () => {
    expect(nextStatuses('SOLD')).toHaveLength(0);
    expect(canTransition('SOLD', 'LISTED')).toBe(false);
  });
});

describe('garage membership', () => {
  it('includes anything bought and not yet sold', () => {
    expect(isInGarage(makeVehicle({ status: 'PURCHASED' }))).toBe(true);
    expect(isInGarage(makeVehicle({ status: 'LISTED' }))).toBe(true);
  });

  it('excludes sold and deleted vehicles', () => {
    expect(isInGarage(makeVehicle({ status: 'SOLD' }))).toBe(false);
    expect(isInGarage(makeVehicle({ deletedAt: '2026-01-01T00:00:00Z' }))).toBe(false);
  });
});

describe('display helpers', () => {
  it('builds a title from whatever is present', () => {
    expect(vehicleTitle({ year: 2018, make: 'Toyota', model: 'Camry', trim: 'SE' })).toBe(
      '2018 Toyota Camry SE',
    );
    expect(vehicleTitle({ year: null, make: 'Toyota', model: 'Camry', trim: '' })).toBe(
      'Toyota Camry',
    );
    expect(vehicleTitleShort({ year: 2018, make: 'Toyota', model: 'Camry' })).toBe(
      '2018 Toyota Camry',
    );
  });

  it('never renders an empty title', () => {
    expect(vehicleTitle({ year: null, make: '', model: '', trim: '' })).toBe('Untitled vehicle');
    expect(vehicleTitleShort({ year: null, make: '  ', model: '' })).toBe('Untitled vehicle');
  });

  it('formats mileage', () => {
    expect(formatMileage(84_120)).toBe('84,120 mi');
    expect(formatMileage(null)).toBe('—');
  });
});
