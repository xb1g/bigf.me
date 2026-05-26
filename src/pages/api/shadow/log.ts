import type { APIRoute } from 'astro'
import { db } from '../../../lib/db'

export const POST: APIRoute = async ({ request }) => {
  const { behavior, trigger, duration_min } = await request.json()

  if (!behavior?.trim()) {
    return new Response(JSON.stringify({ error: 'Behavior required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO shadows (id, behavior, trigger, duration_min) VALUES (?, ?, ?, ?)`,
    args: [id, behavior.trim(), trigger?.trim() || null, duration_min || null],
  })

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
