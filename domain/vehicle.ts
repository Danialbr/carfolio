/**
 * VEHICLE — identity, VIN handling, and the status machine.
 */

import type { Vehicle, VehicleStatus, VehicleType } from './types';

export const VEHICLE_STATUSES: readonly VehicleStatus[] = [
  'PURCHASED',
  'IN_REPAIR',
  'READY',
  'LISTED',
  'SOLD',
];

export const STATUS_LABELS: Record<VehicleStatus, string> = {
  PURCHASED: 'Purchased',
  IN_REPAIR: 'In Repair',
  READY: 'Ready',
  LISTED: 'Listed',
  SOLD: 'Sold',
};

export const TYPE_LABELS: Record<VehicleType, string> = {
  MYSELF: 'Myself',
  ASSOCIATED: 'Associated',
};

/**
 * Which statuses can be reached from which.
 *
 * Movement back and forth between the working states is allowed on purpose —
 * a car goes from LISTED back to IN_REPAIR when a buyer's inspection finds
 * something. What is NOT allowed is setting SOLD directly: that transition
 * happens only through the sale flow, which writes the sale row in the same
 * transaction, so a vehicle can never be marked sold without a sale behind it.
 */
const TRANSITIONS: Record<VehicleStatus, readonly VehicleStatus[]> = {
  PURCHASED: ['IN_REPAIR', 'READY', 'LISTED'],
  IN_REPAIR: ['PURCHASED', 'READY', 'LISTED'],
  READY: ['IN_REPAIR', 'LISTED'],
  LISTED: ['IN_REPAIR', 'READY'],
  SOLD: [], // Terminal. Reopening happens by deleting the sale, not by status.
};

export function canTransition(from: VehicleStatus, to: VehicleStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: VehicleStatus): readonly VehicleStatus[] {
  return TRANSITIONS[from];
}

/** Garage = bought, not yet sold. */
export function isInGarage(vehicle: Vehicle): boolean {
  return vehicle.deletedAt == null && vehicle.status !== 'SOLD';
}

// ─── VIN ────────────────────────────────────────────────────────────────────

/** Upper-cased, stripped of spaces and hyphens. Safe to call on partial input. */
export function normalizeVin(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export interface VinValidation {
  ok: boolean;
  /** True when the VIN is well-formed but fails the manufacturer check digit. */
  suspicious: boolean;
  message: string | null;
}

const VIN_TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Validate a 17-character VIN, including the check digit in position 9.
 *
 * An empty VIN is VALID: project cars, older vehicles and some auction lots
 * genuinely have none, and blocking the save would be worse than the missing
 * data. A wrong check digit is reported as `suspicious` rather than invalid —
 * it is almost always a typo, but the UI warns instead of refusing, because
 * some rebuilt-title vehicles legitimately carry VINs that fail it.
 */
export function validateVin(raw: string): VinValidation {
  const vin = normalizeVin(raw);
  if (vin === '') return { ok: true, suspicious: false, message: null };

  if (vin.length !== 17) {
    return { ok: false, suspicious: false, message: `A VIN has 17 characters — this has ${vin.length}.` };
  }
  if (/[IOQ]/.test(vin)) {
    return { ok: false, suspicious: false, message: 'A VIN never contains the letters I, O or Q.' };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return { ok: false, suspicious: false, message: 'A VIN uses only letters and digits.' };
  }

  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const char = vin[i] as string;
    const value = /\d/.test(char) ? Number(char) : (VIN_TRANSLIT[char] ?? 0);
    sum += value * (VIN_WEIGHTS[i] as number);
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);

  if (vin[8] !== expected) {
    return {
      ok: true,
      suspicious: true,
      message: 'This VIN fails its check digit — worth re-reading off the car.',
    };
  }
  return { ok: true, suspicious: false, message: null };
}

/** Last 6 of the VIN, the way people actually refer to a car on a lot. */
export function vinShort(vin: string): string {
  const v = normalizeVin(vin);
  return v.length >= 6 ? v.slice(-6) : v;
}

/** "2018 Toyota Camry SE" — skips whatever is missing without leaving double spaces. */
export function vehicleTitle(vehicle: Pick<Vehicle, 'year' | 'make' | 'model' | 'trim'>): string {
  const parts = [
    vehicle.year != null ? String(vehicle.year) : '',
    vehicle.make,
    vehicle.model,
    vehicle.trim,
  ].filter((p) => p.trim() !== '');
  return parts.join(' ').trim() || 'Untitled vehicle';
}

/** "2018 Toyota Camry" — no trim, for tight rows. */
export function vehicleTitleShort(
  vehicle: Pick<Vehicle, 'year' | 'make' | 'model'>,
): string {
  const parts = [vehicle.year != null ? String(vehicle.year) : '', vehicle.make, vehicle.model];
  return parts.filter((p) => p.trim() !== '').join(' ').trim() || 'Untitled vehicle';
}

/** Formatted odometer: "84,120 mi". */
export function formatMileage(miles: number | null): string {
  if (miles == null || !Number.isFinite(miles)) return '—';
  return `${Math.round(miles).toLocaleString('en-US')} mi`;
}
