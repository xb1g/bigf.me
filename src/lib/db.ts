import { createClient } from '@libsql/client'

export const db = createClient({
  url: import.meta.env.TURSO_DATABASE_URL,
  authToken: import.meta.env.TURSO_AUTH_TOKEN,
})

export async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS thoughts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      created_at TEXT DEFAULT (datetime('now')),
      content TEXT NOT NULL,
      has_notebook_photo INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS shadows (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      created_at TEXT DEFAULT (datetime('now')),
      behavior TEXT NOT NULL,
      trigger TEXT,
      duration_min INTEGER
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      created_at TEXT DEFAULT (datetime('now')),
      url TEXT NOT NULL,
      type TEXT DEFAULT 'notebook',
      linked_thought_id TEXT
    );
  `)
}
