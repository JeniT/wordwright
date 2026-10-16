import { describe, expect, it } from 'vitest'
import { MAX_CRITIQUE_POINTS, blockHash, splitBlocks } from '@wordwright/core'
import { formatDraftForCritique, parseCritique } from './services/critique'
import {
  PASSWORD,
  createDraft,
  register,
  saveKey,
  setup,
  sharePublication,
  verifyAccounts,
} from './test-helpers'

const blocks = splitBlocks('Opening paragraph.\n\nMiddle paragraph.\n\nEnd.')
const point = (block: string) => ({ block, point: `About ${block}`, reason: 'Because.' })
const reply = (points: unknown[], extra: object = {}) =>
  JSON.stringify({ summary: 'Fine.', ready: false, points, ...extra })

describe('formatDraftForCritique', () => {
  it('sends the title, then each block under the id the model must use', () => {
    const { message } = formatDraftForCritique({ title: 'T', body: 'One.\n\nTwo.' })
    expect(message).toBe('# T\n\n[b1] One.\n\n[b2] Two.')
  })
})

describe('parseCritique', () => {
  it('reads points, adding the start of the block each is about', () => {
    expect(parseCritique(reply([point('b2'), point('whole')]), blocks)).toEqual({
      summary: 'Fine.',
      ready: false,
      points: [
        {
          block: 'b2',
          excerpt: 'Middle paragraph.',
          hash: blockHash('Middle paragraph.'),
          point: 'About b2',
          reason: 'Because.',
        },
        { block: 'whole', excerpt: '', hash: null, point: 'About whole', reason: 'Because.' },
      ],
    })
  })

  it('reads a reply wrapped in a code fence', () => {
    const fenced = '```json\n' + reply([point('b1')]) + '\n```'
    expect(parseCritique(fenced, blocks)?.points).toHaveLength(1)
  })

  it('never lets a point name a block it was not shown', () => {
    const result = parseCritique(reply([point('b9'), point('b1'), point('__proto__')]), blocks)
    expect(result?.points.map((p) => p.block)).toEqual(['b1'])
  })

  it('is not a critique when every point was about something unseen', () => {
    expect(parseCritique(reply([point('b9')]), blocks)).toBeNull()
  })

  it('keeps only the most important points, in the order given', () => {
    const many = Array.from({ length: 9 }, (_, i) => point(i % 2 ? 'b1' : 'b2'))
    many[0] = { ...many[0]!, point: 'The first and most important' }
    const result = parseCritique(reply(many), blocks)
    expect(result?.points).toHaveLength(MAX_CRITIQUE_POINTS)
    expect(result?.points[0]?.point).toBe('The first and most important')
  })

  it('says ready with no points when there is nothing important left', () => {
    expect(parseCritique(reply([], { ready: true, summary: 'Ready.' }), blocks)).toEqual({
      summary: 'Ready.',
      ready: true,
      points: [],
    })
  })

  it('refuses anything else', () => {
    expect(parseCritique('Tighten the opening.', blocks)).toBeNull()
    expect(parseCritique('{"summary": 1}', blocks)).toBeNull()
    expect(parseCritique('{not json}', blocks)).toBeNull()
  })
})

// ---- critique rounds kept with the draft ---------------------------------------------------------------------

