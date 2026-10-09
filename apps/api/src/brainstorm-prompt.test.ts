import { beforeEach, describe, expect, it } from 'vitest'
import { BRAINSTORM_PROMPT_MAX } from '@lfwa/core'
import { DEFAULT_BRAINSTORM_PROMPT } from '@lfwa/prompts'
import { BrainstormPromptService } from './services/brainstorm-prompt'
import { PASSWORD, register, setup, type TestClient } from './test-helpers'

const URL = '/api/account/brainstorm-prompt'

describe('the brainstorming prompt setting', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
  })

  it('needs someone signed in', async () => {
    const stranger = ctx.client()
    expect((await stranger.get(URL)).status).toBe(401)
    expect((await stranger.put(URL, { prompt: 'x' })).status).toBe(401)
    expect((await stranger.delete(URL)).status).toBe(401)
  })

  it('starts as the default prompt from prompts/brainstorm-default.md', async () => {
    const res = await ada.get(URL)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ prompt: DEFAULT_BRAINSTORM_PROMPT, isDefault: true })
    expect(DEFAULT_BRAINSTORM_PROMPT).toMatch(/commissioning editor/)
  })

  it("saves a person's own version, and keeps it separate from other people's", async () => {
    const res = await ada.put(URL, { prompt: '  Be gentle with me.  ' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ prompt: 'Be gentle with me.', isDefault: false })
    expect(await (await ada.get(URL)).json()).toEqual({
      prompt: 'Be gentle with me.',
      isDefault: false,
    })
    expect(await (await bob.get(URL)).json()).toEqual({
      prompt: DEFAULT_BRAINSTORM_PROMPT,
      isDefault: true,
    })
  })

  it('keeps line breaks, normalising Windows line endings', async () => {
    await ada.put(URL, { prompt: 'One.\r\n\r\nTwo.\nThree.' })
    expect((await (await ada.get(URL)).json()).prompt).toBe('One.\n\nTwo.\nThree.')
  })

  it('goes back to the default on reset, and says so', async () => {
    await ada.put(URL, { prompt: 'Mine' })
    const res = await ada.delete(URL)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ prompt: DEFAULT_BRAINSTORM_PROMPT, isDefault: true })
    expect(ctx.store.userPrompts.getBrainstorm(await userId(ada))).toBeUndefined()
    expect((await ada.delete(URL)).status).toBe(200) // resetting twice is harmless
  })

  it('does not store a version identical to the default', async () => {
    await ada.put(URL, { prompt: 'Mine' })
    const res = await ada.put(URL, { prompt: `\n${DEFAULT_BRAINSTORM_PROMPT}\r\n` })
    expect(await res.json()).toEqual({ prompt: DEFAULT_BRAINSTORM_PROMPT, isDefault: true })
    expect(ctx.store.userPrompts.getBrainstorm(await userId(ada))).toBeUndefined()
  })

  it('refuses an empty or over-long prompt with a readable message', async () => {
    for (const prompt of ['', '   \n  ']) {
      const res = await ada.put(URL, { prompt })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('Write a prompt, or reset to the default one')
    }
    const long = await ada.put(URL, { prompt: 'x'.repeat(BRAINSTORM_PROMPT_MAX + 1) })
    expect(long.status).toBe(400)
    expect((await long.json()).error).toContain('8,000 characters or fewer')
    expect((await ada.put(URL, { prompt: 'x'.repeat(BRAINSTORM_PROMPT_MAX) })).status).toBe(200)
    expect((await ada.put(URL, {})).status).toBe(400)
  })

  it('is removed with the account', async () => {
    const id = await userId(ada)
    await ada.put(URL, { prompt: 'Mine' })
    expect(ctx.store.userPrompts.getBrainstorm(id)).toBe('Mine')
    const res = await ada.delete('/api/account', {
      confirmEmail: 'ada@example.com',
      password: PASSWORD,
    })
    expect(res.status).toBe(204)
    expect(ctx.store.userPrompts.getBrainstorm(id)).toBeUndefined()
  })

  async function userId(client: TestClient): Promise<string> {
    return (await (await client.get('/api/auth/me')).json()).id
  }
})

describe('BrainstormPromptService', () => {
  it('lets improvements to the default reach people who have not changed it, and nobody else', async () => {
    const { store, client } = setup()
    const [ada, bob] = [client(), client()]
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    const ids = [await userIdOf(ada), await userIdOf(bob)] as [string, string]

    const v1 = new BrainstormPromptService(store, 'Default v1')
    v1.save(ids[0], 'Ada’s own')
    v1.save(ids[1], 'Default v1') // saved as-is, so still "default"
    expect(v1.effective(ids[0])).toBe('Ada’s own')
    expect(v1.effective(ids[1])).toBe('Default v1')

    const v2 = new BrainstormPromptService(store, 'Default v2')
    expect(v2.effective(ids[0])).toBe('Ada’s own')
    expect(v2.effective(ids[1])).toBe('Default v2')
  })
})

async function userIdOf(client: TestClient): Promise<string> {
  return (await (await client.get('/api/auth/me')).json()).id
}
