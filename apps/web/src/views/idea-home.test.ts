import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const profile = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'owner' }],
}
const link = (n: number) => ({
  id: `l${n}`,
  url: `https://example.org/${n}`,
  title: `Source ${n}`,
  readAt: null as string | null,
  origin: 'entered',
})
const draft = (n: number) => ({
  id: `d${n}`,
  title: n === 3 ? '' : `Part ${n}`,
  updatedAt: '2026-01-02T00:00:00Z',
})
const idea = (links = [link(1), link(2)], drafts = [draft(1), draft(2)]) => ({
  id: 'i1',
  profileId: 'ada-substack',
  name: 'Why rivers meander',
  notes: '',
  links,
  drafts,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
})
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
  createdAt: `2026-01-0${n}T00:00:00Z`,
  updatedAt: `2026-01-0${n}T00:00:00Z`,
})

const ideaUrl = '*/api/profiles/ada-substack/ideas/i1'

/** A pretend API for the idea; `calls` records anything that would cost money or change something. */
function fakeIdea(
  options: { idea?: ReturnType<typeof idea>; notes?: ReturnType<typeof note>[] } = {},
) {
  const state = {
    notes: [...(options.notes ?? [])],
    researched: [] as string[],
    drafts: [] as unknown[],
    requests: [] as string[],
  }
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([profile])),
    http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json([])),
    http.get(ideaUrl, () => HttpResponse.json(options.idea ?? idea())),
    http.get(`${ideaUrl}/notes`, () => HttpResponse.json(state.notes)),
    http.post(`${ideaUrl}/notes`, async ({ request }) => {
      const { text } = (await request.json()) as { text: string }
      const made = note(state.notes.length + 1, text)
      state.notes.push(made)
      return HttpResponse.json(made, { status: 201 })
    }),
    http.get(`${ideaUrl}/research`, () => HttpResponse.json([])),
    http.post(`${ideaUrl}/research`, async ({ request }) => {
      const { areas } = (await request.json()) as { areas: string }
      state.researched.push(areas)
      return HttpResponse.json(
        {
          id: 'run1',
          areas,
          createdByName: 'Ada',
          model: 'fake',
          createdAt: '2026-01-03T00:00:00Z',
          items: [],
        },
        { status: 201 },
      )
    }),
    http.post(`${ideaUrl}/drafts`, async ({ request }) => {
      state.drafts.push(await request.json())
      return HttpResponse.json(
        {
          id: 'd9',
          profileId: 'ada-substack',
          ideaId: 'i1',
          title: 'Untitled',
          body: '',
          createdAt: '2026-01-03T00:00:00Z',
          updatedAt: '2026-01-03T00:00:00Z',
        },
        { status: 201 },
      )
    }),
  )
  server.events.on('request:start', ({ request }) => {
    if (request.method !== 'GET')
      state.requests.push(`${request.method} ${new URL(request.url).pathname}`)
  })
  return state
}

