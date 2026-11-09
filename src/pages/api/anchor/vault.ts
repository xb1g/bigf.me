// Anchor sync vault: stores ONE end-to-end encrypted blob (the server never sees plaintext).
// GET  → { rev, blob, updatedAt } | { rev: 0, blob: null }
// PUT  { ifRev, blob } → { rev, updatedAt } | 409 { rev }
// Auth: Authorization: Bearer <ANCHOR_SYNC_TOKEN>. Never logs the blob or the token.
// When the token is unset this answers 503 { error: 'sync_not_configured' } and does not touch the database.
import type { APIRoute } from 'astro';
import { createHash, timingSafeEqual } from 'node:crypto';
import {
  VAULT_WINDOW_MS, retryAfterSec, utf8ByteLength, windowLimited,
} from '../../../anchor/core/vault-guard.ts';
import type { VaultWindow } from '../../../anchor/core/vault-guard.ts';

export const prerender = false;

const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_BLOB_BYTES + 4096;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

type Row = { rev: number; blob: string; updated_at: string };
type Db = Awaited<ReturnType<typeof getDb>>;

function json(status: number, body: unknown, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });
}

function configuredToken(): string | undefined {
  const fromVite = import.meta.env.ANCHOR_SYNC_TOKEN as string | undefined;
  const fromProcess = typeof process !== 'undefined' ? process.env.ANCHOR_SYNC_TOKEN : undefined;
  const t = fromVite || fromProcess;
  return t && t.trim() ? t : undefined;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest();

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : '';
}

/** null when authorised; otherwise the error response. Caller must already know a token is configured. */
function authorize(request: Request): Response | null {
  const expected = configuredToken();
  if (!expected) return json(503, { error: 'sync_not_configured' });
  const given = bearerToken(request);
  // Hash both sides so lengths match and comparison time doesn't leak the token.
  const ok = timingSafeEqual(sha256(given), sha256(expected)) && given.length > 0;
  return ok ? null : json(401, { error: 'unauthorized' });
}