describe('kept critiques', () => {
  async function ada() {
    const ctx = setup()
    const client = ctx.client()
    await register(client, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    await saveKey(client)
    const publicationId = (await (await client.get('/api/publications')).json())[0].id as string
    const draft = await createDraft(client, publicationId, {
      title: 'T',
      body: 'First paragraph.\n\nSecond paragraph.',
    })
    const base = `/api/publications/${publicationId}`
    return { ctx, client, publicationId, draft, base }
  }

  it('has none until the draft is critiqued, then returns the latest round and its points as comments with their anchors', async () => {
    const { client, base, draft } = await ada()
    expect(await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()).toEqual({
      round: null,
      used: 0,
      allowed: 3,
    })
    expect(await (await client.get(`${base}/drafts/${draft.id}/comments`)).json()).toEqual([])

    const made = await (await client.post(`${base}/assist/critique`, { draftId: draft.id })).json()
    const again = await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()
    expect(again).toEqual(made)
    expect(again.used).toBe(1)
    expect(again.round.points).toBeUndefined() // the points are comments now
    const [first] = await (await client.get(`${base}/drafts/${draft.id}/comments`)).json()
    expect(first).toMatchObject({
      byAi: true,
      authorId: null,
      authorName: null,
      block: 'b1',
      excerpt: 'First paragraph.',
      hash: blockHash('First paragraph.'),
      text: 'Needs a stronger opening.',
      reason: 'It is the first thing read.',
      resolved: false,
    })
    expect(first.id).toBeTruthy()
  })

  it('keeps every round but returns the newest', async () => {
    const { client, base, draft } = await ada()
    await client.post(`${base}/assist/critique`, { draftId: draft.id })
    const second = await (
      await client.post(`${base}/assist/critique`, { draftId: draft.id })
    ).json()
    const latest = await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()
    expect(latest.round.id).toBe(second.round.id)
    // Only the latest round's comments are listed.
    expect(await (await client.get(`${base}/drafts/${draft.id}/comments`)).json()).toHaveLength(1)
  })

  it('is private to the publication and needs sign-in', async () => {
    const { ctx, base, draft } = await ada()
    expect((await ctx.client().get(`${base}/drafts/${draft.id}/critique`)).status).toBe(401)
    const eve = ctx.client()
    await register(eve, 'eve@example.com', 'Eve')
    expect((await eve.get(`${base}/drafts/${draft.id}/critique`)).status).toBeGreaterThanOrEqual(
      403,
    )
  })

  it('goes with the draft, and with the publication', async () => {
    const { ctx, client, base, draft, publicationId } = await ada()
    await client.post(`${base}/assist/critique`, { draftId: draft.id })
    expect(ctx.store.critiques.latest(draft.id)).toBeDefined()
    expect(ctx.store.comments.all(draft.id)).toHaveLength(1)
    await client.delete(`${base}/drafts/${draft.id}`)
    expect(ctx.store.critiques.latest(draft.id)).toBeUndefined()
    expect(ctx.store.comments.all(draft.id)).toEqual([])

    const second = await createDraft(client, publicationId, { title: 'V', body: 'Again.' })
    await client.post(`${base}/assist/critique`, { draftId: second.id })
    expect((await client.delete(base)).status).toBe(204)
    expect(ctx.store.critiques.latest(second.id)).toBeUndefined()
    expect(ctx.store.comments.all(second.id)).toEqual([])
  })
})

// ---- the limit on critiques per draft ------------------------------------------------------------------------

describe('critique rounds per draft', () => {
  async function ada() {
    const ctx = setup()
    const client = ctx.client()
    await register(client, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    await saveKey(client)
    const publicationId = (await (await client.get('/api/publications')).json())[0].id as string
    const base = `/api/publications/${publicationId}`
    const draft = await createDraft(client, publicationId, { title: 'T', body: 'First paragraph.' })
    const ask = (draftId = draft.id) => client.post(`${base}/assist/critique`, { draftId })
    return { ctx, client, publicationId, base, draft, ask }
  }

  it('gives a draft three looks by default, counted as they are used', async () => {
    const { ask } = await ada()
    for (const used of [1, 2, 3]) {
      const res = await ask()
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ used, allowed: 3 })
    }
  })

  it('refuses the next one kindly, before it spends anything on the AI', async () => {
    const { ctx, ask } = await ada()
    for (let i = 0; i < 3; i++) await ask()
    const calls = ctx.llmCalls.length
    const res = await ask()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/3 looks.*publish.*account settings/)
    expect(ctx.llmCalls).toHaveLength(calls)
  })

  it('counts per draft, and editing the draft does not earn more looks', async () => {
    const { client, base, publicationId, draft, ask } = await ada()
    for (let i = 0; i < 3; i++) await ask()
    await client.put(`${base}/drafts/${draft.id}`, {
      title: 'T',
      body: 'A completely new text.',
      version: draft.version,
    })
    expect((await ask()).status).toBe(409)
    const other = await createDraft(client, publicationId, { title: 'U', body: 'Another.' })
    expect((await ask(other.id)).status).toBe(200)
  })

  it('follows the writer’s own setting, from one to five', async () => {
    const { client, ask, base, draft } = await ada()
    expect(await (await client.get('/api/account/critique-settings')).json()).toEqual({ rounds: 3 })
    expect(
      await (await client.put('/api/account/critique-settings', { rounds: 1 })).json(),
    ).toEqual({
      rounds: 1,
    })
    expect((await ask()).status).toBe(200)
    expect((await ask()).status).toBe(409)
    expect(await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()).toMatchObject({
      used: 1,
      allowed: 1,
    })
    await client.put('/api/account/critique-settings', { rounds: 5 })
    for (let i = 0; i < 4; i++) expect((await ask()).status).toBe(200)
    expect((await ask()).status).toBe(409)
  })

  it('rejects settings outside the bounds, and needs sign-in', async () => {
    const { client, ctx } = await ada()
    for (const rounds of [0, 6, 2.5, '3', null]) {
      expect((await client.put('/api/account/critique-settings', { rounds })).status).toBe(400)
    }
    expect((await ctx.client().get('/api/account/critique-settings')).status).toBe(401)
    expect((await ctx.client().put('/api/account/critique-settings', { rounds: 2 })).status).toBe(
      401,
    )
  })

  it('uses the limit of whoever asks, but the draft’s count is shared', async () => {
    const { ctx, client, publicationId, draft, ask } = await ada()
    const bob = ctx.client()
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'bob@example.com')
    await saveKey(bob)
    await sharePublication(ctx, client, publicationId, bob, 'bob@example.com')
    await bob.put('/api/account/critique-settings', { rounds: 4 })
    for (let i = 0; i < 3; i++) await ask()
    expect((await ask()).status).toBe(409) // Ada's limit is 3
    // The editor is whoever asks, so Bob becomes the editor to ask with his own limit.
    const bobId = (await (await bob.get('/api/auth/me')).json()).id
    ctx.store.drafts.reassignEditor(publicationId, draft.editorId, bobId)
    const res = await bob.post(`/api/publications/${publicationId}/assist/critique`, {
      draftId: draft.id,
    })
    expect(res.status).toBe(200) // Bob's is 4
    expect(await res.json()).toMatchObject({ used: 4, allowed: 4 })
  })

  it('removes a person’s setting with their account', async () => {
    const { ctx, client } = await ada()
    await client.put('/api/account/critique-settings', { rounds: 2 })
    const me = await (await client.get('/api/auth/me')).json()
    expect(ctx.store.userSettings.getCritiqueRounds(me.id)).toBe(2)
    const gone = await client.delete('/api/account', {
      password: PASSWORD,
    })
    expect(gone.status).toBe(204)
    expect(ctx.store.userSettings.getCritiqueRounds(me.id)).toBeUndefined()
  })
})
