// Hourly floor and target (baht per founder hour). The user sets these; nothing is assumed.
// They live on the profile, so they stay on the device and ride along inside the encrypted vault.

export const HOURLY_RATE_MAX = 1_000_000;

export interface HourlyRates {
  /** Baht per hour. Missing means the user has not set one. */
  floor?: number;
  target?: number;
}

export function ratesFromProfile(p: { hourlyFloorThb?: number; hourlyTargetThb?: number } | undefined): HourlyRates {
  if (!p) return {};
  return { floor: p.hourlyFloorThb, target: p.hourlyTargetThb };
}

/** Both set, and the target is strictly above the floor (the comparison needs a real range). */
export function hourlyRatesReady(floor: number | undefined, target: number | undefined): boolean {
  return typeof floor === 'number' && typeof target === 'number'
    && Number.isFinite(floor) && Number.isFinite(target) && floor < target;
}

export function hourlyRateIssue(floor: number | undefined, target: number | undefined): string | null {
  if (floor === undefined || target === undefined) return null;
  if (!(floor < target)) return 'The target should be above the floor.';
  return null;
}

export function hourlyRateText(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

export type ParsedHourlyRate = { ok: true; value: number | undefined } | { ok: false };

/** Empty is "not set". Otherwise a non-negative number up to HOURLY_RATE_MAX, at most two decimals. */
export function parseHourlyRate(raw: string): ParsedHourlyRate {
  const t = raw.trim().replace(/฿/g, '').replace(/,/g, '').replace(/\s+/g, '');
  if (!t) return { ok: true, value: undefined };
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(t)) return { ok: false };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > HOURLY_RATE_MAX) return { ok: false };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/**
 * Write one field onto a profile inside a store mutator.
 * Returns an error message, or null when the profile was updated.
 */
export function applyHourlyRate(
  profile: { hourlyFloorThb?: number; hourlyTargetThb?: number },
  key: 'hourlyFloorThb' | 'hourlyTargetThb',
  raw: string,
): string | null {
  const parsed = parseHourlyRate(raw);
  if (!parsed.ok) return 'Use a number, or leave it blank.';
  if (parsed.value === undefined) delete profile[key];
  else profile[key] = parsed.value;
  return null;
}
