import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { ReadingCheck, ResearchItem, ResearchRun } from '@lfwa/core'
import { nowIso } from './database'

export interface NewResearchItem {
  url: string
  title: string
  why: string
  check: ReadingCheck
  fetchedTitle: string | null
  fetchedAuthors: string[]
}

/** The research runs of each idea, with the pages each found. Callers check that the person belongs to the idea's profile first. */
export class ResearchStore {
  constructor(private readonly db: DatabaseSync) {}

  /** Newest first. */
  list(ideaId: string): ResearchRun[] {
    return this.db
      .prepare(
        `SELECT r.*, u.name AS author_name FROM idea_research r
         LEFT JOIN users u ON u.id = r.created_by
         WHERE r.idea_id = ? ORDER BY r.created_at DESC, r.rowid DESC`,
      )
      .all(ideaId)
      .map((r) => this.toRun(r))
  }

  get(ideaId: string, id: string): ResearchRun | undefined {
    const row = this.db
      .prepare(
        `SELECT r.*, u.name AS author_name FROM idea_research r
         LEFT JOIN users u ON u.id = r.created_by WHERE r.idea_id = ? AND r.id = ?`,
      )
      .get(ideaId, id)
    return row ? this.toRun(row) : undefined
  }

  create(
    ideaId: string,
    run: { createdBy: string; areas: string; provider: string; model: string },
    items: NewResearchItem[],
  ): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO idea_research (id, idea_id, created_by, areas, provider, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, ideaId, run.createdBy, run.areas, run.provider, run.model, nowIso())
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
    return id
  }

  /** Sets the status of these items of one run, but only those still `suggested`. Returns how many changed. */
  decide(researchId: string, itemIds: string[], status: 'added' | 'dismissed'): number {
    const update = this.db.prepare(
      `UPDATE idea_research_items SET status = ? WHERE research_id = ? AND id = ? AND status = 'suggested'`,
    )
    let changed = 0
    for (const id of itemIds) changed += Number(update.run(status, researchId, id).changes)
    return changed
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
        check: i.check_status as ReadingCheck,
        fetchedTitle: (i.fetched_title as string | null) ?? null,
        fetchedAuthors: JSON.parse(i.fetched_authors as string) as string[],
        status: i.status as ResearchItem['status'],
      }))
    return {
      id: row.id as string,
      areas: row.areas as string,
      createdByName: (row.author_name as string | null) ?? null,
      model: row.model as string,
      createdAt: row.created_at as string,
      items,
    }
  }
}
