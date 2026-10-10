import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

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

function mockEditor(critique: () => Response) {
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
    http.post('*/api/profiles/p1/assist/critique', critique),
  )
}

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

  it('shows the critique when it works', async () => {
    mockEditor(() => HttpResponse.json({ text: 'Tighten the opening.' }))
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Critique' }))
    await screen.findByText('Tighten the opening.')
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
  start: { notes?: ReturnType<typeof note>[]; insertions?: ReturnType<typeof insertion>[] } = {},
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
    saveFails: false,
    postFails: false,
    notesFail: false,
  }
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([])),
    http.get('*/api/profiles/p1/ideas/i1', () =>
      HttpResponse.json({
        id: 'i1',
        profileId: 'p1',
        name: 'An idea',
        notes: '',
        links: [
          {
            id: 'l1',
            url: 'https://example.org/paper',
            title: 'A paper',
            readAt: null,
            origin: 'entered',
          },
        ],
        drafts: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    ),
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
    expect(notes.getByText('Added by Ada')).toBeInTheDocument()
    expect(notes.getByText('From brainstorming with Ada')).toBeInTheDocument()
    expect(notes.getByText('From reading “A paper”, by Bob')).toBeInTheDocument()
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
      '/p/p1/ideas/i1',
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
      const api = mockDrafting()
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

  describe('tags', () => {
    const tagged = () => [
      { ...note('n1', 'Erosion loops.'), tags: ['intro'] },
      { ...note('n2', 'Deposition inside the bend.'), tags: ['part 2'] },
      note('n3', 'Untagged thought.'),
      { ...note('n4', 'Already used.', { addedAt: '2026-01-02T00:00:00Z' }), tags: ['solo'] },
    ]
    const listed = () =>
      within(drawer())
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
      expect(rows[0]).toHaveTextContent('From brainstorming with Ada')
      expect(rows[0]).toHaveTextContent('Still as inserted')
      expect(rows[1]).toHaveTextContent('From reading “A paper”, by Bob')
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
