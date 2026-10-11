import { describe, expect, it } from 'vitest'
import { MAX_CRITIQUE_POINTS, blockHash, splitBlocks } from '@lfwa/core'
import { formatDraftForCritique, parseCritique } from './services/critique'
import { createDraft, register, saveKey, setup, verifyAccounts } from './test-helpers'

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
    const profileId = (await (await client.get('/api/profiles')).json())[0].id as string
    const draft = await createDraft(client, profileId, {
      title: 'T',
      body: 'First paragraph.\n\nSecond paragraph.',
    })
    const base = `/api/profiles/${profileId}`
    return { ctx, client, profileId, draft, base }
  }

  it('has none until the draft is critiqued, then returns the latest round with its anchors', async () => {
    const { client, base, draft } = await ada()
    expect(await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()).toBeNull()

    const made = await (await client.post(`${base}/assist/critique`, { draftId: draft.id })).json()
    const again = await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()
    expect(again).toEqual(made)
    expect(again.points[0]).toMatchObject({
      block: 'b1',
      excerpt: 'First paragraph.',
      hash: blockHash('First paragraph.'),
    })
    expect(again.points[0].id).toBeTruthy()
  })

  it('keeps every round but returns the newest', async () => {
    const { client, base, draft } = await ada()
    await client.post(`${base}/assist/critique`, { draftId: draft.id })
    const second = await (
      await client.post(`${base}/assist/critique`, { draftId: draft.id })
    ).json()
    const latest = await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()
    expect(latest.id).toBe(second.id)
  })

  it('lets a point be set aside and brought back, and says no for a point it does not have', async () => {
    const { client, base, draft } = await ada()
    const round = await (await client.post(`${base}/assist/critique`, { draftId: draft.id })).json()
    const url = `${base}/drafts/${draft.id}/critique/points/${round.points[0].id}`
    expect((await (await client.put(url, { dismissed: true })).json()).points[0].dismissed).toBe(
      true,
    )
    expect(
      (await (await client.get(`${base}/drafts/${draft.id}/critique`)).json()).points[0].dismissed,
    ).toBe(true)
    expect((await (await client.put(url, { dismissed: false })).json()).points[0].dismissed).toBe(
      false,
    )
    expect(
      (await client.put(`${base}/drafts/${draft.id}/critique/points/nope`, { dismissed: true }))
        .status,
    ).toBe(404)
    expect((await client.put(url, { dismissed: 'yes' })).status).toBe(400)
  })

  it("will not set aside another draft's point", async () => {
    const { client, base, draft, profileId } = await ada()
    const other = await createDraft(client, profileId, { title: 'U', body: 'Other.' })
    const round = await (await client.post(`${base}/assist/critique`, { draftId: draft.id })).json()
    const stolen = `${base}/drafts/${other.id}/critique/points/${round.points[0].id}`
    expect((await client.put(stolen, { dismissed: true })).status).toBe(404)
  })

  it('is private to the profile and needs sign-in', async () => {
    const { ctx, base, draft } = await ada()
    expect((await ctx.client().get(`${base}/drafts/${draft.id}/critique`)).status).toBe(401)
    const eve = ctx.client()
    await register(eve, 'eve@example.com', 'Eve')
    expect((await eve.get(`${base}/drafts/${draft.id}/critique`)).status).toBeGreaterThanOrEqual(
      403,
    )
  })

  it('goes with the draft, and with the profile', async () => {
    const { ctx, client, base, draft, profileId } = await ada()
    await client.post(`${base}/assist/critique`, { draftId: draft.id })
    expect(ctx.store.critiques.latest(draft.id)).toBeDefined()
    await client.delete(`${base}/drafts/${draft.id}`)
    expect(ctx.store.critiques.latest(draft.id)).toBeUndefined()

    const second = await createDraft(client, profileId, { title: 'V', body: 'Again.' })
    await client.post(`${base}/assist/critique`, { draftId: second.id })
    expect((await client.delete(base)).status).toBe(204)
    expect(ctx.store.critiques.latest(second.id)).toBeUndefined()
  })
})
