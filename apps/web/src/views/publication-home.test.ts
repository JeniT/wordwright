import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const publication = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: 'https://substack.example/ada',
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada', handle: 'ada', email: 'ada@example.com', role: 'owner' }],
}
const note = (n: number, text = `Note ${n}`) => ({
  id: `n${n}`,
  text,
  origin: 'entered',
  authorId: 'u1',
  authorName: 'Ada',
  readingItemId: null,
  tags: [] as string[],
  quote: false,
  addedAt: null,
  // Later numbers are newer, but the list is not in that order (the writer can reorder notes).
  createdAt: `2026-01-0${n}T00:00:00Z`,
  updatedAt: `2026-01-0${n}T00:00:00Z`,
})
const idea = (id: string, name: string, draftCount: number) => ({
  id,
  name,
  draftCount,
  updatedAt: '2026-01-01T00:00:00Z',
})

function fakeHome(notes: ReturnType<typeof note>[] = [], ideas: ReturnType<typeof idea>[] = []) {
  const sent: string[] = []
  const state = { notes: [...notes] }
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([publication])),
    http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json(ideas)),
    http.get('*/api/publications/ada-substack/notes', () => HttpResponse.json(state.notes)),
    http.post('*/api/publications/ada-substack/notes', async ({ request }) => {
      const { text } = (await request.json()) as { text: string }
      sent.push(text)
      const made = note(state.notes.length + 1, text)
      state.notes.push(made)
      return HttpResponse.json(made, { status: 201 })
    }),
  )
  return sent
}

