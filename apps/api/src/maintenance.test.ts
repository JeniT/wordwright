import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from './auth/secrets'
import { createScryptHasher } from './auth/password'
import { AccountService } from './services/accounts'
import { MaintenanceService, startMaintenance } from './services/maintenance'
import {
  lastInvitationToken,
  lastVerificationToken,
  PASSWORD,
  register,
  saveKey,
  setup,
  verifyAccounts,
  createDraft,
} from './test-helpers'

const DAY = 24 * 60 * 60 * 1000

/** A world whose clock sits `days` days after the accounts were created. */
function world(options: { ttl?: number; logger?: Pick<Console, 'log' | 'error'> } = {}) {
  const ctx = setup()
  const maintenance = () =>
    new MaintenanceService({
      store: ctx.store,
      unconfirmedTtlDays: options.ttl,
      reminders: new AccountService({
        store: ctx.store,
        hasher: createScryptHasher({ cost: 16 }),
        mailer: ctx.mailer,
        publicUrl: 'http://localhost:5173',
        now: () => ctx.clock.now,
      }),
      now: () => ctx.clock.now,
      logger: options.logger,
    })
  // Accounts get their real creation time; move the clock relative to "now".
  const daysLater = (days: number) => {
    ctx.clock.now = new Date(Date.now() + days * DAY)
  }
  return { ctx, maintenance, daysLater }
}

