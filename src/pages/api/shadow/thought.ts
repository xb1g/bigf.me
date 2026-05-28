import type { APIRoute } from 'astro'
import { db } from '../../../lib/db'

// GET: Fetch all thoughts
export const GET: APIRoute = async () => {
  try {
    const res = await db.execute({
      sql: `SELECT * FROM thoughts ORDER BY created_at DESC`,
      args: [],
    })
    return new Response(JSON.stringify(res.rows), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch thoughts' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// POST: Log a new thought
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

// PUT: Update an existing thought
export const PUT: APIRoute = async ({ request }) => {
  try {
    const { id, content } = await request.json()
    if (!id || !content?.trim()) {
      return new Response(JSON.stringify({ error: 'ID and content required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    await db.execute({
      sql: `UPDATE thoughts SET content = ? WHERE id = ?`,
      args: [content.trim(), id],
    })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to update thought' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// DELETE: Remove an existing thought
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
      sql: `DELETE FROM thoughts WHERE id = ?`,
      args: [id],
    })
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to delete thought' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
