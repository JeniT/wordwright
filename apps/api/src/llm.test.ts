import { describe, expect, it } from 'vitest'
import {
  GOOD_KEY,
  register,
  saveKey,
  setup,
  shareProfile,
  verifyAccounts,
  createDraft,
} from './test-helpers'

async function signedInUser(ctx = setup(), email = 'ada@example.com', name = 'Ada') {
  const client = ctx.client()
  await register(client, email, name)
  verifyAccounts(ctx, email) // these tests aren't about email verification
  const profileId = (await (await client.get('/api/profiles')).json())[0].id as string
  return { ctx, client, profileId }
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
    // One cheap validation call, made with the user's key and chosen model.
    expect(ctx.llmCalls).toHaveLength(1)
    expect(ctx.llmCalls[0]!.config).toMatchObject({ apiKey: GOOD_KEY, model: 'claude-haiku-5-5' })
    expect(ctx.llmCalls[0]!.request.maxTokens).toBe(1)
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
    expect(await res.json()).toMatchObject({
      model: 'claude-opus-5-5',
      hasKey: true,
      keyHint: '…7890',
    })
    expect(ctx.llmCalls).toHaveLength(calls) // no provider call needed
  })

  it('validates the provider, model and key shape', async () => {
    const { client } = await signedInUser()
    expect(
      (await client.put('/api/llm', { provider: 'anthropic', model: 'gpt-4', apiKey: GOOD_KEY }))
        .status,
    ).toBe(400)
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

describe('using the key', () => {
  it('asks for a key before running AI features', async () => {
    const { client, profileId } = await signedInUser()
    const draft = await createDraft(client, profileId, { title: 'T', body: 'B' })
    const res = await client.post(`/api/profiles/${profileId}/assist/critique`, {
      draftId: draft.id,
    })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/API key/)
  })

  it('runs on the stored key and chosen model', async () => {
    const { ctx, client, profileId } = await signedInUser()
    await saveKey(client, 'sk-ant-ada-key-1111111111', 'claude-opus-5-5')
    const draft = await createDraft(client, profileId, { title: 'T', body: 'B' })
    const res = await client.post(`/api/profiles/${profileId}/assist/critique`, {
      draftId: draft.id,
    })
    expect((await res.json()).text).toContain('claude-opus-5-5')
    expect(ctx.llmCalls.at(-1)!.config).toMatchObject({
      apiKey: 'sk-ant-ada-key-1111111111',
      model: 'claude-opus-5-5',
    })
  })

  it('charges whoever makes the request, even in a shared profile', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    await saveKey(ada.client, 'sk-ant-ada-key-1111111111')
    await saveKey(bob.client, 'sk-ant-bob-key-2222222222')
    await shareProfile(ctx, ada.client, ada.profileId, bob.client, 'bob@example.com')
    const draft = await createDraft(ada.client, ada.profileId, { title: 'T', body: 'B' })

    await bob.client.post(`/api/profiles/${ada.profileId}/assist/critique`, { draftId: draft.id })
    expect(ctx.llmCalls.at(-1)!.config.apiKey).toBe('sk-ant-bob-key-2222222222')
    await ada.client.post(`/api/profiles/${ada.profileId}/assist/critique`, { draftId: draft.id })
    expect(ctx.llmCalls.at(-1)!.config.apiKey).toBe('sk-ant-ada-key-1111111111')
  })

  it('does not fall back to anyone else’s key for a user without one', async () => {
    const ctx = setup()
    const ada = await signedInUser(ctx, 'ada@example.com', 'Ada')
    const bob = await signedInUser(ctx, 'bob@example.com', 'Bob')
    await saveKey(ada.client)
    await shareProfile(ctx, ada.client, ada.profileId, bob.client, 'bob@example.com')
    const draft = await createDraft(ada.client, ada.profileId, { title: 'T', body: 'B' })
    const res = await bob.client.post(`/api/profiles/${ada.profileId}/assist/critique`, {
      draftId: draft.id,
    })
    expect(res.status).toBe(409)
  })

  it('tells the user when their key stops working, and when the provider fails', async () => {
    const ctx = setup()
    const { client, profileId } = await signedInUser(ctx)
    await saveKey(client)
    const draft = await createDraft(client, profileId, { title: 'T', body: 'B' })

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
      const res = await client.post(`/api/profiles/${profileId}/assist/critique`, {
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
    const draft = await createDraft(bob.client, bob.profileId, { title: 'T', body: 'B' })
    const res = await bob.client.post(`/api/profiles/${bob.profileId}/assist/critique`, {
      draftId: draft.id,
    })
    expect(res.status).toBe(500)
  })
})
