// Pure helpers for the vault endpoint: byte length (not UTF-16 code units) and the fixed window
// used to slow token guessing. No I/O.

export const VAULT_WINDOW_MS = 10 * 60 * 1000;
/** Requests per window per client, including ones that never present a token. */
export const VAULT_MAX_ATTEMPTS = 60;
/** Wrong bearer tokens per window. The next request after this many is refused. */
export const VAULT_MAX_FAILURES = 8;

export interface VaultWindow {
  start: number;
  attempts: number;
  failures: number;
}

/** UTF-8 byte length. A string's `.length` counts UTF-16 code units, which under-counts most non-ASCII. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function emptyWindow(now: number): VaultWindow {
  return { start: now, attempts: 0, failures: 0 };
}

/** True once this window should refuse another request. */
export function windowLimited(
  w: VaultWindow,
  maxAttempts = VAULT_MAX_ATTEMPTS,
  maxFailures = VAULT_MAX_FAILURES,
): boolean {
  return w.attempts > maxAttempts || w.failures >= maxFailures;
}

export function retryAfterSec(w: VaultWindow, now: number, windowMs = VAULT_WINDOW_MS): number {
  return Math.max(1, Math.ceil((w.start + windowMs - now) / 1000));
}
