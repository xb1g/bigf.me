import type { APIRoute } from 'astro'
import {
  createShadowSession,
  requireShadowSession,
  shadowCookieName,
  shadowCookieOptions,
  shadowSessionMaxAge,
  verifyShadowPin,
} from '../../../lib/shadow-session'

const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }

export const GET: APIRoute = async ({ cookies }) => {
  return requireShadowSession(cookies) || new Response(JSON.stringify({ ok: true }), { headers })
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => null)

  if (!verifyShadowPin(body?.pin)) {
    await new Promise(resolve => setTimeout(resolve, 400))
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers,
    })
  }

  cookies.set(shadowCookieName, createShadowSession(), {
    ...shadowCookieOptions,
    maxAge: shadowSessionMaxAge,
  })
  return new Response(JSON.stringify({ ok: true }), { headers })
}

export const DELETE: APIRoute = async ({ cookies }) => {
  cookies.delete(shadowCookieName, shadowCookieOptions)
  return new Response(JSON.stringify({ ok: true }), { headers })
}
