import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockHash } from '@lfwa/core'
import { NOTE_DRAG_TYPE } from '../lib/note-drag'
import { renderAt, server, signedInAs, testUser, useMockServer, expectOrigin } from '../test-utils'

useMockServer()

const draft = {
  id: 'd1',
  profileId: 'p1',
  ideaId: 'i1',
  title: 'T',
  body: 'Some text',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

/** The critique the server has kept for the draft (null: none yet), and what a new request answers. */
function mockEditor(
  critique: () => Response,
  latest: object | null = null,
  looks: { used: number; allowed: number } = { used: latest ? 1 : 0, allowed: 3 },
) {
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([])),
    http.get('*/api/profiles/p1/ideas/i1', () =>
      HttpResponse.json({
        id: 'i1',
        profileId: 'p1',
        name: 'An idea',
        notes: '',
        links: [],
        drafts: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get('*/api/profiles/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.put('*/api/profiles/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.get('*/api/profiles/p1/drafts/d1/critique', () =>
      HttpResponse.json({ round: latest, ...looks }),
    ),
    http.post('*/api/profiles/p1/assist/critique', critique),
  )
}

const round = (points: object[], extra: object = {}) => ({
  id: 'r1',
  createdAt: '2026-01-02T00:00:00Z',
  summary: 'A decent start.',
  ready: false,
  points,
  ...extra,
})
const pointOn = (id: string, over: object = {}) => ({
  id,
  block: 'b1',
  excerpt: 'Some text',
  hash: blockHash('Some text'),
  point: 'Tighten the opening.',
  reason: 'Readers skim.',
  dismissed: false,
  ...over,
})
/** What the server answers about a draft's critiques. */
const state = (r: object | null, used = 1, allowed = 3) => ({ round: r, used, allowed })
const critiqueRegion = async () => screen.findByRole('region', { name: 'Critique' })

describe('EditorView critique', () => {
  it('points users without an API key to their account settings', async () => {
    mockEditor(() =>
      HttpResponse.json(
        { error: 'Add your Anthropic API key in your account settings to use this feature' },
        { status: 409 },
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByRole('alert')
    await screen.findByText(/Add your Anthropic API key/)
    await screen.findByRole('link', { name: 'Go to account settings' })
  })

  it('shows the critique when it works, and marks the paragraph a point is about', async () => {
    mockEditor(() =>
      HttpResponse.json(
        state(
          round([
            pointOn('p1'),
            pointOn('p2', { block: 'whole', excerpt: '', hash: null, point: 'The order is odd.' }),
          ]),
        ),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByText('A decent start.')
    const points = within(await critiqueRegion()).getAllByRole('listitem')
    expect(points[0]).toHaveTextContent('Some text')
    expect(points[0]).toHaveTextContent('Tighten the opening.')
    expect(points[0]).toHaveTextContent('Readers skim.')
    expect(points[1]).toHaveTextContent('The whole piece')
    expect(points[1]).toHaveTextContent('The order is odd.')
    // Only the paragraph point is marked, in the text; the whole-piece point has no paragraph to mark.
    expect(await screen.findAllByRole('button', { name: /^Critique point/ })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Critique point 1' })).toBeTruthy()
  })

  it('shows the critique kept from last time, without asking for another', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText('A decent start.')
    await screen.findByRole('button', { name: 'Critique point 1' })
  })

  it('ties a mark in the text to its point in the list, and back', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique point 1' }))
    const item = within(await critiqueRegion()).getByRole('listitem')
    await waitFor(() => expect(item).toHaveAttribute('aria-current', 'true'))
    await waitFor(() => expect(item).toHaveFocus())
    // The mark is drawn again to show it is the one being looked at.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Critique point 1' })).toHaveAttribute(
        'aria-current',
        'true',
      ),
    )
  })

  it('keeps the marks out of the draft itself', async () => {
    const saved: unknown[] = []
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    server.use(
      http.put('*/api/profiles/p1/drafts/d1', async ({ request }) => {
        saved.push(await request.json())
        return HttpResponse.json(draft)
      }),
    )
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('button', { name: 'Critique point 1' })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toEqual([{ title: 'T', body: 'Some text' }]))
  })

  it('lists a point whose paragraph has been rewritten apart, without a mark', async () => {
    mockEditor(
      () => new Response(null, { status: 500 }),
      round([
        pointOn('p1'),
        pointOn('p2', {
          hash: blockHash('A paragraph that is not in the draft any more.'),
          excerpt: 'A paragraph that is not in the draft any more.',
          point: 'This one is gone.',
        }),
      ]),
    )
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('button', { name: 'Critique point 1' })
    const region = await critiqueRegion()
    await within(region).findByRole('heading', { name: 'This passage has changed' })
    expect(screen.queryByRole('button', { name: 'Critique point 2' })).toBeNull()
    expect(region).toHaveTextContent('This one is gone.')
  })

  it('sets a point aside, which takes its mark away, and brings it back', async () => {
    const dismissed: boolean[] = []
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]))
    server.use(
      http.put('*/api/profiles/p1/drafts/d1/critique/points/p1', async ({ request }) => {
        const { dismissed: d } = (await request.json()) as { dismissed: boolean }
        dismissed.push(d)
        return HttpResponse.json(state(round([pointOn('p1', { dismissed: d })])))
      }),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: /^Set aside/ }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Critique point 1' })).toBeNull(),
    )
    await fireEvent.click(await screen.findByText(/^Set aside \(1\)/))
    await fireEvent.click(await screen.findByRole('button', { name: /^Bring back/ }))
    await screen.findByRole('button', { name: 'Critique point 1' })
    expect(dismissed).toEqual([true, false])
  })

  it('says how many looks are used before the button is pressed, and updates it afterwards', async () => {
    mockEditor(() => HttpResponse.json(state(round([pointOn('p1')]), 1, 3)), null, {
      used: 0,
      allowed: 3,
    })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText('0 of 3 looks used')
    expect(screen.getByRole('button', { name: 'Critique' })).toBeEnabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Critique' }))
    await screen.findByText('1 of 3 looks used')
  })

  it('stops, kindly, when the looks are used up, and says what to do next', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]), {
      used: 3,
      allowed: 3,
    })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText(/You have had your 3 looks at this draft/)
    expect(screen.getByRole('button', { name: 'Critique' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'publish it' })).toHaveAttribute(
      'href',
      '/p/p1/ideas/i1/publish',
    )
    expect(screen.getByRole('link', { name: 'account settings' })).toHaveAttribute(
      'href',
      '/account',
    )
    // The critique already made is still there to work from.
    expect(await screen.findByText('A decent start.')).toBeTruthy()
  })

  it('says "look" when the limit is one', async () => {
    mockEditor(() => new Response(null, { status: 500 }), round([pointOn('p1')]), {
      used: 1,
      allowed: 1,
    })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByText(/You have had your 1 look at this draft/)
  })

  it('says so when a draft is ready, rather than finding something', async () => {
    mockEditor(() =>
      HttpResponse.json(state(round([], { summary: 'This is ready to publish.', ready: true }))),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByText('This is ready to publish.')
    expect(within(await critiqueRegion()).queryByRole('listitem')).toBeNull()
    expect(screen.getByText(/nothing important left/i)).toBeTruthy()
  })
})

