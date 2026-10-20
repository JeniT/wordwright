import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const publication = {
  id: 'ada-blog',
  name: 'Blog',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada', handle: 'ada', email: 'ada@example.com', role: 'owner' }],
}
const active = (n: number, over: Record<string, unknown> = {}) => ({
  id: `d${n}`,
  title: `Draft ${n}`,
  ideaId: 'i1',
  ideaName: 'Writing',
  publicationId: 'ada-blog',
  publicationName: 'Blog',
  updatedAt: '2026-10-02T00:00:00Z',
  review: null,
  ...over,
})
const answer = (drafts: object[], hasMore = false) => HttpResponse.json({ drafts, hasMore })
const activeRoute = (respond: (url: URL) => Response | Promise<Response>) =>
  http.get('*/api/drafts/active', ({ request }) => respond(new URL(request.url)))

beforeEach(() => localStorage.clear())

describe('Keep writing, on Home', () => {
  const home = (...extra: Parameters<typeof server.use>) =>
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      llmSettings(true),
      ...extra,
    )
  const box = async () =>
    (await screen.findByRole('heading', { name: 'Keep writing' })).closest('section')!

  it('lists the drafts you edit, each row a link into the draft, with where it is and when it changed', async () => {
    home(
      activeRoute(() =>
        answer([
          active(1),
          active(2, { title: '', ideaName: 'Other', updatedAt: '2026-09-30T12:00:00Z' }),
        ]),
      ),
    )
    await renderAt('/')
    const items = await within(await box()).findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Draft 1')
    expect(items[0]).toHaveTextContent('Writing · Blog')
    expect(items[0]).toHaveTextContent(/Last changed/)
    expect(within(items[0]!).getByRole('link')).toHaveAttribute('href', '/p/ada-blog/drafts/d1')
    expect(items[1]).toHaveTextContent('Untitled draft')
    // The whole row is the link: there is no separate "Continue".
    expect(screen.queryByRole('link', { name: /Continue/ })).toBeNull()
  })

  it('says how a draft’s reviews stand, across all its requests, and nothing for one never sent', async () => {
    home(
      activeRoute(() =>
        answer([
          active(1, { review: { asked: 5, ended: 2, unresolved: 4 } }),
          active(2, { review: { asked: 1, ended: 1, unresolved: 0 } }),
          active(3),
        ]),
      ),
    )
    await renderAt('/')
    const items = await within(await box()).findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('2 of 5 reviews complete · 4 unresolved comments')
    expect(items[1]).toHaveTextContent('1 of 1 reviews complete · No unresolved comments')
    expect(items[2]).not.toHaveTextContent(/reviews/)
  })

  it('does not show who edits them: they are all yours', async () => {
    home(activeRoute(() => answer([active(1)])))
    await renderAt('/')
    await within(await box()).findByText('Draft 1')
    expect(within(await box()).queryByText('Ada')).toBeNull()
  })

  it('sits under Quick add', async () => {
    home(activeRoute(() => answer([active(1)])))
    await renderAt('/')
    const quickAdd = await screen.findByRole('region', { name: 'Quick add' })
    const keep = await box()
    expect(quickAdd.compareDocumentPosition(keep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is not there at all when nothing is active', async () => {
    home()
    await renderAt('/')
    await screen.findByRole('region', { name: 'Quick add' })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Keep writing' })).toBeNull()
  })

  it('says when it could not load, and lets you try again', async () => {
    home(activeRoute(() => HttpResponse.json({ error: 'no' }, { status: 500 })))
    await renderAt('/')
    const section = await box()
    expect(await within(section).findByRole('alert')).toHaveTextContent(/couldn't load your drafts/)
    expect(within(section).getByRole('button', { name: /try again/i })).toBeVisible()
  })

  it('says it is loading while the drafts are on their way', async () => {
    home(
      activeRoute(async () => {
        await new Promise((r) => setTimeout(r, 300))
        return answer([active(1)])
      }),
    )
    await renderAt('/')
    const section = await box()
    expect(within(section).getByText('Loading…')).toBeVisible()
    expect(await within(section).findByText('Draft 1')).toBeVisible()
  })

  it('is not offered before there is a publication', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
      llmSettings(false),
    )
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Get started' })
    expect(screen.queryByRole('heading', { name: 'Keep writing' })).toBeNull()
  })

  describe('Show more', () => {
    const asked: string[] = []
    const pages = () =>
      activeRoute((url) => {
        asked.push(url.searchParams.get('limit') ?? '')
        const limit = Number(url.searchParams.get('limit'))
        const all = [1, 2, 3, 4, 5].map((n) => active(n))
        return answer(all.slice(0, limit), limit < all.length)
      })

    it('starts with three, adds three more below them, moves focus to the first new one, and goes at the end', async () => {
      asked.length = 0
      home(pages())
      await renderAt('/')
      const section = await box()
      expect(await within(section).findAllByRole('listitem')).toHaveLength(3)

      await fireEvent.click(within(section).getByRole('button', { name: 'Show more' }))
      await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(5))
      expect(within(section).getAllByRole('listitem')[0]).toHaveTextContent('Draft 1')
      await waitFor(() =>
        expect(within(section).getByRole('link', { name: /Draft 4/ })).toHaveFocus(),
      )
      expect(asked).toEqual(['3', '6'])
      expect(within(section).queryByRole('button', { name: 'Show more' })).toBeNull()
    })
  })
})

