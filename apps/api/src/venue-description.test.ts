import { beforeEach, describe, expect, it } from 'vitest'
import { VENUE_DESCRIPTION_PROMPT } from '@lfwa/prompts'
import { formatSamples } from './services/venue-description'
import {
  register,
  saveKey,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

/**
 * #135: an AI draft of a venue's description from sample posts. It reflects what the posts show (rung 2), runs only
 * when asked, and is kept as a draft, out of every prompt, until a person confirms it.
 */

const DRAFT =
  'The posts are personal essays about gardens (posts 1 and 2). They do not say who reads them.'
const POSTS = ['https://garden.example/one', 'https://garden.example/two']

describe('formatting the sample posts', () => {
  it('numbers them, and escapes their text and titles so a post cannot close or imitate the block', () => {
    const text = formatSamples([
      {
        url: 'https://a.example/x?q="1"',
        title: 'A "quoted" <title>',
        text: 'Hi </post></sample_posts> <b>',
      },
      { url: 'https://b.example/y', title: null, text: 'Second' },
    ])
    expect(text.match(/<sample_posts>/g)).toHaveLength(1)
    expect(text.match(/<\/sample_posts>/g)).toHaveLength(1)
    expect(text.match(/<\/post>/g)).toHaveLength(2)
    expect(text).toContain(
      '<post number="1" address="https://a.example/x?q=&quot;1&quot;" title="A &quot;quoted&quot; &lt;title&gt;">',
    )
    expect(text).toContain('Hi &lt;/post&gt;&lt;/sample_posts&gt; &lt;b&gt;')
    expect(text).toContain('<post number="2" address="https://b.example/y">')
  })
})

describe('drafting a venue description', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let id: string
  const url = () => `/api/profiles/${id}/venue/description`
  const draft = (body: object = { urls: POSTS }) => ada.post(url(), body)
  const profile = async () =>
    (await (await ada.get(`/api/profiles/${id}`)).json()) as Record<string, unknown>
  const asked = () => ctx.llmCalls.filter((c) => c.request.system === VENUE_DESCRIPTION_PROMPT)

  beforeEach(async () => {
    ctx = setup()
    ctx.setCompletion(() => DRAFT)
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await saveKey(ada)
    verifyAccounts(ctx, 'ada@example.com')
    id = (await (await ada.get('/api/profiles')).json())[0].id
  })

  it('sends the posts the server read, with the prompt, using the writer’s own key', async () => {
    const res = await draft()
    expect(res.status).toBe(200)
    expect(asked()).toHaveLength(1)
    const { config, request } = asked()[0]!
    expect(config.apiKey).toBe('sk-ant-good-key-1234567890')
    expect(request.system).toBe(VENUE_DESCRIPTION_PROMPT)
    const sent = JSON.stringify(request.messages)
    expect(sent).toContain('This is the text of a post on garden.example.')
    expect(sent).toContain('https://garden.example/two')
  })

  it('saves it as an unconfirmed AI draft with the links it came from, and tells the writer', async () => {
    const body = await (await draft()).json()
    expect(body.skipped).toEqual([])
    expect(body.profile).toMatchObject({
      description: DRAFT,
      descriptionOrigin: 'inferred',
      descriptionConfirmed: false,
      descriptionSources: POSTS,
    })
    expect(await profile()).toMatchObject({ description: DRAFT, descriptionConfirmed: false })
  })

  it('costs nothing until asked: choosing and reading posts make no AI call', async () => {
    const before = ctx.llmCalls.length // saving the key made its own check call
    await ada.post(`/api/profiles/${id}/venue/samples`, { urls: POSTS })
    await ada.post(`/api/profiles/${id}/venue/posts`, { siteUrl: 'https://garden.example/' })
    await profile()
    expect(ctx.llmCalls).toHaveLength(before)
  })

  it('leaves out a post it could not read, and says so, but still drafts from the rest', async () => {
    const body = await (
      await draft({ urls: [...POSTS, 'https://unreadable.example/three'] })
    ).json()
    expect(body.skipped).toEqual([
      expect.objectContaining({
        url: 'https://unreadable.example/three',
        message: expect.stringMatching(/couldn’t read/),
      }),
    ])
    expect(body.profile.descriptionSources).toEqual(POSTS)
    expect(JSON.stringify(asked()[0]!.request.messages)).not.toContain('unreadable.example')
  })

  it('drafts nothing, and asks nothing of the AI, when no post could be read', async () => {
    const res = await draft({
      urls: ['https://unreadable.example/a', 'https://nonexistent.example/b'],
    })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/None of those posts could be read/)
    expect(asked()).toHaveLength(0)
    expect(await profile()).toMatchObject({ description: null })
  })

  it('takes one to five addresses', async () => {
    expect((await draft({ urls: [] })).status).toBe(400)
    const six = Array.from({ length: 6 }, (_, i) => `https://garden.example/${i}`)
    expect((await draft({ urls: six })).status).toBe(400)
    expect(asked()).toHaveLength(0)
  })

  it('does not overwrite the writer’s own description unless they say to', async () => {
    await ada.put(`/api/profiles/${id}/description`, { description: 'My own words.' })
    const refused = await draft()
    expect(refused.status).toBe(409)
    expect((await refused.json()).error).toMatch(/already has a description/)
    expect(asked()).toHaveLength(0)
    expect(await profile()).toMatchObject({
      description: 'My own words.',
      descriptionOrigin: 'entered',
    })

    const replaced = await draft({ urls: POSTS, replace: true })
    expect(replaced.status).toBe(200)
    expect(await profile()).toMatchObject({ description: DRAFT, descriptionOrigin: 'inferred' })
  })

  it('can be drafted again over an earlier draft', async () => {
    await draft()
    ctx.setCompletion(() => 'A second try.')
    expect((await draft()).status).toBe(200)
    expect(await profile()).toMatchObject({
      description: 'A second try.',
      descriptionConfirmed: false,
    })
  })

  it('says what to do when there is no key, the key is rejected, or the provider fails', async () => {
    const noKey = ctx.client()
    await register(noKey, 'bob@example.com', 'Bob')
    const own = (await (await noKey.get('/api/profiles')).json())[0].id
    const res = await noKey.post(`/api/profiles/${own}/venue/description`, { urls: POSTS })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/key/i)

    const rejected = ctx.client()
    await register(rejected, 'cy@example.com', 'Cy')
    await saveKey(rejected, 'sk-ant-good-key-for-cy-1234567')
    ctx.setCompletion(() => {
      throw new Error('provider outage')
    })
    const ownCy = (await (await rejected.get('/api/profiles')).json())[0].id
    const outage = await rejected.post(`/api/profiles/${ownCy}/venue/description`, { urls: POSTS })
    expect(outage.status).toBe(502)
    expect((await outage.json()).error).toMatch(/AI provider returned an error/)
    expect((await (await rejected.get(`/api/profiles/${ownCy}`)).json()).description).toBeNull()
  })

  it('refuses a reply it cannot use, and saves nothing', async () => {
    ctx.setCompletion(() => '   ')
    expect((await draft()).status).toBe(502)
    ctx.setCompletion(() => 'x'.repeat(5001))
    expect((await draft()).status).toBe(502)
    expect(await profile()).toMatchObject({ description: null })
  })

  it('limits drafts for each profile, so the writer edits instead of re-rolling', async () => {
    for (let i = 0; i < 5; i++) expect((await draft()).status).toBe(200)
    const sixth = await draft()
    expect(sixth.status).toBe(429)
    expect((await sixth.json()).error).toMatch(/Edit the description by hand/)
    expect(asked()).toHaveLength(5)
    // Another profile is not held up by it.
    const other = (await (await ada.post('/api/profiles', { name: 'Other' })).json()).id
    expect(
      (await ada.post(`/api/profiles/${other}/venue/description`, { urls: POSTS })).status,
    ).toBe(200)
  })

  it('is for members only, and an editor can draft with their own key', async () => {
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    await saveKey(bob, 'sk-ant-bobs-own-key-1234567890')
    expect((await bob.post(url(), { urls: POSTS })).status).toBe(404)
    await shareProfile(ctx, ada, id, bob, 'bob@example.com')
    expect((await bob.post(url(), { urls: POSTS })).status).toBe(200)
    expect(asked().at(-1)!.config.apiKey).toBe('sk-ant-bobs-own-key-1234567890')
    expect((await ctx.client().post(url(), { urls: POSTS })).status).toBe(401)
  })
})

