import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ArticleCheck, ResearchItem, ResearchRun, ResearchState } from '@wordwright/core'
import { nowIso } from './database'

export interface NewResearchItem {
  url: string
  title: string
  why: string
  check: ArticleCheck
  fetchedTitle: string | null
  fetchedAuthors: string[]
}

/** A search in the queue, with what the worker needs to run it. */
export interface QueuedSearch {
  id: string
  ideaId: string
  publicationId: string
  createdBy: string | null
  areas: string
  state: 'waiting' | 'searching'
  /** Tries started this round. */
  attempts: number
  /** When it may be tried again; null for as soon as there is room. */
  retryAt: string | null
}

/** The research runs of each idea, with the pages each found. Callers check that the person belongs to the idea's publication first. */
export class ResearchStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Newest first. */
  list(ideaId: string): ResearchRun[] {
    return this.db
      .prepare(
        `SELECT r.*, COALESCE(u.name, r.kept_name) AS author_name FROM idea_research r
         LEFT JOIN users u ON u.id = r.created_by
         WHERE r.idea_id = ? ORDER BY r.created_at DESC, r.rowid DESC`,
      )
      .all(ideaId)
      .map((r) => this.toRun(r))
  }

  get(ideaId: string, id: string): ResearchRun | undefined {
    const row = this.db
      .prepare(
        `SELECT r.*, COALESCE(u.name, r.kept_name) AS author_name FROM idea_research r
         LEFT JOIN users u ON u.id = r.created_by WHERE r.idea_id = ? AND r.id = ?`,
      )
      .get(ideaId, id)
    return row ? this.toRun(row) : undefined
  }

  /** Saves a search the writer has just sent, waiting its turn (#447). */
  queue(
    ideaId: string,
    run: { createdBy: string; areas: string; provider: string; model: string },
  ): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO idea_research (id, idea_id, created_by, areas, provider, model, created_at, state)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting')`,
      )
      .run(id, ideaId, run.createdBy, run.areas, run.provider, run.model, nowIso())
    return id
  }

  /** The searches waiting or searching, in every publication, oldest first: the queue. */
  queued(): QueuedSearch[] {
    return this.db
      .prepare(
        `SELECT r.id, r.idea_id, i.publication_id, r.created_by, r.areas, r.state, r.attempts, r.retry_at
         FROM idea_research r JOIN ideas i ON i.id = r.idea_id
         WHERE r.state IN ('waiting', 'searching') ORDER BY r.created_at, r.rowid`,
      )
      .all()
      .map((r) => ({
        id: r.id as string,
        ideaId: r.idea_id as string,
        publicationId: r.publication_id as string,
        createdBy: (r.created_by as string | null) ?? null,
        areas: r.areas as string,
        state: r.state as 'waiting' | 'searching',
        attempts: r.attempts as number,
        retryAt: (r.retry_at as string | null) ?? null,
      }))
  }

  /** Starts a try: searching, one more attempt counted, with the model it uses. False if the run has gone. */
  start(id: string, provider: string, model: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE idea_research SET state = 'searching', attempts = attempts + 1, retry_at = NULL, error = NULL,
             provider = ?, model = ? WHERE id = ? AND state = 'waiting'`,
        )
        .run(provider, model, id).changes > 0
    )
  }

  /** Puts a search back to wait: to be tried again from `retryAt`, or (with null) as soon as there is room. */
  wait(id: string, retryAt: string | null) {
    this.db
      .prepare(`UPDATE idea_research SET state = 'waiting', retry_at = ? WHERE id = ?`)
      .run(retryAt, id)
  }

  fail(id: string, error: string) {
    this.db
      .prepare(`UPDATE idea_research SET state = 'failed', retry_at = NULL, error = ? WHERE id = ?`)
      .run(error, id)
  }

  /** The sender's one Try again: a new round, waiting. False unless it failed and hasn't been tried again. */
  tryAgain(id: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE idea_research SET state = 'waiting', attempts = 0, tried_again = 1, retry_at = NULL, error = NULL
           WHERE id = ? AND state = 'failed' AND tried_again = 0`,
        )
        .run(id).changes > 0
    )
  }

  /** Saves what a search found. False if the run went meanwhile (deleted, or cancelled). */
  finish(id: string, items: NewResearchItem[]): boolean {
    const done = this.db
      .prepare(
        `UPDATE idea_research SET state = 'finished', retry_at = NULL, error = NULL
         WHERE id = ? AND state = 'searching'`,
      )
      .run(id)
    if (done.changes === 0) return false
    const insert = this.db.prepare(
      `INSERT INTO idea_research_items (id, research_id, position, url, title, why, check_status, fetched_title, fetched_authors)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    items.forEach((item, position) =>
      insert.run(
        randomUUID(),
        id,
        position,
        item.url,
        item.title,
        item.why,
        item.check,
        item.fetchedTitle,
        JSON.stringify(item.fetchedAuthors),
      ),
    )
    return true
  }

  /** Marks a page of one run ignored, but only if it is still waiting for a decision. */
  ignore(researchId: string, itemId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE idea_research_items SET status = 'dismissed'
           WHERE research_id = ? AND id = ? AND status = 'suggested'`,
        )
        .run(researchId, itemId).changes > 0
    )
  }

  /** Marks a page added, remembering the article that adding it made. */
  markAdded(researchId: string, itemId: string, articleId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE idea_research_items SET status = 'added', article_id = ?
           WHERE research_id = ? AND id = ? AND status = 'suggested'`,
        )
        .run(articleId, researchId, itemId).changes > 0
    )
  }

  /**
   * Puts a decided page back to waiting for a decision. Returns the article it had made, if it still
   * exists, for the caller to remove; undefined when the page wasn't decided.
   */
  reopen(researchId: string, itemId: string): { articleId: string | null } | undefined {
    const row = this.db
      .prepare(
        `SELECT article_id FROM idea_research_items
         WHERE research_id = ? AND id = ? AND status <> 'suggested'`,
      )
      .get(researchId, itemId) as { article_id: string | null } | undefined
    if (!row) return undefined
    this.db
      .prepare(
        `UPDATE idea_research_items SET status = 'suggested', article_id = NULL WHERE id = ?`,
      )
      .run(itemId)
    return { articleId: row.article_id }
  }

  delete(ideaId: string, id: string): boolean {
    return (
      this.db.prepare('DELETE FROM idea_research WHERE idea_id = ? AND id = ?').run(ideaId, id)
        .changes > 0
    )
  }

  private toRun(row: Record<string, unknown>): ResearchRun {
    const items = this.db
      .prepare('SELECT * FROM idea_research_items WHERE research_id = ? ORDER BY position')
      .all(row.id as string)
      .map((i): ResearchItem => ({
        id: i.id as string,
        url: i.url as string,
        title: i.title as string,
        why: i.why as string,
        check: i.check_status as ArticleCheck,
        fetchedTitle: (i.fetched_title as string | null) ?? null,
        fetchedAuthors: JSON.parse(i.fetched_authors as string) as string[],
        status: i.status as ResearchItem['status'],
      }))
    const state = row.state as ResearchState
    const attempts = row.attempts as number
    return {
      id: row.id as string,
      areas: row.areas as string,
      createdBy: (row.created_by as string | null) ?? null,
      createdByName: (row.author_name as string | null) ?? null,
      model: row.model as string,
      createdAt: row.created_at as string,
      state,
      // While waiting after a failed try, the next try is the one to show.
      attempt: state === 'searching' ? attempts : state === 'waiting' ? attempts + 1 : attempts,
      error: (row.error as string | null) ?? null,
      canTryAgain: state === 'failed' && row.tried_again === 0,
      items,
    }
  }
}
