import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { CritiquePoint, DraftComment } from '@wordwright/core'
import { nowIso } from './database'

/** What a person writes, once the service has worked out which paragraph it is about. */
export interface NewComment {
  block: string
  hash: string | null
  excerpt: string
  /** The whole paragraph, or null for a general comment. */
  blockText: string | null
  quote: string | null
  text: string
}

/**
 * The comments on drafts, from members and from the AI's critique alike. This store returns every comment of a
 * draft; who may see which is decided in `services/comments.ts`, never here, so there is one place to get it wrong.
 */
export class CommentStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Keeps the points of a critique round as the AI's comments, in the order made (most important first). */
  addFromCritique(
    draftId: string,
    roundId: string,
    points: readonly CritiquePoint[],
    /** The draft's blocks as the AI was shown them, to keep each point's whole paragraph. */
    blocks: readonly { id: string; text: string }[] = [],
  ) {
    const at = nowIso()
    const insert = this.db.prepare(
      `INSERT INTO draft_comments (id, draft_id, round_id, rank, block, block_hash, excerpt, block_text, text, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    points.forEach((p, rank) =>
      insert.run(
        randomUUID(),
        draftId,
        roundId,
        rank,
        p.block,
        p.hash,
        p.excerpt,
        blocks.find((b) => b.id === p.block)?.text ?? null,
        p.point,
        p.reason,
        at,
      ),
    )
  }

  /** `reviewId` when a reviewer made it in a review (so the editor can count and place them by review). */
  add(
    draftId: string,
    authorId: string,
    comment: NewComment,
    reviewId: string | null = null,
  ): DraftComment {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO draft_comments (id, draft_id, author_id, review_id, block, block_hash, excerpt, block_text, quote, text, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        draftId,
        authorId,
        reviewId,
        comment.block,
        comment.hash,
        comment.excerpt,
        comment.blockText,
        comment.quote,
        comment.text,
        nowIso(),
      )
    return this.get(draftId, id)!
  }

  /** The comments made in one review, oldest first. */
  forReview(draftId: string, reviewId: string): DraftComment[] {
    return this.all(draftId).filter((c) => c.reviewId === reviewId)
  }

  get(draftId: string, id: string): DraftComment | undefined {
    return this.all(draftId).find((c) => c.id === id)
  }

  /**
   * Every comment on the draft, oldest first (the AI's in the order it ranked them). The AI's comments from earlier
   * critique rounds stay on record but are left out: the latest round is the one worth reading.
   */
  all(draftId: string): DraftComment[] {
    const rows = this.db
      .prepare(
        `SELECT c.*, coalesce(u.name, c.kept_name) AS author_name FROM draft_comments c
         LEFT JOIN users u ON u.id = c.author_id
         WHERE c.draft_id = ?
           AND (c.round_id IS NULL OR c.round_id = (
             SELECT id FROM critique_rounds WHERE draft_id = c.draft_id ORDER BY created_at DESC, rowid DESC LIMIT 1))
         ORDER BY c.created_at, c.rank, c.rowid`,
      )
      .all(draftId)
    return rows.map((r) => ({
      id: r.id as string,
      byAi: r.round_id !== null,
      reviewId: (r.review_id as string | null) ?? null,
      authorId: r.author_id as string | null,
      authorName: r.author_name as string | null,
      block: r.block as string,
      excerpt: r.excerpt as string,
      blockText: (r.block_text as string | null) ?? null,
      quote: (r.quote as string | null) ?? null,
      hash: r.block_hash as string | null,
      text: r.text as string,
      reason: r.reason as string | null,
      resolved: r.resolved_at !== null,
      createdAt: r.created_at as string,
    }))
  }

  /** Sets a comment of this draft aside or brings it back; false if the draft has no such comment. */
  setResolved(draftId: string, id: string, resolved: boolean): boolean {
    return (
      this.db
        .prepare('UPDATE draft_comments SET resolved_at = ? WHERE id = ? AND draft_id = ?')
        .run(resolved ? nowIso() : null, id, draftId).changes > 0
    )
  }
}
