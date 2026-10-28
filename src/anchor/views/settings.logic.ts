// Settings — pure helpers (no window/document). Export/import shaping, sync response handling,
// PIN/passphrase validation and the copy that goes with them.

import type { AnchorState, SyncMeta } from '../core/types.ts';
import { isValidPin, isEnvelope } from '../core/crypto.ts';
import type { Envelope } from '../core/crypto.ts';
import { formatDateTime } from '../core/dates.ts';
import { MAX_STATE_BYTES } from '../core/constants.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VAULT_URL = '/api/anchor/vault';
/** Device-local keys (prefix 'anchor:' so eraseAll removes them). */
export const TOKEN_KEY = 'anchor:sync:token';
export const PASS_KEY = 'anchor:sync:pass';
/**
 * Largest backup file we try to read: room for a state at MAX_STATE_BYTES even inside an encrypted backup,
 * whose ciphertext is base64 (4/3 of the plain bytes) plus a small envelope.
 */
export const MAX_IMPORT_BYTES = 6 * 1024 * 1024;
/** Server limit for the encrypted blob. */
export const MAX_SYNC_BLOB_BYTES = 2 * 1024 * 1024;
export const MIN_PASSPHRASE = 8;
export const SYNC_TIMEOUT_MS = 20_000;

export const TALK_TARGET_MIN = 1;
export const TALK_TARGET_MAX = 50;
export const MAX_BETS_MIN = 1;
export const MAX_BETS_MAX = 6;

/** Build share targets offered (value = string form of the 0..1 share). */
export const BUILD_TARGET_OPTIONS: readonly { value: string; label: string; ariaLabel: string }[] =
  [0.3, 0.4, 0.5, 0.6, 0.7].map((v) => ({
    value: String(v),
    label: `${Math.round(v * 100)}%`,
    ariaLabel: `${Math.round(v * 100)}% build, ${Math.round((1 - v) * 100)}% sell`,
  }));

export const LOCK_AFTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '0', label: 'Right away' },
  { value: '1', label: '1 min' },
  { value: '5', label: '5 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
];

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Pick the offered option matching a stored build share (tolerates float noise). */
export function buildTargetValue(target: number): string {
  const hit = BUILD_TARGET_OPTIONS.find((o) => Math.abs(Number(o.value) - target) < 0.001);
  return hit ? hit.value : '';
}

export function buildTargetSummary(target: number): string {
  const b = Math.round(target * 100);
  return `${b}% build · ${100 - b}% sell & talk`;
}

/** A calm note when the WIP limit is below the bets already active. */
export function maxBetsNote(activeCount: number, max: number): string | null {
  if (activeCount <= max) return null;
  const extra = activeCount - max;
  return `You have ${activeCount} active bets. Park ${extra} on the Bets screen to get under the limit.`;
}

export function lockAfterLabel(min: number): string {
  if (min <= 0) return 'as soon as you leave the app';
  return `after ${min} minute${min === 1 ? '' : 's'} away`;
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

/**
 * Data to export or sync: everything except this device's PIN hash and sync bookkeeping.
 * (A PIN hash is short-secret material; the sync revision belongs to each device.)
 */
export function exportPayload(state: AnchorState): AnchorState {
  const copy = JSON.parse(JSON.stringify(state)) as AnchorState;
  copy.lock = { lockAfterMin: state.lock.lockAfterMin };
  copy.sync = { rev: 0 };
  return copy;
}

/** A plain backup's text: compact JSON (indenting would add about a third, for no one to read). */
export function exportText(state: AnchorState): string {
  return JSON.stringify(exportPayload(state));
}

/** Shown after a backup is saved whose data is more than an import can bring back (MAX_STATE_BYTES). */
export const BACKUP_TOO_BIG_COPY = 'Saved, but this backup is bigger than Anchor can restore. Keep it, and keep an older one too.';

/** True when a backup holding `payloadJson` could not be imported again on this device (see prepareImport). */
export function backupTooBigToRestore(payloadJson: string): boolean {
  return utf8Bytes(payloadJson) > MAX_STATE_BYTES;
}

export function backupFilename(today: string, encrypted: boolean): string {
  return `anchor-backup-${today}${encrypted ? '.encrypted' : ''}.json`;
}

const KNOWN_KEYS = ['profile', 'days', 'bets', 'timeLog', 'escapes', 'parking', 'funnel', 'talks', 'heavy', 'worries', 'reviews'];

/** True when an object plausibly is Anchor data (schemaVersion 1 or any known collection). */
export function looksLikeAnchor(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion === 1) return true;
  return KNOWN_KEYS.some((k) => k in o && o[k] !== null && typeof o[k] === 'object');
}

export type ParsedBackup =
  | { kind: 'plain'; data: Record<string, unknown> }
  | { kind: 'encrypted'; envelope: Envelope }
  | { kind: 'invalid'; message: string };

