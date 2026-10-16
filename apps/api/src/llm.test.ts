import { describe, expect, it } from 'vitest'
import {
  GOOD_KEY,
  register,
  saveKey,
  setup,
  sharePublication,
  verifyAccounts,
  createDraft,
} from './test-helpers'

async function signedInUser(ctx = setup(), email = 'ada@example.com', name = 'Ada') {
  const client = ctx.client()
  await register(client, email, name)
  verifyAccounts(ctx, email) // these tests aren't about email verification
  const publicationId = (await (await client.get('/api/publications')).json())[0].id as string
  return { ctx, client, publicationId }
}

describe('LLM settings', () => {
  it('starts with no key and the default model', async () => {
    const { client } = await signedInUser()
    expect(await (await client.get('/api/llm')).json()).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      hasKey: false,
      keyHint: null,
    })
  })

  it('requires sign-in', async () => {
    const c = setup().client()
    expect((await c.get('/api/llm')).status).toBe(401)
    expect(
      (
        await c.put('/api/llm', {
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          apiKey: GOOD_KEY,
        })
      ).status,
    ).toBe(401)
  })

  it('checks the key with the provider, then stores it and reveals only a hint', async () => {
    const { ctx, client } = await signedInUser()
    const settings = await saveKey(client, GOOD_KEY, 'claude-haiku-5-5')
    expect(settings).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      hasKey: true,
      keyHint: '…7890',
    })
    // The key is checked by listing the models it can use, which spends no tokens (#206).
    expect(ctx.modelCalls).toHaveLength(1)
    expect(ctx.modelCalls[0]!.config).toMatchObject({ apiKey: GOOD_KEY })
    expect(ctx.llmCalls).toHaveLength(0)
  })

  it('never returns or stores the key in plain text', async () => {
    const { ctx, client } = await signedInUser()
    const put = await client.put('/api/llm', {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      apiKey: GOOD_KEY,
    })
    const responses = [
      JSON.stringify(await put.json()),
      JSON.stringify(await (await client.get('/api/llm')).json()),
    ]
    for (const body of responses) expect(body).not.toContain(GOOD_KEY)

    const me = (await (await client.get('/api/auth/me')).json()).id
    const stored = ctx.store.credentials.get(me)!
    expect(stored.encryptedKey).not.toContain(GOOD_KEY)
    expect(stored.keyHint).toBe('…7890')
  })

  it('rejects a key the provider refuses, and saves nothing', async () => {
    const { client } = await signedInUser()
    const res = await client.put('/api/llm', {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      apiKey: 'bad-key-1234567890',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/rejected/)
    expect((await (await client.get('/api/llm')).json()).hasKey).toBe(false)
  })

  it('reports provider outages differently from bad keys, without saving', async () => {
    const { client } = await signedInUser()
    const res = await client.put('/api/llm', {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      apiKey: 'down-key-1234567890',
    })
    expect(res.status).toBe(502)
    expect((await (await client.get('/api/llm')).json()).hasKey).toBe(false)
  })

  it('keeps a good key when a replacement is rejected', async () => {
    const { client } = await signedInUser()
    await saveKey(client)
    await client.put('/api/llm', {
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      apiKey: 'bad-key-1234567890',
    })
    expect(await (await client.get('/api/llm')).json()).toMatchObject({
      hasKey: true,
      keyHint: '…7890',
    })
  })

  it('changes the model without re-sending the key, but needs a key to exist', async () => {
    const { ctx, client } = await signedInUser()
    const noKey = await client.put('/api/llm', { provider: 'anthropic', model: 'claude-opus-5-5' })
    expect(noKey.status).toBe(400)

    await saveKey(client)
    const calls = ctx.llmCalls.length
    const res = await client.put('/api/llm', { provider: 'anthropic', model: 'claude-opus-5-5' })
    // It is checked against the live list, using the stored key.
    expect(ctx.modelCalls.at(-1)!.config).toMatchObject({ apiKey: GOOD_KEY })
    expect(await res.json()).toMatchObject({
      model: 'claude-opus-5-5',
      hasKey: true,
      keyHint: '…7890',
    })
    expect(ctx.llmCalls).toHaveLength(calls) // no provider call needed
  })

  it('refuses a model the provider does not offer this key, and saves nothing', async () => {
    const { client } = await signedInUser()
    const res = await client.put('/api/llm', {
      provider: 'anthropic',
      model: 'gpt-4',
      apiKey: GOOD_KEY,
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/model/i)
    expect((await (await client.get('/api/llm')).json()).hasKey).toBe(false)
  })

  it('uses the default model for a first key, or the first one offered if the default is not', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const first = await ada.client.put('/api/llm', { provider: 'anthropic', apiKey: GOOD_KEY })
    expect(await first.json()).toMatchObject({ model: 'claude-sonnet-5-5', hasKey: true })

    ctx.setModels([{ id: 'claude-future-1', label: 'Claude Future 1' }])
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    const second = await bob.client.put('/api/llm', { provider: 'anthropic', apiKey: GOOD_KEY })
    expect(await second.json()).toMatchObject({ model: 'claude-future-1' })
  })

  it('keeps the chosen model when only a replacement key is sent', async () => {
    const { client } = await signedInUser()
    await saveKey(client, GOOD_KEY, 'claude-haiku-5-5')
    const res = await client.put('/api/llm', { provider: 'anthropic', apiKey: GOOD_KEY })
    expect(await res.json()).toMatchObject({ model: 'claude-haiku-5-5' })
  })

  it('validates the provider and key shape', async () => {
    const { client } = await signedInUser()
    expect(
      (await client.put('/api/llm', { provider: 'openai', model: 'x', apiKey: GOOD_KEY })).status,
    ).toBe(400)
    expect(
      (
        await client.put('/api/llm', {
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          apiKey: 'short',
        })
      ).status,
    ).toBe(400)
  })

  it('removes the key', async () => {
    const { client } = await signedInUser()
    await saveKey(client)
    expect((await client.delete('/api/llm')).status).toBe(204)
    expect((await (await client.get('/api/llm')).json()).hasKey).toBe(false)
  })

  it('keeps each user’s key separate', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    await saveKey(ada.client, 'sk-ant-ada-key-1111111111')
    expect((await (await bob.client.get('/api/llm')).json()).hasKey).toBe(false)
  })

  it('throttles key submissions', async () => {
    const { client } = await signedInUser()
    let last = 0
    for (let i = 0; i < 12; i++) {
      last = (
        await client.put('/api/llm', {
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          apiKey: 'bad-key-1234567890',
        })
      ).status
    }
    expect(last).toBe(429)
  })
})