describe('Keep writing, on a publication’s landing page', () => {
  it('asks for that publication’s drafts, names only the idea, and sits under Quick add', async () => {
    let asked: URL | undefined
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/publications/ada-blog/ideas', () => HttpResponse.json([])),
      http.get('*/api/publications/ada-blog/notes', () => HttpResponse.json([])),
      activeRoute((url) => {
        asked = url
        return answer([active(1)])
      }),
    )
    await renderAt('/p/ada-blog')
    const section = (await screen.findByRole('heading', { name: 'Keep writing' })).closest(
      'section',
    )!
    const item = await within(section).findByRole('listitem')
    expect(asked?.searchParams.get('publicationId')).toBe('ada-blog')
    expect(asked?.searchParams.get('ideaId')).toBeNull()
    expect(item).toHaveTextContent('Writing')
    expect(item).not.toHaveTextContent('Blog')
    const quickAdd = screen.getByRole('region', { name: 'Quick add' })
    expect(
      quickAdd.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('no longer has the Reviews you sent panel', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/publications/ada-blog/ideas', () => HttpResponse.json([])),
      http.get('*/api/publications/ada-blog/notes', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-blog')
    await screen.findByRole('region', { name: 'Quick add' })
    expect(screen.queryByText('Reviews you sent')).toBeNull()
  })
})

describe('Keep writing, on an idea’s landing page', () => {
  it('asks for that idea’s drafts and names neither idea nor publication', async () => {
    let asked: URL | undefined
    const ideaUrl = '*/api/publications/ada-blog/ideas/i1'
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/publications/ada-blog/ideas', () => HttpResponse.json([])),
      http.get(ideaUrl, () =>
        HttpResponse.json({
          id: 'i1',
          publicationId: 'ada-blog',
          name: 'Writing',
          notes: '',
          links: [],
          drafts: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        }),
      ),
      http.get(`${ideaUrl}/notes`, () => HttpResponse.json([])),
      http.get(`${ideaUrl}/research`, () => HttpResponse.json([])),
      http.get(`${ideaUrl}/conversations`, () => HttpResponse.json({ conversations: [] })),
      activeRoute((url) => {
        asked = url
        return answer([active(1)])
      }),
    )
    await renderAt('/p/ada-blog/ideas/i1')
    const section = (await screen.findByRole('heading', { name: 'Keep writing' })).closest(
      'section',
    )!
    const item = await within(section).findByRole('listitem')
    expect(asked?.searchParams.get('ideaId')).toBe('i1')
    expect(item).toHaveTextContent('Draft 1')
    expect(item).not.toHaveTextContent('Writing')
    expect(item).not.toHaveTextContent('Blog')
  })
})
