import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { AstroCookies } from 'astro'

export const shadowCookieName = 'shadow_session'
export const shadowSessionMaxAge = 30 * 24 * 60 * 60
export const shadowCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/api/shadow',
}

function sessionKey() {
  const secret = import.meta.env.SHADOW_SESSION_SECRET
  if (secret) return secret
  const pin = import.meta.env.SHADOW_PIN
  return pin ? createHash('sha256').update(`bigf.me/shadow-session/v1\0${pin}`).digest() : null
}

export function verifyShadowPin(pin: unknown) {
  const expected = import.meta.env.SHADOW_PIN
  const actualHash = createHash('sha256').update(typeof pin === 'string' ? pin : '').digest()
  const expectedHash = createHash('sha256').update(expected || '').digest()
  return timingSafeEqual(actualHash, expectedHash) && typeof pin === 'string' && !!expected
}

export function createShadowSession() {
  const key = sessionKey()
  if (!key) throw new Error('Shadow authentication is not configured')
  const expiry = String(Math.floor(Date.now() / 1000) + shadowSessionMaxAge)
  const signature = createHmac('sha256', key).update(expiry).digest('hex')
  return `${expiry}.${signature}`
}

export function requireShadowSession(cookies: AstroCookies) {
  const token = cookies.get(shadowCookieName)?.value || ''
  const key = sessionKey()
  if (key && /^\d{10}\.[a-f0-9]{64}$/.test(token)) {
    const [expiry, signature] = token.split('.')
    const expected = createHmac('sha256', key).update(expiry).digest()
    if (timingSafeEqual(Buffer.from(signature, 'hex'), expected) && Number(expiry) > Date.now() / 1000) {
      return null
    }
  }
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