describe('the models on offer', () => {
  it('needs someone signed in', async () => {
    expect((await setup().client().get('/api/llm/models')).status).toBe(401)
  })

  it('asks for a key first', async () => {
    const { client } = await signedInUser()
    const res = await client.get('/api/llm/models')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/API key/)
  })

  it('lists what the provider offers the stored key, with the provider’s own names', async () => {
    const { ctx, client } = await signedInUser()
    await saveKey(client)
    ctx.setModels([
      { id: 'claude-b', label: 'Claude B' },
      { id: 'claude-a', label: 'Claude A' },
    ])
    const res = await client.get('/api/llm/models')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      models: [
        { id: 'claude-b', label: 'Claude B' },
        { id: 'claude-a', label: 'Claude A' },
      ],
    })
    expect(ctx.modelCalls.at(-1)!.config.apiKey).toBe(GOOD_KEY)
  })

  it('says so when the stored key has been revoked, or the provider is down', async () => {
    const ctx = setup()
    const { client } = await signedInUser(ctx)
    await saveKey(client)
    // Simulate the stored key being revoked later by swapping in one the fake provider refuses.
    const me = (await (await client.get('/api/auth/me')).json()).id
    const { createSecretBox } = await import('./auth/secret-box')
    const box = createSecretBox('test-key-secret-test-key-secret!!')
    const stored = ctx.store.credentials.get(me)!
    for (const [key, status] of [
      ['bad-revoked-1234567890', 400],
      ['down-outage-1234567890', 502],
    ] as const) {
      ctx.store.credentials.save(me, {
        ...stored,
        encryptedKey: box.encrypt(key, `llm-key:${me}:anthropic`),
      })
      const res = await client.get('/api/llm/models')
      expect(res.status).toBe(status)
      expect(JSON.stringify(await res.json())).not.toContain(key)
    }
  })

  it('never lists models for a user with no key of their own', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    await saveKey(ada.client)
    expect((await bob.client.get('/api/llm/models')).status).toBe(409)
  })

  it('throttles requests', async () => {
    const { client } = await signedInUser()
    await saveKey(client)
    let last = 0
    for (let i = 0; i < 40; i++) last = (await client.get('/api/llm/models')).status
    expect(last).toBe(429)
  })
})

