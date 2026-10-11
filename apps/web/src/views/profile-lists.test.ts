import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { expectOrigin, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const profile = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'owner' }],
}
type Link = {
  id: string
  url: string
  title: string
  authors: string[]
  readAt: string | null
  origin: string
  why: string | null
}
const link = (id: string, title: string, extra: Partial<Link> = {}): Link => ({
  id,
  url: `https://example.org/${id}`,
  title,
  authors: [],
  readAt: null,
  origin: 'entered',
  why: null,
  ...extra,
})
const note = (id: string, text: string, readingItemId: string | null = null, extra = {}) => ({
  id,
  text,
  origin: readingItemId ? 'reading' : 'entered',
  authorId: 'u1',
  authorName: 'Ada',
  readingItemId,
  tags: [] as string[],
  quote: false,
  addedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

/** A small fake of the profile's own reading list and notes, remembering what it was sent. */
function fakeProfile(initial: { links?: Link[]; notes?: ReturnType<typeof note>[] } = {}) {
  const state = {
    links: [...(initial.links ?? [])],
    notes: [...(initial.notes ?? [])],
    added: [] as string[],
    sentNotes: [] as unknown[],
    orders: [] as string[][],
  }
  const base = '*/api/profiles/ada-substack'
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([profile])),
    http.get(`${base}/ideas`, () => HttpResponse.json([])),
    http.get(`${base}/reading`, () => HttpResponse.json(state.links)),
    http.post(`${base}/reading`, async ({ request }) => {
      const { url } = (await request.json()) as { url: string }
      state.added.push(url)
      state.links.push(link(`n${state.links.length + 1}`, `Title of ${url}`, { url }))
      return HttpResponse.json(state.links, { status: 201 })
    }),
    http.put(`${base}/reading/:linkId/read`, async ({ params, request }) => {
      const { read } = (await request.json()) as { read: boolean }
      state.links = state.links.map((l) =>
        l.id === params.linkId ? { ...l, readAt: read ? '2026-02-02T00:00:00Z' : null } : l,
      )
      return HttpResponse.json(state.links)
    }),
    http.delete(`${base}/reading/:linkId`, ({ params }) => {
      state.links = state.links.filter((l) => l.id !== params.linkId)
      return new HttpResponse(null, { status: 204 })
    }),
    http.get(`${base}/notes`, () => HttpResponse.json(state.notes)),
    http.post(`${base}/notes`, async ({ request }) => {
      const body = (await request.json()) as {
        text: string
        readingItemId?: string
        quote?: boolean
      }
      state.sentNotes.push(body)
      const made = note(`m${state.notes.length + 1}`, body.text, body.readingItemId ?? null, {
        quote: !!body.quote,
      })
      state.notes.push(made)
      return HttpResponse.json(made, { status: 201 })
    }),
    http.delete(`${base}/notes/:noteId`, ({ params }) => {
      state.notes = state.notes.filter((n) => n.id !== params.noteId)
      return new HttpResponse(null, { status: 204 })
    }),
    http.put(`${base}/notes/order`, async ({ request }) => {
      const { ids } = (await request.json()) as { ids: string[] }
      state.orders.push(ids)
      state.notes = ids.map((id) => state.notes.find((n) => n.id === id)!)
      return HttpResponse.json(state.notes)
    }),
  )
  return state
}

describe('the profile page', () => {
  it('leads to the reading list and the notes', async () => {
    fakeProfile()
    await renderAt('/p/ada-substack')
    expect(await screen.findByRole('link', { name: 'Reading list' })).toHaveAttribute(
      'href',
      '/p/ada-substack/reading',
    )
    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'href',
      '/p/ada-substack/notes',
    )
  })
})

