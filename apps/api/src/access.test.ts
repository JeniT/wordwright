import { beforeAll, describe, expect, it } from 'vitest'
import {
  allRows,
  createDraft,
  lastReviewToken,
  PASSWORD,
  register,
  saveKey,
  setup,
  sharePublication,
  verifyAccounts,
  type TestClient,
  type TestContext,
} from './test-helpers'

/**
 * Object-level access (#317). Ada fills a publication with one of everything; Bob, a stranger with a publication of his
 * own, then tries every route in the API with Ada's real ids: once under Ada's publication, and once under his own
 * (where membership passes, so only the route's own lookup stands between him and her things). A route added later is
 * swept too, because the list comes from the app itself.
 */

/** Text that only Ada's things contain, so a response that leaks any of them is caught. */
const SECRET = 'ADA-PRIVATE'

/** Which table holds the things a path parameter names. `:id` depends on the segment before it. */
const PARAM_TABLES: Record<string, string> = {
  articleId: 'articles',
  askId: 'draft_handovers',
  commentId: 'draft_comments',
  conversationId: 'idea_conversations',
  noteId: 'idea_notes',
  proposalId: 'idea_proposals',
  reviewId: 'draft_reviews',
  runId: 'idea_research',
  itemIds: 'idea_research_items',
  snapshotId: 'draft_snapshots',
  userId: 'users',
  senderId: 'users',
}
const ID_TABLES: Record<string, string> = {
  ideas: 'ideas',
  drafts: 'drafts',
  sources: 'publication_sources',
  reviews: 'draft_reviews',
  mine: 'invitations',
  sessions: 'sessions',
  accounts: 'users',
}
/** `:invitationId` by the segment two before it: a publication's invitations, or a draft's reviewers'. */
const INVITATION_TABLES: Record<string, string> = {
  ':publicationId': 'invitations',
  reviewers: 'review_invitations',
}

/** Where a parameter's ids come from: `:id` by the segment before it, `:invitationId` by the one two before. */
function tableFor(name: string, segments: string[], i: number): string {
  if (name === 'id') return ID_TABLES[segments[i - 1] ?? '']!
  if (name === 'invitationId') return INVITATION_TABLES[segments[i - 2] ?? '']!
  return PARAM_TABLES[name]!
}

/** The kind of thing a route's body lists by id (`ids`), by part of its path; notes otherwise. */
const BODY_ID_TABLES: [string, string][] = [
  ['/move/ideas', 'ideas'],
  ['/drafts/order', 'drafts'],
  ['/articles', 'articles'],
]

/**
 * Routes that act only on the caller's own account, so Bob succeeding is right. Signing out a device is the exception
 * that takes an id, so it stays in. (Unblocking takes a sender's id, but only edits Bob's own list of blocks.)
 */
const OWN_ACCOUNT = /^\/api\/(auth|account(?!\/sessions\/:)|llm|invitations\/blocks)\b/

