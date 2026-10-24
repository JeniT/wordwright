import type { Draft, MoveIdeasPreview, MoveIdeasResult } from '@wordwright/core'
import type { Store } from '../db/store'
import { fail } from '../errors'

/** What a move involves, worked out once: the ideas, their drafts, and who belongs to the destination. */
interface Plan {
  publicationId: string
  userId: string
  toPublicationId: string
  ideaIds: string[]
  drafts: Draft[]
  /** The people who belong to the destination. */
  staying: Set<string>
}

/**
 * Moving whole ideas to another publication (docs/adr/publications/moving-ideas-between-publications.md). An idea goes
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
    const { store } = this
    const plan = this.plan(publicationId, userId, ids, toPublicationId)
    const totals = plan.ideaIds.map((id) => store.ideas.contents(id))
    const sum = (key: 'drafts' | 'notes' | 'articles') => totals.reduce((n, t) => n + t[key], 0)
    return {
      ideas: plan.ideaIds.length,
      drafts: plan.drafts.length,
      notes: sum('notes'),
      articles: sum('articles'),
      losingAccess: store.publications
        .members(publicationId)
        .filter((m) => !plan.staying.has(m.userId))
        .map((m) => m.name),
      problem: this.problem(plan)?.message ?? null,
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
      const plan = this.plan(publicationId, userId, ids, toPublicationId)
      const problem = this.problem(plan)
      if (problem) throw fail(problem.status, problem.message)
      store.handovers.closeForMove(
        plan.drafts.map((d) => d.id),
        (u) => plan.staying.has(u),
      )
      for (const id of plan.ideaIds) store.ideas.moveToPublication(id, toPublicationId)
      return { publicationId: toPublicationId, ideaIds: plan.ideaIds }
    })
  }

  /**
   * Checks the destination and the ideas, and gathers what the move involves. A destination the person doesn't
   * belong to is answered as if it didn't exist.
   */
  private plan(
    publicationId: string,
    userId: string,
    ids: string[],
    toPublicationId: string,
  ): Plan {
    const { store } = this
    if (!store.publications.roleOf(toPublicationId, userId)) throw fail(404, 'Not found')
    if (toPublicationId === publicationId) {
      throw fail(400, 'Choose a different publication to move them to.')
    }
    const ideaIds = [...new Set(ids)]
    const drafts = ideaIds.flatMap((id) => {
      const idea = store.ideas.get(publicationId, id)
      if (!idea) throw fail(404, 'Not found')
      return idea.drafts.map((d) => store.drafts.getById(d.id)!)
    })
    const staying = new Set(store.publications.members(toPublicationId).map((m) => m.userId))
    return { publicationId, userId, toPublicationId, ideaIds, drafts, staying }
  }

  /** Why the move would be refused, if it would, as the status and the words to show. */
  private problem(plan: Plan): { status: 403 | 409; message: string } | null {
    const { store } = this
    if (!plan.drafts.length) return null
    if (store.publications.roleOf(plan.publicationId, plan.userId) !== 'owner') {
      const source = store.publications.get(plan.publicationId, plan.userId)
      return {
        status: 403,
        message: `Only an owner of ${source?.name ?? 'the publication'} can move an idea that has drafts.`,
      }
    }
    const away = plan.drafts.find((d) => d.editorId && !plan.staying.has(d.editorId))
    if (!away) return null
    const dest = store.publications.get(plan.toPublicationId, plan.userId)
    return {
      status: 409,
      message: `Ask ${away.editorName} to join ${dest?.name ?? 'that publication'} first, or hand the draft over.`,
    }
  }
}
