import type { APIRoute } from 'astro'
import { db } from '../../../lib/db'

export const POST: APIRoute = async ({ request }) => {
  const { content, has_notebook_photo } = await request.json()

  if (!content?.trim()) {
    return new Response(JSON.stringify({ error: 'Content required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const id = crypto.randomUUID()
  await db.execute({
    sql: `INSERT INTO thoughts (id, content, has_notebook_photo) VALUES (?, ?, ?)`,
    args: [id, content.trim(), has_notebook_photo ? 1 : 0],
  })

  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
