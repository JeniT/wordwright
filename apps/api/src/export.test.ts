import { beforeEach, describe, expect, it } from 'vitest'
import {
  PASSWORD,
  readZip,
  register,
  saveKey,
  setup,
  shareProfile,
  verifyAccounts,
  type TestClient,
} from './test-helpers'

describe('exporting writing as Markdown', () => {
  let ctx: ReturnType<typeof setup>
  let ada: TestClient
  let bob: TestClient
  let profile: string
  let ideaId: string
  let adaDraft: { id: string }
  let handedDraft: { id: string }
  let adaId: string
  let bobId: string
  const base = () => `/api/profiles/${profile}`

  const download = async (client: TestClient, path: string) => {
    const res = await client.get(path)
    expect(res.status).toBe(200)
    return { res, files: readZip(await res.bytes()) }
  }
  const only = (files: Record<string, string>, pattern: RegExp) => {
    const hits = Object.keys(files).filter((p) => pattern.test(p))
    expect(hits, String(pattern)).toHaveLength(1)
    return files[hits[0]!]!
  }

  beforeEach(async () => {
    ctx = setup()
    ada = ctx.client()
    bob = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    await register(bob, 'bob@example.com', 'Bob')
    verifyAccounts(ctx, 'ada@example.com', 'bob@example.com')
    profile = (await (await ada.get('/api/profiles')).json())[0].id
    await ada.put(`${base()}/description`, { description: 'A blog about **rivers**.' })
    await shareProfile(ctx, ada, profile, bob, 'bob@example.com')
    adaId = (await (await ada.get('/api/auth/me')).json()).id
    bobId = (await (await bob.get('/api/auth/me')).json()).id

    ideaId = (await (await ada.post(`${base()}/ideas`, { name: 'Why rivers meander' })).json()).id
    const idea = `${base()}/ideas/${ideaId}`
    await ada.post(`${idea}/notes`, { text: 'Erosion is faster on the outside bend.' })
    await bob.post(`${idea}/notes`, { text: 'Ask a hydrologist.\nThen check the sources.' })
    await ada.post(`${idea}/links`, {
      url: 'https://example.org/meanders',
      title: 'How meanders form',
    })
    await ada.post(`${base()}/notes`, { text: 'A loose thought, not yet in an idea.' })
    adaDraft = await (
      await ada.post(`${idea}/drafts`, { title: 'Meanders', body: 'Rivers rarely flow straight.' })
    ).json()
    await bob.post(`${idea}/drafts`, { title: 'Oxbow lakes', body: 'Cut-off bends.' })
    handedDraft = await (
      await bob.post(`${idea}/drafts`, { title: 'Floods', body: 'Water rises.' })
    ).json()
    ctx.store.drafts.setEditor(handedDraft.id, adaId) // Bob started it, Ada now edits it
  })

  it('gives an owner every draft in the profile, with the rule explained in the README', async () => {
    const { res, files } = await download(ada, `${base()}/export`)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(
      new RegExp(`attachment; filename="wordwright-${profile}-\\d{4}-\\d{2}-\\d{2}\\.zip"`),
    )
    const drafts = Object.keys(files).filter((p) => p.includes('/drafts/'))
    expect(drafts).toHaveLength(3)
    expect(only(files, /drafts\/meanders\.md$/)).toBe(
      '# Meanders\n\nRivers rarely flow straight.\n',
    )
    expect(only(files, /drafts\/oxbow-lakes\.md$/)).toContain('Cut-off bends.')
    const readme = only(files, /^[^/]+\/README\.md$/)
    expect(readme).toMatch(/As an owner[^]*every draft/i)
    expect(readme).not.toMatch(/As a member/)
  })

  it('gives a member only the drafts they edit or started, and says what is missing', async () => {
    const { files } = await download(bob, `${base()}/export`)
    const drafts = Object.keys(files).filter((p) => p.includes('/drafts/'))
    expect(drafts.map((p) => p.split('/').pop()).sort()).toEqual(['floods.md', 'oxbow-lakes.md'])
    expect(JSON.stringify(files)).not.toContain('Rivers rarely flow straight.')
    const idea = only(files, /ideas\/why-rivers-meander\.md$/)
    expect(idea).toContain('[Oxbow lakes](../drafts/oxbow-lakes.md)')
    expect(idea).toMatch(/\[Floods\]\(\.\.\/drafts\/floods\.md\) \(now edited by someone else\)/)
    expect(idea).toMatch(/1 draft by other members isn.t included/)
    const readme = only(files, /^[^/]+\/README\.md$/)
    expect(readme).toMatch(/As a member[^]*edit or started/i)
    expect(readme).not.toMatch(/As an owner/)
  })

  it('lists notes and reading items with credits, in the profile, idea and loose lists', async () => {
    const { files } = await download(bob, `${base()}/export`)
    const idea = only(files, /ideas\/why-rivers-meander\.md$/)
    expect(idea).toMatch(/- Erosion is faster on the outside bend\. \(Ada, \d+ \w+ \d{4}\)/)
    expect(idea).toMatch(/- Ask a hydrologist\.\n {2}Then check the sources\. \(Bob, /) // multi-line notes stay one bullet
    expect(idea).toMatch(
      /- \[How meanders form\]\(https:\/\/example\.org\/meanders\).*added \d+ \w+ \d{4}/,
    )
    const home = only(files, new RegExp(`^[^/]+/${profile}/${profile}\\.md$`))
    expect(home).toContain('# ')
    expect(home).toContain('A blog about **rivers**.')
    expect(home).toContain('- [Why rivers meander](ideas/why-rivers-meander.md)')
    expect(home).toMatch(/- A loose thought, not yet in an idea\. \(Ada, /)
  })

  it('never includes comments, API keys, reviewer details or anything outside the rules', async () => {
    await saveKey(ada, 'sk-super-secret-key-1234567890')
    await ada.post(`${base()}/drafts/${adaDraft.id}/comments`, {
      block: 'b1',
      text: 'A private comment.',
    })
    const { files } = await download(ada, `${base()}/export`)
    const all = JSON.stringify(files)
    expect(all).not.toContain('sk-super-secret')
    expect(all).not.toContain('A private comment.')
    expect(all).not.toContain('bob@example.com') // email addresses stay out; names are enough
  })

  it('keeps every path inside the folder, and makes titles into distinct safe file names', async () => {
    const idea = `${base()}/ideas/${ideaId}`
    for (const title of ['../../etc/passwd', 'Same', 'Same', '???', 'Ünïcode tïtle']) {
      await ada.post(`${idea}/drafts`, { title, body: 'x' })
    }
    const { files } = await download(ada, `${base()}/export`)
    for (const path of Object.keys(files)) {
      expect(path, path).toMatch(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*\/?[a-z0-9-]*(\.md)?$/i)
      expect(path).not.toContain('..')
    }
    const names = Object.keys(files)
      .filter((p) => p.includes('/drafts/'))
      .map((p) => p.split('/').pop())
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(expect.arrayContaining(['same.md', 'same-2.md', 'untitled.md']))
  })

  it('keeps a title with line breaks in it from starting headings or bullets of its own', async () => {
    await ada.post(`${base()}/ideas/${ideaId}/drafts`, {
      title: 'Two\r\n# Injected heading\n- fake bullet',
      body: 'Body.',
    })
    const { files } = await download(ada, `${base()}/export`)
    const draft = only(files, /drafts\/two-injected-heading-fake-bullet\.md$/)
    expect(draft.split('\n')[0]).toBe('# Two # Injected heading - fake bullet')
    expect(draft.split('\n').filter((line) => line.startsWith('#'))).toHaveLength(1)
    const idea = only(files, /ideas\/why-rivers-meander\.md$/)
    expect(idea).toContain('[Two # Injected heading - fake bullet](../drafts/')
    expect(idea.split('\n').filter((line) => line.startsWith('- fake'))).toEqual([])
  })

  it('exports every profile the person belongs to from the account page, one folder each', async () => {
    const second = await (await ada.post('/api/profiles', { name: 'Newsletter' })).json()
    const { res, files } = await download(ada, '/api/account/export')
    expect(res.headers.get('content-disposition')).toMatch(
      /filename="wordwright-export-\d{4}-\d{2}-\d{2}\.zip"/,
    )
    const folders = new Set(Object.keys(files).map((p) => p.split('/')[1]))
    expect(folders).toEqual(new Set(['README.md', profile, second.id]))
    // As a member of someone else's profile, Bob gets only his own drafts there, and Ada's profile is the one profile.
    const bobFiles = (await download(bob, '/api/account/export')).files
    expect(JSON.stringify(bobFiles)).not.toContain('Rivers rarely flow straight.')
    expect(Object.keys(bobFiles).some((p) => p.includes(`/${profile}/`))).toBe(true)
  })

  it('is for members only, and for signed-in people only', async () => {
    const eve = ctx.client()
    await register(eve, 'eve@example.com', 'Eve')
    expect((await eve.get(`${base()}/export`)).status).toBe(404)
    expect((await ctx.client().get(`${base()}/export`)).status).toBe(401)
    expect((await ctx.client().get('/api/account/export')).status).toBe(401)
    expect(bobId).not.toBe(adaId)
  })

  it('is throttled per person, because building it costs the server something', async () => {
    let last = 200
    for (let i = 0; i < 12 && last === 200; i++) last = (await bob.get(`${base()}/export`)).status
    expect(last).toBe(429)
    expect((await (await bob.get('/api/account/export')).json()).error).toMatch(/try again/i)
    expect((await ada.get(`${base()}/export`)).status).toBe(200) // someone else is not affected
  })

  it('credits notes whose author has gone as "a former member"', async () => {
    await bob.delete('/api/account', {
      confirmEmail: 'bob@example.com',
      password: PASSWORD,
      keepName: false,
    })
    const { files } = await download(ada, `${base()}/export`)
    expect(only(files, /ideas\/why-rivers-meander\.md$/)).toMatch(/\(a former member, /)
  })
})