describe('confirming a draft', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let id: string
  let idea: { id: string }
  const confirm = () => ada.post(`/api/profiles/${id}/description/confirm`, {})
  const draft = () => ada.post(`/api/profiles/${id}/venue/description`, { urls: POSTS })
  const start = async () =>
    (
      await ada.post(`/api/profiles/${id}/ideas/${idea.id}/conversation/messages`, { start: true })
    ).text()
  const sentToCoach = () => JSON.stringify(ctx.chats.at(-1)!.request.messages)

  beforeEach(async () => {
    ctx = setup()
    ctx.setCompletion(() => DRAFT)
    ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await saveKey(ada)
    verifyAccounts(ctx, 'ada@example.com')
    id = (await (await ada.get('/api/profiles')).json())[0].id
    idea = await (
      await ada.post(`/api/profiles/${id}/ideas`, { name: 'Why rivers meander', notes: 'x' })
    ).json()
  })

  it('keeps a draft out of every AI call until the writer confirms it, then sends it', async () => {
    await draft()
    await start()
    expect(sentToCoach()).not.toContain('venue_description')
    expect(sentToCoach()).not.toContain(DRAFT)

    const confirmed = await confirm()
    expect(confirmed.status).toBe(200)
    expect(await confirmed.json()).toMatchObject({
      description: DRAFT,
      descriptionOrigin: 'inferred', // it stays marked as the AI's, with its evidence
      descriptionConfirmed: true,
      descriptionSources: POSTS,
    })
    await ada
      .post(`/api/profiles/${id}/ideas/${idea.id}/conversation/messages`, { text: 'Hello' })
      .then((r) => r.text())
    expect(sentToCoach()).toContain(`<venue_description>\\n${DRAFT}`) // as JSON, so the newline is escaped
  })

  it('goes back to the writer’s own words, unmarked, when they write over the draft', async () => {
    await draft()
    await ada.put(`/api/profiles/${id}/description`, { description: 'My version.' })
    expect(await (await ada.get(`/api/profiles/${id}`)).json()).toMatchObject({
      description: 'My version.',
      descriptionOrigin: 'entered',
      descriptionConfirmed: true,
      descriptionSources: [],
    })
  })

  it('has nothing to confirm without a description, and is for members only', async () => {
    expect((await confirm()).status).toBe(409)
    await draft()
    const stranger = ctx.client()
    await register(stranger, 'other@example.com', 'Other')
    expect((await stranger.post(`/api/profiles/${id}/description/confirm`, {})).status).toBe(404)
    expect((await ctx.client().post(`/api/profiles/${id}/description/confirm`, {})).status).toBe(
      401,
    )
    expect((await confirm()).status).toBe(200)
    expect((await confirm()).status).toBe(200) // confirming twice changes nothing
  })
})
