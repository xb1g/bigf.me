import type { APIRoute } from 'astro'
import { db } from '../../../lib/db'

// GET: Fetch all shadows
export const GET: APIRoute = async () => {
  try {
    const res = await db.execute({
      sql: `SELECT * FROM shadows ORDER BY created_at DESC`,
      args: [],
    })
    return new Response(JSON.stringify(res.rows), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch shadows' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// POST: Log a new shadow
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

  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

// PUT: Update an existing shadow
export const PUT: APIRoute = async ({ request }) => {
  try {
    const { id, behavior, trigger, duration_min } = await request.json()
    if (!id || !behavior?.trim()) {
      return new Response(JSON.stringify({ error: 'ID and behavior required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await db.execute({
      sql: `UPDATE shadows SET behavior = ?, trigger = ?, duration_min = ? WHERE id = ?`,
      args: [behavior.trim(), trigger?.trim() || null, duration_min || null, id],
    })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to update shadow' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// DELETE: Remove an existing shadow
export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { id } = await request.json()
    if (!id) {
      return new Response(JSON.stringify({ error: 'ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await db.execute({
      sql: `DELETE FROM shadows WHERE id = ?`,
      args: [id],
    })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to delete shadow' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
