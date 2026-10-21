import { describe, expect, it } from 'vitest'
import {
  PASSWORD,
  createDraft,
  lastReviewToken,
  register,
  setup,
  verifyAccounts,
} from './test-helpers'

async function ada() {
  const ctx = setup()
  const client = ctx.client()
  await register(client, 'ada@example.com', 'Ada')
  verifyAccounts(ctx, 'ada@example.com')
  const me = await (await client.get('/api/auth/me')).json()
  return { ctx, client, me }
}

describe('tutorial mode (#198, #314)', () => {
  it('is on for a new account', async () => {
    const { me } = await ada()
    expect(me.tutorialMode).toBe(true)
  })

  it('is off for an account that predates it', async () => {
    const { ctx, client, me } = await ada()
    ctx.db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(me.id)
    expect((await (await client.get('/api/auth/me')).json()).tutorialMode).toBe(false)
  })

  it('can be switched off and on again', async () => {
    const { client } = await ada()
    const off = await client.put('/api/account/tutorial', { on: false })
    expect(await off.json()).toEqual({ on: false })
    expect((await (await client.get('/api/auth/me')).json()).tutorialMode).toBe(false)
    const on = await client.put('/api/account/tutorial', { on: true })
    expect(await on.json()).toEqual({ on: true })
    expect((await (await client.get('/api/auth/me')).json()).tutorialMode).toBe(true)
  })

  it('refuses a change that does not say on or off', async () => {
    const { client } = await ada()
    expect((await client.put('/api/account/tutorial', {})).status).toBe(400)
    expect((await client.put('/api/account/tutorial', { on: 'yes' })).status).toBe(400)
  })

  it('no longer keeps track of pages seen or an offer answered (#314)', async () => {
    const { client } = await ada()
    expect((await client.get('/api/account/tutorial')).status).toBe(404)
    expect((await client.post('/api/account/tutorial/seen', { kind: 'x' })).status).toBe(404)
  })

  describe('reviewer-only accounts', () => {
    async function reviewerAndWriter() {
      const { ctx, client } = await ada()
      const publication = (await (await client.get('/api/publications')).json())[0].id
      const draft = await createDraft(client, publication, { title: 'T', body: 'Body.' })
      await client.post(`/api/publications/${publication}/drafts/${draft.id}/send-for-review`, {
        emails: ['rae@example.com'],
      })
      await new Promise((r) => setTimeout(r, 0))
      const rae = ctx.client()
      const token = lastReviewToken(ctx.mailer)
      const res = await rae.post('/api/auth/register-reviewer', {
        token,
        name: 'Rae',
        password: PASSWORD,
      })
      expect(res.status).toBe(201)
      return { rae, user: await res.json() }
    }

    it('never has it, and cannot reach the setting (as with all of /account)', async () => {
      const { rae, user } = await reviewerAndWriter()
      expect(user.tutorialMode).toBe(false)
      expect((await rae.put('/api/account/tutorial', { on: true })).status).toBe(404)
    })

    it('gets it when they start writing, as any new account does', async () => {
      const { rae } = await reviewerAndWriter()
      const res = await rae.post('/api/reviews/start-writing', { handle: 'raewrites' })
      expect(res.status).toBeLessThan(300)
      expect((await (await rae.get('/api/auth/me')).json()).tutorialMode).toBe(true)
    })
  })

  it('is removed with the account', async () => {
    const { ctx, client, me } = await ada()
    await client.put('/api/account/tutorial', { on: false })
    const gone = await client.delete('/api/account', {
      password: PASSWORD,
    })
    expect(gone.status).toBe(204)
    const rows = ctx.db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').all(me.id)
    expect(rows).toEqual([])
  })

  it('cannot be changed by signed-out visitors', async () => {
    const ctx = setup()
    expect((await ctx.client().put('/api/account/tutorial', { on: true })).status).toBe(401)
  })
})
