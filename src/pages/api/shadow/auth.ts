import type { APIContext, APIRoute } from 'astro'
import { db } from '../../../lib/db'
import { clearShadowTries, countShadowTry } from '../../../lib/shadow-limit'
import {
  createShadowSession,
  requireShadowSession,
  shadowAuthConfigured,
  shadowCookieName,
  shadowCookieOptions,
  shadowSessionMaxAge,
  verifyShadowPin,
} from '../../../lib/shadow-session'

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

export const GET: APIRoute = async ({ cookies }) => {
  return requireShadowSession(cookies) || new Response(JSON.stringify({ ok: true }), { headers })
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } })
}

// Vercel sets the client address and overwrites forwarded headers, so it can't be spoofed by the caller.
function clientIp(context: APIContext) {
  try {
    return context.clientAddress
  } catch {
    return context.request.headers.get('x-real-ip') || 'unknown'
  }
}

export const POST: APIRoute = async (context) => {
  const { request, cookies } = context
  if (!shadowAuthConfigured()) return json({ ok: false, error: 'not_configured' }, 503)

  const ip = clientIp(context)
  let waitMs: number
  try {
    waitMs = await countShadowTry(db, ip)
  } catch {
    return json({ ok: false, error: 'unavailable' }, 503)
  }
  if (waitMs > 0) {
    const retryAfter = Math.ceil(waitMs / 1000)
    return json({ ok: false, error: 'too_many_tries', retryAfter }, 429, { 'Retry-After': String(retryAfter) })
  }

  const body = await request.json().catch(() => null)
  if (!verifyShadowPin(body?.pin)) {
    await new Promise(resolve => setTimeout(resolve, 400))
    return json({ ok: false }, 401)
  }

  await clearShadowTries(db, ip).catch(() => {})
  cookies.set(shadowCookieName, createShadowSession(), {
    ...shadowCookieOptions,
    maxAge: shadowSessionMaxAge,
  })
  return json({ ok: true })
}

export const DELETE: APIRoute = async ({ cookies }) => {
  cookies.delete(shadowCookieName, shadowCookieOptions)
  return new Response(JSON.stringify({ ok: true }), { headers })
}