describe('purging unconfirmed, unused accounts', () => {
  it('removes everything that belonged to an abandoned signup, and frees the address', async () => {
    const { ctx, maintenance, daysLater } = world()
    // Ada (confirmed) invited an address that then signed up but never confirmed or did anything.
    const ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    const adaPublication = (await (await ada.get('/api/publications')).json())[0].id
    await ada.post(`/api/publications/${adaPublication}/invitations`, { email: 'typo@example.com' })
    const inviteToken = lastInvitationToken(ctx.mailer)

    const abandoned = ctx.client()
    const user = await register(abandoned, 'typo@example.com', 'Typo')
    const sessionToken = abandoned.cookies.get('wordwright_session')!
    const verifyToken = lastVerificationToken(ctx.mailer)
    const theirPublication = (await (await abandoned.get('/api/publications')).json())[0].id

    daysLater(15)
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(1)

    expect(ctx.store.users.findById(user.id)).toBeUndefined()
    expect(ctx.store.users.findByEmail('typo@example.com')).toBeUndefined()
    expect(ctx.store.publications.members(theirPublication)).toEqual([])
    expect(ctx.store.tokens.findSessionUser(hashToken(sessionToken), ctx.clock.now)).toBeUndefined()
    expect(ctx.store.tokens.findVerification(hashToken(verifyToken))).toBeUndefined()
    expect(ctx.store.invitations.findByTokenHash(hashToken(inviteToken))).toBeUndefined()
    // Ada and her publication are untouched, and the address can sign up again.
    expect(ctx.store.users.findByEmail('ada@example.com')).toBeDefined()
    expect(ctx.store.publications.members(adaPublication)).toHaveLength(1)
    const again = await ctx.client().post('/api/auth/register', {
      name: 'Typo Fixed',
      email: 'typo@example.com',
      password: PASSWORD,
      handle: 'typo',
    })
    expect(again.status).toBe(201)
  })

  it('only removes accounts older than the limit', async () => {
    const { ctx, maintenance, daysLater } = world({ ttl: 14 })
    await register(ctx.client(), 'new@example.com', 'New')
    daysLater(14 - 0.01) // a few minutes short of 14 days
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(0)
    daysLater(14 + 0.01)
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(1)
  })

  it('never touches confirmed accounts, however old', async () => {
    const { ctx, maintenance, daysLater } = world()
    await register(ctx.client(), 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    daysLater(400)
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(0)
    expect(ctx.store.users.findByEmail('ada@example.com')).toBeDefined()
  })

  it.each([
    [
      'has written a draft',
      async (ctx: ReturnType<typeof setup>, c: ReturnType<ReturnType<typeof setup>['client']>) => {
        const pid = (await (await c.get('/api/publications')).json())[0].id
        await createDraft(c, pid, { title: 'My piece', body: 'text' })
      },
    ],
    [
      'has noted down an idea',
      async (_ctx: ReturnType<typeof setup>, c: ReturnType<ReturnType<typeof setup>['client']>) => {
        const pid = (await (await c.get('/api/publications')).json())[0].id
        await c.post(`/api/publications/${pid}/ideas`, { name: 'Rivers' })
      },
    ],
    [
      'has saved an API key',
      async (_ctx: ReturnType<typeof setup>, c: ReturnType<ReturnType<typeof setup>['client']>) => {
        await saveKey(c)
      },
    ],
    [
      'shares a publication with someone',
      async (ctx: ReturnType<typeof setup>, c: ReturnType<ReturnType<typeof setup>['client']>) => {
        const me = (await (await c.get('/api/auth/me')).json()).id
        const pid = ctx.store.publications.listIdsForUser(me)[0]!
        const other = ctx.store.users.create({
          name: 'O',
          email: 'o@example.com',
          emailVerified: true,
        })
        ctx.store.publications.addMember(pid, other.id, 'member')
      },
    ],
  ])('keeps an unconfirmed account that %s', async (_label, makeUsed) => {
    const { ctx, maintenance, daysLater } = world()
    const c = ctx.client()
    const user = await register(c, 'busy@example.com', 'Busy')
    await makeUsed(ctx, c)
    daysLater(60)
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(0)
    expect(ctx.store.users.findById(user.id)).toBeDefined()
  })

  it('can be switched off', async () => {
    const { ctx, maintenance, daysLater } = world({ ttl: 0 })
    await register(ctx.client(), 'old@example.com', 'Old')
    daysLater(500)
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(0)
    expect(ctx.store.users.findByEmail('old@example.com')).toBeDefined()
  })

  it('works through a large backlog in one run', async () => {
    const { ctx, maintenance, daysLater } = world()
    for (let i = 0; i < 230; i++) {
      const u = ctx.store.users.create({
        name: `U${i}`,
        email: `u${i}@example.com`,
        emailVerified: false,
      })
      ctx.store.publications.create(`U${i}'s writing`, u.id)
    }
    daysLater(20)
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(230)
    expect(ctx.store.users.findStaleUnconfirmed(new Date(Date.now() + 99 * DAY), 10)).toEqual([])
  })

  it('logs how many were removed but never who', async () => {
    const logger = { log: vi.fn(), error: vi.fn() }
    const { ctx, maintenance, daysLater } = world({ logger })
    await register(ctx.client(), 'secret.person@example.com', 'Secret Person')
    daysLater(20)
    const result = maintenance().run()
    expect(result.purgedAccounts).toBe(1)
    const message = String(logger.log.mock.calls[0]![0])
    expect(message).toMatch(/removed 1 unused unconfirmed account/)
    expect(message).not.toMatch(/secret|example\.com/i)
  })

  it('stays quiet when there is nothing to do', () => {
    const logger = { log: vi.fn(), error: vi.fn() }
    world({ logger }).maintenance().run()
    expect(logger.log).not.toHaveBeenCalled()
  })
})

describe('reminding before deleting', () => {
  const reminders = (ctx: ReturnType<typeof setup>) =>
    ctx.mailer.outbox.filter((e) => e.subject.includes('will be deleted'))

  it('warns an unused, unconfirmed account once, a few days before it goes, with a link that keeps it', async () => {
    const { ctx, maintenance, daysLater } = world()
    const c = ctx.client()
    const user = await register(c, 'late@example.com', 'Late')

    daysLater(10) // 4 days left: too early
    expect(maintenance().remindUnconfirmedAccounts()).toBe(0)

    daysLater(11.5) // 2.5 days left
    expect(maintenance().remindUnconfirmedAccounts()).toBe(1)
    const [email] = reminders(ctx)
    expect(email!.to).toBe('late@example.com')
    expect(email!.subject).toBe('Your account will be deleted in 3 days unless you confirm it')
    expect(email!.text).toContain("we'll delete it in 3 days")

    // Once only, however often the job runs.
    expect(maintenance().remindUnconfirmedAccounts()).toBe(0)
    expect(maintenance().run().remindedAccounts).toBe(0)
    expect(reminders(ctx)).toHaveLength(1)

    // The link in it confirms the address, which is what keeps the account.
    const link = /verify-email\?token=([\w-]+)/.exec(email!.text)![1]!
    expect((await ctx.client().post('/api/auth/verify-email', { token: link })).status).toBe(200)
    expect(ctx.store.users.findById(user.id)!.emailVerified).toBe(true)
    daysLater(30)
    expect(maintenance().purgeUnconfirmedAccounts()).toBe(0)
  })

  it('does not warn accounts that are confirmed or in use', async () => {
    const { ctx, maintenance, daysLater } = world()
    await register(ctx.client(), 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    const busy = ctx.client()
    await register(busy, 'busy@example.com', 'Busy')
    await saveKey(busy)
    daysLater(12)
    expect(maintenance().remindUnconfirmedAccounts()).toBe(0)
    expect(reminders(ctx)).toHaveLength(0)
  })

  it('does not warn an account that is already past the limit: it is just deleted', async () => {
    const { ctx, maintenance, daysLater } = world()
    await register(ctx.client(), 'old@example.com', 'Old')
    daysLater(15)
    const result = maintenance().run()
    expect(result).toMatchObject({ purgedAccounts: 1, remindedAccounts: 0 })
    expect(reminders(ctx)).toHaveLength(0)
  })

  it('sends nothing when the cleanup is off', async () => {
    const { ctx, maintenance, daysLater } = world({ ttl: 0 })
    await register(ctx.client(), 'old@example.com', 'Old')
    daysLater(12)
    expect(maintenance().remindUnconfirmedAccounts()).toBe(0)
    expect(reminders(ctx)).toHaveLength(0)
  })

  it('counts warnings in the log but never names anyone', async () => {
    const logger = { log: vi.fn(), error: vi.fn() }
    const { ctx, maintenance, daysLater } = world({ logger })
    await register(ctx.client(), 'secret.person@example.com', 'Secret Person')
    daysLater(12)
    expect(maintenance().run().remindedAccounts).toBe(1)
    const message = String(logger.log.mock.calls[0]![0])
    expect(message).toMatch(/warned 1/)
    expect(message).not.toMatch(/secret|example\.com/i)
  })
})

describe('pruning expired sessions and links', () => {
  it('removes expired sessions but keeps live ones', async () => {
    const { ctx, maintenance } = world()
    const old = ctx.client()
    await register(old, 'ada@example.com', 'Ada') // session expires 30 days after the fake clock's start
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 40 * DAY)
    const fresh = ctx.client()
    await fresh.post('/api/auth/login', { email: 'ada@example.com', password: PASSWORD })

    const result = maintenance().pruneExpired()
    expect(result.expiredSessions).toBe(1)
    expect((await old.get('/api/auth/me')).status).toBe(401)
    expect((await fresh.get('/api/auth/me')).status).toBe(200)
  })

  it('removes used and expired reset/verification links but keeps live ones', async () => {
    const { ctx, maintenance } = world()
    await register(ctx.client(), 'ada@example.com', 'Ada')
    const verifyToken = lastVerificationToken(ctx.mailer)
    await ctx.client().post('/api/auth/forgot-password', { email: 'ada@example.com' })

    // Nothing is expired yet.
    expect(maintenance().pruneExpired().expiredLinks).toBe(0)
    expect(ctx.store.tokens.findVerification(hashToken(verifyToken))).toBeDefined()

    ctx.clock.now = new Date(ctx.clock.now.getTime() + 2 * DAY) // both links (1h, 24h) have expired
    expect(maintenance().pruneExpired().expiredLinks).toBe(2)
    expect(ctx.store.tokens.findVerification(hashToken(verifyToken))).toBeUndefined()
  })

  it('removes expired pending invitations, and accepted ones after 30 days', async () => {
    const { ctx, maintenance } = world()
    ctx.clock.now = new Date() // rows are stamped with the real time, so start from it
    const ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    const pid = (await (await ada.get('/api/publications')).json())[0].id
    await ada.post(`/api/publications/${pid}/invitations`, { email: 'bob@example.com' })
    const bobToken = lastInvitationToken(ctx.mailer)
    await ada.post(`/api/publications/${pid}/invitations`, { email: 'carol@example.com' })
    const carolToken = lastInvitationToken(ctx.mailer)
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await bob.post('/api/invitations/accept', { token: bobToken })

    // Day 8: Carol's pending invitation (7 days) has expired; Bob's accepted one is still kept.
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 8 * DAY)
    maintenance().pruneExpired()
    expect(ctx.store.invitations.findByTokenHash(hashToken(carolToken))).toBeUndefined()
    expect(ctx.store.invitations.findByTokenHash(hashToken(bobToken))).toBeDefined()

    // After 30+ days even the accepted record goes.
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 40 * DAY)
    maintenance().pruneExpired()
    expect(ctx.store.invitations.findByTokenHash(hashToken(bobToken))).toBeUndefined()
  })
})

