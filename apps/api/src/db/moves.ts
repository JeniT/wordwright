import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from './database'

export interface MoveRecord {
  id: string
  batchId: string
  kind: 'reading' | 'note'
  itemId: string
  /** The idea it came from; null for the publication itself. */
  fromIdeaId: string | null
  toIdeaId: string | null
  merged: boolean
  movedAt: string
}

/** What was moved between a publication's reading list and notes and its ideas. Written inside the move's transaction. */
export class MoveStore {
  constructor(private readonly db: DatabaseSync) {}

  record(
    publicationId: string,
    userId: string,
    batchId: string,
    move: Omit<MoveRecord, 'id' | 'batchId' | 'movedAt'>,
  ) {
    this.db
      .prepare(
        `INSERT INTO moves (id, batch_id, publication_id, moved_by, moved_at, kind, item_id, from_idea_id, to_idea_id, merged)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        batchId,
        publicationId,
        userId,
        nowIso(),
        move.kind,
        move.itemId,
        move.fromIdeaId,
        move.toIdeaId,
        move.merged ? 1 : 0,
      )
  }

  /** Newest first. */
  list(publicationId: string): MoveRecord[] {
    return this.db
      .prepare('SELECT * FROM moves WHERE publication_id = ? ORDER BY moved_at DESC, rowid DESC')
      .all(publicationId)
      .map((r) => ({
        id: r.id as string,
        batchId: r.batch_id as string,
        kind: r.kind as 'reading' | 'note',
        itemId: r.item_id as string,
        fromIdeaId: r.from_idea_id as string | null,
        toIdeaId: r.to_idea_id as string | null,
        merged: r.merged === 1,
        movedAt: r.moved_at as string,
      }))
  }
}
