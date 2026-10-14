import type {
  CommentInput,
  Draft,
  DraftReviewers,
  ReviewDetail,
  ReviewInvitationPreview,
  ReviewSummary,
} from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import { generateToken, hashToken } from '../auth/secrets'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { fail } from '../errors'
import { sendInBackground } from '../mail/background'
import type { Mailer } from '../mail/mailer'
import { reviewInvitationEmail } from '../mail/templates'
import type { AccountService, Session } from './accounts'
import { addComment, visibleComments } from './comments'

export const REVIEW_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface ReviewServiceDeps {
  store: Store
  mailer: Mailer
  accounts: AccountService
  publicUrl: string
  /** Caps review invitations to any one address, whoever sends them. */
  recipientLimiter: RateLimiter
  now?: () => Date
  logger?: Pick<Console, 'error'>
}

const invalidLink = () => fail(400, 'This invitation is invalid or has expired')

/**
 * Reviewers read one draft and comment on it, with an account that reaches nothing else (ADR 0002). They are invited
 * the way profile members are: an emailed link that lasts 7 days and is bound to the address, the same quiet answer
 * whatever the address, and the same blocks. The editor or an owner invites and can end a review at any time.
 */
export class ReviewService {
  private readonly now: () => Date

  constructor(private readonly d: ReviewServiceDeps) {
    this.now = d.now ?? (() => new Date())
  }

  // ---- the editor's side ----------------------------------------------------

  /** The editor or an owner may invite and end reviews. */
  requireManager(draft: Draft, userId: string) {
    const role = this.d.store.profiles.roleOf(draft.profileId, userId)
    if (draft.editorId !== userId && role !== 'owner') {
      throw fail(403, 'Only the draft’s editor or an owner can do that.')
    }
  }