export const IMPORT_COPY = {
  notJson: 'That file isn’t a backup Anchor can read.',
  notAnchor: 'That file doesn’t look like an Anchor backup.',
  tooBig: 'That file is too big to be an Anchor backup.',
  empty: 'That file is empty.',
  damaged: 'That file can’t be read. It may be damaged.',
  needPass: 'Enter the passphrase for this file.',
  tooBigOpened: 'That backup holds more than this device can keep. Nothing was changed.',
  changedMeanwhile: 'This device’s data changed while that was open. Nothing was imported. Try again.',
} as const;

/** Copy for a failed decrypt of an imported file. */
export function importErrorCopy(code: SyncErrorCode): string {
  if (code === 'wrong_passphrase') return SYNC_ERROR_COPY.wrong_passphrase;
  if (code === 'bad_envelope') return IMPORT_COPY.damaged;
  if (code === 'insecure') return SYNC_ERROR_COPY.insecure;
  return SYNC_ERROR_COPY.unknown;
}

/** Classify a backup file's text. Never throws. */
export function parseBackupText(text: string): ParsedBackup {
  if (!text.trim()) return { kind: 'invalid', message: IMPORT_COPY.empty };
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return { kind: 'invalid', message: IMPORT_COPY.notJson };
  }
  if (isEnvelope(raw)) return { kind: 'encrypted', envelope: raw };
  if (looksLikeAnchor(raw)) return { kind: 'plain', data: raw };
  return { kind: 'invalid', message: IMPORT_COPY.notAnchor };
}

export interface CountRow { key: string; label: string; count: number }

/** Counts used in the import/pull preview. */
export function backupCounts(s: AnchorState): CountRow[] {
  const daysUsed = Object.values(s.days).filter((d) =>
    Boolean(d.anchor?.text || d.actions.length || d.checkin || d.shutdown)).length;
  return [
    { key: 'bets', label: 'Bets', count: s.bets.length },
    { key: 'talks', label: 'Talks', count: s.talks.length },
    { key: 'funnel', label: 'Funnel rows', count: s.funnel.length },
    { key: 'days', label: 'Days logged', count: daysUsed },
    { key: 'timeLog', label: 'Time blocks', count: s.timeLog.length },
    { key: 'escapes', label: 'Escape checks', count: s.escapes.length },
    { key: 'parking', label: 'Parked ideas', count: s.parking.length },
    { key: 'heavy', label: 'Heavy items', count: s.heavy.length },
    { key: 'worries', label: 'Worries', count: s.worries.length },
    { key: 'reviews', label: 'Weekly reviews', count: s.reviews.length },
  ];
}

export interface PreviewRow { key: string; label: string; current: number; incoming: number }

export function previewRows(current: AnchorState, incoming: AnchorState): PreviewRow[] {
  const a = backupCounts(current);
  const b = backupCounts(incoming);
  return a.map((r, i) => ({ key: r.key, label: r.label, current: r.count, incoming: b[i].count }));
}

export function totalItems(s: AnchorState): number {
  return backupCounts(s).reduce((n, r) => n + r.count, 0);
}