describe('the profile’s reading list', () => {
  beforeEach(() => fakeProfile())

  it('leads to the Inspiration page, where posts from the feeds are added to it', async () => {
    await renderAt('/p/ada-substack/reading')
    expect(await screen.findByRole('link', { name: 'Add to reading list' })).toHaveAttribute(
      'href',
      '/p/ada-substack/inspiration',
    )
  })

  it('says it is empty, and what the list is for', async () => {
    await renderAt('/p/ada-substack/reading')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reading list' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('Nothing on the reading list yet.')).toBeInTheDocument()
    expect(screen.getByText(/before any one idea/)).toBeInTheDocument()
  })

  it('shows loading, and says what went wrong loading, and tries again', async () => {
    let fail = true
    const state = fakeProfile({ links: [link('l1', 'A paper')] })
    server.use(
      http.get('*/api/profiles/ada-substack/reading', () =>
        fail
          ? HttpResponse.json({ error: 'nope' }, { status: 500 })
          : HttpResponse.json(state.links),
      ),
    )
    await renderAt('/p/ada-substack/reading')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the reading list")
    fail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('A paper')).toBeInTheDocument()
  })

  it('lists the items, with a way to take notes on each at the profile’s own reading page', async () => {
    fakeProfile({ links: [link('l1', 'A paper', { authors: ['Bo'] }), link('l2', '')] })
    await renderAt('/p/ada-substack/reading')
    expect(await screen.findByText('A paper')).toBeInTheDocument()
    const [first, second] = await screen.findAllByRole('link', { name: 'Take notes' })
    expect(first).toHaveAttribute('href', '/p/ada-substack/reading/l1')
    expect(second).toHaveAttribute('href', '/p/ada-substack/reading/l2')
  })

  it('adds an item by its address, clearing the field, and keeps what was typed when it fails', async () => {
    const state = fakeProfile()
    await renderAt('/p/ada-substack/reading')
    await fireEvent.update(await screen.findByLabelText('Web address'), 'https://example.org/new')
    await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(await screen.findByText('Title of https://example.org/new')).toBeInTheDocument()
    expect(state.added).toEqual(['https://example.org/new'])
    await waitFor(() => expect(screen.getByLabelText('Web address')).toHaveValue(''))

    server.use(
      http.post('*/api/profiles/ada-substack/reading', () =>
        HttpResponse.json(
          { error: 'That link is already in this profile’s reading list.' },
          { status: 409 },
        ),
      ),
    )
    await fireEvent.update(screen.getByLabelText('Web address'), 'https://example.org/new')
    await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    expect(await screen.findByText(/already in this profile/)).toBeInTheDocument()
    expect(screen.getByLabelText('Web address')).toHaveValue('https://example.org/new')
  })

  it('marks an item read and unread, and removes it', async () => {
    const state = fakeProfile({ links: [link('l1', 'A paper'), link('l2', 'Another')] })
    await renderAt('/p/ada-substack/reading')
    const box = await screen.findByRole('checkbox', { name: 'Read: A paper' })
    await fireEvent.click(box)
    await waitFor(() => expect(state.links[0]!.readAt).toBeTruthy())
    await fireEvent.click(await screen.findByRole('checkbox', { name: 'Read: A paper' }))
    await waitFor(() => expect(state.links[0]!.readAt).toBeNull())

    await fireEvent.click(screen.getByRole('button', { name: 'Remove link to Another' }))
    await waitFor(() => expect(screen.queryByText('Another')).not.toBeInTheDocument())
    expect(state.links.map((l) => l.id)).toEqual(['l1'])
  })

  it('shows where an item came from: the AI’s with the highlighter, a feed’s without', async () => {
    fakeProfile({
      links: [
        link('l1', 'From research', { origin: 'research', why: 'It argues the opposite' }),
        link('l2', 'From a feed', { origin: 'feed' }),
      ],
    })
    await renderAt('/p/ada-substack/reading')
    const research = (await screen.findByText('Found by research')).closest('span')!
    expect(research).toHaveClass('chip-ai')
    const feed = screen.getByText('From a feed', { selector: '.chip' })
    expect(feed).not.toHaveClass('chip-ai')
  })
})

