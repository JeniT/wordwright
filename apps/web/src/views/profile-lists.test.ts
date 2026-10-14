import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  expectOrigin,
  openFilters,
  renderAt,
  server,
  showArrows,
  signedInAs,
  testUser,
  useMockServer,
} from '../test-utils'

useMockServer()

const profile = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
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
  addedAt?: string
}
const link = (id: string, title: string, extra: Partial<Link> = {}): Link => ({
  id,
  url: `https://example.org/${id}`,
  title,
  authors: [],
  readAt: null,
  origin: 'entered',
  why: null,
  addedAt: '2026-01-02T00:00:00Z',
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

describe('the profile’s menu', () => {
  it('leads to its four steps, which include the reading list and the notes', async () => {
    fakeProfile()
    await renderAt('/p/ada-substack')
    const menu = within(await screen.findByRole('navigation', { name: 'Profile' }))
    expect(await menu.findByRole('link', { name: 'Search' })).toHaveAttribute(
      'href',
      '/p/ada-substack/search',
    )
    expect(menu.getByRole('link', { name: 'Read' })).toHaveAttribute('href', '/p/ada-substack/read')
    expect(menu.getByRole('link', { name: 'Notes' })).toHaveAttribute(
      'href',
      '/p/ada-substack/notes',
    )
    expect(menu.getByRole('link', { name: 'Ideas' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas',
    )
  })
})

describe('the profile’s reading list', () => {
  beforeEach(() => fakeProfile())

  it('is the Read page, and the old addresses lead there', async () => {
    const { router } = await renderAt('/p/ada-substack/reading')
    expect(await screen.findByRole('heading', { level: 1, name: 'Read' })).toBeInTheDocument()
    expect(router.currentRoute.value.path).toBe('/p/ada-substack/read')
    await router.push('/p/ada-substack/inspiration#reading-list')
    expect(router.currentRoute.value.path).toBe('/p/ada-substack/read')
  })

  it('leaves the feeds and recent posts to the Search page, which the old Inspiration address shows', async () => {
    const { router } = await renderAt('/p/ada-substack/inspiration')
    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument()
    expect(router.currentRoute.value.path).toBe('/p/ada-substack/search')
    expect(screen.queryByRole('region', { name: 'Reading list' })).not.toBeInTheDocument()
  })

  it('says it is empty, and what the list is for', async () => {
    await renderAt('/p/ada-substack/reading')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Reading list' }),
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
    await renderAt('/p/ada-substack/read')
    const box = await screen.findByRole('switch', { name: 'Read: A paper' })
    await fireEvent.click(box)
    await waitFor(() => expect(state.links[0]!.readAt).toBeTruthy())
    await fireEvent.click(await screen.findByRole('switch', { name: 'Read: A paper' }))
    await waitFor(() => expect(state.links[0]!.readAt).toBeNull())

    // Removing is held (a screen reader's activation asks twice), and says nothing is lost silently.
    const remove = screen.getByRole('button', { name: 'Remove link to Another' })
    await fireEvent.click(remove)
    expect(state.links).toHaveLength(2)
    await fireEvent.click(remove)
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

      await openFilters()
      const tick = screen.getByRole('switch', { name: 'Show read items (2)' })
      await fireEvent.click(tick)
      expect(await screen.findByText('Already read')).toBeInTheDocument()
      expect(screen.getByText('Also read')).toBeInTheDocument()

      await fireEvent.click(tick)
      await waitFor(() => expect(screen.queryByText('Already read')).not.toBeInTheDocument())
    })

    it('say so, rather than "nothing yet", when everything has been read', async () => {
      fakeProfile({ links: [link('l2', 'Already read', { readAt: read })] })
      await renderAt('/p/ada-substack/reading')
      expect(await screen.findByText('Everything on the list has been read.')).toBeInTheDocument()
      expect(screen.queryByText('Nothing on the reading list yet.')).not.toBeInTheDocument()
    })

    it('offer no tick when none has been read, and a truly empty list says so', async () => {
      fakeProfile({ links: [link('l1', 'Still to read')] })
      await renderAt('/p/ada-substack/reading')
      await screen.findByText('Still to read')
      expect(screen.queryByRole('switch', { name: /Show read items/ })).not.toBeInTheDocument()
    })

    it('stay in view when ticked during this visit, so they can be unticked', async () => {
      const state = fakeProfile({ links: items() })
      await renderAt('/p/ada-substack/reading')
      await fireEvent.click(await screen.findByRole('switch', { name: 'Read: Still to read' }))
      await waitFor(() => expect(state.links[0]!.readAt).toBeTruthy())
      // It was just ticked, so it is still there, ticked, and the others are still hidden.
      expect(screen.getByRole('switch', { name: 'Read: Still to read' })).toBeChecked()
      expect(screen.queryByText('Already read')).not.toBeInTheDocument()
      // Unticking it makes it an ordinary unread item again.
      await fireEvent.click(screen.getByRole('switch', { name: 'Read: Still to read' }))
      await waitFor(() => expect(state.links[0]!.readAt).toBeNull())
      expect(screen.getByRole('switch', { name: 'Read: Still to read' })).not.toBeChecked()
    })

    it('go out of view once the tick is changed, if they were read this visit', async () => {
      const state = fakeProfile({ links: items() })
      await renderAt('/p/ada-substack/reading')
      await fireEvent.click(await screen.findByRole('switch', { name: 'Read: Still to read' }))
      await waitFor(() => expect(state.links[0]!.readAt).toBeTruthy())
      await openFilters()
      const show = await screen.findByRole('switch', { name: 'Show read items (3)' })
      await fireEvent.click(show) // show them all
      await fireEvent.click(show) // and hide them again
      await waitFor(() => expect(screen.queryByText('Still to read')).not.toBeInTheDocument())
    })
  })

  it('says what stays and what goes after a month, briefly', async () => {
    await renderAt('/p/ada-substack/reading')
    expect(
      await screen.findByText(/Links you add stay; links from your feeds go after a month/),
    ).toBeInTheDocument()
  })

  it('has a Keep tick on each item, saved when it is changed', async () => {
    const state = fakeProfile({
      links: [link('l1', 'A paper'), link('l2', 'Another', { kept: true })],
    })
    await renderAt('/p/ada-substack/reading')
    const first = await screen.findByRole('switch', { name: 'Keep: A paper' })
    expect(first).not.toBeChecked()
    expect(screen.getByRole('switch', { name: 'Keep: Another' })).toBeChecked()
    // Only an item that isn't kept says when it will go (a month after it was added), and on what date.
    expect(screen.getAllByText(/Removed from this list on/)).toHaveLength(1)
    expect(screen.getByText('Removed from this list on 1 Feb unless kept')).toBeInTheDocument()

    await fireEvent.click(first)
    await waitFor(() => expect(state.links[0]!.kept).toBe(true))
    await fireEvent.click(await screen.findByRole('switch', { name: 'Keep: Another' }))
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
    const box = await screen.findByRole('switch', { name: 'Keep: A paper' })
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
    await renderAt('/p/ada-substack/read')
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
    await screen.findByRole('checkbox', { name: 'Select A paper' })
  }
  const tick = (title: string) =>
    fireEvent.click(screen.getByRole('checkbox', { name: `Select ${title}` }))
  /** The Move to… action is for what is selected, so choose first. */
  const openMove = () => fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
  const chooseDestination = async (value: string) => {
    await openMove()
    await fireEvent.update(await screen.findByLabelText('Move to'), value)
  }

  it('offers ticks on each item and a place to move to, and moves only once both are chosen', async () => {
    fake()
    await open()
    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull() // hidden until something is selected
    await tick('A paper')
    await tick('Another')
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    await openMove()
    // The form takes over the header: the other actions are gone, and a tick and a cross end it.
    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Tag/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move 2 items' })).toBeDisabled() // no place chosen yet
    await fireEvent.update(await screen.findByLabelText('Move to'), 'i1')
    expect(screen.getByRole('button', { name: 'Move 2 items' })).toBeEnabled()
  })

  it('moves the chosen items to an idea, and says what moved, with an Undo', async () => {
    const f = fake()
    await open()
    await tick('A paper')
    await tick('Another')
    await chooseDestination('i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 2 items' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Moved 2 items and 5 notes to “Rivers”.',
    )
    expect(f.moves).toEqual([{ ids: ['l1', 'l2'], to: { ideaId: 'i1' } }])
    expect(await screen.findByText('Nothing on the reading list yet.')).toBeInTheDocument()
  })

  it('puts them back with Undo', async () => {
    const f = fake()
    await open()
    await tick('A paper')
    await chooseDestination('i2')
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
    await chooseDestination('i1')
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
    await chooseDestination('__new')
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
    await chooseDestination('i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 item' }))
    expect(
      await within(screen.getByRole('region', { name: 'Reading list' })).findByRole('alert'),
    ).toHaveTextContent('An idea can have up to 50 links')
    expect(screen.getByRole('checkbox', { name: 'Select A paper' })).toBeChecked()
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
    await tick('A paper')
    await openMove()
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't load your ideas")
    expect(screen.queryByLabelText('Move to')).not.toBeInTheDocument()
  })

  it('closes the move form on Cancel, and keeps what was selected', async () => {
    fake()
    await open()
    await tick('A paper')
    await openMove()
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Move to')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select A paper' })).toBeChecked()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
  })

  it('has no toolbar for an empty list', async () => {
    fake([])
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Nothing on the reading list yet.')
    expect(screen.queryByRole('button', { name: 'Move to…' })).not.toBeInTheDocument()
  })
})

