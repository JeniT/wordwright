import { firstAvailable, suggestHandle } from '@lfwa/core'
import type { Invitation, InvitationBlocks, InvitationPreview } from '@lfwa/core'
import type { RateLimiter } from '../auth/rate-limit'
import { generateToken, hashToken } from '../auth/secrets'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { sendInBackground } from '../mail/background'
import type { Mailer } from '../mail/mailer'
import { invitationEmail } from '../mail/templates'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export class InvitationError extends Error {
  constructor(
    readonly code:
      | 'owner_unverified'
      | 'email_unverified'
      | 'invalid_invitation'
      | 'wrong_account'
      | 'not_found',
    message: string,
  ) {
    super(message)
  }
}

export interface InvitationServiceDeps {
  store: Store
  mailer: Mailer
  publicUrl: string
  /** Caps invitations to any one address, whoever sends them, so many owners can't pile on one person. */
  recipientLimiter: RateLimiter
  now?: () => Date
  logger?: Pick<Console, 'error'>
}

/**
 * People join a shared profile by accepting an emailed invitation. Invitations are addressed to an
 * email (so the invitee needn't have an account yet) and the reply to the owner is identical whether
 * or not that address has one, so this can't be used to find out who is registered.
 */
export class InvitationService {
  private readonly now: () => Date

  constructor(private readonly d: InvitationServiceDeps) {
    this.now = d.now ?? (() => new Date())
  }

  /** Emails an invitation (replacing any earlier pending one for the same address). */
  invite(owner: UserRecord, profileId: string, email: string): void {
    const { store } = this.d
    // Inviting gives access to someone's work, so the inviter's own address must be confirmed first.
    if (!owner.emailVerified) {
      throw new InvitationError(
        'owner_unverified',
        'Please confirm your email address before inviting someone',
      )
    }
    const profile = store.profiles.get(profileId, owner.id)
    if (!profile) throw new InvitationError('not_found', 'Not found')

    // Already in? Say nothing different: no email, same answer.
    const existing = store.users.findByEmail(email)
    if (existing && store.profiles.roleOf(profileId, existing.id)) return

    // Blocked, or the address has had enough: the same quiet answer as any other outcome, so the sender
    // learns nothing about the recipient (not even that they have an account).
    if (store.invitations.isBlocked(email, owner.id)) return
    if (!this.d.recipientLimiter.allow(email)) return

    const token = generateToken()
    store.invitations.replacePending({
      profileId,
      invitedBy: owner.id,
      email,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.now().getTime() + INVITE_TTL_MS),
    })
    sendInBackground(
      this.d.mailer,
      this.d.logger ?? console,
      `invitation email for profile ${profileId}`,
      {
        to: email,
        ...invitationEmail({
          inviterName: owner.name,
          profileName: profile.name,
          link: `${this.d.publicUrl}/accept-invite?token=${token}`,
          declineLink: `${this.d.publicUrl}/decline-invite?token=${token}`,
          ttlDays: INVITE_TTL_MS / 86_400_000,
        }),
      },
    )
  }

  listPending(profileId: string): Invitation[] {
    return this.d.store.invitations.listPending(profileId, this.now())
  }

  revoke(profileId: string, invitationId: string): void {
    if (!this.d.store.invitations.revoke(profileId, invitationId)) {
      throw new InvitationError('not_found', 'Not found')
    }
  }

  /** What a link holder may see before accepting. Anyone with the link already got it by email. */
  preview(token: string): InvitationPreview {
    const inv = this.usable(token)
    return { profileName: inv.profileName, inviterName: inv.inviterName, email: inv.email }
  }

  /**
   * Joins the signed-in user to the profile, if they are the person the invitation was sent to.
   * Because the link only ever reached that inbox, accepting also confirms the address.
   * Re-opening an already-accepted link as the same person is a harmless success.
   */
  accept(user: UserRecord, token: string): { profileId: string } {
    const { store } = this.d
    const inv = store.invitations.findByTokenHash(hashToken(token))
    if (inv?.acceptedBy === user.id && store.profiles.roleOf(inv.profileId, user.id)) {
      return { profileId: inv.profileId }
    }
    const usable = this.usable(token)
    if (user.email !== usable.email) {
      throw new InvitationError(
        'wrong_account',
        'This invitation was sent to a different email address. Sign in with the address it was sent to.',
      )
    }
    store.transaction(() => {
      if (!store.profiles.roleOf(usable.profileId, user.id)) {
        store.profiles.addMember(usable.profileId, user.id, 'member')
      }
      store.invitations.markAccepted(usable.id, user.id)
      if (!user.emailVerified) store.users.markEmailVerified(user.id)
      // A reviewer invited into a profile becomes a full account: it gets a username now (the app asks once if
      // they would like another) and keeps the reviews it already has.
      if (user.reviewerOnly) {
        store.users.setHandle(
          user.id,
          firstAvailable(suggestHandle(user.name, user.email), (h) => store.users.handleTaken(h)),
          null,
        )
        store.users.clearHandleChosen(user.id)
      }
    })
    return { profileId: usable.profileId }
  }

  /**
   * The invitee's answer from the emailed link, signed in or not (the link proves the inbox). Removes
   * the invitation and, if asked, blocks future ones from that sender or from everyone, withdrawing what
   * is already pending. The inviter is not told: the invitation just stops being pending.
   */
  decline(token: string, block: 'none' | 'sender' | 'all'): void {
    const { store } = this.d
    const inv = this.usable(token)
    store.transaction(() => {
      store.invitations.deletePending(inv.id)
      if (block === 'sender') store.invitations.addBlock(inv.email, inv.invitedBy)
      if (block === 'all') store.invitations.addBlock(inv.email, null)
    })
  }

  /** Managing blocks needs a confirmed address, or anyone could pre-register someone's email and lift them. */
  blocks(user: UserRecord): InvitationBlocks {
    this.requireConfirmed(user)
    return this.d.store.invitations.listBlocks(user.email)
  }

  setBlockAll(user: UserRecord, blocked: boolean): void {
    this.requireConfirmed(user)
    const { invitations } = this.d.store
    if (blocked) invitations.addBlock(user.email, null)
    else invitations.removeBlock(user.email, null)
  }

  unblockSender(user: UserRecord, senderId: string): void {
    this.requireConfirmed(user)
    this.d.store.invitations.removeBlock(user.email, senderId)
  }

  private requireConfirmed(user: UserRecord) {
    if (!user.emailVerified) {
      throw new InvitationError(
        'email_unverified',
        'Please confirm your email address before changing who can invite you',
      )
    }
  }

  private usable(token: string) {
    const inv = this.d.store.invitations.findByTokenHash(hashToken(token))
    if (!inv || inv.acceptedBy !== null || inv.expiresAt <= this.now()) {
      throw new InvitationError('invalid_invitation', 'This invitation is invalid or has expired')
    }
    return inv
  }
}
