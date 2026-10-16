import type { MoveIdeasPreview, MoveIdeasResult } from '@wordwright/core'
import type { Store } from '../db/store'
import { fail } from '../errors'

/**
 * Moving whole ideas to another publication (docs/decisions.md, "Moving ideas between publications"). An idea goes
 * with its drafts (comments, reviews, critique rounds), notes, links and brainstorm thread, as one transaction.
 * Callers have checked that the person belongs to the publication the ideas are in.
 */
export class IdeaMoveService {
  constructor(private readonly store: Store) {}

  /** What the move would do and who would lose sight of the ideas, without doing it. */
  preview(
    publicationId: string,
    userId: string,
    ids: string[],
    toPublicationId: string,
  ): MoveIdeasPreview {
    const { ideaIds } = this.plan(publicationId, ids, toPublicationId, userId)
    const { store } = this
    const totals = ideaIds.map((id) => store.ideas.contents(id))
    const sum = (key: 'drafts' | 'notes' | 'links') => totals.reduce((n, t) => n + t[key], 0)
    const staying = new Set(store.publications.members(toPublicationId).map((m) => m.userId))
    return {
      ideas: ideaIds.length,
      drafts: sum('drafts'),
      notes: sum('notes'),
      links: sum('links'),
      losingAccess: store.publications
        .members(publicationId)
        .filter((m) => !staying.has(m.userId))
        .map((m) => m.name),
      problem: this.problem(publicationId, userId, ideaIds, toPublicationId)?.message ?? null,
    }
  }

  move(
    publicationId: string,
    userId: string,
    ids: string[],
    toPublicationId: string,
  ): MoveIdeasResult {
    const { store } = this
    return store.transaction(() => {
      const { ideaIds } = this.plan(publicationId, ids, toPublicationId, userId)
      const problem = this.problem(publicationId, userId, ideaIds, toPublicationId)
      if (problem) throw fail(problem.status, problem.message)
      const members = new Set(store.publications.members(toPublicationId).map((m) => m.userId))
      const draftIds = ideaIds.flatMap((id) => this.draftsOf(publicationId, id))
      store.handovers.closeForMove(draftIds, (u) => members.has(u))
      for (const id of ideaIds) store.ideas.moveToPublication(id, toPublicationId)
      return { publicationId: toPublicationId, ideaIds }
    })
  }

  /** Checks the destination and finds the ideas; a destination the person doesn't belong to doesn't exist. */
  private plan(publicationId: string, ids: string[], toPublicationId: string, userId: string) {
    const { store } = this
    if (!store.publications.roleOf(toPublicationId, userId)) throw fail(404, 'Not found')
    if (toPublicationId === publicationId) {
      throw fail(400, 'Choose a different publication to move them to.')
    }
    const ideaIds = [...new Set(ids)]
    for (const id of ideaIds) if (!store.ideas.get(publicationId, id)) throw fail(404, 'Not found')
    return { ideaIds }
  }

  private draftsOf(publicationId: string, ideaId: string) {
    return this.store.ideas.get(publicationId, ideaId)!.drafts.map((d) => d.id)
  }

  /** Why the move would be refused, if it would, as the status and the words to show. */
  private problem(
    publicationId: string,
    userId: string,
    ideaIds: string[],
    toPublicationId: string,
  ): { status: 403 | 409; message: string } | null {
    const { store } = this
    const draftIds = ideaIds.flatMap((id) => this.draftsOf(publicationId, id))
    if (!draftIds.length) return null
    const source = store.publications.get(publicationId, userId)
    if (store.publications.roleOf(publicationId, userId) !== 'owner') {
      return {
        status: 403,
        message: `Only an owner of ${source?.name ?? 'the publication'} can move an idea that has drafts.`,
      }
    }
    const dest = store.publications.get(toPublicationId, userId)
    const members = new Set(store.publications.members(toPublicationId).map((m) => m.userId))
    for (const id of draftIds) {
      const draft = store.drafts.getById(id)!
      if (draft.editorId && !members.has(draft.editorId)) {
        return {
          status: 409,
          message: `Ask ${draft.editorName} to join ${dest?.name ?? 'that publication'} first, or hand the draft over.`,
        }
      }
    }
    return null
  }
}
