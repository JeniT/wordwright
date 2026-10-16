import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { HandoverEvent, HandoverState } from '@wordwright/core'
import { nowIso } from './database'

type Kind = HandoverEvent['kind']
type Status = HandoverEvent['status']
export interface HandoverRow {
  id: string
  draftId: string
  kind: Kind
  status: Status
  actorId: string | null
  memberId: string | null
}

const toRow = (r: Record<string, unknown>): HandoverRow => ({
  id: r.id as string,
  draftId: r.draft_id as string,
  kind: r.kind as Kind,
  status: r.status as Status,
  actorId: (r.actor_id as string | null) ?? null,
  memberId: (r.member_id as string | null) ?? null,
})

/** Offers, asks and reassignments of drafts' editor role, and what became of them. */
export class HandoverStore {
  constructor(private readonly db: DatabaseSync) {}

  add(draftId: string, kind: Kind, actorId: string, memberId: string): HandoverRow {
    const id = randomUUID()
    const now = nowIso()
    const done = kind === 'reassign'
    this.db
      .prepare(
        `INSERT INTO draft_handovers (id, draft_id, kind, status, actor_id, member_id, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, draftId, kind, done ? 'done' : 'pending', actorId, memberId, now, done ? now : null)
    return this.get(draftId, id)!
  }

  /** The system moved the editor role because the previous editor left the publication. */
  addAutomaticReassignment(draftId: string, newEditorId: string) {
    const now = nowIso()
    this.db
      .prepare(
        `INSERT INTO draft_handovers (id, draft_id, kind, status, actor_id, member_id, created_at, resolved_at, reason)
         VALUES (?, ?, 'reassign', 'done', NULL, ?, ?, ?, 'left')`,
      )
      .run(randomUUID(), draftId, newEditorId, now, now)
  }

  get(draftId: string, id: string): HandoverRow | undefined {
    const row = this.db
      .prepare('SELECT * FROM draft_handovers WHERE draft_id = ? AND id = ?')
      .get(draftId, id)
    return row ? toRow(row) : undefined
  }

  pendingOffer(draftId: string): HandoverRow | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM draft_handovers WHERE draft_id = ? AND kind = 'offer' AND status = 'pending'",
      )
      .get(draftId)
    return row ? toRow(row) : undefined
  }

  pendingAskBy(draftId: string, userId: string): HandoverRow | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM draft_handovers WHERE draft_id = ? AND kind = 'ask' AND status = 'pending' AND actor_id = ?",
      )
      .get(draftId, userId)
    return row ? toRow(row) : undefined
  }

  resolve(id: string, status: Status) {
    this.db
      .prepare('UPDATE draft_handovers SET status = ?, resolved_at = ? WHERE id = ?')
      .run(status, nowIso(), id)
  }

  /** The editor changed: the old editor's offer lapses, and the new editor's own ask has been answered. */
  settleAfterEditorChange(draftId: string, newEditorId: string) {
    const now = nowIso()
    this.db
      .prepare(
        `UPDATE draft_handovers SET status = 'withdrawn', resolved_at = ?
         WHERE draft_id = ? AND kind = 'offer' AND status = 'pending'`,
      )
      .run(now, draftId)
    this.db
      .prepare(
        `UPDATE draft_handovers SET status = 'fulfilled', resolved_at = ?
         WHERE draft_id = ? AND kind = 'ask' AND status = 'pending' AND actor_id = ?`,
      )
      .run(now, draftId, newEditorId)
  }

  /** A member leaves a publication: whatever they had open there is closed, so nothing waits on someone who is gone. */
  closeForLeaver(publicationId: string, userId: string) {
    const now = nowIso()
    const inPublication = '(SELECT id FROM drafts WHERE publication_id = ?)'
    const close = (status: Status, where: string) =>
      this.db
        .prepare(
          `UPDATE draft_handovers SET status = ?, resolved_at = ?
           WHERE status = 'pending' AND draft_id IN ${inPublication} AND ${where}`,
        )
        .run(status, now, publicationId, userId)
    close('withdrawn', "kind = 'offer' AND actor_id = ?")
    close('declined', "kind = 'offer' AND member_id = ?")
    close('withdrawn', "kind = 'ask' AND actor_id = ?")
  }

  /**
   * Drafts are going to a publication where some of the people in their open offers and asks are not members: those
   * are closed, so nothing waits on someone who can no longer see the draft.
   */
  closeForMove(draftIds: string[], stays: (userId: string) => boolean) {
    if (!draftIds.length) return
    const marks = draftIds.map(() => '?').join(', ')
    const open = this.db
      .prepare(
        `SELECT id, kind, actor_id, member_id FROM draft_handovers
         WHERE status = 'pending' AND draft_id IN (${marks})`,
      )
      .all(...draftIds)
    for (const h of open) {
      const actor = h.actor_id as string | null
      const member = h.member_id as string | null
      if ((actor && !stays(actor)) || (member && !stays(member))) {
        this.resolve(
          h.id as string,
          h.kind === 'offer' && member && !stays(member) ? 'declined' : 'withdrawn',
        )
      }
    }
  }

  /** Open offers in the publication that are made to this person, or (`by`) that this person has made. */
  openOffers(publicationId: string, userId: string, side: 'to' | 'by') {
    const mine = side === 'to' ? 'h.member_id' : 'h.actor_id'
    const other = side === 'to' ? 'h.actor_id' : 'h.member_id'
    const otherName =
      side === 'to' ? 'coalesce(a.name, h.kept_actor_name)' : 'coalesce(m.name, h.kept_member_name)'
    return this.db
      .prepare(
        `SELECT h.draft_id, d.title, ${otherName} AS other_name
         FROM draft_handovers h
         JOIN drafts d ON d.id = h.draft_id
         LEFT JOIN users a ON a.id = h.actor_id
         LEFT JOIN users m ON m.id = h.member_id
         WHERE d.publication_id = ? AND h.kind = 'offer' AND h.status = 'pending' AND ${mine} = ?
           AND ${other} IS NOT NULL
         ORDER BY h.created_at, h.rowid`,
      )
      .all(publicationId, userId)
      .map((r) => ({
        draftId: r.draft_id as string,
        title: r.title as string,
        otherName: (r.other_name as string | null) ?? null,
      }))
  }

  /** What the page shows: the open offer, the open asks and the history, with names as they are now. */
  state(draftId: string, editorId: string, editorName: string): HandoverState {
    const rows = this.db
      .prepare(
        `SELECT h.*, coalesce(a.name, h.kept_actor_name) AS actor_name,
                coalesce(m.name, h.kept_member_name) AS member_name
         FROM draft_handovers h
         LEFT JOIN users a ON a.id = h.actor_id
         LEFT JOIN users m ON m.id = h.member_id
         WHERE h.draft_id = ? ORDER BY h.created_at DESC, h.rowid DESC`,
      )
      .all(draftId)
    const history: HandoverEvent[] = rows.map((r) => ({
      id: r.id as string,
      kind: r.kind as Kind,
      status: r.status as Status,
      actorName: (r.actor_name as string | null) ?? null,
      memberName: (r.member_name as string | null) ?? null,
      createdAt: r.created_at as string,
      resolvedAt: (r.resolved_at as string | null) ?? null,
      automatic: r.reason === 'left',
    }))
    const open = rows.filter((r) => r.status === 'pending')
    const offer = open.find((r) => r.kind === 'offer')
    return {
      editorId,
      editorName,
      offer: offer
        ? {
            id: offer.id as string,
            toId: offer.member_id as string,
            toName: (offer.member_name as string | null) ?? 'a former member',
            createdAt: offer.created_at as string,
          }
        : null,
      asks: open
        .filter((r) => r.kind === 'ask')
        .map((r) => ({
          id: r.id as string,
          byId: r.actor_id as string,
          byName: (r.actor_name as string | null) ?? 'a former member',
          createdAt: r.created_at as string,
        })),
      history,
    }
  }
}