/** One calm line about what is on this device. */
export function deviceSummary(s: AnchorState, bytes: number): string {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  return [
    n(s.bets.length, 'bet', 'bets'),
    n(s.talks.length, 'talk', 'talks'),
    n(s.funnel.length, 'funnel row', 'funnel rows'),
    `about ${formatBytes(bytes)}`,
  ].join(' · ');
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function newPinIssue(pin: string, repeat: string): string | null {
  if (!isValidPin(pin)) return 'Use 4 to 8 digits.';
  if (pin !== repeat) return 'Those PINs don’t match.';
  return null;
}

/** For a passphrase that will encrypt something new. */
export function newPassphraseIssue(pass: string, repeat?: string): string | null {
  if (!pass) return 'Enter a passphrase.';
  if (pass.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`;
  if (repeat !== undefined && pass !== repeat) return 'Those passphrases don’t match.';
  return null;
}

export function tokenIssue(token: string): string | null {
  return token.trim() ? null : 'Add your sync token first.';
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncErrorCode =
  | 'offline' | 'timeout' | 'unauthorized' | 'not_configured' | 'too_large' | 'bad_request'
  | 'server' | 'wrong_passphrase' | 'bad_envelope' | 'not_anchor' | 'insecure'
  | 'missing_token' | 'missing_pass' | 'short_pass' | 'replaced' | 'replaced_after_push' | 'state_too_large' | 'unknown';

export const SYNC_ERROR_COPY: Record<SyncErrorCode, string> = {
  offline: 'Can’t reach the server. You may be offline — your data is safe here. Try again when you’re connected.',
  timeout: 'The server took too long. Try again in a minute.',
  unauthorized: 'The sync token doesn’t match. Check it and try again.',
  not_configured: 'Sync isn’t set up on the server yet. Backups still work.',
  too_large: 'Your data is over the 2 MB sync limit. Download a backup instead.',
  bad_request: 'The server didn’t accept that. Try again.',
  server: 'The server had a problem. Try again in a minute.',
  wrong_passphrase: 'Wrong passphrase.',
  bad_envelope: 'The server copy can’t be read. It may be damaged.',
  not_anchor: 'The server copy isn’t Anchor data.',
  insecure: 'Encryption needs a secure connection (https).',
  missing_token: 'Add your sync token first.',
  missing_pass: 'Enter your passphrase first.',
  short_pass: `Use a passphrase of at least ${MIN_PASSPHRASE} characters.`,
  replaced: 'This device’s data was replaced or erased while syncing, so that sync stopped. Nothing here changed. Try again.',
  state_too_large: 'The server copy holds more than this device can keep. Nothing here changed.',
  replaced_after_push: 'Pushed, but this device’s data was replaced meanwhile, so it isn’t marked as synced. Push or pull again to match.',
  unknown: 'Something went wrong. Your data on this device is unchanged.',
};

export function syncErrorCopy(code: SyncErrorCode): string {
  return SYNC_ERROR_COPY[code] ?? SYNC_ERROR_COPY.unknown;
}

export type HttpOutcome =
  | { kind: 'ok' }
  | { kind: 'conflict'; rev: number }
  | { kind: 'error'; code: SyncErrorCode };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isRev = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0;

/** Map a vault HTTP status + JSON body to an outcome. */
export function classifyHttp(status: number, body: unknown): HttpOutcome {
  const err = isObj(body) && typeof body.error === 'string' ? body.error : '';
  if (status >= 200 && status < 300) return { kind: 'ok' };
  if (status === 409) return isObj(body) && isRev(body.rev) ? { kind: 'conflict', rev: body.rev } : { kind: 'error', code: 'server' };
  if (status === 401 || status === 403) return { kind: 'error', code: 'unauthorized' };
  if (status === 503 && err === 'sync_not_configured') return { kind: 'error', code: 'not_configured' };
  if (status === 400 || status === 413) return { kind: 'error', code: err === 'too_large' || status === 413 ? 'too_large' : 'bad_request' };
  return { kind: 'error', code: 'server' };
}

export interface VaultGet { rev: number; blob: string | null; updatedAt?: string }
export interface VaultPut { rev: number; updatedAt: string }

/** Validate a GET 200 body. null = malformed. */
export function parseGetBody(body: unknown): VaultGet | null {
  if (!isObj(body) || !isRev(body.rev)) return null;
  if (body.blob !== null && typeof body.blob !== 'string') return null;
  const out: VaultGet = { rev: body.rev, blob: body.blob as string | null };
  if (typeof body.updatedAt === 'string') out.updatedAt = body.updatedAt;
  return out;
}

/** Validate a PUT 200 body. null = malformed. */
export function parsePutBody(body: unknown): VaultPut | null {
  if (!isObj(body) || !isRev(body.rev) || typeof body.updatedAt !== 'string') return null;
  return { rev: body.rev, updatedAt: body.updatedAt };
}

/** Turn a thrown error (fetch, crypto, abort) into a sync error code. */
export function errorCodeOf(err: unknown, online = true): SyncErrorCode {
  const e = (err ?? {}) as { name?: unknown; code?: unknown; message?: unknown };
  if (e.code === 'wrong_passphrase') return 'wrong_passphrase';
  if (e.code === 'bad_envelope') return 'bad_envelope';
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return 'timeout';
  if (typeof e.message === 'string' && /secure context/i.test(e.message)) return 'insecure';
  if (!online) return 'offline';
  if (e.name === 'TypeError') return 'offline';
  return 'unknown';
}

/** Byte length of a UTF-8 string (pure; no TextEncoder needed). */
export function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/**
 * True when this device has changes the server copy doesn't have.
 * Exact when the last push/pull recorded the updatedAt it matched (sync.syncedUpdatedAt). Older data
 * without it falls back to comparing times, with a small slack for the bookkeeping write.
 */
export function hasUnsyncedChanges(state: Pick<AnchorState, 'updatedAt' | 'sync'>, slackMs = 2000): boolean {
  if (!state.sync.lastSyncedAt) return true;
  if (state.sync.syncedUpdatedAt) return state.updatedAt !== state.sync.syncedUpdatedAt;
  const u = Date.parse(state.updatedAt);
  const s = Date.parse(state.sync.lastSyncedAt);
  if (Number.isNaN(u) || Number.isNaN(s)) return true;
  return u - s > slackMs;
}

export function syncStatusText(sync: SyncMeta): string {
  if (!sync.lastSyncedAt) return sync.rev > 0 ? `Server revision ${sync.rev}. Not synced from this device yet.` : 'Not synced from this device yet.';
  return `Last synced ${formatDateTime(sync.lastSyncedAt)} · revision ${sync.rev}`;
}

export function conflictText(localRev: number, serverRev: number): string {
  const here = localRev > 0 ? `this device last synced revision ${localRev}` : 'this device hasn’t synced yet';
  return `The server has a newer copy (revision ${serverRev}), and ${here}. Pick which one to keep.`;
}

export function pushedMessage(rev: number): string {
  return `Pushed. The server is at revision ${rev}.`;
}

export function pulledMessage(rev: number): string {
  return `Pulled revision ${rev}. This device now matches the server.`;
}