describe('a stranger reaching for someone else’s things', () => {
  let ctx: TestContext
  let bob: TestClient
  let adaPublication: string
  let bobPublication: string
  let bobId: string
  const ids = new Map<string, string[]>()

  beforeAll(async () => {
    ctx = setup()
    const ada = ctx.client()
    await register(ada, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    await saveKey(ada)
    adaPublication = (await (await ada.get('/api/publications')).json())[0].id
    const pub = `/api/publications/${adaPublication}`
    /** Each piece of the setup must work, or the sweep would pass for want of anything to reach. */
    const made = async (request: ReturnType<TestClient['post']>) => {
      const res = await request
      if (res.status >= 300) throw new Error(`Setup failed: ${res.status} ${await res.text()}`)
      return res.json()
    }
    const idea = await made(
      ada.post(`${pub}/ideas`, { name: `${SECRET} idea`, notes: `${SECRET} notes` }),
    )
    const ideaUrl = `${pub}/ideas/${idea.id}`
    await made(ada.post(`${ideaUrl}/notes`, { text: `${SECRET} idea note` }))
    await made(ada.post(`${pub}/notes`, { text: `${SECRET} publication note` }))
    await made(ada.post(`${ideaUrl}/articles`, { url: 'https://a.example/adas-page' }))
    await made(ada.post(`${pub}/articles`, { url: 'https://b.example/adas-page' }))
    await made(ada.post(`${pub}/sources`, { url: 'https://c.example/feed.xml' }))
    const draft = await createDraft(ada, adaPublication, {
      title: `${SECRET} draft`,
      body: `${SECRET} body`,
    })
    const draftUrl = `${pub}/drafts/${draft.id}`
    await made(ada.post(`${draftUrl}/comments`, { block: 'b1', text: `${SECRET} comment` }))

    // A member who asks to take the draft over, and an invitation still waiting for an answer.
    const cy = ctx.client()
    await register(cy, 'cy@example.com', 'Cy')
    await sharePublication(ctx, ada, adaPublication, cy, 'cy@example.com')
    await made(cy.post(`${draftUrl}/handover/asks`, {}))
    await made(ada.post(`${pub}/invitations`, { email: 'carol@example.com' }))

    // A reviewer, so there is a review, a snapshot and a pending review invitation.
    await made(ada.post(`${draftUrl}/send-for-review`, { emails: ['rae@example.com'] }))
    await new Promise((r) => setTimeout(r, 0))
    await made(
      ctx.client().post('/api/auth/register-reviewer', {
        token: lastReviewToken(ctx.mailer),
        name: 'Rae',
        password: PASSWORD,
      }),
    )
    await made(ada.post(`${draftUrl}/send-for-review`, { emails: ['ray@example.com'] }))

    // A brainstorm with a suggestion in it, and a research run.
    ctx.setChat(() => ({
      text: `${SECRET} reply`,
      toolCalls: [{ name: 'suggest_note', input: { text: `${SECRET} suggestion` } }],
    }))
    const conversation = await made(ada.post(`${ideaUrl}/conversations`, {}))
    const started = await ada.post(`${ideaUrl}/conversations/${conversation.id}/messages`, {
      start: true,
    })
    await started.text()
    ctx.setResearch(() => [{ url: 'https://d.example/ada', title: `${SECRET} found`, why: 'x' }])
    await made(ada.post(`${ideaUrl}/research`, { areas: `${SECRET} areas` }))

    for (const table of new Set([
      ...Object.values(PARAM_TABLES),
      ...Object.values(ID_TABLES),
      ...Object.values(INVITATION_TABLES),
    ])) {
      const rows = ctx.db.prepare(`SELECT id FROM "${table}"`).all() as { id: string }[]
      ids.set(
        table,
        rows.map((r) => r.id),
      )
    }

    bob = ctx.client()
    const me = await register(bob, 'bob@example.com', 'Bob')
    bobId = me.id
    verifyAccounts(ctx, 'bob@example.com')
    await saveKey(bob, 'sk-ant-bobs-own-key-1234567890')
    bobPublication = (await (await bob.get('/api/publications')).json())[0].id
  })

  it('has one of everything to reach for', () => {
    const missing = [...ids].filter(([, list]) => list.length === 0).map(([table]) => table)
    expect(missing).toEqual([])
  })

  /** Every way of filling in the route's parameters with Ada's ids (and `publicationId` with `publication`). */
  function fill(path: string, publication: string): string[] {
    let paths = ['']
    const segments = path.split('/').slice(1)
    segments.forEach((segment, i) => {
      if (!segment.startsWith(':')) {
        paths = paths.map((p) => `${p}/${segment}`)
        return
      }
      const name = segment.slice(1)
      const candidates =
        name === 'publicationId'
          ? [publication]
          : (ids.get(tableFor(name, segments, i)) ?? [`no-such-${name}`])
      paths = paths.flatMap((p) => candidates.map((id) => `${p}/${encodeURIComponent(id)}`))
    })
    return paths
  }

  /**
   * A body that passes validation for every route (Zod drops the keys a route doesn't read), so each request gets past
   * the schema to the lookup that should refuse it. Lists of ids are Ada's things of the kind the route works on.
   */
  function bodyFor(path: string) {
    const all = (table: string) => ids.get(table)!
    const kind = BODY_ID_TABLES.find(([part]) => path.includes(part))?.[1] ?? 'idea_notes'
    const [ada, cy] = all('users')
    return {
      ids: all(kind),
      itemIds: all('idea_research_items'),
      to: { ideaId: null, publicationId: bobPublication },
      name: 'Bob was here',
      notes: 'Bob was here',
      text: 'Bob was here',
      title: 'Bob was here',
      body: 'Bob was here',
      description: 'Bob was here',
      version: 1,
      published: true,
      url: 'https://e.example/bobs-page',
      before: 'Bob was',
      after: 'here',
      // A comment's paragraph, or what declining an invitation also blocks.
      block: path.endsWith('/decline') ? 'none' : 'b1',
      resolved: true,
      read: true,
      kept: true,
      added: true,
      tags: ['bob'],
      add: ['bob'],
      role: 'owner',
      userId: cy,
      emails: ['bob-friend@example.com'],
      memberIds: [ada],
      noteId: all('idea_notes')[0],
      draftId: all('drafts')[0],
      kind: 'title',
      offered: 'Bob was here',
      wording: 'Bob was here',
      aim: 'Bob was here',
      areas: 'Bob was here',
      posts: [{ sourceId: all('publication_sources')[0], postId: 'post' }],
    }
  }

  it('reaches nothing of Ada’s through any route', async () => {
    const routes = [...new Set(ctx.app.routes.map((r) => `${r.method} ${r.path}`))]
      .map((r) => r.split(' ') as [string, string])
      .filter(([method, path]) => method !== 'ALL' && path.startsWith('/api/'))
      .filter(([, path]) => !OWN_ACCOUNT.test(path))
    const before = new Set(
      allRows(ctx)
        .flat()
        .map((row) => JSON.stringify(row)),
    )
    const reached: string[] = []
    let tried = 0
    for (const [method, path] of routes) {
      const publications = path.includes(':publicationId')
        ? [adaPublication, bobPublication]
        : [adaPublication]
      for (const publication of publications) {
        // Under his own publication, a route with no id of Ada's is just Bob using his own.
        if (publication === bobPublication && !/:(?!publicationId)/.test(path)) continue
        for (const url of fill(path, publication)) {
          const res = await bob.request(method, url, method === 'GET' ? undefined : bodyFor(path))
          const text = await res.text()
          tried++
          // Only "not found" (or "not yours") will do: any other answer means the request got past the lookup.
          const refused = res.status === 404 || res.status === 403
          const ownList = !/\/:/.test(path)
          if ((!refused && !ownList) || text.includes(SECRET)) {
            reached.push(`${method} ${url} → ${res.status} ${text.slice(0, 100)}`)
          }
        }
      }
    }
    expect(reached).toEqual([])
    expect(tried).toBeGreaterThan(300)

    // Nothing of Ada's changed: every row that is new or gone is Bob's own (his handle starts his publications' ids).
    const after = new Set(
      allRows(ctx)
        .flat()
        .map((row) => JSON.stringify(row)),
    )
    const changed = [
      ...[...before].filter((row) => !after.has(row)),
      ...[...after].filter((row) => !before.has(row)),
    ].filter((row) => !row.includes(bobId) && !row.includes('"bob-'))
    expect(changed).toEqual([])
  })

  /** The other way round: Bob's own things, pointed at Ada's. Each must be refused, and leave Ada's as they were. */
  it('cannot point his own things at Ada’s', async () => {
    const pub = `/api/publications/${bobPublication}`
    const idea = await (await bob.post(`${pub}/ideas`, { name: 'Bob’s idea' })).json()
    const note = await (await bob.post(`${pub}/notes`, { text: 'Bob’s note' })).json()
    const [article] = await (
      await bob.post(`${pub}/articles`, { url: 'https://f.example/bobs-page' })
    ).json()
    const draft = await createDraft(bob, bobPublication, { title: 'Bob’s draft' })
    const draftUrl = `${pub}/drafts/${draft.id}`
    const [ada] = ids.get('users')!
    const adaIdea = ids.get('ideas')![0]
    const adaNote = ids.get('idea_notes')![0]
    const before = JSON.stringify(allRows(ctx))

    const attempts = {
      'notes into Ada’s publication': bob.post(`${pub}/move/notes`, {
        ids: [note.id],
        to: { ideaId: null, publicationId: adaPublication },
      }),
      'notes into Ada’s idea': bob.post(`${pub}/move/notes`, {
        ids: [note.id],
        to: { ideaId: adaIdea },
      }),
      'articles into Ada’s idea': bob.post(`${pub}/move/articles`, {
        ids: [article.id],
        to: { ideaId: adaIdea, publicationId: adaPublication },
      }),
      'ideas into Ada’s publication': bob.post(`${pub}/move/ideas`, {
        ids: [idea.id],
        to: { publicationId: adaPublication },
      }),
      'Ada’s note into his draft': bob.post(`${draftUrl}/insertions`, {
        noteId: adaNote,
        text: 'Ada’s words',
      }),
      'his draft to Ada for review': bob.post(`${draftUrl}/send-for-review`, {
        memberIds: [ada],
      }),
      'his draft offered to Ada': bob.post(`${draftUrl}/handover/offer`, { userId: ada }),
      'his draft reassigned to Ada': bob.post(`${draftUrl}/handover/reassign`, { userId: ada }),
      'Ada made an owner of his publication': bob.put(`${pub}/members/${ada}/role`, {
        role: 'owner',
      }),
    }
    const statuses = Object.fromEntries(
      await Promise.all(
        Object.entries(attempts).map(async ([what, res]) => [what, (await res).status]),
      ),
    )
    for (const [what, status] of Object.entries(statuses)) {
      expect([400, 403, 404], what).toContain(status)
    }
    expect(JSON.stringify(allRows(ctx))).toBe(before)
  })
})
