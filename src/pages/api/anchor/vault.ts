// Anchor sync vault: stores ONE end-to-end encrypted blob (the server never sees plaintext).
// GET  → { rev, blob, updatedAt } | { rev: 0, blob: null }
// PUT  { ifRev, blob } → { rev, updatedAt } | 409 { rev }
// Auth: Authorization: Bearer <ANCHOR_SYNC_TOKEN>. Never logs the blob or the token.
import type { APIRoute } from 'astro';
import { createHash, timingSafeEqual } from 'node:crypto';

export const prerender = false;

const MAX_BLOB_BYTES = 2 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_BLOB_BYTES + 4096;
const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

type Row = { rev: number; blob: string; updated_at: string };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
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

/** null when authorised; otherwise the error response. */
function authorize(request: Request): Response | null {
  const expected = configuredToken();
  if (!expected) return json(503, { error: 'sync_not_configured' });
  const header = request.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const given = m ? m[1].trim() : '';
  // Hash both sides so lengths match and comparison time doesn't leak the token.
  const ok = timingSafeEqual(sha256(given), sha256(expected)) && given.length > 0;
  return ok ? null : json(401, { error: 'unauthorized' });
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
      .then(() => undefined)
      .catch((err) => {
        tableReady = null;
        throw err;
      });
  }
  await tableReady;
  return db;
}

async function currentRow(db: Awaited<ReturnType<typeof getDb>>): Promise<Row | null> {
  const res = await db.execute({ sql: `SELECT rev, blob, updated_at FROM anchor_vault WHERE id = 'main'`, args: [] });
  const r = res.rows[0];
  if (!r) return null;
  return { rev: Number(r.rev), blob: String(r.blob), updated_at: String(r.updated_at) };
}

function serverError(): Response {
  console.error('[anchor/vault] storage error');
  return json(500, { error: 'server_error' });
}

export const GET: APIRoute = async ({ request }) => {
  const denied = authorize(request);
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

export const PUT: APIRoute = async ({ request }) => {
  const denied = authorize(request);
  if (denied) return denied;

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json(400, { error: 'too_large' });
  let text: string;
  try {
    text = await request.text();
  } catch {
    return json(400, { error: 'bad_body' });
  }
  if (text.length > MAX_BODY_BYTES) return json(400, { error: 'too_large' });

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'invalid_body' });
  const { ifRev, blob } = body as { ifRev?: unknown; blob?: unknown };
  if (typeof ifRev !== 'number' || !Number.isInteger(ifRev) || ifRev < 0) return json(400, { error: 'invalid_ifRev' });
  if (typeof blob !== 'string') return json(400, { error: 'invalid_blob' });
  if (blob.length > MAX_BLOB_BYTES) return json(400, { error: 'too_large' });
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
