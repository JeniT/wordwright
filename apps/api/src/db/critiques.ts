import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Critique, CritiqueRound } from '@lfwa/core'
import { nowIso } from './database'

/**
 * The rounds of critique a draft has had. What a round pointed out is kept as comments (see `CommentStore`). Callers
 * check that the draft is one the person may reach before asking for its rounds.
 */
export class CritiqueStore {
  constructor(private readonly db: DatabaseSync) {}

  add(draftId: string, critique: Pick<Critique, 'summary' | 'ready'>): CritiqueRound {
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO critique_rounds (id, draft_id, summary, ready, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, draftId, critique.summary, critique.ready ? 1 : 0, nowIso())
    return this.round(id)!
  }

  /** The most recent round for the draft, or undefined if it has never been critiqued. */
  latest(draftId: string): CritiqueRound | undefined {
    const row = this.db
      .prepare(
        'SELECT id FROM critique_rounds WHERE draft_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
      )
      .get(draftId)
    return row ? this.round(row.id as string) : undefined
  }

  /** How many times the draft has been critiqued. */
  count(draftId: string): number {
    const row = this.db
      .prepare('SELECT count(*) AS n FROM critique_rounds WHERE draft_id = ?')
      .get(draftId) as { n: number }
    return row.n
  }

  private round(id: string): CritiqueRound | undefined {
    const r = this.db.prepare('SELECT * FROM critique_rounds WHERE id = ?').get(id)
    if (!r) return undefined
    return {
      id: r.id as string,
      createdAt: r.created_at as string,
      summary: r.summary as string,
      ready: r.ready === 1,
    }
  }
}