function clientIp(request: Request, clientAddress: string | undefined): string {
  const direct = clientAddress?.trim();
  if (direct) return direct;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Bucket id. The token peppers it so a database dump is not a list of client addresses. */
function bucketId(ip: string): string {
  const pepper = configuredToken() ?? '';
  return createHash('sha256').update(`anchor-rl\0${pepper}\0${ip}`).digest('hex');
}

function isB64(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 4 && v.length % 4 === 0 && B64_RE.test(v);
}

function isEnvelopeString(blob: string): boolean {
  let env: unknown;
  try {
    env = JSON.parse(blob);
  } catch {
    return false;
  }
  if (!env || typeof env !== 'object' || Array.isArray(env)) return false;
  const e = env as Record<string, unknown>;
  return e.v === 1 && isB64(e.salt) && isB64(e.iv) && isB64(e.ct);
}

let tableReady: Promise<void> | null = null;
/** This instance's copy of the window, used only when the database cannot be reached. */
const memoryBuckets = new Map<string, VaultWindow>();

async function getDb() {
  const { db } = await import('../../../lib/db');
  if (!tableReady) {
    tableReady = db
      .execute(`CREATE TABLE IF NOT EXISTS anchor_vault (
        id TEXT PRIMARY KEY,
        rev INTEGER NOT NULL,
        blob TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)
      .then(() => db.execute(`CREATE TABLE IF NOT EXISTS anchor_vault_rl (
        id TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        attempts INTEGER NOT NULL,
        failures INTEGER NOT NULL
      )`))
      .then(() => undefined)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  await tableReady;
  return db;
}

function rateLimited(w: VaultWindow, now: number): Response {
  const sec = retryAfterSec(w, now);
  return json(429, { error: 'rate_limited', retryAfterSec: sec }, { 'Retry-After': String(sec) });
}

function rowWindow(row: Record<string, unknown> | undefined, now: number): VaultWindow {
  if (!row) return { start: now, attempts: 0, failures: 0 };
  return { start: Number(row.window_start), attempts: Number(row.attempts), failures: Number(row.failures) };
}

/**
 * Count one request (or one rejected token) in a single statement, so parallel guesses can't
 * all read the same count. Falls back to this instance's memory if the database is down.
 */
async function charge(id: string, kind: 'attempt' | 'failure', now: number): Promise<VaultWindow> {
  const reset = VAULT_WINDOW_MS;
  try {
    const db = await getDb();
    const sql = kind === 'attempt'
      ? `INSERT INTO anchor_vault_rl (id, window_start, attempts, failures) VALUES (?1, ?2, 1, 0)
         ON CONFLICT(id) DO UPDATE SET
           window_start = CASE WHEN ?2 - anchor_vault_rl.window_start >= ?3 THEN ?2 ELSE anchor_vault_rl.window_start END,
           attempts = CASE WHEN ?2 - anchor_vault_rl.window_start >= ?3 THEN 1 ELSE anchor_vault_rl.attempts + 1 END,
           failures = CASE WHEN ?2 - anchor_vault_rl.window_start >= ?3 THEN 0 ELSE anchor_vault_rl.failures END
         RETURNING window_start, attempts, failures`
      : `INSERT INTO anchor_vault_rl (id, window_start, attempts, failures) VALUES (?1, ?2, 0, 1)
         ON CONFLICT(id) DO UPDATE SET
           window_start = CASE WHEN ?2 - anchor_vault_rl.window_start >= ?3 THEN ?2 ELSE anchor_vault_rl.window_start END,
           attempts = CASE WHEN ?2 - anchor_vault_rl.window_start >= ?3 THEN 0 ELSE anchor_vault_rl.attempts END,
           failures = CASE WHEN ?2 - anchor_vault_rl.window_start >= ?3 THEN 1 ELSE anchor_vault_rl.failures + 1 END
         RETURNING window_start, attempts, failures`;
    const rs = await db.execute({ sql, args: [id, now, reset] });
    const w = rowWindow(rs.rows[0] as unknown as Record<string, unknown> | undefined, now);
    memoryBuckets.set(id, w);
    return w;
  } catch {
    const prev = memoryBuckets.get(id);
    const expired = !prev || now - prev.start >= VAULT_WINDOW_MS;
    const base: VaultWindow = expired || !prev ? { start: now, attempts: 0, failures: 0 } : { ...prev };
    const w = kind === 'attempt'
      ? { ...base, attempts: base.attempts + 1 }
      : { ...base, failures: base.failures + 1 };
    memoryBuckets.set(id, w);
    return w;
  }
}

/**
 * 503 when sync is not configured (no database, no limiter).
 * 429 when this client is over the window. Otherwise null, and a presented bad token is counted.
 */
async function gate(request: Request, clientAddress: string | undefined): Promise<Response | null> {
  if (!configuredToken()) return json(503, { error: 'sync_not_configured' });
  const now = Date.now();
  const id = bucketId(clientIp(request, clientAddress));
  const attempt = await charge(id, 'attempt', now);
  if (windowLimited(attempt)) return rateLimited(attempt, now);
  const denied = authorize(request);
  if (!denied) return null;
  // A missing token is not a guess. Only a presented bearer token spends the failure budget.
  if (bearerToken(request)) await charge(id, 'failure', now);
  return denied;
}

async function currentRow(db: Db): Promise<Row | null> {
  const res = await db.execute({ sql: `SELECT rev, blob, updated_at FROM anchor_vault WHERE id = 'main'`, args: [] });
  const r = res.rows[0];
  if (!r) return null;
  return { rev: Number(r.rev), blob: String(r.blob), updated_at: String(r.updated_at) };
}

function serverError(): Response {
  console.error('[anchor/vault] storage error');
  return json(500, { error: 'server_error' });
}

/** Read the body, stopping once it passes `maxBytes`. Content-Length is bytes; so is this check. */
async function readBody(request: Request, maxBytes: number): Promise<
  { ok: true; bytes: number; text: string } | { ok: false; reason: 'too_large' | 'bad_body' }
> {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) return { ok: false, reason: 'bad_body' };
    if (n > maxBytes) return { ok: false, reason: 'too_large' };
  }
  const stream = request.body;
  if (!stream) return { ok: true, bytes: 0, text: '' };
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'bad_body' };
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return { ok: true, bytes: total, text: new TextDecoder().decode(buf) };
}

function addressOf(context: { clientAddress?: string }): string | undefined {
  try {
    return typeof context.clientAddress === 'string' ? context.clientAddress : undefined;
  } catch {
    return undefined;
  }
}

export const GET: APIRoute = async (context) => {
  const denied = await gate(context.request, addressOf(context));
  if (denied) return denied;
  try {
    const db = await getDb();
    const row = await currentRow(db);
    if (!row) return json(200, { rev: 0, blob: null });
    return json(200, { rev: row.rev, blob: row.blob, updatedAt: row.updated_at });
  } catch {
    return serverError();
  }
};

export const PUT: APIRoute = async (context) => {
  const denied = await gate(context.request, addressOf(context));
  if (denied) return denied;

  const read = await readBody(context.request, MAX_BODY_BYTES);
  if (!read.ok) return json(400, { error: read.reason === 'too_large' ? 'too_large' : 'bad_body' });

  let body: unknown;
  try {
    body = JSON.parse(read.text);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'invalid_body' });
  const { ifRev, blob } = body as { ifRev?: unknown; blob?: unknown };
  if (typeof ifRev !== 'number' || !Number.isInteger(ifRev) || ifRev < 0) return json(400, { error: 'invalid_ifRev' });
  if (typeof blob !== 'string') return json(400, { error: 'invalid_blob' });
  if (utf8ByteLength(blob) > MAX_BLOB_BYTES) return json(400, { error: 'too_large' });
  if (!isEnvelopeString(blob)) return json(400, { error: 'invalid_envelope' });

  try {
    const db = await getDb();
    const updatedAt = new Date().toISOString();
    const nextRev = ifRev + 1;
    // Optimistic concurrency without a read-modify-write race:
    // first write inserts only if no row exists; later writes update only if rev still matches.
    const res = ifRev === 0
      ? await db.execute({
          sql: `INSERT INTO anchor_vault (id, rev, blob, updated_at) VALUES ('main', ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
          args: [nextRev, blob, updatedAt],
        })
      : await db.execute({
          sql: `UPDATE anchor_vault SET rev = ?, blob = ?, updated_at = ? WHERE id = 'main' AND rev = ?`,
          args: [nextRev, blob, updatedAt, ifRev],
        });
    if (res.rowsAffected === 1) return json(200, { rev: nextRev, updatedAt });
    const row = await currentRow(db);
    return json(409, { rev: row ? row.rev : 0 });
  } catch {
    return serverError();
  }
};

export const ALL: APIRoute = async () => json(405, { error: 'method_not_allowed' });