  invite(inviter: UserRecord, draft: Draft, email: string): void {
    const { store } = this.d
    this.requireManager(draft, inviter.id)
    if (!inviter.emailVerified) {
      throw fail(403, 'Please confirm your email address before inviting someone')
    }
    // Quiet outcomes, so the inviter learns nothing about the address: already reviewing, blocked, or enough emails.
    const existing = store.users.findByEmail(email)
    if (existing && store.reviews.forReviewer(draft.id, existing.id)?.state === 'open') return
    if (existing && store.profiles.roleOf(draft.profileId, existing.id)) return
    if (store.invitations.isBlocked(email, inviter.id)) return
    if (!this.d.recipientLimiter.allow(email)) return

    const token = generateToken()
    store.reviews.replacePending({
      draftId: draft.id,
      invitedBy: inviter.id,
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.now().getTime() + REVIEW_INVITE_TTL_MS),
    })
    const profile = store.profiles.get(draft.profileId, inviter.id)
    sendInBackground(
      this.d.mailer,
      this.d.logger ?? console,
      `review invitation for draft ${draft.id}`,
      {
        to: email,
        ...reviewInvitationEmail({
          inviterName: inviter.name,
          draftTitle: draft.title,
          profileName: profile?.name ?? 'a profile',
          link: `${this.d.publicUrl}/review-invite?token=${token}`,
          ttlDays: REVIEW_INVITE_TTL_MS / 86_400_000,
        }),
      },
    )
  }

  reviewers(draft: Draft, userId: string): DraftReviewers {
    this.requireManager(draft, userId)
    const { reviews } = this.d.store
    return {
      reviewers: reviews.listForDraft(draft.id),
      pending: reviews.pendingForDraft(draft.id, this.now()),
    }
  }

  /** Ends someone's review: they can no longer read the draft, and their comments stay. */
  revoke(draft: Draft, userId: string, reviewId: string): void {
    this.requireManager(draft, userId)
    const review = this.d.store.reviews.ofDraft(draft.id, reviewId)
    if (!review) throw fail(404, 'Not found')
    this.d.store.reviews.end(review.id, 'revoked')
  }

  withdrawInvitation(draft: Draft, userId: string, invitationId: string): void {
    this.requireManager(draft, userId)
    if (!this.d.store.reviews.deletePending(draft.id, invitationId)) throw fail(404, 'Not found')
  }

  // ---- the link holder's side -------------------------------------------------

  preview(token: string): ReviewInvitationPreview {
    const inv = this.usable(token)
    return {
      draftTitle: inv.draftTitle,
      profileName: inv.profileName,
      inviterName: inv.inviterName,
      email: inv.email,
    }
  }

  /** Signed in as the person it was sent to: the review is added to their account (a full account stays full). */
  accept(user: UserRecord, token: string): { reviewId: string } {
    const { store } = this.d
    const prior = store.reviews.findInvitation(hashToken(token))
    if (prior?.acceptedBy === user.id) {
      const review = store.reviews.forReviewer(prior.draftId, user.id)
      if (review) return { reviewId: review.id }
    }
    const inv = this.usable(token)
    if (user.email !== inv.email) {
      throw fail(
        403,
        'This invitation was sent to a different email address. Sign in with the address it was sent to.',
      )
    }
    return store.transaction(() => this.enroll(user, inv))
  }

  /** A new person: a reviewer-only account is made for them, and they are signed in. */
  async registerAndAccept(token: string, name: string, password: string): Promise<Session> {
    const inv = this.usable(token)
    return this.d.accounts
      .registerReviewer({ name, email: inv.email, password }, (user) => this.enroll(user, inv))
      .catch((err: unknown) => {
        if (err instanceof Error && 'code' in err && err.code === 'email_in_use') {
          throw fail(409, 'There is already an account for this address. Sign in to see the draft.')
        }
        throw err
      })
  }

  decline(token: string, block: 'none' | 'sender' | 'all'): void {
    const { store } = this.d
    const inv = this.usable(token)
    store.transaction(() => {
      store.reviews.deletePending(inv.draftId, inv.id)
      if (block === 'sender') store.invitations.addBlock(inv.email, inv.invitedBy)
      if (block === 'all') store.invitations.addBlock(inv.email, null)
    })
  }

  // ---- the reviewer's side ------------------------------------------------------

  list(user: UserRecord): ReviewSummary[] {
    return this.d.store.reviews.listFor(user.id)
  }

  /** The draft and the reviewer's own comments, while the review is open; the comments alone once it has ended. */
  open(user: UserRecord, reviewId: string): ReviewDetail {
    const { store } = this.d
    const review = store.reviews.ownedBy(reviewId, user.id)
    const summary = store.reviews.listFor(user.id).find((r) => r.id === reviewId)
    if (!review || !summary) throw fail(404, 'Not found')
    const draft = this.draftOf(review.draftId)
    return {
      ...summary,
      draft: review.state === 'open' ? { title: draft.title, body: draft.body } : null,
      comments: visibleComments(store, draft, user.id),
    }
  }

  comment(user: UserRecord, reviewId: string, input: CommentInput) {
    const review = this.d.store.reviews.ownedBy(reviewId, user.id)
    if (!review) throw fail(404, 'Not found')
    if (review.state !== 'open')
      throw fail(409, 'This review has ended, so you can’t add comments.')
    return addComment(this.d.store, this.draftOf(review.draftId), user.id, input)
  }

  leave(user: UserRecord, reviewId: string): void {
    const review = this.d.store.reviews.ownedBy(reviewId, user.id)
    if (!review) throw fail(404, 'Not found')
    this.d.store.reviews.end(review.id, 'left')
  }

  /** "Start writing": the reviewer chooses a username and becomes a full account. */
  startWriting(user: UserRecord, handle: string): UserRecord {
    if (!user.reviewerOnly) throw fail(400, 'You already have a full account.')
    return this.d.accounts.changeHandle(user, handle)
  }

  // ---- internals -------------------------------------------------------------

  private enroll(user: UserRecord, inv: { id: string; draftId: string; invitedBy: string }) {
    const { store } = this.d
    const review = store.reviews.grant(inv.draftId, user.id, inv.invitedBy)
    store.reviews.markAccepted(inv.id, user.id)
    if (!user.emailVerified) store.users.markEmailVerified(user.id)
    return { reviewId: review.id }
  }

  private draftOf(draftId: string): Draft {
    const draft = this.d.store.drafts.getById(draftId)
    if (!draft) throw fail(404, 'Not found')
    return draft
  }

  private usable(token: string) {
    const inv = this.d.store.reviews.findInvitation(hashToken(token))
    if (!inv || inv.acceptedBy !== null || inv.expiresAt <= this.now()) throw invalidLink()
    return inv
  }
}
