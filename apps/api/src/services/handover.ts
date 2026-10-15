import type { Draft, HandoverState } from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { fail } from '../errors'
import { sendInBackground } from '../mail/background'
import type { Mailer } from '../mail/mailer'
import { handoverOfferEmail } from '../mail/templates'
import { requireEditor } from './draft-editor'

export interface HandoverDeps {
  store: Store
  mailer: Mailer
  publicUrl: string
  /** Per editor: each offer emails someone. */
  offerLimiter: RateLimiter
  logger?: Pick<Console, 'error'>
}

/**
 * Moving a draft's editor role takes two people, so it is explicit (CONTEXT.md, "Handover"): the editor offers it to a
 * named member who accepts; until then the offerer stays editor. Any other member can ask, which only prompts the
 * editor. An owner can reassign without the editor, for when they are away. Callers have checked publication membership.
 */
export class HandoverService {
  constructor(private readonly d: HandoverDeps) {}

  state(draft: Draft): HandoverState {
    return this.d.store.handovers.state(draft.id, draft.editorId, draft.editorName)
  }

  offer(draft: Draft, editor: UserRecord, toUserId: string): HandoverState {
    const { store } = this.d
    requireEditor(draft, editor.id)
    if (toUserId === editor.id) throw fail(400, 'You are already this draft’s editor.')
    const target = this.memberOf(draft, toUserId)
    const open = store.handovers.pendingOffer(draft.id)
    if (open) {
      throw fail(409, 'This draft is already offered to someone. Withdraw that offer first.')
    }
    if (!this.d.offerLimiter.allow(editor.id)) {
      throw fail(429, 'You have made a lot of offers today. Please try again tomorrow.')
    }
    store.handovers.add(draft.id, 'offer', editor.id, target.userId)
    const publication = store.publications.get(draft.publicationId, editor.id)
    const to = store.users.findById(target.userId)
    if (to) {
      sendInBackground(
        this.d.mailer,
        this.d.logger ?? console,
        `handover offer for draft ${draft.id}`,
        {
          to: to.email,
          ...handoverOfferEmail({
            fromName: editor.name,
            draftTitle: draft.title,
            publicationName: publication?.name ?? 'a publication',
            link: `${this.d.publicUrl}/p/${draft.publicationId}/drafts/${draft.id}`,
          }),
        },
      )
    }
    return this.state(draft)
  }

  withdraw(draft: Draft, editor: UserRecord): HandoverState {
    requireEditor(draft, editor.id)
    const open = this.d.store.handovers.pendingOffer(draft.id)
    if (!open) throw fail(404, 'There is no offer to withdraw.')
    this.d.store.handovers.resolve(open.id, 'withdrawn')
    return this.state(draft)
  }

  accept(draft: Draft, user: UserRecord): HandoverState {
    const { store } = this.d
    const open = this.offeredTo(draft, user.id)
    return store.transaction(() => {
      store.handovers.resolve(open.id, 'accepted')
      store.drafts.setEditor(draft.id, user.id)
      store.handovers.settleAfterEditorChange(draft.id, user.id)
      return store.handovers.state(draft.id, user.id, user.name)
    })
  }

  decline(draft: Draft, user: UserRecord): HandoverState {
    const open = this.offeredTo(draft, user.id)
    this.d.store.handovers.resolve(open.id, 'declined')
    return this.state(draft)
  }

  /** Any member but the editor can ask; the editor sees it on the page, and nothing else happens. */
  ask(draft: Draft, user: UserRecord): HandoverState {
    const { store } = this.d
    if (draft.editorId === user.id) throw fail(400, 'You are already this draft’s editor.')
    if (store.handovers.pendingAskBy(draft.id, user.id)) {
      throw fail(409, `You have already asked ${draft.editorName} for this draft.`)
    }
    store.handovers.add(draft.id, 'ask', user.id, draft.editorId)
    return this.state(draft)
  }

  /** The person who asked takes it back, or the editor sets it aside. */
  closeAsk(draft: Draft, user: UserRecord, askId: string): HandoverState {
    const ask = this.d.store.handovers.get(draft.id, askId)
    if (!ask || ask.kind !== 'ask' || ask.status !== 'pending') throw fail(404, 'Not found')
    if (ask.actorId === user.id) this.d.store.handovers.resolve(ask.id, 'withdrawn')
    else if (draft.editorId === user.id) this.d.store.handovers.resolve(ask.id, 'dismissed')
    else throw fail(403, 'Only the person who asked, or the editor, can close this.')
    return this.state(draft)
  }

  /** An owner moves the role without the editor, recorded as such in the history. */
  reassign(draft: Draft, owner: UserRecord, toUserId: string): HandoverState {
    const { store } = this.d
    if (store.publications.roleOf(draft.publicationId, owner.id) !== 'owner') {
      throw fail(403, 'Only an owner can reassign a draft.')
    }
    if (toUserId === draft.editorId) throw fail(400, 'They are already this draft’s editor.')
    const target = this.memberOf(draft, toUserId)
    return store.transaction(() => {
      store.handovers.add(draft.id, 'reassign', owner.id, target.userId)
      store.drafts.setEditor(draft.id, target.userId)
      store.handovers.settleAfterEditorChange(draft.id, target.userId)
      return store.handovers.state(draft.id, target.userId, target.name)
    })
  }

  private memberOf(draft: Draft, userId: string) {
    const member = this.d.store.publications
      .members(draft.publicationId)
      .find((m) => m.userId === userId)
    if (!member) throw fail(400, 'That person is not a member of this publication.')
    return member
  }

  private offeredTo(draft: Draft, userId: string) {
    const open = this.d.store.handovers.pendingOffer(draft.id)
    if (!open || open.memberId !== userId)
      throw fail(404, 'There is no offer of this draft for you.')
    return open
  }
}