// ---- pulling notes into the draft ----------------------------------------------------------------------------

const note = (
  id: string,
  text: string,
  extra: Partial<{
    origin: string
    authorName: string | null
    readingItemId: string | null
    quote: boolean
    addedAt: string | null
  }> = {},
) => ({
  id,
  text,
  origin: 'entered',
  authorId: 'u1',
  authorName: 'Ada',
  readingItemId: null,
  tags: [] as string[],
  quote: false,
  addedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
})

const insertion = (text: string, extra: object = {}) => ({
  id: `ins-${text.length}`,
  text,
  origin: 'entered',
  noteAuthorName: 'Ada',
  insertedByName: 'Ada',
  insertedAt: '2026-01-02T00:00:00Z',
  source: null,
  ...extra,
})

/** A fake of the endpoints the drafting page uses, which remembers what it was sent. */
function mockDrafting(
  start: {
    notes?: ReturnType<typeof note>[]
    insertions?: ReturnType<typeof insertion>[]
    /** When the reading-list item (l1, "A paper") was marked read; null while it isn't. */
    readAt?: string | null
  } = {},
) {
  const state = {
    notes: start.notes ?? [
      note('n1', 'Erosion loops.'),
      note('n2', 'Deposition inside the bend.', { origin: 'brainstorm' }),
      note('n3', 'A useful quote.', { origin: 'reading', readingItemId: 'l1', authorName: 'Bob' }),
      note('n4', 'Already used.', { addedAt: '2026-01-02T00:00:00Z' }),
    ],
    insertions: start.insertions ?? [],
    saved: [] as { title: string; body: string }[],
    posted: [] as unknown[],
    putBack: [] as unknown[],
    readAt: (start.readAt ?? null) as string | null,
    markedRead: [] as unknown[],
    markFails: false,
    saveFails: false,
    postFails: false,
    notesFail: false,
  }
  const ideaNow = () => ({
    id: 'i1',
    profileId: 'p1',
    name: 'An idea',
    notes: '',
    links: [
      {
        id: 'l1',
        url: 'https://example.org/paper',
        title: 'A paper',
        readAt: state.readAt,
        origin: 'entered',
      },
    ],
    drafts: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  })
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([])),
    http.get('*/api/profiles/p1/ideas/i1', () => HttpResponse.json(ideaNow())),
    http.put('*/api/profiles/p1/ideas/i1/links/l1/read', async ({ request }) => {
      const body = (await request.json()) as { read: boolean }
      if (state.markFails) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      state.markedRead.push(body)
      state.readAt = body.read ? '2026-01-04T00:00:00Z' : null
      return HttpResponse.json(ideaNow())
    }),
    http.get('*/api/profiles/p1/drafts/d1', () => HttpResponse.json(draft)),
    http.put('*/api/profiles/p1/drafts/d1', async ({ request }) => {
      const body = (await request.json()) as { title: string; body: string }
      if (state.saveFails) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      state.saved.push(body)
      return HttpResponse.json({ ...draft, ...body })
    }),
    http.get('*/api/profiles/p1/ideas/i1/notes', () =>
      state.notesFail
        ? HttpResponse.json({ error: 'boom' }, { status: 500 })
        : HttpResponse.json(state.notes),
    ),
    http.get('*/api/profiles/p1/drafts/d1/insertions', () => HttpResponse.json(state.insertions)),
    http.post('*/api/profiles/p1/drafts/d1/insertions', async ({ request }) => {
      const body = (await request.json()) as { noteId: string; text: string }
      if (state.postFails) return HttpResponse.json({ error: 'boom' }, { status: 500 })
      state.posted.push(body)
      state.notes = state.notes.map((n) =>
        n.id === body.noteId ? { ...n, addedAt: '2026-01-03T00:00:00Z' } : n,
      )
      const made = insertion(body.text)
      state.insertions = [...state.insertions, made]
      return HttpResponse.json(made, { status: 201 })
    }),
    http.put('*/api/profiles/p1/ideas/i1/notes/:noteId/added', async ({ request, params }) => {
      state.putBack.push({ id: params.noteId, ...((await request.json()) as object) })
      state.notes = state.notes.map((n) => (n.id === params.noteId ? { ...n, addedAt: null } : n))
      return HttpResponse.json(state.notes.find((n) => n.id === params.noteId))
    }),
  )
  return state
}

