import { describe, expect, it } from 'vitest'
import { MAX_REQUEST_BYTES } from './app'
import { createDraft, register, setup } from './test-helpers'

// The API reads a whole request into memory before validating it, so without a limit anyone, signed in or not, could
// send it something huge (#317).
describe('the size of a request', () => {
  it('refuses one that is too large, before anyone is signed in, with a message a person can act on', async () => {
    const ctx = setup()
    const res = await ctx.client().post('/api/auth/login', {
      email: 'ada@example.com',
      password: 'x'.repeat(MAX_REQUEST_BYTES),
    })
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/too large/i)
  })

  it('still saves a draft as long as a book', async () => {
    const ctx = setup()
    const ada = ctx.client()
    await register(ada)
    const publication = (await (await ada.get('/api/publications')).json())[0].id
    const draft = await createDraft(ada, publication)
    // About 150,000 words.
    const body = 'All work and no play makes a long book. '.repeat(20_000)
    const res = await ada.put(`/api/publications/${publication}/drafts/${draft.id}`, {
      title: 'Long',
      body,
      version: draft.version,
    })
    expect(res.status).toBe(200)
  })
})
