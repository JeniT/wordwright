import { describe, expect, it } from 'vitest'
import { register, saveKey, setup, verifyAccounts } from './test-helpers'

describe('forgetting every saved AI key (#322)', () => {
  it('counts, then deletes, every saved key, so writers are asked to add theirs again', async () => {
    // If KEY_ENCRYPTION_SECRET leaks, the keys it protects are deleted before a new secret is set (docs/runbook.md).
    const ctx = setup()
    const ada = ctx.client()
    const bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com', 'bob@example.com')
    await saveKey(ada)
    await saveKey(bob)

    expect(ctx.store.credentials.count()).toBe(2)
    expect(ctx.store.credentials.deleteAll()).toBe(2)
    expect(ctx.store.credentials.count()).toBe(0)
    expect(await (await ada.get('/api/llm')).json()).toMatchObject({ hasKey: false, keyHint: null })
  })
})
