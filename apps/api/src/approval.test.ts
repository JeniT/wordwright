import { describe, expect, it } from 'vitest'
import { FakeIdentityProvider } from './auth/identity'
import { loadConfig } from './config'
import { setAdminByEmail } from './services/admin'
import {
  PASSWORD,
  allRows,
  createDraft,
  lastInvitationToken,
  lastReviewToken,
  register,
  setup,
  signUp,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

const ADMIN = 'owner@example.com'

/** The private alpha (#328): an owner, who is an admin, and people who sign up and wait. */
async function world(options: Parameters<typeof setup>[0] = {}) {
  const ctx = setup({ approvalRequired: true, adminEmails: [ADMIN], ...options })
  const admin = ctx.client()
  await signUp(admin, ADMIN, 'Olive Owner')
  verifyAccounts(ctx, ADMIN)
  // The first request after the address is confirmed is what makes the account an admin.
  expect((await admin.get('/api/auth/me')).status).toBe(200)
  const newcomer = async (email = 'bea@example.com', name = 'Bea Newcomer') => {
    const client = ctx.client()
    const user = await signUp(client, email, name)
    return { client, user }
  }
  const accounts = async () => (await admin.get('/api/admin/accounts')).json()
  const decide = (id: string, decision: 'approve' | 'decline') =>
    admin.post(`/api/admin/accounts/${id}/decision`, { decision })
  return { ctx, admin, newcomer, accounts, decide }
}

describe('who starts approved', () => {
  it('makes a new account wait', async () => {
    const { newcomer } = await world()
    const { client, user } = await newcomer()
    expect(user.approval).toBe('waiting')
    expect((await (await client.get('/api/auth/me')).json()).approval).toBe('waiting')
  })

  it('approves everyone at once when approval is off', async () => {
    const ctx = setup()
    expect((await signUp(ctx.client())).approval).toBe('approved')
  })

  it('makes accounts that already existed approved (the migration default)', async () => {
    const ctx = setup()
    await signUp(ctx.client())
    expect(ctx.store.users.findByEmail('ada@example.com')!.approval).toBe('approved')
  })

  it('makes a Google sign-up wait, like an email one', async () => {
    const idp = new FakeIdentityProvider(
      { subject: 'g1', email: 'gail@example.com', emailVerified: true, name: 'Gail' },
      'google',
      'Google',
    )
    const ctx = setup({ approvalRequired: true, identityProviders: [idp] })
    const client = ctx.client()
    const start = await client.get('/api/auth/oauth/google/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    await client.get(`/api/auth/oauth/google/callback?code=good-code&state=${state}`)
    expect((await (await client.get('/api/auth/me')).json()).approval).toBe('waiting')
    expect((await client.get('/api/publications')).status).toBe(403)
  })

  it('makes a reviewer invited by an approved person approved, and one invited by a waiting person wait', async () => {
    const { ctx, admin } = await world()
    // The owner (approved) sends a draft for review.
    const publication = (await (await admin.post('/api/publications', { name: 'Notes' })).json()).id
    const draft = await createDraft(admin, publication, { title: 'Meanders', body: 'Rivers bend.' })
    const url = `/api/publications/${publication}/drafts/${draft.id}`
    expect(
      (await admin.post(`${url}/send-for-review`, { emails: ['rae@example.com'] })).status,
    ).toBe(202)
    await new Promise((r) => setTimeout(r, 0))
    const rae = ctx.client()
    const joined = await rae.post('/api/auth/register-reviewer', {
      token: lastReviewToken(ctx.mailer),
      name: 'Rae',
      password: PASSWORD,
    })
    expect((await joined.json()).approval).toBe('approved')
    expect((await rae.get('/api/reviews')).status).toBe(200)
  })

  it('lets a waiting account in when it accepts an invitation from an approved person', async () => {
    const { ctx, admin, newcomer } = await world()
    const publication = (await (await admin.post('/api/publications', { name: 'Notes' })).json()).id
    const { client } = await newcomer('bea@example.com')
    expect((await client.get('/api/publications')).status).toBe(403)
    expect(
      (
        await admin.post(`/api/publications/${publication}/invitations`, {
          email: 'bea@example.com',
        })
      ).status,
    ).toBe(202)
    const accepted = await client.post('/api/invitations/accept', {
      token: lastInvitationToken(ctx.mailer),
    })
    expect(accepted.status).toBe(200)
    expect((await (await client.get('/api/auth/me')).json()).approval).toBe('approved')
    expect((await client.get('/api/publications')).status).toBe(200)
  })

  it('does not let in a declined account that accepts an invitation', async () => {
    const { ctx, admin, newcomer, decide } = await world()
    const publication = (await (await admin.post('/api/publications', { name: 'Notes' })).json()).id
    const { client, user } = await newcomer('bea@example.com')
    await decide(user.id, 'decline')
    await admin.post(`/api/publications/${publication}/invitations`, { email: 'bea@example.com' })
    const res = await client.post('/api/invitations/accept', {
      token: lastInvitationToken(ctx.mailer),
    })
    expect(res.status).toBe(403)
    expect((await (await client.get('/api/auth/me')).json()).approval).toBe('declined')
    expect(ctx.store.publications.listIdsForUser(user.id)).toEqual([])
  })
})

describe('what a waiting or declined account may reach', () => {
  const blocked: [string, string][] = [
    ['GET', '/api/publications'],
    ['POST', '/api/publications'],
    ['GET', '/api/drafts/active'],
    ['GET', '/api/reviews'],
    ['GET', '/api/llm'],
    ['PUT', '/api/llm'],
    ['PUT', '/api/account/name'],
    ['GET', '/api/account/sessions'],
    ['GET', '/api/admin/accounts'],
  ]

  for (const state of ['waiting', 'declined'] as const) {
    it(`refuses the app, and the AI, to a ${state} account`, async () => {
      const { newcomer, decide } = await world()
      const { client, user } = await newcomer()
      if (state === 'declined') await decide(user.id, 'decline')
      for (const [method, path] of blocked) {
        const res = await client.request(method, path, method === 'GET' ? undefined : {})
        expect([method, path, res.status]).toEqual([method, path, 403])
      }
    })

    it(`lets a ${state} account see who it is, sign out, download what it has and delete itself`, async () => {
      const { ctx, newcomer, decide } = await world()
      const { client, user } = await newcomer()
      if (state === 'declined') await decide(user.id, 'decline')
      expect((await client.get('/api/auth/me')).status).toBe(200)
      expect((await client.get('/api/account/export')).status).toBe(200)
      expect((await client.post('/api/auth/resend-verification')).status).toBe(200)
      expect((await client.post('/api/auth/logout')).status).toBe(204)
      // Signed out; signs back in, then deletes itself.
      const again = ctx.client()
      expect(
        (await again.post('/api/auth/login', { email: 'bea@example.com', password: PASSWORD }))
          .status,
      ).toBe(200)
      expect((await again.delete('/api/account', { password: PASSWORD })).status).toBe(204)
      expect(ctx.store.users.findByEmail('bea@example.com')).toBeUndefined()
    })
  }

  it('lets an approved account in', async () => {
    const { newcomer, decide } = await world()
    const { client, user } = await newcomer()
    await decide(user.id, 'approve')
    expect((await client.get('/api/publications')).status).toBe(200)
  })
})

describe('the admin area', () => {
  it('is hidden from everyone who is not an admin, approved or not', async () => {
    const { ctx, newcomer, decide } = await world()
    const { client, user } = await newcomer()
    await decide(user.id, 'approve')
    expect((await client.get('/api/admin/accounts')).status).toBe(404)
    expect(
      (await client.post(`/api/admin/accounts/${user.id}/decision`, { decision: 'decline' }))
        .status,
    ).toBe(404)
    expect((await ctx.client().get('/api/admin/accounts')).status).toBe(401)
    expect(ctx.store.users.findById(user.id)!.approval).toBe('approved')
  })

  it('needs a confirmed address, even for a listed one', async () => {
    const ctx = setup({ approvalRequired: true, adminEmails: [ADMIN] })
    const admin = ctx.client()
    await signUp(admin, ADMIN, 'Olive Owner')
    // The account is waiting, so it cannot reach the app at all until its address is confirmed.
    expect((await admin.get('/api/admin/accounts')).status).toBe(403)
    expect((await (await admin.get('/api/auth/me')).json()).isAdmin).toBe(false)
    verifyAccounts(ctx, ADMIN)
    expect((await admin.get('/api/admin/accounts')).status).toBe(200)
    expect((await (await admin.get('/api/auth/me')).json()).isAdmin).toBe(true)
  })

  it('cannot be switched on through the app', async () => {
    const { ctx, newcomer } = await world()
    const { client, user } = await newcomer()
    for (const body of [{ isAdmin: true }, { is_admin: true }, { approval: 'approved' }]) {
      await client.put('/api/account/name', { name: 'Bea', ...body })
      await client.patch('/api/account', body)
    }
    const record = ctx.store.users.findById(user.id)!
    expect(record.isAdmin).toBe(false)
    expect(record.approval).toBe('waiting')
  })

  it('lists the waiting first, then everyone, with only name, address, date and status', async () => {
    const { admin, ctx, newcomer, accounts } = await world()
    const bea = await newcomer('bea@example.com', 'Bea')
    ctx.clock.now = new Date('2026-01-02T00:00:00Z')
    await newcomer('cy@example.com', 'Cy')
    // Something a person wrote and a key they saved, which an admin must never see.
    verifyAccounts(ctx, 'bea@example.com')
    const publication = (await (await admin.post('/api/publications', { name: 'Hidden' })).json())
      .id
    await createDraft(admin, publication, { title: 'Secret draft', body: 'secret body' })

    const list = await accounts()
    expect(list.waiting.map((a: { email: string }) => a.email)).toEqual([
      'bea@example.com',
      'cy@example.com',
    ])
    expect(list.all).toHaveLength(3)
    expect(Object.keys(list.all[0]).sort()).toEqual(
      ['approval', 'createdAt', 'email', 'emailVerified', 'id', 'isAdmin', 'name'].sort(),
    )
    expect(JSON.stringify(list)).not.toMatch(/secret|Hidden|handle/i)
    expect(list.waiting[0].id).toBe(bea.user.id)
  })

  it('approves and declines, writes each decision to the audit log, and emails the person', async () => {
    const { ctx, admin, newcomer, decide, accounts } = await world()
    const bea = await newcomer('bea@example.com', 'Bea')
    const cy = await newcomer('cy@example.com', 'Cy')
    const adminId = ctx.store.users.findByEmail(ADMIN)!.id
    ctx.mailer.outbox.length = 0

    const approved = await decide(bea.user.id, 'approve')
    expect(approved.status).toBe(200)
    expect((await approved.json()).waiting.map((a: { id: string }) => a.id)).toEqual([cy.user.id])
    await decide(cy.user.id, 'decline')
    await new Promise((r) => setTimeout(r, 0))

    expect(ctx.store.adminAudit.list()).toMatchObject([
      { adminId, action: 'approve', userId: bea.user.id },
      { adminId, action: 'decline', userId: cy.user.id },
    ])
    const [yes, no] = ctx.mailer.outbox
    expect(yes).toMatchObject({ to: 'bea@example.com', subject: 'You’re in' })
    expect(yes!.text).toContain('/login')
    expect(no).toMatchObject({ to: 'cy@example.com' })
    expect(no!.text).not.toMatch(/because|reason/i)
    expect((await accounts()).waiting).toEqual([])
    expect((await admin.get('/api/auth/me')).status).toBe(200)
  })

  it('does nothing, and emails no one, when the same decision is made twice', async () => {
    const { ctx, newcomer, decide } = await world()
    const bea = await newcomer()
    await decide(bea.user.id, 'approve')
    await new Promise((r) => setTimeout(r, 0))
    const sent = ctx.mailer.outbox.length
    await decide(bea.user.id, 'approve')
    await new Promise((r) => setTimeout(r, 0))
    expect(ctx.mailer.outbox).toHaveLength(sent)
    expect(ctx.store.adminAudit.list()).toHaveLength(1)
  })

  it('can change its mind, and does not decide about itself or another admin', async () => {
    const { ctx, newcomer, decide } = await world()
    const bea = await newcomer()
    await decide(bea.user.id, 'decline')
    expect((await decide(bea.user.id, 'approve')).status).toBe(200)
    expect(ctx.store.users.findById(bea.user.id)!.approval).toBe('approved')
    const adminId = ctx.store.users.findByEmail(ADMIN)!.id
    expect((await decide(adminId, 'decline')).status).toBe(400)
    expect((await decide('nobody', 'approve')).status).toBe(404)
  })

  it('checks the decision it is given', async () => {
    const { newcomer, admin } = await world()
    const bea = await newcomer()
    expect(
      (await admin.post(`/api/admin/accounts/${bea.user.id}/decision`, { decision: 'delete' }))
        .status,
    ).toBe(400)
  })

  it('throttles decisions', async () => {
    const { newcomer, decide } = await world()
    const bea = await newcomer()
    let last = 200
    for (let i = 0; i < 125; i++) {
      last = (await decide(bea.user.id, i % 2 ? 'approve' : 'decline')).status
    }
    expect(last).toBe(429)
  })
})

describe('signing up', () => {
  it('is throttled', async () => {
    const ctx = setup({ approvalRequired: true })
    let last = 201
    for (let i = 0; i < 31; i++) {
      last = (
        await ctx.client().post('/api/auth/register', {
          name: 'Person',
          email: `p${i}@example.com`,
          password: PASSWORD,
          handle: `person${i}`,
        })
      ).status
    }
    expect(last).toBe(429)
  })
})

describe('signing up with Google', () => {
  const claims = (n: number) => ({
    subject: `g${n}`,
    email: `g${n}@example.com`,
    emailVerified: true,
    name: `Gail ${n}`,
  })
  /** The redirect and callback, as a browser does them; answers where the callback sent the browser. */
  const signIn = async (client: TestClient) => {
    const start = await client.get('/api/auth/oauth/google/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const res = await client.get(`/api/auth/oauth/google/callback?code=good-code&state=${state}`)
    return res.headers.get('location')!
  }

  it('shares the email form’s allowance, so Google is not a way round it', async () => {
    const idp = new FakeIdentityProvider(claims(1), 'google', 'Google')
    const ctx = setup({ approvalRequired: true, identityProviders: [idp], signupsPerHour: 2 })
    // One sign-up by email, one by Google: the allowance is used up.
    await signUp(ctx.client(), 'p@example.com', 'Pat')
    expect(await signIn(ctx.client())).not.toContain('error=')
    idp.claims = claims(2)
    const refused = ctx.client()
    expect(await signIn(refused)).toContain('error=too_many_signups')
    expect(ctx.store.users.findByEmail('g2@example.com')).toBeUndefined()
    expect((await refused.get('/api/auth/me')).status).toBe(401)
    // The email form is refused too: it is one allowance.
    expect(
      (
        await ctx.client().post('/api/auth/register', {
          name: 'Quin',
          email: 'q@example.com',
          password: PASSWORD,
          handle: 'quin',
        })
      ).status,
    ).toBe(429)
  })

  it('still lets someone who already has an account sign in, however many have signed up', async () => {
    const idp = new FakeIdentityProvider(claims(1), 'google', 'Google')
    const ctx = setup({ approvalRequired: true, identityProviders: [idp], signupsPerHour: 1 })
    expect(await signIn(ctx.client())).not.toContain('error=')
    // Allowance used up: a second visit by the same person, and a person who signed up by email, both go in.
    expect(await signIn(ctx.client())).not.toContain('error=')
    const bea = await signUp(ctx.client(), 'bea@example.com', 'Bea').catch(() => null)
    expect(bea).toBeNull() // the form is refused...
    ctx.store.users.create({ name: 'Cy', email: 'cy@example.com', emailVerified: true })
    idp.claims = { ...claims(3), email: 'cy@example.com' } // ...but linking Google to an existing account is not a sign-up
    expect(await signIn(ctx.client())).not.toContain('error=')
  })
})

describe('the owner signing up for the first time', () => {
  it('is approved at once through Google, which has confirmed the address, and is an admin', async () => {
    const idp = new FakeIdentityProvider(
      { subject: 'owner', email: 'Owner@Example.com', emailVerified: true, name: 'Olive' },
      'google',
      'Google',
    )
    const ctx = setup({
      approvalRequired: true,
      adminEmails: ['owner@example.com'],
      identityProviders: [idp],
      signupsPerHour: 1,
    })
    await signUp(ctx.client(), 'p@example.com', 'Pat') // the whole allowance for the hour
    const client = ctx.client()
    const start = await client.get('/api/auth/oauth/google/start')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!
    const res = await client.get(`/api/auth/oauth/google/callback?code=good-code&state=${state}`)
    expect(res.headers.get('location')).not.toContain('error=')
    expect(ctx.store.users.findByEmail('Owner@Example.com')?.approval).toBe('approved')
    expect(await (await client.get('/api/auth/me')).json()).toMatchObject({
      approval: 'approved',
      isAdmin: true,
    })
    expect((await client.get('/api/admin/accounts')).status).toBe(200)
  })

  it('is let in by the link in the confirmation email, even signed out, and is not held up by the allowance', async () => {
    const ctx = setup({
      approvalRequired: true,
      adminEmails: ['owner@example.com'],
      signupsPerHour: 1,
    })
    await signUp(ctx.client(), 'p@example.com', 'Pat') // the whole allowance for the hour
    const phone = ctx.client()
    await signUp(phone, 'owner@example.com', 'Olive') // not refused, but not approved before the address is confirmed
    const record = () => ctx.store.users.findByEmail('owner@example.com')!
    expect(record()).toMatchObject({ approval: 'waiting', isAdmin: false })

    const link = ctx.mailer.outbox.filter((m) => m.to === 'owner@example.com').at(-1)!
    const token = link.text.match(/verify-email\?token=([\w-]+)/)![1]
    expect((await ctx.client().post('/api/auth/verify-email', { token })).status).toBe(200)
    expect(record()).toMatchObject({ approval: 'approved', isAdmin: true })
    expect((await phone.get('/api/admin/accounts')).status).toBe(200)
  })

  it('does not approve someone else who signs up with the owner’s address before confirming it', async () => {
    const ctx = setup({ approvalRequired: true, adminEmails: ['owner@example.com'] })
    const squatter = ctx.client()
    await signUp(squatter, 'owner@example.com', 'Not Olive')
    expect((await squatter.get('/api/publications')).status).toBe(403)
  })
})

describe('the admin command and settings', () => {
  it('grants and revokes admin by address, only for a confirmed one', async () => {
    const ctx = setup({ approvalRequired: true })
    await signUp(ctx.client(), 'cy@example.com', 'Cy')
    expect(setAdminByEmail(ctx.store, 'nobody@example.com', true)).toBe('no-account')
    expect(setAdminByEmail(ctx.store, 'cy@example.com', true)).toBe('unconfirmed')
    verifyAccounts(ctx, 'cy@example.com')
    expect(setAdminByEmail(ctx.store, 'Cy@Example.com', true)).toBe('done')
    const cy = ctx.store.users.findByEmail('cy@example.com')!
    expect(cy).toMatchObject({ isAdmin: true, approval: 'approved' })
    expect(setAdminByEmail(ctx.store, 'cy@example.com', false)).toBe('done')
    expect(ctx.store.users.findById(cy.id)!.isAdmin).toBe(false)
  })

  it('takes admin away when the address changes', async () => {
    const ctx = setup({ approvalRequired: true })
    await signUp(ctx.client(), 'cy@example.com', 'Cy')
    verifyAccounts(ctx, 'cy@example.com')
    setAdminByEmail(ctx.store, 'cy@example.com', true)
    const id = ctx.store.users.findByEmail('cy@example.com')!.id
    ctx.store.users.setVerifiedEmail(id, 'cy2@example.com')
    expect(ctx.store.users.findById(id)!.isAdmin).toBe(false)
  })

  it('reads ADMIN_EMAILS as a list, and approval as required unless told otherwise', () => {
    expect(loadConfig({ ADMIN_EMAILS: ' A@x.org, b@x.org ,' }).ADMIN_EMAILS).toEqual([
      'a@x.org',
      'b@x.org',
    ])
    expect(loadConfig({}).ACCOUNT_APPROVAL).toBe('required')
    expect(loadConfig({ ACCOUNT_APPROVAL: 'open' }).ACCOUNT_APPROVAL).toBe('open')
    expect(() => loadConfig({ ACCOUNT_APPROVAL: 'maybe' })).toThrow()
  })
})

describe('deleting accounts', () => {
  it('keeps the audit log but unlinks the people', async () => {
    const { ctx, newcomer, decide } = await world()
    const bea = await newcomer()
    await decide(bea.user.id, 'approve')
    const client: TestClient = ctx.client()
    await client.post('/api/auth/login', { email: 'bea@example.com', password: PASSWORD })
    expect((await client.delete('/api/account', { password: PASSWORD })).status).toBe(204)
    const [entry] = ctx.store.adminAudit.list()
    expect(entry).toMatchObject({ action: 'approve', userId: null })
    expect(entry!.adminId).not.toBeNull()
    expect(JSON.stringify(allRows(ctx))).not.toContain('bea@example.com')
  })

  it('unlinks the admin from their decisions when the admin goes', async () => {
    const { ctx, admin, newcomer, decide } = await world()
    const bea = await newcomer()
    await decide(bea.user.id, 'approve')
    expect((await admin.delete('/api/account', { password: PASSWORD })).status).toBe(204)
    expect(ctx.store.adminAudit.list()).toMatchObject([{ adminId: null, userId: bea.user.id }])
  })
})

it('keeps `register` creating working accounts when approval is off', async () => {
  const ctx = setup()
  const c = ctx.client()
  await register(c)
  expect((await c.get('/api/publications')).status).toBe(200)
})