describe('selecting, bulk actions and pages on the reading list', () => {
  const seven = () =>
    Array.from({ length: 7 }, (_, i) => link(`l${i + 1}`, `Link ${i + 1}`, { origin: 'feed' }))
  const titles = () =>
    screen
      .getAllByRole('checkbox', { name: /^Select Link/ })
      .map((c) => c.getAttribute('aria-label')!.replace('Select ', ''))
  const selectAll = () => screen.getByRole('checkbox', { name: 'Select all links on this page' })

  it('pages the list five at a time, with where you are, and keeps the filter ahead of the paging', async () => {
    fakeProfile({ links: [...seven(), link('l8', 'Done', { readAt: '2026-02-02T00:00:00Z' })] })
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Link 1')
    expect(titles()).toEqual(['Link 1', 'Link 2', 'Link 3', 'Link 4', 'Link 5'])
    expect(screen.getAllByText('Links 1–5 of 7').length).toBeGreaterThan(0)
    await fireEvent.click(screen.getAllByRole('button', { name: /^Next/ })[0]!)
    expect(titles()).toEqual(['Link 6', 'Link 7'])
    // A new filter starts again at the first page, and the count is of the filtered list.
    await openFilters()
    await fireEvent.click(screen.getByRole('switch', { name: 'Show read items (1)' }))
    expect(titles()).toHaveLength(5)
    expect(screen.getAllByText('Links 1–5 of 8').length).toBeGreaterThan(0)
  })

  it('shows no page controls for a list that fits on one page', async () => {
    fakeProfile({ links: seven().slice(0, 3) })
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Link 1')
    expect(screen.queryByRole('button', { name: /^Next/ })).not.toBeInTheDocument()
  })

  it('selects the page with the box at the top, which shows a partial selection as such', async () => {
    fakeProfile({ links: seven() })
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Link 1')
    expect(screen.getByText('0 selected')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select Link 2' }))
    expect(selectAll()).toHaveProperty('indeterminate', true)
    await fireEvent.click(selectAll())
    expect(screen.getByText('5 selected')).toBeInTheDocument()
    expect(selectAll()).toBeChecked()
    await fireEvent.click(selectAll())
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('offers the rest of the pages once the whole page is selected, and clears the selection on a new page', async () => {
    fakeProfile({ links: seven() })
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Link 1')
    await fireEvent.click(selectAll())
    await fireEvent.click(screen.getByRole('button', { name: 'Select all 7' }))
    expect(screen.getByText('7 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove 7' })).toBeEnabled()
    await fireEvent.click(screen.getAllByRole('button', { name: /^Next/ })[0]!)
    expect(screen.getByText('0 selected')).toBeInTheDocument() // what an action touches is always what is on screen
  })

  it('removes the selected links only after the dialog is confirmed, and nothing until something is selected', async () => {
    const state = fakeProfile({ links: seven().slice(0, 3) })
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Link 1')
    expect(screen.queryByRole('button', { name: /^Remove \d+$/ })).toBeNull() // hidden until something is selected
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select Link 1' }))
    await fireEvent.click(screen.getByRole('checkbox', { name: 'Select Link 3' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Remove 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Remove 2 links?' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(state.links).toHaveLength(3)
    await fireEvent.click(screen.getByRole('button', { name: 'Remove 2' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, remove them' }),
    )
    await waitFor(() => expect(state.links.map((l) => l.id)).toEqual(['l2']))
    await waitFor(() => expect(screen.queryByText('Link 1')).not.toBeInTheDocument())
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('says so when some of the selected links could not be removed, and keeps those selected', async () => {
    fakeProfile({ links: seven().slice(0, 2) })
    server.use(
      http.delete('*/api/profiles/ada-substack/reading/l2', () =>
        HttpResponse.json({ error: 'x' }, { status: 500 }),
      ),
    )
    await renderAt('/p/ada-substack/reading')
    await screen.findByText('Link 1')
    await fireEvent.click(selectAll())
    await fireEvent.click(screen.getByRole('button', { name: 'Remove 2' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, remove them' }),
    )
    expect(await screen.findByText(/Couldn't remove all of those links/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Link 1')).not.toBeInTheDocument())
    expect(screen.getByRole('checkbox', { name: 'Select Link 2' })).toBeChecked()
  })

  it('puts a link’s facts under it, plain: the host as text, where it came from as a flat chip', async () => {
    fakeProfile({
      links: [
        link('l1', 'A paper', { url: 'https://www.example.org/a/long/path', origin: 'feed' }),
      ],
    })
    await renderAt('/p/ada-substack/reading')
    const item = (await screen.findByRole('link', { name: /A paper/ })).closest('li')!
    expect(within(item).getByText('example.org')).toBeInTheDocument()
    expect(within(item).queryByText(/long\/path/)).not.toBeInTheDocument() // one link, not two
    expect(within(item).getByText('From a feed')).toHaveClass('chip-quiet')
    expect(within(item).getAllByRole('link')).toHaveLength(2) // the title, and Take notes
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
    expect(screen.getByRole('link', { name: /Back to the reading list/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/read',
    )
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
    const items = within(
      await within(await screen.findByRole('main')).findByRole('list'),
    ).getAllByRole('listitem')
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
    await fireEvent.click(await screen.findByRole('switch', { name: 'I have read this' }))
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

describe('moving notes', () => {
  const ideaRows = [
    { id: 'i1', name: 'Rivers', draftCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'i2', name: 'Lakes', draftCount: 1, updatedAt: '2026-01-01T00:00:00Z' },
  ]
  function fake(
    initial = [
      note('n1', 'Typed thought'),
      note('n2', 'From the paper', 'l1'),
      note('n3', 'More from the paper', 'l1'),
      note('n4', '“Exact words”', 'l2', { quote: true }),
    ],
  ) {
    const state = fakeProfile({
      links: [link('l1', 'A paper'), link('l2', 'Another')],
      notes: initial,
    })
    const moves: { ids: string[]; to: { ideaId: string | null } }[] = []
    let result = { batchId: 'b', readingItems: 0, merged: 0, copied: 1, notes: 2 }
    server.use(
      http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json(ideaRows)),
      http.post('*/api/profiles/ada-substack/ideas', async ({ request }) => {
        const body = (await request.json()) as { name: string }
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
      http.post('*/api/profiles/ada-substack/move/notes', async ({ request }) => {
        const body = (await request.json()) as (typeof moves)[number]
        moves.push(body)
        state.notes = state.notes.filter((n) => !body.ids.includes(n.id))
        return HttpResponse.json(result)
      }),
    )
    return {
      state,
      moves,
      setResult: (r: Partial<typeof result>) => (result = { ...result, ...r }),
    }
  }
  const open = async () => {
    await renderAt('/p/ada-substack/notes')
    await screen.findAllByRole('checkbox', { name: /^Select note/ })
  }
  const tick = (text: string) =>
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`^Select note “${text}`) }))
  /** Move to… is for what is selected, so choose first; it opens the form, then a place is picked. */
  const moveTo = async (value: string) => {
    const button = screen.queryByRole('button', { name: 'Move to…' }) // gone once the form has taken over
    if (button) await fireEvent.click(button)
    await fireEvent.update(await screen.findByLabelText('Move to'), value)
  }
  const says = () => document.querySelector('[data-move-says]')

  it('offers a tick on every note, quotations too, and moves only once notes and a place are chosen', async () => {
    fake()
    await open()
    expect(screen.getAllByRole('checkbox', { name: /^Select note/ })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull() // hidden until something is selected
    await tick('Typed thought')
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    expect(screen.getByRole('button', { name: 'Move 1 note' })).toBeDisabled() // no place yet
    await moveTo('i1')
    expect(screen.getByRole('button', { name: 'Move 1 note' })).toBeEnabled()
  })

  it('says plainly what will move, including that sources are copied and originals stay', async () => {
    fake()
    await open()
    await tick('Typed thought')
    await moveTo('i1')
    expect(says()).toHaveTextContent('1 note will move to “Rivers”.')
    expect(says()).not.toHaveTextContent('copied') // it has no source
    await tick('From the paper')
    expect(says()).toHaveTextContent('2 notes will move to “Rivers”.')
    expect(says()).toHaveTextContent(
      'The page they were taken from will be copied to its reading list',
    )
    expect(says()).toHaveTextContent('the originals stay where they are')
  })

  it('moves the chosen notes, says what moved, and puts them back with Undo', async () => {
    const f = fake()
    await open()
    await tick('From the paper')
    await tick('Typed thought')
    await moveTo('i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 2 notes' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(
      'Moved 2 notes to “Rivers”. 1 source was copied so the notes keep it.',
    )
    expect(f.moves).toEqual([{ ids: ['n1', 'n2'], to: { ideaId: 'i1' } }])
    await waitFor(() => expect(screen.queryByLabelText('Move to')).not.toBeInTheDocument()) // the form is done with

    await fireEvent.click(within(status).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(f.moves).toHaveLength(2))
    expect(f.moves[1]).toEqual({ ids: ['n1', 'n2'], to: { ideaId: null } })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Moved back. The page copied to “Rivers” stays on its reading list.',
    )
  })

  it('offers to bring the other notes from the same pages, and brings them if asked', async () => {
    const f = fake()
    await open()
    await tick('From the paper')
    await moveTo('i2')
    const box = await screen.findByRole('switch', {
      name: /Also bring the 1 other note taken from those pages/,
    })
    expect(box).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Move 1 note' })).toBeEnabled()
    await fireEvent.click(box)
    expect(screen.getByRole('button', { name: 'Move 2 notes' })).toBeEnabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Move 2 notes' }))
    await waitFor(() => expect(f.moves).toEqual([{ ids: ['n2', 'n3'], to: { ideaId: 'i2' } }]))
  })

  it('makes a new idea from the notes, named in the writer’s own words', async () => {
    const f = fake()
    await open()
    await tick('Typed thought')
    await moveTo('__new')
    const button = screen.getByRole('button', { name: 'Move 1 note' })
    expect(button).toBeDisabled() // it needs a name
    await fireEvent.update(screen.getByLabelText("What's your core idea?"), 'Why rivers meander')
    await fireEvent.click(button)
    await waitFor(() => expect(f.moves).toEqual([{ ids: ['n1'], to: { ideaId: 'new1' } }]))
    expect(await screen.findByRole('status')).toHaveTextContent('to “Why rivers meander”.')
  })

  it('selects all the notes shown with the box at the top, and clears them again', async () => {
    fake()
    await open()
    const all = screen.getByRole('checkbox', { name: 'Select all notes on this page' })
    await fireEvent.click(all)
    for (const box of screen.getAllByRole('checkbox', { name: /^Select note/ }))
      expect(box).toBeChecked()
    expect(screen.getByText('4 selected')).toBeInTheDocument()
    await fireEvent.click(all)
    for (const box of screen.getAllByRole('checkbox', { name: /^Select note/ }))
      expect(box).not.toBeChecked()
  })

  it('selects only the notes with the tag being shown', async () => {
    fake([
      note('n1', 'Tagged one', null, { tags: ['intro'] }),
      note('n2', 'Tagged two', null, { tags: ['intro'] }),
      note('n3', 'Untagged'),
    ])
    await renderAt('/p/ada-substack/notes')
    await openFilters()
    await fireEvent.click(await screen.findByRole('button', { name: /^intro/ }))
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select all notes on this page' }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    expect(screen.getByRole('button', { name: 'Move 2 notes' })).toBeDisabled() // chosen, but no place yet
    expect(screen.queryByText('Untagged')).not.toBeInTheDocument()
  })

  it('says why it could not move, and keeps the choice', async () => {
    fake()
    server.use(
      http.post('*/api/profiles/ada-substack/move/notes', () =>
        HttpResponse.json(
          { error: 'An idea can have up to 200 notes. Merge or delete some to make room.' },
          { status: 409 },
        ),
      ),
    )
    await open()
    await tick('Typed thought')
    await moveTo('i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('up to 200 notes')
    expect(screen.getByRole('checkbox', { name: /^Select note “Typed thought/ })).toBeChecked()
  })

  it('closes the move form on Cancel, and keeps what was selected', async () => {
    fake()
    await open()
    await tick('Typed thought')
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Move to')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /^Select note “Typed thought/ })).toBeChecked()
  })

  it('forgets the selection when the tag being shown changes', async () => {
    fake([note('n1', 'Tagged one', null, { tags: ['intro'] }), note('n2', 'Untagged')])
    await renderAt('/p/ada-substack/notes')
    await fireEvent.click(await screen.findByRole('checkbox', { name: /^Select note “Untagged/ }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    await openFilters()
    await fireEvent.click(screen.getByRole('button', { name: /^intro/ }))
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('says it is done even when every note has gone, rather than just showing nothing', async () => {
    fake([note('n1', 'Only one')]).setResult({ notes: 1, copied: 0 })
    await open()
    await tick('Only one')
    await moveTo('i1')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 note' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Moved 1 note to “Rivers”.')
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument()
  })
})

describe('deleting selected notes', () => {
  it('deletes the selected notes only after the dialog is confirmed, and nothing until something is selected', async () => {
    const state = fakeProfile({
      notes: [note('n1', 'One'), note('n2', 'Two'), note('n3', 'Three')],
    })
    await renderAt('/p/ada-substack/notes')
    await screen.findByText('One')
    expect(screen.queryByRole('button', { name: /^Delete \d+$/ })).toBeNull() // hidden until something is selected
    await fireEvent.click(screen.getByRole('checkbox', { name: /^Select note “One/ }))
    await fireEvent.click(screen.getByRole('checkbox', { name: /^Select note “Three/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete 2 notes?' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(state.notes).toHaveLength(3)
    await fireEvent.click(screen.getByRole('button', { name: 'Delete 2' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, delete them' }),
    )
    await waitFor(() => expect(state.notes.map((n) => n.id)).toEqual(['n2']))
    await waitFor(() => expect(screen.queryByText('One')).not.toBeInTheDocument())
    expect(screen.getByText('0 selected')).toBeInTheDocument()
  })

  it('shows a note’s own actions as icons, with Edit and a held Delete', async () => {
    fakeProfile({ notes: [note('n1', 'One')] })
    await renderAt('/p/ada-substack/notes')
    await screen.findByText('One')
    const edit = screen.getByRole('button', { name: /^Edit note “One/ })
    expect(edit).toHaveClass('btn-icon')
    expect(edit).toHaveTextContent('') // an icon, named by its label
    expect(screen.getByRole('button', { name: /^Delete note “One/ })).toHaveAttribute(
      'title',
      'Press and hold, or tap twice, to delete this note',
    )
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
    await showArrows()
    await fireEvent.click(screen.getByRole('button', { name: /Move note “Two” up/ }))
    await waitFor(() => expect(state.orders).toEqual([['n2', 'n1']]))

    const del = screen.getByRole('button', { name: /^Delete note “One”/ })
    await fireEvent.click(del)
    await fireEvent.click(del)
    await waitFor(() => expect(screen.queryByText('One')).not.toBeInTheDocument())
    expect(state.notes.map((n) => n.id)).toEqual(['n2'])
  })
})
