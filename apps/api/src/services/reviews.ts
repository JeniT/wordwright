import type {
  CommentInput,
  Draft,
  DraftReviewers,
  ReviewDetail,
  ReviewInvitationPreview,
  ReviewSummary,
  SendForReviewInput,
} from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import { generateToken, hashToken } from '../auth/secrets'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { fail } from '../errors'
import { sendInBackground } from '../mail/background'
import type { Mailer } from '../mail/mailer'
import { reviewFinishedEmail, reviewInvitationEmail, reviewRequestEmail } from '../mail/templates'
import type { AccountService, Session } from './accounts'
import { addComment } from './comments'

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

  /**
   * Sends the draft for review: freezes its title and body as a snapshot (ADR 0001) and asks each person to review
   * that. Only the editor sends. People by email are invited as profile members are (a quiet outcome whatever the
   * address); members of the profile are asked directly and told by email.
   */
  send(editor: UserRecord, draft: Draft, input: SendForReviewInput): void {
    const { store } = this.d
    if (draft.editorId !== editor.id) {
      throw fail(403, `Only ${draft.editorName}, the draft’s editor, can send it for review.`)
    }
    const emails = [...new Set((input.emails ?? []).map((e) => e.trim().toLowerCase()))]
    const memberIds = [...new Set(input.memberIds ?? [])]
    if (emails.length && !editor.emailVerified) {
      throw fail(403, 'Please confirm your email address before inviting someone')
    }
    const members = new Map(store.profiles.members(draft.profileId).map((m) => [m.userId, m]))
    for (const id of memberIds) {
      if (id === editor.id || !members.has(id)) {
        throw fail(
          400,
          'You can ask other members of this profile, but not yourself or anyone else.',
        )
      }
    }

    const profile = store.profiles.get(draft.profileId, editor.id)
    const profileName = profile?.name ?? 'a profile'
    const snapshot = store.transaction(() => {
      const made = store.reviews.createSnapshot(draft.id, draft.title, draft.body, editor.id)
      for (const id of memberIds) store.reviews.grant(made.id, draft.id, id, editor.id)
      return made
    })

    for (const id of memberIds) {
      const review = store.reviews.forReviewer(snapshot.id, id)!
      const to = store.users.findById(id)
      if (!to) continue
      sendInBackground(
        this.d.mailer,
        this.d.logger ?? console,
        `review request for draft ${draft.id}`,
        {
          to: to.email,
          ...reviewRequestEmail({
            inviterName: editor.name,
            draftTitle: snapshot.title,
            profileName,
            link: `${this.d.publicUrl}/reviews/${review.id}`,
          }),
        },
      )
    }
    for (const email of emails) {
      // Quiet outcomes, so the editor learns nothing about the address: a member (asked above), blocked, or too many emails.
      const existing = store.users.findByEmail(email)
      if (existing && store.profiles.roleOf(draft.profileId, existing.id)) continue
      if (store.invitations.isBlocked(email, editor.id)) continue
      if (!this.d.recipientLimiter.allow(email)) continue
      const token = generateToken()
      store.reviews.replacePending({
        draftId: draft.id,
        snapshotId: snapshot.id,
        invitedBy: editor.id,
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(this.now().getTime() + REVIEW_INVITE_TTL_MS),
      })
      sendInBackground(
        this.d.mailer,
        this.d.logger ?? console,
        `review invitation for draft ${draft.id}`,
        {
          to: email,
          ...reviewInvitationEmail({
            inviterName: editor.name,
            draftTitle: snapshot.title,
            profileName,
            link: `${this.d.publicUrl}/review-invite?token=${token}`,
            ttlDays: REVIEW_INVITE_TTL_MS / 86_400_000,
          }),
        },
      )
    }
  }

  reviewers(draft: Draft, userId: string): DraftReviewers {
    this.requireManager(draft, userId)
    const { reviews } = this.d.store
    return {
      snapshots: reviews.snapshotSummaries(draft.id),
      reviewers: reviews.listForDraft(draft.id),
      pending: reviews.pendingForDraft(draft.id, this.now()),
    }
  }

  /** The editor or an owner stops accepting one review: it becomes read-only, and the comments stay. */
  close(draft: Draft, userId: string, reviewId: string): void {
    this.requireManager(draft, userId)
    const review = this.d.store.reviews.ofDraft(draft.id, reviewId)
    if (!review) throw fail(404, 'Not found')
    this.d.store.reviews.end(review.id, 'closed')
  }

  /** ...or every open review of the draft at once. */
  closeAll(draft: Draft, userId: string): number {
    this.requireManager(draft, userId)
    return this.d.store.reviews.closeAllOpen(draft.id)
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
      const review = store.reviews.forReviewer(prior.snapshotId, user.id)
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

  /** The snapshot that was shared and this reviewer's own comments on it, in whatever state the review is in. */
  open(user: UserRecord, reviewId: string): ReviewDetail {
    const { store } = this.d
    const review = store.reviews.ownedBy(reviewId, user.id)
    const summary = store.reviews.listFor(user.id).find((r) => r.id === reviewId)
    const snapshot = review && store.reviews.snapshot(review.snapshotId)
    if (!review || !summary || !snapshot) throw fail(404, 'Not found')
    return {
      ...summary,
      draft: { title: snapshot.title, body: snapshot.body },
      comments: store.comments.forReview(review.draftId, review.id),
    }
  }

  /** A comment is about a paragraph of the snapshot, whatever the editor has done to the live draft since. */
  comment(user: UserRecord, reviewId: string, input: CommentInput) {
    const { store } = this.d
    const review = store.reviews.ownedBy(reviewId, user.id)
    const snapshot = review && store.reviews.snapshot(review.snapshotId)
    if (!review || !snapshot) throw fail(404, 'Not found')
    if (review.state !== 'open') {
      throw fail(409, 'This review has ended, so you can’t add comments.')
    }
    return addComment(store, this.draftOf(review.draftId), user.id, input, {
      id: review.id,
      body: snapshot.body,
    })
  }

  /** "End review": the reviewer is finished. The editor is emailed once, and the review becomes read-only. */
  end(user: UserRecord, reviewId: string): void {
    const { store } = this.d
    const review = store.reviews.ownedBy(reviewId, user.id)
    if (!review) throw fail(404, 'Not found')
    if (!store.reviews.end(review.id, 'ended')) return // already over: nothing to announce again
    const draft = this.draftOf(review.draftId)
    const editor = store.users.findById(draft.editorId)
    const snapshot = store.reviews.snapshot(review.snapshotId)
    if (!editor) return
    sendInBackground(
      this.d.mailer,
      this.d.logger ?? console,
      `review finished for draft ${draft.id}`,
      {
        to: editor.email,
        ...reviewFinishedEmail({
          reviewerName: user.name,
          draftTitle: snapshot?.title ?? draft.title,
          commentCount: store.reviews.commentCount(review.id),
          link: `${this.d.publicUrl}/p/${draft.profileId}/drafts/${draft.id}`,
        }),
      },
    )
  }

  /** "Start writing": the reviewer chooses a username and becomes a full account. */
  startWriting(user: UserRecord, handle: string): UserRecord {
    if (!user.reviewerOnly) throw fail(400, 'You already have a full account.')
    return this.d.accounts.changeHandle(user, handle)
  }

  // ---- internals -------------------------------------------------------------

  private enroll(
    user: UserRecord,
    inv: { id: string; draftId: string; snapshotId: string; invitedBy: string },
  ) {
    const { store } = this.d
    const review = store.reviews.grant(inv.snapshotId, inv.draftId, user.id, inv.invitedBy)
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
