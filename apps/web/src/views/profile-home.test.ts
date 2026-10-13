import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const profile = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: 'https://substack.example/ada',
  imageUrl: null,
  description: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'owner' }],
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
    http.get('*/api/profiles', () => HttpResponse.json([profile])),
    http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json(ideas)),
    http.get('*/api/profiles/ada-substack/notes', () => HttpResponse.json(state.notes)),
    http.post('*/api/profiles/ada-substack/notes', async ({ request }) => {
      const { text } = (await request.json()) as { text: string }
      sent.push(text)
      const made = note(state.notes.length + 1, text)
      state.notes.push(made)
      return HttpResponse.json(made, { status: 201 })
    }),
  )
  return sent
}

describe('a profile’s landing page', () => {
  it('is titled with the profile’s name, beside its website, and does not link to itself', async () => {
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
    const ideas = screen.getByRole('region', { name: 'Ideas' })
    expect(screen.getByRole('region', { name: 'Search' }).querySelector('h2')).toHaveTextContent(
      /^01\s*Search$/,
    )
    expect(screen.getByRole('region', { name: 'Read' }).querySelector('h2')).toHaveTextContent(
      /^02\s*Read$/,
    )
    expect(notes.querySelector('h2')).toHaveTextContent(/^03\s*Notes$/)
    expect(ideas.querySelector('h2')).toHaveTextContent(/^04\s*Ideas$/)
    // The numbers are decoration: the headings are named without them.
    expect(screen.getByRole('heading', { level: 2, name: 'Notes' })).toBeInTheDocument()
  })

  describe('description', () => {
    const describedAs = (description: string | null) => {
      fakeHome()
      server.use(http.get('*/api/profiles', () => HttpResponse.json([{ ...profile, description }])))
    }
    /** jsdom does no layout, so say how tall the text is and how much room it gets. */
    const layout = (scrollHeight: number, clientHeight: number) => {
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(scrollHeight)
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(clientHeight)
    }
    afterEach(() => vi.restoreAllMocks())

    it('invites a description when there is none, linking to where it is drafted or written', async () => {
      describedAs(null)
      await renderAt('/p/ada-substack')
      const link = await screen.findByRole('link', { name: 'Add a description' })
      expect(link).toHaveAttribute('href', '/p/ada-substack/describe')
      expect(screen.queryByRole('button', { name: /Show/ })).toBeNull()
    })

    it('shows a short one in full as Markdown, with no Show more button', async () => {
      describedAs('Weeknotes, *mostly for me*. See [home](https://example.com).')
      layout(100, 100)
      await renderAt('/p/ada-substack')
      const about = await screen.findByRole('region', { name: 'About this profile' })
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
    it('says so when there are none, and still offers the form', async () => {
      fakeHome()
      await renderAt('/p/ada-substack')
      expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
      expect(screen.getByLabelText('Add a note')).toBeInTheDocument()
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
      expect(screen.getByText('(7)')).toBeInTheDocument()
    })

    it('adds a note without leaving the page, and it appears at the top', async () => {
      const sent = fakeHome([note(1)])
      await renderAt('/p/ada-substack')
      await screen.findByText('Note 1')
      await fireEvent.update(screen.getByLabelText('Add a note'), 'A new thought')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      await waitFor(() => expect(sent).toEqual(['A new thought']))
      const list = await screen.findByRole('list', { name: 'Recent notes' })
      expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('A new thought')
      expect(screen.getByLabelText('Add a note')).toHaveValue('')
    })

    it('says what went wrong when a note can’t be added, and keeps the words', async () => {
      fakeHome()
      server.use(
        http.post('*/api/profiles/ada-substack/notes', () =>
          HttpResponse.json({ error: 'Too many notes' }, { status: 409 }),
        ),
      )
      await renderAt('/p/ada-substack')
      await fireEvent.update(await screen.findByLabelText('Add a note'), 'Keep me')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      expect(await screen.findByText('Too many notes')).toBeInTheDocument()
      expect(screen.getByLabelText('Add a note')).toHaveValue('Keep me')
    })

    it('says when the notes can’t be loaded', async () => {
      fakeHome()
      server.use(
        http.get('*/api/profiles/ada-substack/notes', () =>
          HttpResponse.json({ error: 'Nope' }, { status: 500 }),
        ),
      )
      await renderAt('/p/ada-substack')
      expect(await screen.findByText(/couldn't load the notes/)).toBeInTheDocument()
    })
  })

  describe('ideas', () => {
    it('lists them with their draft counts, and links to each, to all, and to a new one', async () => {
      fakeHome([], [idea('i1', 'Why rivers meander', 2), idea('i2', 'Lakes', 1)])
      await renderAt('/p/ada-substack')
      const link = await screen.findByRole('link', { name: /Why rivers meander/ })
      expect(link).toHaveTextContent('2 drafts')
      expect(screen.getByRole('link', { name: /Lakes/ })).toHaveTextContent('1 draft')
      expect(screen.getByRole('link', { name: 'See all ideas' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas',
      )
      expect(screen.getByRole('link', { name: 'New idea' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/new',
      )
    })

    it('says so when there are none, and still offers a new idea', async () => {
      fakeHome()
      await renderAt('/p/ada-substack')
      expect(await screen.findByText(/No ideas yet/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'New idea' })).toBeInTheDocument()
    })

    it('says when the ideas can’t be loaded', async () => {
      fakeHome()
      server.use(
        http.get('*/api/profiles/ada-substack/ideas', () =>
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
  summary: null,
  publishedAt: `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`,
  status,
})
function fakeFeeds(sources: ReturnType<typeof source>[], posts: ReturnType<typeof post>[]) {
  server.use(
    http.get('*/api/profiles/ada-substack/sources', () => HttpResponse.json(sources)),
    http.get('*/api/profiles/ada-substack/sources/recent', () =>
      HttpResponse.json({ days: 30, posts, omitted: 0, undated: 0, failed: [] }),
    ),
  )
}

describe('a profile’s landing page: search', () => {
  it('says there are no feeds, and leads to where to add one', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    const region = await screen.findByRole('region', { name: 'Search' })
    expect(await within(region).findByText(/No feeds yet/)).toBeInTheDocument()
    expect(within(region).getByRole('link', { name: /Add a blog/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/search',
    )
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
    expect(screen.getByRole('link', { name: 'See more and set up feeds' })).toHaveAttribute(
      'href',
      '/p/ada-substack/search',
    )
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
      http.get('*/api/profiles/ada-substack/sources', () =>
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
      http.get('*/api/profiles/ada-substack/sources', () => HttpResponse.json([source('s1', 'A')])),
      http.get('*/api/profiles/ada-substack/sources/recent', ({ request }) => {
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

describe('a profile’s landing page: read', () => {
  function fakeReading(initial: ReturnType<typeof link>[]) {
    const state = { links: [...initial], added: [] as string[] }
    server.use(
      http.get('*/api/profiles/ada-substack/reading', () => HttpResponse.json(state.links)),
      http.post('*/api/profiles/ada-substack/reading', async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        state.added.push(url)
        state.links.push(link(`n${state.links.length + 1}`, `Title of ${url}`, { url }))
        return HttpResponse.json(state.links, { status: 201 })
      }),
    )
    return state
  }

  it('says when the list is empty, and still offers the form', async () => {
    fakeHome()
    await renderAt('/p/ada-substack')
    expect(await screen.findByText('Nothing on the reading list yet.')).toBeInTheDocument()
    expect(screen.getByLabelText('Web address')).toBeInTheDocument()
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

  it('adds an item without leaving the page, and checks the address like the Read page does', async () => {
    fakeHome()
    const state = fakeReading([])
    await renderAt('/p/ada-substack')
    await fireEvent.update(await screen.findByLabelText('Web address'), 'example.org/new')
    await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    await waitFor(() => expect(state.added).toEqual(['example.org/new']))
    const list = await screen.findByRole('list', { name: 'To read' })
    expect(within(list).getByText('Title of example.org/new')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Web address')).toHaveValue(''))
  })

  it('says what went wrong when an address is refused, and keeps what was typed', async () => {
    fakeHome()
    fakeReading([])
    server.use(
      http.post('*/api/profiles/ada-substack/reading', () =>
        HttpResponse.json(
          { error: 'Enter a web address, like https://example.com' },
          { status: 400 },
        ),
      ),
    )
    await renderAt('/p/ada-substack')
    await fireEvent.update(await screen.findByLabelText('Web address'), 'rubbish')
    await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(await screen.findByText(/Enter a web address/)).toBeInTheDocument()
    expect(screen.getByLabelText('Web address')).toHaveValue('rubbish')
  })

  it('says when the list can’t be loaded', async () => {
    fakeHome()
    server.use(
      http.get('*/api/profiles/ada-substack/reading', () =>
        HttpResponse.json({ error: 'Nope' }, { status: 500 }),
      ),
    )
    await renderAt('/p/ada-substack')
    expect(await screen.findByText(/couldn't load the reading list/)).toBeInTheDocument()
  })
})
