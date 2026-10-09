import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Draft, DraftInput } from '@lfwa/core'

/** Storage port for drafts. */
export interface DraftRepository {
  list(): Draft[]
  get(id: string): Draft | undefined
  create(input: DraftInput): Draft
  update(id: string, input: DraftInput): Draft | undefined
  delete(id: string): boolean
}

export class SqliteDraftRepository implements DraftRepository {
  private readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
  }

  list(): Draft[] {
    return this.db.prepare('SELECT * FROM drafts ORDER BY updated_at DESC').all().map(toDraft)
  }

  get(id: string): Draft | undefined {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id)
    return row ? toDraft(row) : undefined
  }

  create(input: DraftInput): Draft {
    const now = new Date().toISOString()
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO drafts (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, input.title, input.body, now, now)
    return this.get(id)!
  }

  update(id: string, input: DraftInput): Draft | undefined {
    const result = this.db
      .prepare('UPDATE drafts SET title = ?, body = ?, updated_at = ? WHERE id = ?')
      .run(input.title, input.body, new Date().toISOString(), id)
    return result.changes ? this.get(id) : undefined
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM drafts WHERE id = ?').run(id).changes > 0
  }
}

function toDraft(row: Record<string, unknown>): Draft {
  return {
    id: row.id as string,
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}