const drawer = () => screen.getByRole('complementary')
const text = () => document.querySelector('.ProseMirror')!.textContent

describe('the notes beside the draft', () => {
  it('lists the notes not yet used, with where each came from, and hides the ones already added', async () => {
    mockDrafting()
    await renderAt('/p/p1/drafts/d1')
    const notes = within(await screen.findByRole('complementary'))
    await notes.findByText('Erosion loops.')
    expect(notes.getByText('Added')).toBeInTheDocument()
    expect(notes.getByText('From brainstorming')).toBeInTheDocument()
    expect(notes.getByText('From reading “A paper”')).toBeInTheDocument()
    expect(notes.getAllByText('Bob')[0]).toHaveClass('rounded-full') // the person, as a chip, not "by Bob"
    expect(notes.queryByText('Already used.')).toBeNull()
  })

  it('shows the added ones too when asked, and puts one back', async () => {
    const api = mockDrafting()
    await renderAt('/p/p1/drafts/d1')
    const notes = within(await screen.findByRole('complementary'))
    await fireEvent.click(await notes.findByLabelText('Show notes already added (1)'))
    expect(notes.getByText('Already used.')).toBeInTheDocument()

    await fireEvent.click(notes.getByRole('button', { name: /^Put note “Already used\.” back/ }))
    await waitFor(() => expect(api.putBack).toEqual([{ id: 'n4', added: false }]))
    // Now it can be added again, so it is listed with the others.
    expect(
      await notes.findByRole('button', { name: /^Add note “Already used\.”/ }),
    ).toBeInTheDocument()
  })

  it('says so when there are no notes, and when every note is in a draft', async () => {
    mockDrafting({ notes: [] })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText(/No notes yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add some on the idea page.' })).toHaveAttribute(
      'href',
      '/p/p1/ideas/i1/notes',
    )
  })

  it('says all notes are used when they all are', async () => {
    mockDrafting({ notes: [note('n1', 'Done.', { addedAt: '2026-01-02T00:00:00Z' })] })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText('All your notes are in a draft.')).toBeInTheDocument()
  })

  it('explains when the notes cannot be loaded, and tries again', async () => {
    const api = mockDrafting()
    api.notesFail = true
    await renderAt('/p/p1/drafts/d1')
    expect(
      await within(await screen.findByRole('complementary')).findByRole('alert'),
    ).toHaveTextContent("couldn't load the notes")
    api.notesFail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Erosion loops.')).toBeInTheDocument()
  })

  describe('adding a note to the draft', () => {
    it('puts its words after the first paragraph, saves the draft, then marks the note as added', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )

      await waitFor(() => expect(api.posted).toEqual([{ noteId: 'n1', text: 'Erosion loops.' }]))
      expect(text()).toContain('Some text')
      expect(text()).toContain('Erosion loops.')
      expect(text()!.indexOf('Some text')).toBeLessThan(text()!.indexOf('Erosion loops.'))
      // The draft was saved with the words in it before the note was marked added.
      expect(api.saved.at(-1)!.body).toContain('Erosion loops.')
      await waitFor(() => expect(within(drawer()).queryByText('Erosion loops.')).toBeNull()) // gone from the list
    })

    it('adds a link to the reading-list item a note came from', async () => {
      const api = mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “A useful quote\.” to the draft/ }),
      )
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(api.posted[0]).toEqual({
        noteId: 'n3',
        text: 'A useful quote. ([A paper](https://example.org/paper))',
      })
      const link = document.querySelector('.ProseMirror a')!
      expect(link).toHaveAttribute('href', 'https://example.org/paper')
      expect(link).toHaveTextContent('A paper')
    })

    it('puts a quotation in as a blockquote with its source inside it', async () => {
      const api = mockDrafting({
        notes: [
          note('n1', 'Meanders grow.\nBends move.', {
            origin: 'reading',
            readingItemId: 'l1',
            quote: true,
          }),
        ],
      })
      await renderAt('/p/p1/drafts/d1')
      expect(await screen.findByText('Quoted from “A paper”')).toBeInTheDocument()
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Meanders grow\.” to the draft/ }),
      )
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(api.posted[0]).toEqual({
        noteId: 'n1',
        text: '> Meanders grow.\n> Bends move.\n>\n> — [A paper](https://example.org/paper)',
      })
      const quoted = document.querySelector('.ProseMirror blockquote')!
      expect(quoted).toHaveTextContent('Meanders grow.')
      expect(quoted.querySelector('a')).toHaveAttribute('href', 'https://example.org/paper')
      expect(api.saved.at(-1)!.body).toMatch(/^> /m)
    })

    it('does not mark the note as added if the draft could not be saved, and says so', async () => {
      const api = mockDrafting()
      api.saveFails = true
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't save the draft",
      )
      expect(api.posted).toEqual([])
      expect(
        within(drawer()).getByRole('button', { name: /^Add note “Erosion loops\.”/ }),
      ).toBeEnabled()
    })

    it('says so if the note could not be marked as added after the draft was saved', async () => {
      const api = mockDrafting()
      api.postFails = true
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't mark the note as added",
      )
      expect(api.saved.at(-1)!.body).toContain('Erosion loops.')
    })
  })

  describe('dragging a note into the draft', () => {
    /** What the browser hands the handlers: the types being dragged, and the data under each. */
    const carrying = (type: string, data: string) => ({
      dataTransfer: {
        types: [type],
        getData: (t: string) => (t === type ? data : ''),
        setData: vi.fn(),
        setDragImage: vi.fn(),
        effectAllowed: '',
        dropEffect: '',
      },
    })
    const editorEl = () => document.querySelector('.ProseMirror')!
    const grip = async (start: RegExp) =>
      (await screen.findByText(start)).closest('li')!.querySelector('[data-testid="note-grip"]')!

    afterEach(() => vi.restoreAllMocks())

    it('picks a note up by its grip, carrying only its id', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      const drag = carrying(NOTE_DRAG_TYPE, '')
      await fireEvent.dragStart(await grip(/^Erosion loops\./), drag)
      expect(drag.dataTransfer.setData).toHaveBeenCalledWith(NOTE_DRAG_TYPE, 'n1')
      expect(drag.dataTransfer.effectAllowed).toBe('copy')
      expect(drag.dataTransfer.setDragImage).toHaveBeenCalled()
    })

    it('puts a dropped note in the draft as the button would: saved, recorded, and set aside', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))

      await waitFor(() => expect(api.posted).toEqual([{ noteId: 'n1', text: 'Erosion loops.' }]))
      expect(document.querySelector('.ProseMirror')!.textContent).toContain('Erosion loops.')
      expect(api.saved.at(-1)!.body).toContain('Erosion loops.')
      await waitFor(() => expect(within(drawer()).queryByText('Erosion loops.')).toBeNull()) // set aside
    })

    it('keeps the source link with a note taken from a source, as the button does', async () => {
      const api = mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('A useful quote.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n3'))
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(api.posted[0]).toEqual({
        noteId: 'n3',
        text: 'A useful quote. ([A paper](https://example.org/paper))',
      })
      expect(document.querySelector('.ProseMirror a')).toHaveAttribute(
        'href',
        'https://example.org/paper',
      )
    })

    it('ignores anything else dropped on the draft (a file, some text)', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying('Files', ''))
      await fireEvent.drop(editorEl(), carrying('text/plain', 'n1'))
      await new Promise((r) => setTimeout(r, 50))
      expect(api.posted).toEqual([])
      expect(api.saved).toEqual([])
    })

    it('says so when the note is already in a draft, or cannot be found, and adds nothing', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n4')) // already used
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent('already in a draft')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'gone'))
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't find that note",
      )
      expect(api.posted).toEqual([])
    })

    it('shows why when the draft could not be saved, and does not set the note aside', async () => {
      const api = mockDrafting()
      api.saveFails = true
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))
      expect(await within(drawer()).findByRole('alert')).toHaveTextContent(
        "couldn't save the draft",
      )
      expect(api.posted).toEqual([])
    })

    it('does not let two drops overlap', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))
      await fireEvent.drop(editorEl(), carrying(NOTE_DRAG_TYPE, 'n1'))
      await waitFor(() => expect(api.posted).toHaveLength(1))
      await new Promise((r) => setTimeout(r, 50))
      expect(api.posted).toHaveLength(1)
    })
  })

  describe('citing something from the reading list', () => {
    const insertLink = async () =>
      fireEvent.click(
        await within(await screen.findByRole('complementary')).findByRole('button', {
          name: 'Insert a link to A paper',
        }),
      )
    const dialog = () => screen.findByRole('dialog', { name: "You haven't marked this as read" })

    afterEach(() => vi.restoreAllMocks())

    it('lists the items, saying which are read', async () => {
      mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      const list = within(await screen.findByRole('region', { name: 'Reading list' }))
      expect(await list.findByText('A paper')).toBeInTheDocument()
      expect(list.getByText('Read')).toBeInTheDocument()
    })

    it('says so when there is nothing on the reading list', async () => {
      mockDrafting()
      server.use(
        http.get('*/api/profiles/p1/ideas/i1', () =>
          HttpResponse.json({
            id: 'i1',
            profileId: 'p1',
            name: 'An idea',
            notes: '',
            links: [],
            drafts: [],
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          }),
        ),
      )
      await renderAt('/p/p1/drafts/d1')
      expect(await screen.findByText('Nothing on the reading list yet.')).toBeInTheDocument()
    })

    it('puts a link to a read item in the line being written, and saves the draft, without asking', async () => {
      const api = mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      await renderAt('/p/p1/drafts/d1')
      await insertLink()
      await waitFor(() => expect(api.saved).toHaveLength(1))
      expect(api.saved[0]!.body).toContain('[A paper](https://example.org/paper)')
      expect(screen.queryByRole('dialog')).toBeNull()
      const link = document.querySelector('.ProseMirror a')!
      expect(link).toHaveAttribute('href', 'https://example.org/paper')
      expect(document.querySelectorAll('.ProseMirror p')).toHaveLength(1) // in the line, not a new paragraph
    })

    it('makes the link something that can be opened: Ctrl or Cmd and click opens it, a plain click only edits', async () => {
      mockDrafting({ readAt: '2026-01-02T00:00:00Z' })
      const open = vi.spyOn(window, 'open').mockImplementation(() => null)
      await renderAt('/p/p1/drafts/d1')
      await insertLink()
      const link = await waitFor(() => {
        const a = document.querySelector('.ProseMirror a')
        if (!a) throw new Error('no link yet')
        return a
      })
      expect(screen.getByText('Ctrl or ⌘ and click a link to open it.')).toBeInTheDocument()

      await fireEvent.click(link)
      expect(open).not.toHaveBeenCalled()
      await fireEvent.click(link, { ctrlKey: true })
      expect(open).toHaveBeenCalledWith('https://example.org/paper', '_blank', 'noopener')
      await fireEvent.click(link, { metaKey: true })
      expect(open).toHaveBeenCalledTimes(2)
    })

    describe('when it is not marked read', () => {
      it('asks first, with the safe choice focused, and offers to read it, mark it read, or cancel', async () => {
        const api = mockDrafting()
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        const box = await dialog()
        expect(box).toHaveTextContent('“A paper” is on your reading list')
        const cancel = within(box).getByRole('button', { name: 'Cancel' })
        await waitFor(() => expect(cancel).toHaveFocus())
        expect(within(box).getByRole('button', { name: 'Read it now' })).toBeInTheDocument()
        expect(within(box).getByRole('button', { name: 'Mark as read' })).toBeInTheDocument()
        expect(api.saved).toEqual([]) // nothing yet
      })

      it('inserts nothing, and marks nothing, when cancelled (also with Escape)', async () => {
        const api = mockDrafting()
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

        await insertLink()
        await dialog()
        await fireEvent.keyDown(document, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

        expect(document.querySelector('.ProseMirror a')).toBeNull()
        expect(api.markedRead).toEqual([])
        expect(api.saved).toEqual([])
      })

      it('marks it as read, then inserts the link', async () => {
        const api = mockDrafting()
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Mark as read' }))

        await waitFor(() => expect(api.saved).toHaveLength(1))
        expect(api.markedRead).toEqual([{ read: true }])
        expect(api.saved[0]!.body).toContain('[A paper](https://example.org/paper)')
        expect(screen.queryByRole('dialog')).toBeNull()
        const list = within(screen.getByRole('region', { name: 'Reading list' }))
        expect(await list.findByText('Read')).toBeInTheDocument() // the list now shows it as read
      })

      it('opens it in a new tab on "Read it now", inserting nothing and keeping the draft as it is', async () => {
        const api = mockDrafting()
        const open = vi.spyOn(window, 'open').mockImplementation(() => null)
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Read it now' }))

        await waitFor(() =>
          expect(open).toHaveBeenCalledWith('/p/p1/ideas/i1/reading/l1', '_blank', 'noopener'),
        )
        expect(await screen.findByText(/Opened “A paper” in a new tab/)).toBeInTheDocument()
        expect(api.markedRead).toEqual([])
        expect(api.saved).toEqual([])
        expect(document.querySelector('.ProseMirror a')).toBeNull()
        expect(screen.getByText('Not marked as read')).toBeInTheDocument()
      })

      it('says so if it could not be marked as read, and inserts nothing', async () => {
        const api = mockDrafting()
        api.markFails = true
        await renderAt('/p/p1/drafts/d1')
        await insertLink()
        await fireEvent.click(within(await dialog()).getByRole('button', { name: 'Mark as read' }))
        const alert = await within(screen.getByRole('region', { name: 'Reading list' })).findByRole(
          'alert',
        )
        expect(alert).toHaveTextContent("couldn't mark it as read")
        expect(api.saved).toEqual([])
        expect(document.querySelector('.ProseMirror a')).toBeNull()
      })
    })

    it('does not ask for a note taken from the item, even if the item is not ticked: taking the note was the reading', async () => {
      const api = mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await fireEvent.click(
        await screen.findByRole('button', { name: /^Add note “A useful quote\.” to the draft/ }),
      )
      await waitFor(() => expect(api.posted).toHaveLength(1))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(api.markedRead).toEqual([])
    })
  })

  describe('tags', () => {
    const tagged = () => [
      { ...note('n1', 'Erosion loops.'), tags: ['intro'] },
      { ...note('n2', 'Deposition inside the bend.'), tags: ['part 2'] },
      note('n3', 'Untagged thought.'),
      { ...note('n4', 'Already used.', { addedAt: '2026-01-02T00:00:00Z' }), tags: ['solo'] },
    ]
    const listed = () =>
      within(screen.getByRole('list', { name: 'Notes to add' }))
        .getAllByRole('listitem')
        .filter((li) => li.querySelector('p'))
        .map((li) => li.querySelector('p')!.textContent)

    it('are shown on the notes, and can narrow the list to one tag, for adding what belongs in this part', async () => {
      mockDrafting({ notes: tagged() })
      await renderAt('/p/p1/drafts/d1')
      const notes = within(await screen.findByRole('complementary'))
      await notes.findByText('Erosion loops.')
      const filter = notes.getByRole('group', { name: 'Show notes with a tag' })
      // Only tags on notes that can still be added are offered; "solo" is only on an added note.
      expect(
        within(filter)
          .getAllByRole('button')
          .map((b) => b.textContent?.trim()),
      ).toEqual(['All', 'intro', 'part 2'])
      await fireEvent.click(within(filter).getByRole('button', { name: 'part 2' }))
      expect(listed()).toEqual(['Deposition inside the bend.'])
      await fireEvent.click(within(filter).getByRole('button', { name: 'All' }))
      expect(listed()).toEqual([
        'Erosion loops.',
        'Deposition inside the bend.',
        'Untagged thought.',
      ])
    })

    it('say so when nothing is left with the tag once its notes are in the draft', async () => {
      mockDrafting({ notes: tagged() })
      await renderAt('/p/p1/drafts/d1')
      const notes = within(await screen.findByRole('complementary'))
      await fireEvent.click(await notes.findByRole('button', { name: 'intro' }))
      await fireEvent.click(
        notes.getByRole('button', { name: /^Add note “Erosion loops\.” to the draft/ }),
      )
      // The tag is no longer on anything that can be added, so the filter goes back to everything.
      await waitFor(() => expect(listed()).toContain('Untagged thought.'))
      expect(notes.queryByRole('button', { name: 'intro' })).toBeNull()
    })
  })

  describe('where the words came from', () => {
    it('lists what was pulled in, with its origin, and whether it is still as inserted', async () => {
      mockDrafting({
        insertions: [
          insertion('Some text', { origin: 'brainstorm' }),
          insertion('Words that were rewritten since.', {
            origin: 'reading',
            noteAuthorName: 'Bob',
            source: { title: 'A paper', url: 'https://example.org/paper' },
          }),
        ],
      })
      await renderAt('/p/p1/drafts/d1')
      const summary = (await screen.findByText('Where some of the words came from (2)')).closest(
        'details',
      )!
      const rows = within(summary).getAllByRole('listitem')
      expectOrigin(rows[0]!, 'From brainstorming', 'Ada')
      expect(rows[0]).toHaveTextContent('Still as inserted')
      expectOrigin(rows[1]!, 'From reading “A paper”', 'Bob')
      expect(rows[1]).toHaveTextContent('Edited or removed since')
    })

    it('is not shown when nothing has been pulled in', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      await screen.findByText('Erosion loops.')
      expect(screen.queryByText(/Where some of the words came from/)).toBeNull()
    })
  })

  describe('on a phone', () => {
    it('slides in from a Notes button, and closes with its own button or Escape, returning focus', async () => {
      mockDrafting()
      await renderAt('/p/p1/drafts/d1')
      const open = await screen.findByRole('button', { name: 'Notes' })
      expect(open).toHaveAttribute('aria-expanded', 'false')
      expect(open).toHaveAttribute('aria-controls', 'draft-notes')

      await fireEvent.click(open)
      expect(open).toHaveAttribute('aria-expanded', 'true')
      const close = screen.getByRole('button', { name: 'Close notes' })
      await waitFor(() => expect(close).toHaveFocus())
      expect(drawer()).not.toHaveClass('max-lg:invisible')

      await fireEvent.click(close)
      expect(open).toHaveAttribute('aria-expanded', 'false')
      expect(drawer()).toHaveClass('max-lg:invisible') // not reachable by keyboard or screen reader while shut
      await waitFor(() => expect(open).toHaveFocus())

      await fireEvent.click(open)
      await fireEvent.keyDown(screen.getByRole('button', { name: 'Close notes' }), {
        key: 'Escape',
      })
      expect(open).toHaveAttribute('aria-expanded', 'false')
    })
  })
})
