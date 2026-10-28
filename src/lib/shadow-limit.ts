// Limits Shadow Catcher PIN tries, per IP and for everyone, in the database so it holds across serverless instances.
// Every try is counted before the PIN is checked, so a burst of parallel requests can't slip past the limit.
import type { Client } from '@libsql/client'

export interface TryRule { maxTries: number; windowMs: number }

/** One IP: 5 tries per 15 minutes. A correct PIN resets it. */
export const IP_RULE: TryRule = { maxTries: 5, windowMs: 15 * 60_000 }
/** Everyone together: 30 tries per hour, so guesses spread over many IPs stay slow. */
export const GLOBAL_RULE: TryRule = { maxTries: 30, windowMs: 60 * 60_000 }

/** Milliseconds until another try is allowed (0 = this try may be checked). */
export function waitAfterTry(tries: number, windowStart: number, rule: TryRule, now: number): number {
  if (tries <= rule.maxTries) return 0
  return Math.max(0, windowStart + rule.windowMs - now)
}

let tableReady: Promise<unknown> | null = null

function ensureTable(client: Client) {
  tableReady ??= client.execute(`CREATE TABLE IF NOT EXISTS shadow_auth_tries (
    scope TEXT PRIMARY KEY,
    tries INTEGER NOT NULL,
    window_start INTEGER NOT NULL
  )`).catch((err: unknown) => {
    tableReady = null
    throw err
  })
  return tableReady
}

async function countTry(client: Client, scope: string, rule: TryRule, now: number): Promise<number> {
  const rs = await client.execute({
    sql: `INSERT INTO shadow_auth_tries (scope, tries, window_start) VALUES (?1, 1, ?2)
      ON CONFLICT(scope) DO UPDATE SET
        tries = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE tries + 1 END,
        window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
      RETURNING tries, window_start`,
    args: [scope, now, rule.windowMs],
  })
  const row = rs.rows[0]
  return waitAfterTry(Number(row.tries), Number(row.window_start), rule, now)
}

/** Count one PIN try from this IP. Returns milliseconds to wait; 0 means go ahead and check the PIN. */
export async function countShadowTry(client: Client, ip: string, now = Date.now()): Promise<number> {
  await ensureTable(client)
  const ipWait = await countTry(client, `ip:${ip}`, IP_RULE, now)
  const globalWait = await countTry(client, 'global', GLOBAL_RULE, now)
  return Math.max(ipWait, globalWait)
}

/** After a correct PIN, this IP starts fresh. */
export async function clearShadowTries(client: Client, ip: string): Promise<void> {
  await ensureTable(client)
  await client.execute({ sql: 'DELETE FROM shadow_auth_tries WHERE scope = ?', args: [`ip:${ip}`] })
}

/** Test hook: forget the cached CREATE TABLE between in-memory databases. */
export function resetShadowLimitForTests() {
  tableReady = null
}
