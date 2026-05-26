import type { APIRoute } from 'astro'

export const POST: APIRoute = async ({ request }) => {
  const { pin } = await request.json()
  const expected = import.meta.env.SHADOW_PIN

  if (!expected || pin !== expected) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
