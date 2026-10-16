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

describe('tutorial mode (#198)', () => {
  it('is on for a new account, and nothing has been seen or answered yet', async () => {
    const { client, me } = await ada()
    expect(me.tutorialMode).toBe(true)
    expect(await (await client.get('/api/account/tutorial')).json()).toEqual({
      on: true,
      seen: [],
      answered: false,
    })
  })

  it('is off for an account that predates it', async () => {
    const { ctx, client, me } = await ada()
    ctx.db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(me.id)
    expect((await (await client.get('/api/auth/me')).json()).tutorialMode).toBe(false)
    expect((await (await client.get('/api/account/tutorial')).json()).on).toBe(false)
  })

  it('can be switched off and on again, and switching it on keeps what was seen', async () => {
    const { client } = await ada()
    await client.post('/api/account/tutorial/seen', { kind: 'publication-ideas' })
    const off = await client.put('/api/account/tutorial', { on: false })
    expect(await off.json()).toMatchObject({ on: false, seen: ['publication-ideas'] })
    expect((await (await client.get('/api/auth/me')).json()).tutorialMode).toBe(false)
    const on = await client.put('/api/account/tutorial', { on: true })
    expect(await on.json()).toMatchObject({ on: true, seen: ['publication-ideas'] })
    expect((await (await client.get('/api/auth/me')).json()).tutorialMode).toBe(true)
  })

  it('remembers that the offer to turn it off was answered', async () => {
    const { client } = await ada()
    const res = await client.put('/api/account/tutorial', { answered: true })
    expect(await res.json()).toMatchObject({ on: true, answered: true })
    expect((await (await client.get('/api/account/tutorial')).json()).answered).toBe(true)
  })

  describe('pages seen', () => {
    it('records each kind of page once', async () => {
      const { client } = await ada()
      await client.post('/api/account/tutorial/seen', { kind: 'publication-ideas' })
      await client.post('/api/account/tutorial/seen', { kind: 'idea-research' })
      const again = await client.post('/api/account/tutorial/seen', { kind: 'publication-ideas' })
      expect((await again.json()).seen).toEqual(['publication-ideas', 'idea-research'])
    })

    it('refuses anything that is not a route name', async () => {
      const { client } = await ada()
      for (const kind of ['', 'Has Spaces', '<script>', 'x'.repeat(65)]) {
        const res = await client.post('/api/account/tutorial/seen', { kind })
        expect(res.status).toBe(400)
      }
    })

    it('stops growing at a limit, so a client cannot fill the table', async () => {
      const { client } = await ada()
      let last
      for (let i = 0; i < 105; i++) {
        last = await client.post('/api/account/tutorial/seen', { kind: `page-${i}` })
      }
      expect((await last!.json()).seen).toHaveLength(100)
    })
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
      expect((await rae.get('/api/account/tutorial')).status).toBe(404)
      expect((await rae.put('/api/account/tutorial', { on: true })).status).toBe(404)
      expect((await rae.post('/api/account/tutorial/seen', { kind: 'x' })).status).toBe(404)
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
    await client.post('/api/account/tutorial/seen', { kind: 'publication-ideas' })
    const gone = await client.delete('/api/account', {
      password: PASSWORD,
    })
    expect(gone.status).toBe(204)
    const rows = ctx.db.prepare('SELECT 1 FROM user_settings WHERE user_id = ?').all(me.id)
    expect(rows).toEqual([])
  })

  it('is not shown to signed-out visitors', async () => {
    const ctx = setup()
    expect((await ctx.client().get('/api/account/tutorial')).status).toBe(401)
  })
})
