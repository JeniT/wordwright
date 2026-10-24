import type { AdminAccounts, AdminDecision } from '@wordwright/core'
import type { Store } from '../db/store'
import type { UserRecord } from '../db/users'
import { fail } from '../errors'
import { sendInBackground } from '../mail/background'
import type { Mailer } from '../mail/mailer'
import { approvedEmail, declinedEmail } from '../mail/templates'

export interface AdminServiceDeps {
  store: Store
  mailer: Mailer
  publicUrl: string
  logger?: Pick<Console, 'error'>
}

/**
 * The owner's side of the private alpha (#328): who is waiting, and letting them in or not. It shows name, address,
 * date and status, and nothing a person has written. Every decision is recorded in the audit log.
 */
export class AdminService {
  constructor(private readonly d: AdminServiceDeps) {}

  accounts(): AdminAccounts {
    const all = this.d.store.users.listForAdmin()
    return { waiting: all.filter((a) => a.approval === 'waiting').reverse(), all }
  }

  decide(admin: UserRecord, userId: string, decision: AdminDecision): void {
    const { store } = this.d
    const target = store.users.findById(userId)
    if (!target) throw fail(404, 'Not found')
    if (target.id === admin.id) throw fail(400, 'You can’t decide about your own account.')
    if (target.isAdmin) throw fail(400, 'Admins are set in the server’s settings, not here.')
    const approval = decision === 'approve' ? 'approved' : 'declined'
    // Pressing the same button twice (a double click, two admins) changes nothing and emails no one twice.
    if (target.approval === approval) return
    store.transaction(() => {
      store.users.setApproval(target.id, approval)
      store.adminAudit.record(admin.id, decision, target.id)
    })
    const email =
      decision === 'approve'
        ? approvedEmail({ name: target.name, signInLink: `${this.d.publicUrl}/login` })
        : declinedEmail({ name: target.name })
    sendInBackground(
      this.d.mailer,
      this.d.logger ?? console,
      `${decision} email for user ${target.id}`,
      { to: target.email, ...email },
    )
  }
}

/**
 * The admin command (`pnpm --filter @wordwright/api admin grant|revoke <email>`): the only way besides `ADMIN_EMAILS`
 * to make an admin, and never reachable from the app. An admin is approved too, since they must be able to sign in.
 */
export function setAdminByEmail(
  store: Store,
  email: string,
  on: boolean,
): 'done' | 'no-account' | 'unconfirmed' {
  const user = store.users.findByEmail(email.trim().toLowerCase())
  if (!user) return 'no-account'
  if (on && !user.emailVerified) return 'unconfirmed'
  store.transaction(() => {
    store.users.setAdmin(user.id, on)
    if (on) store.users.setApproval(user.id, 'approved')
  })
  return 'done'
}

const SEEDED_ADMIN_HANDLE = 'admin'

/**
 * Makes the owner's Admin account at server start (#367), so the admin role can be handed over without the owner's
 * own account carrying it. It is made for the **first** address in `ADMIN_EMAILS` only, with a confirmed address
 * and no password: the owner sets one through "Forgot password". The reserved username is allowed here and still
 * blocked at sign-up. Safe to run on every start.
 */
export function seedAdminAccount(
  store: Store,
  adminEmails: string[],
): 'none' | 'exists' | 'handle-taken' | 'created' {
  const email = adminEmails[0]
  if (!email) return 'none'
  if (store.users.findByEmail(email)) return 'exists'
  if (store.users.handleTaken(SEEDED_ADMIN_HANDLE)) return 'handle-taken'
  store.transaction(() => {
    const admin = store.users.create({
      name: 'Admin',
      email,
      emailVerified: true,
      handle: SEEDED_ADMIN_HANDLE,
      approval: 'approved',
    })
    store.users.setAdmin(admin.id, true)
  })
  return 'created'
}
