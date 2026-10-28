import type { APIRoute } from 'astro'
import { requireShadowSession } from '../../../lib/shadow-session'
import { db } from '../../../lib/db'
import { uploadToB2 } from '../../../lib/b2'

export const POST: APIRoute = async ({ request, cookies }) => {
  const unauthorized = requireShadowSession(cookies)
  if (unauthorized) return unauthorized
  const formData = await request.formData()
  const file = formData.get('file') as File
  const type = (formData.get('type') as string) || 'notebook'
  const linked_thought_id = formData.get('linked_thought_id') as string | null

  if (!file) {
    return new Response(JSON.stringify({ error: 'File required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = await uploadToB2(file)
  const id = crypto.randomUUID()

  await db.execute({
    sql: `INSERT INTO photos (id, url, type, linked_thought_id) VALUES (?, ?, ?, ?)`,
    args: [id, url, type, linked_thought_id || null],
  })

  return new Response(JSON.stringify({ ok: true, url }), {
    headers: { 'Content-Type': 'application/json' },
  })
}