describe('reading an item of the profile’s own list', () => {
  const open = (state = fakeProfile({ links: [link('l1', 'A paper')] })) => {
    return { state, shown: renderAt('/p/ada-substack/reading/l1') }
  }

  it('shows the item, and goes back to the reading list', async () => {
    open()
    expect(await screen.findByRole('heading', { level: 1, name: 'A paper' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open the page/ })).toHaveAttribute(
      'href',
      'https://example.org/l1',
    )
    expect(
      screen.getByRole('link', { name: /Back to the profile’s reading list/ }),
    ).toHaveAttribute('href', '/p/ada-substack/reading')
  })

  it('says so when the item is not on the list', async () => {
    fakeProfile()
    await renderAt('/p/ada-substack/reading/nope')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "couldn't open that reading-list item",
    )
    expect(screen.getByRole('link', { name: 'Back to the reading list' })).toBeInTheDocument()
  })

  it('takes a note from the item as one of the profile’s notes, and a quote word for word', async () => {
    const { state } = open()
    await fireEvent.update(await screen.findByLabelText('Add a note from this page'), 'My thought')
    await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('My thought')).toBeInTheDocument()
    expect(state.sentNotes).toEqual([{ text: 'My thought', readingItemId: 'l1' }])

    await fireEvent.update(screen.getByLabelText('Add a note from this page'), 'Exact words')
    await fireEvent.click(screen.getByRole('checkbox', { name: /direct quote/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Add note' }))
    await waitFor(() => expect(state.sentNotes).toHaveLength(2))
    expect(state.sentNotes[1]).toEqual({ text: 'Exact words', readingItemId: 'l1', quote: true })
    const items = within(await screen.findByRole('list')).getAllByRole('listitem')
    expectOrigin(items[0]!, 'Quoted from “A paper”', 'Ada')
  })

  it('adds another page to the profile’s reading list, and offers to read it', async () => {
    const { state } = open()
    await fireEvent.update(await screen.findByLabelText('Web address'), 'https://example.org/more')
    await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
    const read = await screen.findByRole('link', { name: 'Read it and take notes' })
    expect(state.added).toEqual(['https://example.org/more'])
    expect(read).toHaveAttribute('href', expect.stringMatching(/^\/p\/ada-substack\/reading\/n\d$/))
  })

  it('marks it read, and edits its title and authors', async () => {
    const { state } = open()
    await fireEvent.click(await screen.findByRole('checkbox', { name: 'I have read this' }))
    await waitFor(() => expect(state.links[0]!.readAt).toBeTruthy())

    server.use(
      http.patch('*/api/profiles/ada-substack/reading/l1', async ({ request }) => {
        const body = (await request.json()) as { title: string; authors: string[] }
        state.links[0] = { ...state.links[0]!, title: body.title, authors: body.authors }
        return HttpResponse.json(state.links)
      }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Edit title and authors' }))
    await fireEvent.update(screen.getByLabelText('Title'), 'A better title')
    await fireEvent.update(screen.getByLabelText('Authors'), 'Bo Writer, Cy Author')
    await fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'A better title' }),
    ).toBeInTheDocument()
    expect(screen.getByText('By Bo Writer and Cy Author')).toBeInTheDocument()
  })
})

describe('the profile’s notes', () => {
  it('says there are none yet, and that they belong to the profile', async () => {
    fakeProfile()
    await renderAt('/p/ada-substack/notes')
    expect(await screen.findByRole('heading', { level: 1, name: 'Notes' })).toBeInTheDocument()
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument()
    expect(screen.getByText(/belong to the profile, not to any one idea yet/)).toBeInTheDocument()
  })

  it('lists them with the reading item each came from', async () => {
    fakeProfile({
      links: [link('l1', 'A paper')],
      notes: [note('n1', 'Typed thought'), note('n2', 'From the paper', 'l1')],
    })
    await renderAt('/p/ada-substack/notes')
    expect(await screen.findByText('Typed thought')).toBeInTheDocument()
    const items = screen
      .getAllByRole('listitem')
      .filter((li) => li.textContent?.includes('From the paper'))
    expectOrigin(items[0]!, 'From reading “A paper”', 'Ada')
  })

  it('says what went wrong loading them, and tries again', async () => {
    let fail = true
    const state = fakeProfile({ notes: [note('n1', 'A thought')] })
    server.use(
      http.get('*/api/profiles/ada-substack/notes', () =>
        fail
          ? HttpResponse.json({ error: 'nope' }, { status: 500 })
          : HttpResponse.json(state.notes),
      ),
    )
    await renderAt('/p/ada-substack/notes')
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the notes")
    fail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('A thought')).toBeInTheDocument()
  })

  it('adds a note of the profile’s own', async () => {
    const state = fakeProfile()
    await renderAt('/p/ada-substack/notes')
    await fireEvent.update(await screen.findByLabelText('Add a note'), 'Something I noticed')
    await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Something I noticed')).toBeInTheDocument()
    expect(state.sentNotes).toEqual([{ text: 'Something I noticed' }])
  })

  it('puts notes in order and deletes them, as an idea’s notes can', async () => {
    const state = fakeProfile({ notes: [note('n1', 'One'), note('n2', 'Two')] })
    await renderAt('/p/ada-substack/notes')
    await screen.findByText('One')
    await fireEvent.click(screen.getByRole('button', { name: /Move note “Two” up/ }))
    await waitFor(() => expect(state.orders).toEqual([['n2', 'n1']]))

    const del = screen.getByRole('button', { name: /^Delete note “One”/ })
    await fireEvent.click(del)
    await fireEvent.click(del)
    await waitFor(() => expect(screen.queryByText('One')).not.toBeInTheDocument())
    expect(state.notes.map((n) => n.id)).toEqual(['n2'])
  })
})