describe('using the key', () => {
  it('asks for a key before running AI features', async () => {
    const { client, publicationId } = await signedInUser()
    const draft = await createDraft(client, publicationId, { title: 'T', body: 'B' })
    const res = await client.post(`/api/publications/${publicationId}/assist/critique`, {
      draftId: draft.id,
    })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/API key/)
  })

  it('runs on the stored key and chosen model', async () => {
    const { ctx, client, publicationId } = await signedInUser()
    await saveKey(client, 'sk-ant-ada-key-1111111111', 'claude-opus-5-5')
    const draft = await createDraft(client, publicationId, { title: 'T', body: 'B' })
    const res = await client.post(`/api/publications/${publicationId}/assist/critique`, {
      draftId: draft.id,
    })
    expect((await res.json()).round.summary).toContain('claude-opus-5-5')
    expect(ctx.llmCalls.at(-1)!.config).toMatchObject({
      apiKey: 'sk-ant-ada-key-1111111111',
      model: 'claude-opus-5-5',
    })
  })

  it('charges whoever makes the request, even in a shared publication', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    await saveKey(ada.client, 'sk-ant-ada-key-1111111111')
    await saveKey(bob.client, 'sk-ant-bob-key-2222222222')
    await sharePublication(ctx, ada.client, ada.publicationId, bob.client, 'bob@example.com')
    // Each critiques a draft they are the editor of; the AI call is made with the key of whoever asks.
    const adas = await createDraft(ada.client, ada.publicationId, { title: 'T', body: 'B' })
    const bobs = await createDraft(bob.client, ada.publicationId, { title: 'T', body: 'B' })

    const bobAsked = await bob.client.post(
      `/api/publications/${ada.publicationId}/assist/critique`,
      { draftId: bobs.id },
    )
    expect(bobAsked.status).toBe(200)
    expect(ctx.llmCalls.at(-1)!.config.apiKey).toBe('sk-ant-bob-key-2222222222')
    const adaAsked = await ada.client.post(
      `/api/publications/${ada.publicationId}/assist/critique`,
      { draftId: adas.id },
    )
    expect(adaAsked.status).toBe(200)
    expect(ctx.llmCalls.at(-1)!.config.apiKey).toBe('sk-ant-ada-key-1111111111')
  })

  it('does not fall back to anyone else’s key for a user without one', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    await saveKey(ada.client)
    await sharePublication(ctx, ada.client, ada.publicationId, bob.client, 'bob@example.com')
    const draft = await createDraft(ada.client, ada.publicationId, { title: 'T', body: 'B' })
    // Bob must be the editor for his request to get as far as a key.
    const bobId = (await (await bob.client.get('/api/auth/me')).json()).id
    ctx.store.drafts.reassignEditor(ada.publicationId, draft.editorId, bobId)
    const res = await bob.client.post(`/api/publications/${ada.publicationId}/assist/critique`, {
      draftId: draft.id,
    })
    expect(res.status).toBe(409)
  })

  it('tells the user when their key stops working, and when the provider fails', async () => {
    const ctx = setup()
    const { client, publicationId } = await signedInUser(ctx)
    await saveKey(client)
    const draft = await createDraft(client, publicationId, { title: 'T', body: 'B' })

    // Simulate the stored key being revoked later by swapping in one the fake provider refuses.
    const me = (await (await client.get('/api/auth/me')).json()).id
    const { createSecretBox } = await import('./auth/secret-box')
    const box = createSecretBox('test-key-secret-test-key-secret!!')
    const stored = ctx.store.credentials.get(me)!
    for (const [key, status] of [
      ['bad-revoked-1234567890', 400],
      ['down-outage-1234567890', 502],
    ] as const) {
      ctx.store.credentials.save(me, {
        ...stored,
        encryptedKey: box.encrypt(key, `llm-key:${me}:anthropic`),
      })
      const res = await client.post(`/api/publications/${publicationId}/assist/critique`, {
        draftId: draft.id,
      })
      expect(res.status).toBe(status)
      expect(JSON.stringify(await res.json())).not.toContain(key)
    }
  })

  it('refuses a ciphertext copied from another user’s row', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    await saveKey(ada.client)
    const adaId = (await (await ada.client.get('/api/auth/me')).json()).id
    const bobId = (await (await bob.client.get('/api/auth/me')).json()).id
    ctx.store.credentials.save(bobId, ctx.store.credentials.get(adaId)!)
    const draft = await createDraft(bob.client, bob.publicationId, { title: 'T', body: 'B' })
    const res = await bob.client.post(`/api/publications/${bob.publicationId}/assist/critique`, {
      draftId: draft.id,
    })
    expect(res.status).toBe(500)
  })
})