describe('the schedule', () => {
  afterEach(() => vi.useRealTimers())

  it('runs shortly after start and then on every interval, until stopped', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const job = startMaintenance({ run, intervalMs: 1000, initialDelayMs: 100 })
    await vi.advanceTimersByTimeAsync(99)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(run).toHaveBeenCalledTimes(3)
    job.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('logs a failed run and carries on with the next one', async () => {
    vi.useFakeTimers()
    const logger = { error: vi.fn() }
    const run = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('disk full')
      })
      .mockImplementation(() => undefined)
    const job = startMaintenance({ run, intervalMs: 1000, initialDelayMs: 10, logger })
    await vi.advanceTimersByTimeAsync(10)
    expect(logger.error).toHaveBeenCalledWith('Maintenance run failed: disk full')
    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(2)
    job.stop()
  })
})

describe('the signup email', () => {
  it('tells people unused, unconfirmed accounts are deleted, and when', async () => {
    const ctx = setup({ unconfirmedAccountTtlDays: 14 })
    await register(ctx.client(), 'ada@example.com', 'Ada')
    const email = ctx.mailer.outbox.at(-1)!
    expect(email.text).toContain("we'll delete it after 14 days")
    expect(email.html).toContain('after 14 days')
  })

  it('says nothing about deletion when the cleanup is off', async () => {
    const ctx = setup({ unconfirmedAccountTtlDays: 0 })
    await register(ctx.client(), 'ada@example.com', 'Ada')
    expect(ctx.mailer.outbox.at(-1)!.text).not.toMatch(/delete it/)
  })
})