describe('an idea’s landing page', () => {
  it('is titled with the idea’s name, with the profile above as a way up, and opens here', async () => {
    fakeIdea()
    const { router } = await renderAt('/p/ada-substack/ideas/i1')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Why rivers meander' }),
    ).toBeInTheDocument()
    expect(router.currentRoute.value.name).toBe('idea')
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Substack' }),
    ).toHaveAttribute('href', '/p/ada-substack')
    // It is none of the steps, so the menu marks nothing current.
    const nav = screen.getByRole('navigation', { name: 'Idea' })
    expect(nav.querySelector('[aria-current="page"]')).toBeNull()
  })

  it('numbers its sections as the menu numbers the steps', async () => {
    fakeIdea()
    await renderAt('/p/ada-substack/ideas/i1')
    const research = await screen.findByRole('region', { name: 'Research' })
    expect(research.querySelector('h2')).toHaveTextContent(/^01\s*Research$/)
    expect(screen.getByRole('region', { name: 'Notes' }).querySelector('h2')).toHaveTextContent(
      /^02\s*Notes$/,
    )
    expect(screen.getByRole('region', { name: 'Draft' }).querySelector('h2')).toHaveTextContent(
      /^04\s*Draft$/,
    )
  })

  it('says when the idea cannot be opened', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      http.get(ideaUrl, () => HttpResponse.json({ error: 'Not found' }, { status: 404 })),
    )
    await renderAt('/p/ada-substack/ideas/i1')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't open that idea")
  })

  it('asks the AI for nothing, and changes nothing, just because it was opened', async () => {
    const state = fakeIdea({ notes: [note(1)] })
    await renderAt('/p/ada-substack/ideas/i1')
    await screen.findByText('Note 1')
    await screen.findByRole('list', { name: 'Drafts' })
    expect(state.requests).toEqual([])
  })

  describe('research', () => {
    it('links to the reading list, with the number of sources', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Research' })
      const link = within(region).getByRole('link', { name: /See the reading list/ })
      expect(link).toHaveAttribute('href', '/p/ada-substack/ideas/i1/research')
      expect(link).toHaveTextContent('(2 sources)')
    })

    it('says what is sent to the AI provider, next to the button', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Research' })
      expect(within(region).getByText(/sent to your AI provider/)).toBeInTheDocument()
    })

    it('starts the research only when the button is pressed, then shows the results', async () => {
      const state = fakeIdea()
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      const button = await screen.findByRole('button', { name: 'Research' })
      expect(button).toBeDisabled()
      await fireEvent.update(
        screen.getByLabelText('What areas do you want to research?'),
        'How bends migrate',
      )
      expect(state.researched).toEqual([])
      await fireEvent.click(button)
      await waitFor(() => expect(state.researched).toEqual(['How bends migrate']))
      await waitFor(() =>
        expect(router.currentRoute.value.path).toBe('/p/ada-substack/ideas/i1/research/find'),
      )
    })

    it('says what went wrong, and keeps the words, when the research fails', async () => {
      fakeIdea()
      server.use(
        http.post(`${ideaUrl}/research`, () =>
          HttpResponse.json({ error: 'The search service is busy' }, { status: 502 }),
        ),
      )
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.update(
        await screen.findByLabelText('What areas do you want to research?'),
        'Keep me',
      )
      await fireEvent.click(screen.getByRole('button', { name: 'Research' }))
      expect(await screen.findByText('The search service is busy')).toBeInTheDocument()
      expect(screen.getByLabelText('What areas do you want to research?')).toHaveValue('Keep me')
      expect(router.currentRoute.value.name).toBe('idea')
    })
  })

  describe('notes', () => {
    it('says so when there are none, and still offers the form', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
      expect(screen.getByLabelText('Add a note')).toBeInTheDocument()
    })

    it('shows the five most recent, and links to all of them', async () => {
      fakeIdea({ notes: [1, 2, 3, 4, 5, 6, 7].map((n) => note(n)) })
      await renderAt('/p/ada-substack/ideas/i1')
      const list = await screen.findByRole('list', { name: 'Recent notes' })
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((li) => li.textContent?.trim()),
      ).toEqual(['Note 7', 'Note 6', 'Note 5', 'Note 4', 'Note 3'])
      expect(screen.getByRole('link', { name: /See all notes/ })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/notes',
      )
    })

    it('adds a note without leaving the page', async () => {
      fakeIdea({ notes: [note(1)] })
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      await screen.findByText('Note 1')
      await fireEvent.update(screen.getByLabelText('Add a note'), 'A new thought')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      const list = await screen.findByRole('list', { name: 'Recent notes' })
      await waitFor(() =>
        expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('A new thought'),
      )
      expect(router.currentRoute.value.name).toBe('idea')
    })

    it('says when the notes can’t be loaded', async () => {
      fakeIdea()
      server.use(
        http.get(`${ideaUrl}/notes`, () => HttpResponse.json({ error: 'Nope' }, { status: 500 })),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByText(/couldn't load the notes/)).toBeInTheDocument()
    })
  })

  describe('drafts', () => {
    it('lists them in order, each leading to its editor, and links to the Draft page', async () => {
      fakeIdea({ idea: idea([], [draft(1), draft(3), draft(2)]) })
      await renderAt('/p/ada-substack/ideas/i1')
      const list = await screen.findByRole('list', { name: 'Drafts' })
      const items = within(list).getAllByRole('link')
      expect(items.map((a) => a.querySelector('span')?.textContent)).toEqual([
        'Part 1',
        'Untitled',
        'Part 2',
      ])
      expect(items[0]).toHaveAttribute('href', '/p/ada-substack/drafts/d1')
      expect(screen.getByRole('link', { name: /See all drafts/ })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/drafts',
      )
    })

    it('says so when there are none, and still offers to start one', async () => {
      fakeIdea({ idea: idea([], []) })
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByText(/No drafts yet/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Start a draft' })).toBeInTheDocument()
    })

    it('starts a draft and opens it', async () => {
      const state = fakeIdea({ idea: idea([], []) })
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.click(await screen.findByRole('button', { name: 'Start a draft' }))
      await waitFor(() => expect(state.drafts).toEqual([{ title: 'Untitled' }]))
      await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-substack/drafts/d9'))
    })

    it('says what went wrong when a draft can’t be started', async () => {
      fakeIdea({ idea: idea([], []) })
      server.use(
        http.post(`${ideaUrl}/drafts`, () => HttpResponse.json({ error: 'Nope' }, { status: 500 })),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.click(await screen.findByRole('button', { name: 'Start a draft' }))
      expect(await screen.findByText(/Couldn't start a new draft/)).toBeInTheDocument()
    })
  })
})
