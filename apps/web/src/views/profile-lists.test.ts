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
  kept?: boolean
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
    http.put(`${base}/reading/:linkId/kept`, async ({ params, request }) => {
      const { kept } = (await request.json()) as { kept: boolean }
      state.links = state.links.map((l) => (l.id === params.linkId ? { ...l, kept } : l))
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

  describe('read items', () => {
    const read = '2026-02-02T00:00:00Z'
    const items = () => [
      link('l1', 'Still to read'),
      link('l2', 'Already read', { readAt: read }),
      link('l3', 'Also read', { readAt: read }),
    ]

    it('are hidden by default, with how many, and shown with the tick', async () => {
      fakeProfile({ links: items() })
      await renderAt('/p/ada-substack/reading')
      expect(await screen.findByText('Still to read')).toBeInTheDocument()
      expect(screen.queryByText('Already read')).not.toBeInTheDocument()
      expect(screen.getByText('2 read items are hidden.')).toBeInTheDocument()

      const tick = screen.getByRole('checkbox', { name: 'Show read items (2)' })
      await fireEvent.click(tick)
      expect(await screen.findByText('Already read')).toBeInTheDocument()
      expect(screen.getByText('Also read')).toBeInTheDocument()
      expect(screen.queryByText(/read items are hidden/)).not.toBeInTheDocument()

      await fireEvent.click(tick)
      await waitFor(() => expect(screen.queryByText('Already read')).not.toBeInTheDocument())
    })

    it('say so, rather than "nothing yet", when everything has been read', async () => {
      fakeProfile({ links: [link('l2', 'Already read', { readAt: read })] })
      await renderAt('/p/ada-substack/reading')
      expect(await screen.findByText('Everything on the list has been read.')).toBeInTheDocument()
      expect(screen.getByText('1 read item is hidden.')).toBeInTheDocument()
      expect(screen.queryByText('Nothing on the reading list yet.')).not.toBeInTheDocument()
    })

    it('offer no tick when none has been read, and a truly empty list says so', async () => {
      fakeProfile({ links: [link('l1', 'Still to read')] })
      await renderAt('/p/ada-substack/reading')
      await screen.findByText('Still to read')
      expect(screen.queryByRole('checkbox', { name: /Show read items/ })).not.toBeInTheDocument()
    })

    it('stay in view when ticked during this visit, so they can be unticked', async () => {
      const state = fakeProfile({ links: items() })
      await renderAt('/p/ada-substack/reading')
      await fireEvent.click(await screen.findByRole('checkbox', { name: 'Read: Still to read' }))
      await waitFor(() => expect(state.links[0]!.readAt).toBeTruthy())
      // It was just ticked, so it is still there, ticked, and the others are still hidden.
      expect(screen.getByRole('checkbox', { name: 'Read: Still to read' })).toBeChecked()
      expect(screen.queryByText('Already read')).not.toBeInTheDocument()
      expect(await screen.findByText('2 read items are hidden.')).toBeInTheDocument()
      // Unticking it makes it an ordinary unread item again.
      await fireEvent.click(screen.getByRole('checkbox', { name: 'Read: Still to read' }))
      await waitFor(() => expect(state.links[0]!.readAt).toBeNull())
      expect(screen.getByRole('checkbox', { name: 'Read: Still to read' })).not.toBeChecked()
    })

    it('go out of view once the tick is changed, if they were read this visit', async () => {
      const state = fakeProfile({ links: items() })
      await renderAt('/p/ada-substack/reading')
      await fireEvent.click(await screen.findByRole('checkbox', { name: 'Read: Still to read' }))
      await waitFor(() => expect(state.links[0]!.readAt).toBeTruthy())
      const show = await screen.findByRole('checkbox', { name: 'Show read items (3)' })
      await fireEvent.click(show) // show them all
      await fireEvent.click(show) // and hide them again
      await waitFor(() => expect(screen.queryByText('Still to read')).not.toBeInTheDocument())
    })
  })

  it('has no limit, and says what is removed after a month and what is not', async () => {
    await renderAt('/p/ada-substack/reading')
    expect(await screen.findByText(/There is no limit to the list/)).toBeInTheDocument()
    expect(screen.getByText(/removed a month after it was added/)).toBeInTheDocument()
    expect(screen.getByText(/never removed/)).toBeInTheDocument()
  })

  it('has a Keep tick on each item, saved when it is changed', async () => {
    const state = fakeProfile({
      links: [link('l1', 'A paper'), link('l2', 'Another', { kept: true })],
    })
    await renderAt('/p/ada-substack/reading')
    const first = await screen.findByRole('checkbox', { name: 'Keep: A paper' })
    expect(first).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Keep: Another' })).toBeChecked()
    expect(screen.getAllByText(/otherwise it is removed a month after it was added/)).toHaveLength(
      2,
    )

    await fireEvent.click(first)
    await waitFor(() => expect(state.links[0]!.kept).toBe(true))
    await fireEvent.click(await screen.findByRole('checkbox', { name: 'Keep: Another' }))
    await waitFor(() => expect(state.links[1]!.kept).toBe(false))
  })

  it('puts the tick back and says so when keeping could not be saved', async () => {
    fakeProfile({ links: [link('l1', 'A paper')] })
    server.use(
      http.put('*/api/profiles/ada-substack/reading/l1/kept', () =>
        HttpResponse.json({ error: 'nope' }, { status: 500 }),
      ),
    )
    await renderAt('/p/ada-substack/reading')
    const box = await screen.findByRole('checkbox', { name: 'Keep: A paper' })
    await fireEvent.click(box)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that")
    await waitFor(() => expect(box).not.toBeChecked())
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

describe('moving reading items', () => {
  const ideaRows = [
    { id: 'i1', name: 'Rivers', draftCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'i2', name: 'Lakes', draftCount: 1, updatedAt: '2026-01-01T00:00:00Z' },
  ]
  /** The fake of the profile's lists plus the ideas and the move endpoint, remembering what it was sent. */
  function fake(links: Link[] = [link('l1', 'A paper'), link('l2', 'Another')]) {
    const state = fakeProfile({ links })
    const moves: { ids: string[]; to: { ideaId: string | null } }[] = []
    const created: string[] = []
    let result = { batchId: 'b', readingItems: 2, merged: 0, copied: 0, notes: 5 }
    server.use(
      http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json(ideaRows)),
      http.post('*/api/profiles/ada-substack/ideas', async ({ request }) => {
        const body = (await request.json()) as { name: string }
        created.push(body.name)
        return HttpResponse.json(
          {
            id: 'new1',
            profileId: 'ada-substack',
            name: body.name,
            notes: '',
            links: [],
            drafts: [],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
          { status: 201 },
        )
      }),
      http.post('*/api/profiles/ada-substack/move/reading', async ({ request }) => {
        const body = (await request.json()) as (typeof moves)[number]
        moves.push(body)
        state.links = state.links.filter((l) => !body.ids.includes(l.id))
        return HttpResponse.json(result)
      }),
    )
    return {
      state,
      moves,
      created,
      setResult: (r: Partial<typeof result>) => (result = { ...result, ...r }),
    }
  }
  const open = async () => {
    await renderAt('/p/ada-substack/reading')
    await fireEvent.click(await screen.findByRole('button', { name: 'Move items' }))
  }
  const tick = (title: string) =>
    fireEvent.click(screen.getByRole('checkbox', { name: `Select to move: ${title}` }))

  it('offers ticks on each item and a place to move to, and moves only once both are chosen', async () => {
    fake()
    await open()
    expect(screen.getByRole('button', { name: 'Stop moving' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const button = screen.getByRole('button', { name: 'Move 0 items' })
    expect(button).toBeDisabled()
    await tick('A paper')
    await tick('Another')
    expect(screen.getByRole('button', { name: 'Move 2 items' })).toBeDisabled() // no place chosen yet
    await fireEvent.update(await screen.findByLabelText('Move to'), 'i1')
    expect(screen.getByRole('button', { name: 'Move 2 items' })).toBeEnabled()
  })

  it('moves the chosen items to an idea, and says what moved, with an Undo', async () => {
    const f = fake()
    await open()
    await tick('A paper')
    await tick('Another')
    await fireEvent.update(await screen.findByLabelText('Move to'), 'i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 2 items' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Moved 2 items and 5 notes to “Rivers”.',
    )
    expect(f.moves).toEqual([{ ids: ['l1', 'l2'], to: { ideaId: 'i1' } }])
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: /Select to move/ })).not.toBeInTheDocument(),
    ) // done selecting
    expect(await screen.findByText('Nothing on the reading list yet.')).toBeInTheDocument()
  })

  it('puts them back with Undo', async () => {
    const f = fake()
    await open()
    await tick('A paper')
    await fireEvent.update(await screen.findByLabelText('Move to'), 'i2')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 item' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(f.moves).toHaveLength(2))
    expect(f.moves[1]).toEqual({ ids: ['l1'], to: { ideaId: null } }) // back to the profile's own list
    expect(await screen.findByRole('status')).toHaveTextContent('Moved back.')
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('says when items were joined to ones already there, and offers no Undo for that', async () => {
    const f = fake()
    f.setResult({ readingItems: 1, merged: 1, notes: 0 })
    await open()
    await tick('A paper')
    await fireEvent.update(await screen.findByLabelText('Move to'), 'i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 item' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Moved 1 item to “Rivers”. 1 item was already there, so it was joined with it.',
    )
    expect(within(status).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
    await fireEvent.click(within(status).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('makes a new idea from the chosen items, named in the writer’s words', async () => {
    const f = fake()
    await open()
    await tick('A paper')
    await fireEvent.update(await screen.findByLabelText('Move to'), '__new')
    const button = screen.getByRole('button', { name: 'Move 1 item' })
    expect(button).toBeDisabled() // it needs a name
    await fireEvent.update(screen.getByLabelText("What's your core idea?"), '  Why rivers meander ')
    expect(button).toBeEnabled()
    await fireEvent.click(button)
    await waitFor(() => expect(f.moves).toEqual([{ ids: ['l1'], to: { ideaId: 'new1' } }]))
    expect(f.created).toEqual(['Why rivers meander'])
    expect(await screen.findByRole('status')).toHaveTextContent('to “Why rivers meander”.')
  })

  it('says why it could not move, and keeps the choice', async () => {
    fake()
    server.use(
      http.post('*/api/profiles/ada-substack/move/reading', () =>
        HttpResponse.json(
          {
            error: 'An idea can have up to 50 links. Remove some you no longer need to make room.',
          },
          { status: 409 },
        ),
      ),
    )
    await open()
    await tick('A paper')
    await fireEvent.update(await screen.findByLabelText('Move to'), 'i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 item' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('An idea can have up to 50 links')
    expect(screen.getByRole('checkbox', { name: 'Select to move: A paper' })).toBeChecked()
    expect(screen.getByLabelText('Move to')).toHaveValue('i1')
  })

  it('says so, and offers nowhere to move to, when the ideas could not be loaded', async () => {
    fake()
    server.use(
      http.get('*/api/profiles/ada-substack/ideas', () =>
        HttpResponse.json({ error: 'x' }, { status: 500 }),
      ),
    )
    await open()
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your ideas")
    expect(screen.queryByLabelText('Move to')).not.toBeInTheDocument()
  })

  it('stops moving, clearing what was ticked', async () => {
    fake()
    await open()
    await tick('A paper')
    await fireEvent.click(screen.getByRole('button', { name: 'Stop moving' }))
    expect(screen.queryByRole('checkbox', { name: /Select to move/ })).not.toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Move items' }))
    expect(screen.getByRole('checkbox', { name: 'Select to move: A paper' })).not.toBeChecked()
  })

  it('has no Move button for an empty list', async () => {
    fake([])
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Nothing on the reading list yet.')
    expect(screen.queryByRole('button', { name: 'Move items' })).not.toBeInTheDocument()
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