describe('a publication’s landing page', () => {
  it('is titled with the publication’s name, beside its website, and does not link to itself', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    const title = await screen.findByRole('heading', { level: 1, name: 'Substack' })
    expect(title).toBeInTheDocument()
    const site = within(screen.getByRole('main')).getByRole('link', { name: /substack\.example/ })
    expect(site).toHaveAttribute('href', 'https://substack.example/ada')
    expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Substack' })).toBeNull()
  })

  it('numbers its sections as the menu numbers the steps', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    const notes = await screen.findByRole('region', { name: 'Notes' })
    expect(screen.getByRole('region', { name: 'Search' }).querySelector('h3')).toHaveTextContent(
      /^01\s*Search$/,
    )
    expect(screen.getByRole('region', { name: 'Read' }).querySelector('h3')).toHaveTextContent(
      /^02\s*Read$/,
    )
    expect(notes.querySelector('h3')).toHaveTextContent(/^03\s*Notes$/)
    // The numbers are decoration: the headings are named without them.
    expect(screen.getByRole('heading', { level: 3, name: 'Notes' })).toBeInTheDocument()
  })

  it('lists the ideas first, unnumbered, and the three steps under “Stuck for ideas?”', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    const ideas = await screen.findByRole('region', { name: 'Ideas' })
    expect(ideas.querySelector('h2')).toHaveTextContent(/^Ideas$/)
    const stuck = screen.getByRole('region', { name: 'Stuck for ideas?' })
    for (const name of ['Search', 'Read', 'Notes'])
      expect(within(stuck).getByRole('region', { name })).toBeInTheDocument()
    expect(ideas.compareDocumentPosition(stuck) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const quick = screen.getByRole('region', { name: 'Quick add' })
    expect(quick.compareDocumentPosition(ideas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  describe('description', () => {
    const describedAs = (description: string | null) => {
      fakeHome()
      server.use(
        http.get('*/api/publications', () => HttpResponse.json([{ ...publication, description }])),
      )
    }
    /** jsdom does no layout, so say how tall the text is and how much room it gets. */
    const layout = (scrollHeight: number, clientHeight: number) => {
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight)
    }
    afterEach(() => vi.restoreAllMocks())

    it('has no description area when there is none: the invitation is the one at the top', async () => {
      describedAs(null)
      await renderAt('/p/ada-substack')
      await screen.findByRole('heading', { level: 1, name: 'Substack' })
      expect(screen.queryByRole('link', { name: 'Add a description' })).toBeNull()
      expect(screen.queryByRole('region', { name: 'About this publication' })).toBeNull()
      expect(screen.queryByRole('button', { name: /Show/ })).toBeNull()
    })

    it('shows a short one in full as Markdown, with no Show more button', async () => {
      describedAs('Weeknotes, *mostly for me*. See [home](https://example.com).')
      layout(100, 100)
      await renderAt('/p/ada-substack')
      const about = await screen.findByRole('region', { name: 'About this publication' })
      expect(within(about).getByRole('link', { name: 'home' })).toHaveAttribute(
        'href',
        'https://example.com',
      )
      expect(within(about).queryByRole('button')).toBeNull()
    })

    it('clamps a long one, and expands and collapses it, saying which', async () => {
      describedAs('A long description.\n\nWith several paragraphs.')
      layout(400, 200)
      await renderAt('/p/ada-substack')
      const more = await screen.findByRole('button', { name: 'Show more…' })
      expect(more).toHaveAttribute('aria-expanded', 'false')
      const body = document.getElementById(more.getAttribute('aria-controls')!)!
      expect(body).toHaveClass('clamped')
      await fireEvent.click(more)
      const less = screen.getByRole('button', { name: 'Show less' })
      expect(less).toHaveAttribute('aria-expanded', 'true')
      expect(body).not.toHaveClass('clamped')
      await fireEvent.click(less)
      expect(screen.getByRole('button', { name: 'Show more…' })).toHaveAttribute(
        'aria-expanded',
        'false',
      )
    })
  })

  describe('notes', () => {
    it('says so when there are none', async () => {
      fakeHome()
      await renderAt('/p/ada-substack')
      expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
    })

    it('shows the five most recent, newest first, and links to all of them', async () => {
      // Seven notes, stored oldest first except that the writer has moved the newest to the top.
      fakeHome([7, 1, 2, 3, 4, 5, 6].map((n) => note(n)))
      await renderAt('/p/ada-substack')
      const list = await screen.findByRole('list', { name: 'Recent notes' })
      const shown = within(list)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('p')?.textContent?.trim())
      expect(shown).toEqual(['Note 7', 'Note 6', 'Note 5', 'Note 4', 'Note 3'])
      expect(screen.getByRole('link', { name: /See all notes/ })).toHaveAttribute(
        'href',
        '/p/ada-substack/notes',
      )
    })

    it('says when the notes can’t be loaded', async () => {
      fakeHome()
      server.use(
        http.get('*/api/publications/ada-substack/notes', () =>
          HttpResponse.json({ error: 'Nope' }, { status: 500 }),
        ),
      )
      await renderAt('/p/ada-substack')
      expect(await screen.findByText(/couldn't load the notes/)).toBeInTheDocument()
    })
  })

  describe('ideas', () => {
    it('lists them with their draft counts, and links to each (new ones start in Quick add)', async () => {
      fakeHome([], [idea('i1', 'Why rivers meander', 2), idea('i2', 'Lakes', 1)])
      await renderAt('/p/ada-substack')
      const link = await screen.findByRole('link', { name: /Why rivers meander/ })
      expect(link).toHaveTextContent('2 drafts')
      expect(screen.getByRole('link', { name: /Lakes/ })).toHaveTextContent('1 draft')
      expect(screen.queryByRole('link', { name: 'See all ideas' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'New idea' })).toBeNull()
    })

    it('says so when there are none', async () => {
      fakeHome()
      await renderAt('/p/ada-substack')
      expect(await screen.findByText(/No ideas yet/)).toBeInTheDocument()
    })

    it('says when the ideas can’t be loaded', async () => {
      fakeHome()
      server.use(
        http.get('*/api/publications/ada-substack/ideas', () =>
          HttpResponse.json({ error: 'Nope' }, { status: 500 }),
        ),
      )
      await renderAt('/p/ada-substack')
      expect(await screen.findByText(/couldn't load ideas/)).toBeInTheDocument()
    })
  })
})

const source = (id: string, title: string) => ({
  id,
  url: `https://${id}.example/feed`,
  title,
  description: null,
  siteUrl: null,
  iconUrl: null,
})
const post = (id: string, sourceId: string, title: string, day: number, status = 'new') => ({
  id,
  sourceId,
  title,
  url: `https://${sourceId}.example/${id}`,
  authors: [] as string[],
  summary: null as string | null,
  publishedAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`,
  status,
})
function fakeFeeds(sources: ReturnType<typeof source>[], posts: ReturnType<typeof post>[]) {
  server.use(
    http.get('*/api/publications/ada-substack/sources', () => HttpResponse.json(sources)),
    http.get('*/api/publications/ada-substack/sources/recent', () =>
      HttpResponse.json({ days: 30, posts, omitted: 0, undated: 0, failed: [] }),
    ),
  )
}

describe('a publication’s landing page: search', () => {
  it('says there are no feeds, and leads to setting them up', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    const region = await screen.findByRole('region', { name: 'Search' })
    expect(await within(region).findByText('No feeds yet.')).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: 'Set up feeds →' })).toHaveAttribute(
      'href',
      '/p/ada-substack/settings/feeds',
    )
    expect(within(region).queryByRole('link', { name: 'See all posts' })).toBeNull()
  })

  it('shows the five newest posts still waiting, not those already decided, and links to Search', async () => {
    fakeHome()
    fakeFeeds(
      [source('s1', 'Alpha Notes')],
      [
        post('p1', 's1', 'Post 1', 9),
        post('p2', 's1', 'Post 2', 8),
        post('p3', 's1', 'Post 3', 7),
        post('p4', 's1', 'Post 4', 6),
        post('p5', 's1', 'Post 5', 5),
        post('p6', 's1', 'Post 6', 4),
        post('p7', 's1', 'Added already', 3, 'added'),
      ],
    )
    await renderAt('/p/ada-substack')
    const list = await screen.findByRole('list', { name: 'Recent posts from your feeds' })
    const titles = within(list)
      .getAllByRole('link')
      .map((a) => a.textContent?.replace(/\s*\(opens in a new tab\)/, '').trim())
    expect(titles).toEqual(['Post 1', 'Post 2', 'Post 3', 'Post 4', 'Post 5'])
    expect(within(list).getByRole('link', { name: /Post 1/ })).toHaveAttribute(
      'href',
      'https://s1.example/p1',
    )
    expect(within(list).getAllByText(/Alpha Notes/)).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'See all posts' })).toHaveAttribute(
      'href',
      '/p/ada-substack/search',
    )
    // With feeds, setting them up is a quiet link, not a button.
    expect(screen.getByRole('link', { name: 'Manage feeds' })).toHaveAttribute(
      'href',
      '/p/ada-substack/settings/feeds',
    )
    expect(screen.queryByRole('link', { name: 'Set up feeds →' })).toBeNull()
  })

  it('shows each post as the Search page does, with its authors, summary and icon buttons', async () => {
    fakeHome()
    fakeFeeds(
      [source('s1', 'Alpha Notes')],
      [{ ...post('p1', 's1', 'Post 1', 9), authors: ['Bo Writer'], summary: 'The start of it' }],
    )
    await renderAt('/p/ada-substack')
    const row = (await screen.findByRole('link', { name: /Post 1/ })).closest('li')!
    expect(row).toHaveTextContent('Bo Writer')
    expect(row).toHaveTextContent('The start of it')
    // Icon-only, so the names carry the meaning.
    const add = within(row).getByRole('button', { name: 'Add to reading list: Post 1' })
    expect(add).toHaveTextContent('')
    add.focus()
    expect(document.querySelector('[data-tip]')).toHaveTextContent('Add to reading list')
    const ignore = within(row).getByRole('button', { name: 'Ignore: Post 1' })
    ignore.focus()
    expect(document.querySelector('[data-tip]')).toHaveTextContent('Ignore')
  })

  describe('deciding', () => {
    /** The feeds, remembering what was decided, and answering the way the server does. */
    function fakeDecisions() {
      const state = {
        posts: [1, 2, 3].map((n) => post(`p${n}`, 's1', `Post ${n}`, 10 - n)),
        sent: [] as { what: string; postId: string }[],
      }
      fakeHome()
      server.use(
        http.get('*/api/publications/ada-substack/sources', () =>
          HttpResponse.json([source('s1', 'Alpha Notes')]),
        ),
        http.get('*/api/publications/ada-substack/sources/recent', () =>
          HttpResponse.json({
            days: 30,
            posts: [
              ...state.posts.filter((p) => p.status === 'new'),
              ...state.posts.filter((p) => p.status !== 'new'),
            ],
            omitted: 0,
            undated: 0,
            failed: [],
          }),
        ),
        http.post(
          '*/api/publications/ada-substack/sources/recent/:what',
          async ({ params, request }) => {
            const { posts } = (await request.json()) as { posts: { postId: string }[] }
            const what = params.what as string
            for (const { postId } of posts) state.sent.push({ what, postId })
            state.posts = state.posts.map((p) =>
              posts.some((x) => x.postId === p.id)
                ? { ...p, status: what === 'add' ? 'added' : 'ignored' }
                : p,
            )
            return HttpResponse.json({ results: [] })
          },
        ),
      )
      return state
    }

    it('adds a post to the reading list from the landing page, and the next one waiting takes its place', async () => {
      const state = fakeDecisions()
      await renderAt('/p/ada-substack')
      const list = await screen.findByRole('list', { name: 'Recent posts from your feeds' })
      await fireEvent.click(
        await within(list).findByRole('button', { name: 'Add to reading list: Post 1' }),
      )
      await waitFor(() => expect(state.sent).toEqual([{ what: 'add', postId: 'p1' }]))
      await waitFor(() => expect(within(list).queryByRole('link', { name: /Post 1/ })).toBeNull())
      expect(within(list).getByRole('link', { name: /Post 2/ })).toBeInTheDocument()
      expect(screen.getByText('Added “Post 1” to the reading list.')).toBeInTheDocument()
    })

    it('ignores a post from the landing page', async () => {
      const state = fakeDecisions()
      await renderAt('/p/ada-substack')
      const list = await screen.findByRole('list', { name: 'Recent posts from your feeds' })
      await fireEvent.click(await within(list).findByRole('button', { name: 'Ignore: Post 2' }))
      await waitFor(() => expect(state.sent).toEqual([{ what: 'ignore', postId: 'p2' }]))
      await waitFor(() => expect(within(list).queryByRole('link', { name: /Post 2/ })).toBeNull())
      expect(screen.getByText('Ignored “Post 2”.')).toBeInTheDocument()
    })

    it('says when a decision could not be saved, and the post stays', async () => {
      fakeDecisions()
      server.use(
        http.post('*/api/publications/ada-substack/sources/recent/:what', () =>
          HttpResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 }),
        ),
      )
      await renderAt('/p/ada-substack')
      const list = await screen.findByRole('list', { name: 'Recent posts from your feeds' })
      await fireEvent.click(await within(list).findByRole('button', { name: 'Ignore: Post 1' }))
      const search = screen.getByRole('region', { name: 'Search' })
      expect(await within(search).findByRole('alert')).toHaveTextContent('Could not save that')
      expect(within(list).getByRole('link', { name: /Post 1/ })).toBeInTheDocument()
      await fireEvent.click(within(search).getByRole('button', { name: 'Dismiss' }))
      expect(within(search).queryByRole('alert')).toBeNull()
    })
  })

  it('says when nothing is new', async () => {
    fakeHome()
    fakeFeeds([source('s1', 'Alpha Notes')], [])
    await renderAt('/p/ada-substack')
    expect(await screen.findByText(/Nothing new from your feeds/)).toBeInTheDocument()
  })

  it('says when the feeds can’t be loaded, or their posts, and can try again', async () => {
    fakeHome()
    server.use(
      http.get('*/api/publications/ada-substack/sources', () =>
        HttpResponse.json({ error: 'Nope' }, { status: 500 }),
      ),
    )
    await renderAt('/p/ada-substack')
    expect(await screen.findByText(/couldn't load your feeds/)).toBeInTheDocument()
  })

  it('never asks the feeds to check again just because the page was opened', async () => {
    fakeHome()
    const asked: string[] = []
    server.use(
      http.get('*/api/publications/ada-substack/sources', () =>
        HttpResponse.json([source('s1', 'A')]),
      ),
      http.get('*/api/publications/ada-substack/sources/recent', ({ request }) => {
        asked.push(new URL(request.url).search)
        return HttpResponse.json({ days: 30, posts: [], omitted: 0, undated: 0, failed: [] })
      }),
    )
    await renderAt('/p/ada-substack')
    await screen.findByText(/Nothing new from your feeds/)
    expect(asked.every((q) => !q.includes('refresh'))).toBe(true)
  })
})

const link = (id: string, title: string, extra = {}) => ({
  id,
  url: `https://example.org/${id}`,
  title,
  authors: [] as string[],
  readAt: null as string | null,
  origin: 'entered',
  why: null,
  addedAt: '2026-01-02T00:00:00Z',
  ...extra,
})

describe('a publication’s landing page: read', () => {
  function fakeReading(initial: ReturnType<typeof link>[]) {
    const state = { links: [...initial], added: [] as string[] }
    server.use(
      http.get('*/api/publications/ada-substack/reading', () => HttpResponse.json(state.links)),
      http.post('*/api/publications/ada-substack/reading', async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        state.added.push(url)
        state.links.push(link(`n${state.links.length + 1}`, `Title of ${url}`, { url }))
        return HttpResponse.json(state.links, { status: 201 })
      }),
    )
    return state
  }

  it('says when the list is empty', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    expect(await screen.findByText('Nothing on the reading list yet.')).toBeInTheDocument()
  })

  it('shows the first five still to read, each leading to its reading page, and links to the list', async () => {
    fakeHome()
    fakeReading([
      ...[1, 2, 3, 4, 5, 6].map((n) => link(`l${n}`, `Item ${n}`)),
      link('l0', 'Already read', { readAt: '2026-02-02T00:00:00Z' }),
    ])
    await renderAt('/p/ada-substack')
    const list = await screen.findByRole('list', { name: 'To read' })
    const items = within(list).getAllByRole('link')
    expect(items.map((a) => within(a).getByText(/^Item \d$/).textContent)).toEqual([
      'Item 1',
      'Item 2',
      'Item 3',
      'Item 4',
      'Item 5',
    ])
    expect(within(items[0]!).getByText('example.org')).toBeInTheDocument()
    expect(items[0]).toHaveAttribute('href', '/p/ada-substack/reading/l1')
    expect(screen.getByRole('link', { name: /See the reading list/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/read',
    )
  })

  it('says when the list can’t be loaded', async () => {
    fakeHome()
    server.use(
      http.get('*/api/publications/ada-substack/reading', () =>
        HttpResponse.json({ error: 'Nope' }, { status: 500 }),
      ),
    )
    await renderAt('/p/ada-substack')
    expect(await screen.findByText(/couldn't load the reading list/)).toBeInTheDocument()
  })
})

describe('a publication’s landing page: the top, and the menu', () => {
  it('puts the settings gear at the far end of the title row', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    await screen.findByRole('heading', { level: 1, name: 'Substack' })
    const main = within(screen.getByRole('main'))
    const gear = main.getByRole('link', { name: 'Publication settings' })
    expect(gear).toHaveAttribute('href', '/p/ada-substack/settings')
    // It follows the title block as a sibling, so the row's free space sits between them.
    const row = main.getByRole('heading', { level: 1 }).closest('div')!.parentElement!
    expect(row.lastElementChild).toBe(gear)
  })

  it('offers to describe the publication before anything else when it has no description', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    const nudge = await screen.findByRole('navigation', { name: 'Next step' })
    expect(within(nudge).getByRole('link', { name: /Describe this publication/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/settings/description',
    )
    const main = screen.getByRole('main')
    const position = main.compareDocumentPosition(nudge)
    expect(position & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy()
    // Before the Quick add panel and the first section.
    const quick = screen.getByRole('region', { name: 'Quick add' })
    expect(nudge.compareDocumentPosition(quick) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows a count under every step in the menu, and its website as a plain link', async () => {
    fakeHome([note(1), note(2)], [idea('i1', 'Lakes', 1)])
    server.use(
      http.get('*/api/publications/ada-substack/sources', () =>
        HttpResponse.json([source('s1', 'A feed')]),
      ),
      http.get('*/api/publications/ada-substack/reading', () =>
        HttpResponse.json([
          {
            id: 'r1',
            url: 'https://a.example/1',
            title: 'One',
            authors: [],
            readAt: null,
            origin: 'entered',
            tags: [],
          },
          {
            id: 'r2',
            url: 'https://a.example/2',
            title: 'Two',
            authors: [],
            readAt: '2026-01-01T00:00:00Z',
            origin: 'entered',
            tags: [],
          },
        ]),
      ),
    )
    await renderAt('/p/ada-substack')
    const menu = within(await screen.findByRole('banner'))
    await menu.findByText('2 notes')
    expect(menu.getByText('1 feed')).toBeInTheDocument()
    expect(menu.getByText('1 to read')).toBeInTheDocument()
    expect(menu.queryByText('1 idea')).toBeNull()
    const site = menu.getByRole('link', { name: /Website/ })
    expect(site).toHaveAttribute('href', 'https://substack.example/ada')
    expect(menu.queryByText(/substack\.example/)).toBeNull()
  })
})

describe('a publication’s landing page: Quick add', () => {
  it('has the tabs, with no publication picker, and starts on New idea', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    const quick = within(await screen.findByRole('region', { name: 'Quick add' }))
    expect(quick.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual([
      'New idea',
      'Add a note',
      'Add to reading list',
    ])
    expect(quick.getByRole('tab', { name: 'New idea' })).toHaveAttribute('aria-selected', 'true')
    expect(quick.queryByLabelText('Add to publication')).toBeNull()
  })

  it('adds a note to the publication’s own notes, which then show in the section below', async () => {
    const sent = fakeHome([note(1)])
    await renderAt('/p/ada-substack')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add a note' }))
    await fireEvent.update(screen.getByLabelText('Note'), 'A new thought')
    await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(sent).toEqual(['A new thought']))
    expect(await screen.findByText(/Note added/)).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Recent notes' })
    await waitFor(() =>
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('A new thought'),
    )
  })

  it('adds something to read, and says what went wrong when it is refused', async () => {
    fakeHome()
    const added: string[] = []
    server.use(
      http.get('*/api/publications/ada-substack/reading', () => HttpResponse.json([])),
      http.post('*/api/publications/ada-substack/reading', async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        if (url === 'https://bad.example')
          return HttpResponse.json(
            { error: 'Enter a web address, like https://example.com' },
            { status: 400 },
          )
        added.push(url)
        return HttpResponse.json([], { status: 201 })
      }),
    )
    await renderAt('/p/ada-substack')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add to reading list' }))
    await fireEvent.update(screen.getByLabelText('Web address'), 'https://bad.example')
    await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
    expect(await screen.findByText(/Enter a web address/)).toBeInTheDocument()
    expect(screen.getByLabelText('Web address')).toHaveValue('https://bad.example')
    await fireEvent.update(screen.getByLabelText('Web address'), 'https://example.org/new')
    await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
    await waitFor(() => expect(added).toEqual(['https://example.org/new']))
    expect(await screen.findByText(/Added to .+’s reading list\./)).toBeInTheDocument()
  })

  it('the sections below no longer carry forms of their own', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    await screen.findByRole('region', { name: 'Quick add' })
    for (const name of ['Search', 'Read', 'Notes', 'Ideas'])
      expect(within(screen.getByRole('region', { name })).queryByRole('textbox')).toBeNull()
  })
})

describe('a publication’s landing page: who you are here', () => {
  const shared = {
    ...publication,
    members: [
      ...publication.members,
      { userId: 'u2', name: 'Bob', handle: 'bob', email: 'bob@example.com', role: 'member' },
    ],
  }
  const serve = (pub: typeof publication) =>
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([pub])),
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
      http.get('*/api/publications/ada-substack/notes', () => HttpResponse.json([])),
    )

  it('shows the person’s role on a shared publication', async () => {
    serve(shared)
    await renderAt('/p/ada-substack')
    const main = within(await screen.findByRole('main'))
    expect(await main.findByText('Owner')).toBeInTheDocument()
    expect(main.getByText(/Shared with 1 person/)).toBeInTheDocument()
  })

  it('says Member for a member', async () => {
    serve({ ...shared, role: 'member' })
    await renderAt('/p/ada-substack')
    expect(await within(await screen.findByRole('main')).findByText('Member')).toBeInTheDocument()
  })

  it('shows no role when the publication is not shared', async () => {
    serve(publication)
    await renderAt('/p/ada-substack')
    await screen.findByRole('heading', { level: 1, name: 'Substack' })
    const main = within(screen.getByRole('main'))
    expect(main.queryByText('Owner')).toBeNull()
    expect(main.queryByText(/Shared with/)).toBeNull()
  })
})

describe('a publication’s landing page: tutorial mode (#229)', () => {
  const setup = (tutorialMode: boolean, description: string | null = null) =>
    server.use(
      signedInAs({ ...testUser, tutorialMode }),
      http.get('*/api/publications', () => HttpResponse.json([{ ...publication, description }])),
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
      http.get('*/api/publications/ada-substack/notes', () => HttpResponse.json([])),
    )

  it('writes out what the page, Quick add, the nudge, feeds and ideas are, when it is on', async () => {
    server.use(signedInAs({ ...testUser, tutorialMode: true })) // (setup's own is replaced below, same user)
    setup(true)
    const { router } = await renderAt('/p/ada-substack')
    expect(router.currentRoute.value.name).toBe('publication')
    expect(await screen.findByText(/This is your publication’s home/)).toBeInTheDocument()
    expect(screen.getByText(/Start with your ideas/)).toBeVisible()
    expect(
      await screen.findByText(
        /An idea is something you want to write about\. You can add notes.*several drafts under each idea/,
      ),
    ).toBeVisible()
    for (const text of [
      /First look for recent articles or news stories for inspiration/,
      /Second, read the articles or news stories on this reading list/,
      /Third, review, tag and arrange your notes/,
    ])
      expect(screen.getByText(text)).toBeVisible()
  })

  it('says none of it when it is off', async () => {
    setup(false)
    await renderAt('/p/ada-substack')
    await screen.findByRole('heading', { level: 1, name: 'Substack' })
    for (const text of [
      /This is your publication’s home/,
      /Your AI reads this/,
      /An idea is something/,
      /First look for recent articles/,
      /Second, read the articles/,
      /Third, review, tag and arrange/,
    ])
      expect(screen.queryByText(text)).toBeNull()
  })

  it('does not say why a description matters beside the nudge', async () => {
    setup(true)
    await renderAt('/p/ada-substack')
    await screen.findByText(/This is your publication’s home/)
    expect(screen.queryByText(/Your AI reads this/)).toBeNull()
  })

  it('says it beside an existing description, which then needs no nudge', async () => {
    setup(true, 'About this.')
    await renderAt('/p/ada-substack')
    expect(
      await screen.findByText(/Your AI reads this when it comments on your drafts/),
    ).toBeVisible()
    expect(screen.queryByRole('link', { name: /Describe this publication/ })).toBeNull()
  })
})
