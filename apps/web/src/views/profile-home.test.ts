import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const profile = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: 'https://substack.example/ada',
  imageUrl: null,
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
    expect(notes.querySelector('h2')).toHaveTextContent(/^03\s*Notes$/)
    expect(ideas.querySelector('h2')).toHaveTextContent(/^04\s*Ideas$/)
    // The numbers are decoration: the headings are named without them.
    expect(screen.getByRole('heading', { level: 2, name: 'Notes' })).toBeInTheDocument()
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
        .map((li) => li.textContent?.trim())
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
      expect(await screen.findByText(/Couldn't load the notes/)).toBeInTheDocument()
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
      expect(await screen.findByText(/Couldn't load ideas/)).toBeInTheDocument()
    })
  })
})
