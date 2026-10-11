import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Critique, CritiqueRound } from '@lfwa/core'
import { nowIso } from './database'

/** The critiques of drafts. Callers check that the draft is one the person may reach before asking for its rounds. */
export class CritiqueStore {
  constructor(private readonly db: DatabaseSync) {}

  add(draftId: string, critique: Critique): CritiqueRound {
    const id = randomUUID()
    this.db
      .prepare(
        'INSERT INTO critique_rounds (id, draft_id, summary, ready, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, draftId, critique.summary, critique.ready ? 1 : 0, nowIso())
    const insert = this.db.prepare(
      `INSERT INTO critique_points (id, round_id, rank, block, block_hash, excerpt, point, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    critique.points.forEach((p, rank) =>
      insert.run(randomUUID(), id, rank, p.block, p.hash, p.excerpt, p.point, p.reason),
    )
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

  /** Sets a point of this draft aside or brings it back; false if the draft has no such point. */
  setDismissed(draftId: string, pointId: string, dismissed: boolean): boolean {
    return (
      this.db
        .prepare(
          `UPDATE critique_points SET dismissed_at = ?
           WHERE id = ? AND round_id IN (SELECT id FROM critique_rounds WHERE draft_id = ?)`,
        )
        .run(dismissed ? nowIso() : null, pointId, draftId).changes > 0
    )
  }

  private round(id: string): CritiqueRound | undefined {
    const r = this.db.prepare('SELECT * FROM critique_rounds WHERE id = ?').get(id)
    if (!r) return undefined
    const points = this.db
      .prepare('SELECT * FROM critique_points WHERE round_id = ? ORDER BY rank')
      .all(id)
    return {
      id: r.id as string,
      createdAt: r.created_at as string,
      summary: r.summary as string,
      ready: r.ready === 1,
      points: points.map((p) => ({
        id: p.id as string,
        block: p.block as string,
        excerpt: p.excerpt as string,
        hash: p.block_hash as string | null,
        point: p.point as string,
        reason: p.reason as string,
        dismissed: p.dismissed_at !== null,
      })),
    }
  }
}
