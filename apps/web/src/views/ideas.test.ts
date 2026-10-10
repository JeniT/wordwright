import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer, expectOrigin } from '../test-utils'

useMockServer()

const profile = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'owner' }],
}
const listProfiles = http.get('*/api/profiles', () => HttpResponse.json([profile]))

const idea = {
  id: 'i1',
  profileId: 'ada-substack',
  name: 'Why rivers meander',
  notes: 'Erosion loops.',
  links: [
    {
      id: 'l1',
      url: 'https://example.org/paper',
      title: 'A paper',
      readAt: null as string | null,
      origin: 'entered',
    },
  ],
  drafts: [{ id: 'd1', title: 'Part 1', updatedAt: '2026-01-02T00:00:00Z' }],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const ideaUrl = '*/api/profiles/ada-substack/ideas/i1'

describe('ideas on the profile page', () => {
  it('lists them with their draft counts and links to each', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get('*/api/profiles/ada-substack/ideas', () =>
        HttpResponse.json([
          {
            id: 'i1',
            name: 'Why rivers meander',
            draftCount: 2,
            updatedAt: '2026-01-02T00:00:00Z',
          },
          { id: 'i2', name: 'Tides', draftCount: 1, updatedAt: '2026-01-01T00:00:00Z' },
        ]),
      ),
    )
    await renderAt('/p/ada-substack')
    const link = await screen.findByRole('link', { name: /Why rivers meander/ })
    expect(link).toHaveAttribute('href', '/p/ada-substack/ideas/i1')
    expect(link).toHaveTextContent('2 drafts')
    expect(screen.getByRole('link', { name: /Tides/ })).toHaveTextContent('1 draft')
    expect(screen.getByRole('link', { name: 'New idea' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/new',
    )
  })

  it('has an empty state', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack')
    await screen.findByText(/No ideas yet/)
  })

  it('says what to do when they cannot be loaded', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get('*/api/profiles/ada-substack/ideas', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )
    await renderAt('/p/ada-substack')
    expect(await screen.findByText(/Couldn't load ideas/)).toBeInTheDocument()
  })
})

describe('new idea page', () => {
  it('asks for the core idea and notes, then opens the new idea', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.post('*/api/profiles/ada-substack/ideas', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(idea, { status: 201 })
      }),
      http.get(ideaUrl, () => HttpResponse.json(idea)),
      http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json([])),
    )
    const { router } = await renderAt('/p/ada-substack/ideas/new')
    await fireEvent.update(
      await screen.findByLabelText("What's your core idea?"),
      'Why rivers meander',
    )
    await fireEvent.update(screen.getByLabelText('Expand on your idea here'), 'Erosion loops.')
    await fireEvent.click(screen.getByRole('button', { name: 'Save idea' }))

    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-substack/ideas/i1'))
    expect(sent).toEqual({ name: 'Why rivers meander', notes: 'Erosion loops.' })
  })

  it("shows the server's explanation and keeps what was typed", async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.post('*/api/profiles/ada-substack/ideas', () =>
        HttpResponse.json({ error: 'Describe your idea in a few words' }, { status: 400 }),
      ),
    )
    await renderAt('/p/ada-substack/ideas/new')
    await fireEvent.update(await screen.findByLabelText("What's your core idea?"), 'x')
    await fireEvent.click(screen.getByRole('button', { name: 'Save idea' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Describe your idea')
    expect(screen.getByLabelText("What's your core idea?")).toHaveValue('x')
  })
})

describe('idea page', () => {
  const open = (extra: Parameters<typeof server.use> = []) => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get(ideaUrl, () => HttpResponse.json(idea)),
      http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json([])),
      ...extra,
    )
    return renderAt('/p/ada-substack/ideas/i1')
  }

  it('shows the idea, its links and its drafts in order', async () => {
    await open()
    expect(await screen.findByLabelText("What's your core idea?")).toHaveValue('Why rivers meander')
    const link = screen.getByRole('link', { name: /A paper/ })
    expect(link).toHaveAttribute('href', 'https://example.org/paper')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: /Part 1/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/drafts/d1',
    )
  })

  describe('the Brainstorm link', () => {
    const conversationUrl = '*/api/profiles/ada-substack/ideas/i1/conversation'
    const withConversation = (messages: unknown[]) =>
      http.get(conversationUrl, () => HttpResponse.json({ messages, replyingNow: null }))

    it('begins a conversation straight away when there is none yet', async () => {
      await open([withConversation([])])
      const link = await screen.findByRole('link', { name: 'Brainstorm' })
      await waitFor(() =>
        expect(link).toHaveAttribute('href', '/p/ada-substack/ideas/i1/brainstorm?start=1'),
      )
    })

    it('goes back to the existing conversation, without restarting it', async () => {
      await open([
        withConversation([
          {
            id: 'm1',
            role: 'user',
            kind: 'kickoff',
            text: '',
            authorName: 'Ada',
            model: null,
            status: 'complete',
            stopReason: null,
            proposals: [],
            notes: [],
            createdAt: '2026-01-01T00:00:00Z',
          },
        ]),
      ])
      const link = await screen.findByRole('link', { name: 'Continue brainstorming' })
      expect(link).toHaveAttribute('href', '/p/ada-substack/ideas/i1/brainstorm')
    })

    it('does not start anything while it is still unknown whether there is a conversation', async () => {
      await open([
        http.get(conversationUrl, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      ])
      const link = await screen.findByRole('link', { name: 'Brainstorm' })
      expect(link).toHaveAttribute('href', '/p/ada-substack/ideas/i1/brainstorm')
    })
  })

  it('explains when the idea cannot be opened', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get(ideaUrl, () => HttpResponse.json({ error: 'Not found' }, { status: 404 })),
    )
    await renderAt('/p/ada-substack/ideas/i1')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't open that idea")
  })

  it('saves a change to the name', async () => {
    let sent: unknown
    await open([
      http.patch(ideaUrl, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...idea, name: 'Meanders' })
      }),
    ])
    await fireEvent.update(await screen.findByLabelText("What's your core idea?"), 'Meanders')
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))
    expect(sent).toEqual({ name: 'Meanders' }) // the notes have their own routes
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Meanders')
  })

  it('shows why a save failed', async () => {
    await open([
      http.patch(ideaUrl, () =>
        HttpResponse.json({ error: 'Describe your idea in a few words' }, { status: 400 }),
      ),
    ])
    await fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Describe your idea')
  })

  it('shows a link by its title, with the address beneath, and by its address when it has no title', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get(ideaUrl, () =>
        HttpResponse.json({
          ...idea,
          links: [
            ...idea.links,
            {
              id: 'l2',
              url: 'https://example.org/untitled',
              title: '',
              readAt: null,
              origin: 'entered',
            },
          ],
        }),
      ),
    )
    await renderAt('/p/ada-substack/ideas/i1')
    const titled = await screen.findByRole('link', { name: /A paper/ })
    expect(titled).toHaveTextContent('https://example.org/paper')
    const untitled = screen.getByRole('link', { name: /example\.org\/untitled/ })
    expect(untitled).toHaveAttribute('href', 'https://example.org/untitled')
    expect(untitled.textContent).toContain('https://example.org/untitled')
  })

  describe('the reading list', () => {
    it('is headed Reading list, and says to tick off what has been read', async () => {
      await open()
      const section = (await screen.findByRole('heading', { name: 'Reading list' })).closest(
        'section',
      )!
      expect(within(section).getByText(/Tick each one off/)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Related work' })).toBeNull()
    })

    it('shows which items are read, and where an item that was not added by hand came from', async () => {
      server.use(
        signedInAs(testUser),
        listProfiles,
        http.get(ideaUrl, () =>
          HttpResponse.json({
            ...idea,
            links: [
              {
                id: 'l1',
                url: 'https://example.org/a',
                title: 'Read one',
                readAt: '2026-01-03T00:00:00Z',
                origin: 'entered',
              },
              {
                id: 'l2',
                url: 'https://example.org/b',
                title: 'Unread one',
                readAt: null,
                origin: 'brainstorm',
              },
              {
                id: 'l3',
                url: 'https://example.org/c',
                title: 'Found one',
                readAt: null,
                origin: 'research',
              },
            ],
          }),
        ),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByRole('checkbox', { name: 'Read: Read one' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Read: Unread one' })).not.toBeChecked()
      expect(screen.getByText('Suggested in brainstorming')).toBeInTheDocument()
      expect(screen.getByText('Found by research')).toBeInTheDocument()
      expect(screen.queryByText('From idea generation')).toBeNull() // and nothing for those added by hand
    })

    it('marks an item read, then unread, saving each', async () => {
      const sent: unknown[] = []
      let current = idea
      await open([
        http.put(`${ideaUrl}/links/l1/read`, async ({ request }) => {
          const body = (await request.json()) as { read: boolean }
          sent.push(body)
          current = {
            ...idea,
            links: [{ ...idea.links[0]!, readAt: body.read ? '2026-01-03T00:00:00Z' : null }],
          }
          return HttpResponse.json(current)
        }),
      ])
      const box = await screen.findByRole('checkbox', { name: 'Read: A paper' })
      expect(box).not.toBeChecked()
      await fireEvent.click(box)
      await waitFor(() => expect(sent).toEqual([{ read: true }]))
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'Read: A paper' })).toBeChecked(),
      )
      await fireEvent.click(screen.getByRole('checkbox', { name: 'Read: A paper' }))
      await waitFor(() => expect(sent).toEqual([{ read: true }, { read: false }]))
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'Read: A paper' })).not.toBeChecked(),
      )
    })

    it('says so when it could not be saved, and leaves the item as it was', async () => {
      await open([
        http.put(`${ideaUrl}/links/l1/read`, () =>
          HttpResponse.json({ error: 'boom' }, { status: 500 }),
        ),
      ])
      await fireEvent.click(await screen.findByRole('checkbox', { name: 'Read: A paper' }))
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that")
      expect(screen.getByRole('checkbox', { name: 'Read: A paper' })).not.toBeChecked()
    })
  })

  describe('adding a link', () => {
    it('sends just the address, then shows the link and clears the field, keeping an unsaved note', async () => {
      let sent: unknown
      const added = {
        ...idea,
        links: [
          ...idea.links,
          {
            id: 'l2',
            url: 'https://example.org/new',
            title: 'Fetched title',
            readAt: null,
            origin: 'entered',
          },
        ],
      }
      await open([
        http.post(`${ideaUrl}/links`, async ({ request }) => {
          sent = await request.json()
          return HttpResponse.json(added, { status: 201 })
        }),
      ])
      expect(screen.queryByLabelText(/Title/)).toBeNull() // adding a link doesn't ask for a title
      await fireEvent.update(await screen.findByLabelText('Add a note'), 'Unsaved')
      await fireEvent.update(screen.getByLabelText('Web address'), 'example.org/new')
      await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))

      await waitFor(() => expect(screen.getByLabelText('Web address')).toHaveValue(''))
      expect(sent).toEqual({ url: 'example.org/new' })
      expect(await screen.findByRole('link', { name: /Fetched title/ })).toBeInTheDocument()
      expect(screen.getByLabelText('Add a note')).toHaveValue('Unsaved')
    })

    it.each([
      [400, 'Enter a web address, like https://example.com'],
      [409, 'That link is already in this idea.'],
      [400, "We couldn't find a website at that address. Check it for typos."],
    ])(
      'shows why (%i) under the field, in red, and keeps what was typed',
      async (status, message) => {
        await open([
          http.post(`${ideaUrl}/links`, () => HttpResponse.json({ error: message }, { status })),
        ])
        const field = await screen.findByLabelText('Web address')
        await fireEvent.update(field, 'example.org/paper')
        await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))

        const hint = await screen.findByText(message)
        expect(hint).toHaveClass('text-red-700')
        expect(field).toHaveAttribute('aria-invalid', 'true')
        expect(field).toHaveAccessibleDescription(message)
        expect(field).toHaveValue('example.org/paper')
      },
    )

    it('clears the error once the person starts correcting the address', async () => {
      await open([
        http.post(`${ideaUrl}/links`, () =>
          HttpResponse.json({ error: 'That link is already in this idea.' }, { status: 409 }),
        ),
      ])
      const field = await screen.findByLabelText('Web address')
      await fireEvent.update(field, 'example.org/paper')
      await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
      await screen.findByText('That link is already in this idea.')
      await fireEvent.update(field, 'example.org/paper2')
      expect(screen.queryByText('That link is already in this idea.')).toBeNull()
      expect(field).not.toHaveAttribute('aria-invalid')
    })
  })

  describe('editing a link', () => {
    const edit = async () => {
      await fireEvent.click(await screen.findByRole('button', { name: 'Edit link to A paper' }))
      return {
        address: screen.getByLabelText('Web address of this link'),
        title: screen.getByLabelText('Title of this link (optional)'),
      }
    }

    it('opens a form with the current address and title, and puts focus in it', async () => {
      await open()
      const { address, title } = await edit()
      expect(address).toHaveValue('https://example.org/paper')
      expect(title).toHaveValue('A paper')
      await waitFor(() => expect(address).toHaveFocus())
      expect(title).toHaveAccessibleDescription(/blank to look the title up again/)
    })

    it('saves a new address and title, and updates the list', async () => {
      let sent: unknown
      await open([
        http.patch(`${ideaUrl}/links/l1`, async ({ request }) => {
          sent = await request.json()
          return HttpResponse.json({
            ...idea,
            links: [
              {
                id: 'l1',
                url: 'https://example.org/better',
                title: 'Better title',
                readAt: null,
                origin: 'entered',
              },
            ],
          })
        }),
      ])
      const { address, title } = await edit()
      await fireEvent.update(address, 'example.org/better')
      await fireEvent.update(title, 'Better title')
      await fireEvent.click(screen.getByRole('button', { name: 'Save link' }))

      expect(await screen.findByRole('link', { name: /Better title/ })).toHaveAttribute(
        'href',
        'https://example.org/better',
      )
      expect(sent).toEqual({ url: 'example.org/better', title: 'Better title' })
      // Back to reading the list, with focus returned to the Edit button.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Edit link to Better title' })).toHaveFocus(),
      )
    })

    it('shows a refusal under the address field and stays open for another try', async () => {
      await open([
        http.patch(`${ideaUrl}/links/l1`, () =>
          HttpResponse.json({ error: 'That link is already in this idea.' }, { status: 409 }),
        ),
      ])
      const { address } = await edit()
      await fireEvent.update(address, 'example.org/other')
      await fireEvent.click(screen.getByRole('button', { name: 'Save link' }))
      const hint = await screen.findByText('That link is already in this idea.')
      expect(hint).toHaveClass('text-red-700')
      expect(address).toHaveValue('example.org/other')
    })

    it('cancels without saving, with the Escape key too', async () => {
      let saved = false
      await open([
        http.patch(`${ideaUrl}/links/l1`, () => {
          saved = true
          return HttpResponse.json(idea)
        }),
      ])
      const { address } = await edit()
      await fireEvent.update(address, 'example.org/changed')
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.queryByLabelText('Web address of this link')).toBeNull()
      expect(screen.getByRole('link', { name: /A paper/ })).toHaveAttribute(
        'href',
        'https://example.org/paper',
      )

      await fireEvent.click(screen.getByRole('button', { name: 'Edit link to A paper' }))
      await fireEvent.keyDown(screen.getByLabelText('Web address of this link'), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Save link' })).toBeNull())
      expect(saved).toBe(false)
    })
  })

  it('removes a link', async () => {
    let removed = false
    await open([
      http.delete(`${ideaUrl}/links/l1`, () => {
        removed = true
        return new HttpResponse(null, { status: 204 })
      }),
    ])
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove link to A paper' }))
    await waitFor(() => expect(removed).toBe(true))
  })

  it('adds a draft and opens it', async () => {
    let sent: unknown
    await open([
      http.post(`${ideaUrl}/drafts`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          {
            id: 'd2',
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
      http.get('*/api/profiles/ada-substack/drafts/d2', () =>
        HttpResponse.json({
          id: 'd2',
          profileId: 'ada-substack',
          ideaId: 'i1',
          title: 'Untitled',
          body: '',
          createdAt: '2026-01-03T00:00:00Z',
          updatedAt: '2026-01-03T00:00:00Z',
        }),
      ),
    ])
    await fireEvent.click(await screen.findByRole('button', { name: 'Add a draft' }))
    // The new draft opens in the editor, which links back to the idea.
    expect(
      await screen.findByRole('link', { name: /Back to “Why rivers meander”/ }),
    ).toHaveAttribute('href', '/p/ada-substack/ideas/i1')
    expect(sent).toEqual({ title: 'Untitled' })
  })

  describe('notes', () => {
    const notesUrl = `${ideaUrl}/notes`
    const note = (
      id: string,
      text: string,
      origin = 'entered',
      authorName: string | null = 'Ada',
    ) => ({
      id,
      text,
      origin,
      authorId: authorName ? 'u1' : null,
      authorName,
      readingItemId: null as string | null,
      tags: [] as string[],
      quote: false,
      addedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    const three = [
      note('n1', 'Erosion loops.'),
      note('n2', 'Deposition inside the bend.\nSecond line.', 'brainstorm'),
      note('n3', 'A quote from the paper.', 'reading', 'Bob'),
    ]
    const region = () => screen.getByRole('region', { name: 'Notes' })
    const texts = () =>
      within(region())
        .getAllByRole('listitem')
        .filter((li) => li.querySelector('p')) // the notes, not their tags
        .map((li) => li.querySelector('p')?.textContent)

    /** A notes list that behaves like the server's, and records what was asked of it. */
    function fakeNotes(start = three) {
      const state = {
        notes: start,
        orders: [] as string[][],
        sent: [] as unknown[],
        tagged: [] as { id: string; tags: string[] }[],
        merged: [] as string[][],
        split: [] as { id: string; before: string; after: string }[],
      }
      server.use(
        http.get(notesUrl, () => HttpResponse.json(state.notes)),
        http.post(notesUrl, async ({ request }) => {
          const body = (await request.json()) as { text: string }
          state.sent.push(body)
          const created = note(`n${state.notes.length + 1}`, body.text.trim())
          state.notes = [...state.notes, created]
          return HttpResponse.json(created, { status: 201 })
        }),
        http.patch(`${notesUrl}/:noteId`, async ({ request, params }) => {
          const body = (await request.json()) as { text: string }
          state.sent.push(body)
          state.notes = state.notes.map((n) =>
            n.id === params.noteId ? { ...n, text: body.text } : n,
          )
          return HttpResponse.json(state.notes.find((n) => n.id === params.noteId))
        }),
        http.delete(`${notesUrl}/:noteId`, ({ params }) => {
          state.notes = state.notes.filter((n) => n.id !== params.noteId)
          return new HttpResponse(null, { status: 204 })
        }),
        http.post(`${notesUrl}/merge`, async ({ request }) => {
          const { ids } = (await request.json()) as { ids: string[] }
          state.merged.push(ids)
          const chosen = state.notes.filter((n) => ids.includes(n.id))
          state.notes = state.notes
            .filter((n) => n.id === chosen[0]!.id || !ids.includes(n.id))
            .map((n) =>
              n.id === chosen[0]!.id ? { ...n, text: chosen.map((c) => c.text).join('\n\n') } : n,
            )
          return HttpResponse.json(state.notes)
        }),
        http.post(`${notesUrl}/:noteId/split`, async ({ request, params }) => {
          const { before, after } = (await request.json()) as { before: string; after: string }
          state.split.push({ id: params.noteId as string, before, after })
          const at = state.notes.findIndex((n) => n.id === params.noteId)
          const original = state.notes[at]!
          state.notes = [
            ...state.notes.slice(0, at),
            { ...original, text: before.trim() },
            { ...original, id: `${original.id}b`, text: after.trim() },
            ...state.notes.slice(at + 1),
          ]
          return HttpResponse.json(state.notes, { status: 201 })
        }),
        http.put(`${notesUrl}/:noteId/tags`, async ({ request, params }) => {
          const { tags } = (await request.json()) as { tags: string[] }
          state.tagged.push({ id: params.noteId as string, tags })
          state.notes = state.notes.map((n) => (n.id === params.noteId ? { ...n, tags } : n))
          return HttpResponse.json(state.notes.find((n) => n.id === params.noteId))
        }),
        http.put(`${notesUrl}/order`, async ({ request }) => {
          const { ids } = (await request.json()) as { ids: string[] }
          state.orders.push(ids)
          state.notes = ids.map((id) => state.notes.find((n) => n.id === id)!)
          return HttpResponse.json(state.notes)
        }),
      )
      return state
    }

    it('shows each note with where it came from, in order', async () => {
      fakeNotes()
      await open()
      await screen.findByText('Erosion loops.')
      expect(texts()).toEqual([
        'Erosion loops.',
        'Deposition inside the bend.\nSecond line.',
        'A quote from the paper.',
      ])
      const items = within(region()).getAllByRole('listitem')
      expectOrigin(items[0]!, 'Added', 'Ada')
      expectOrigin(items[1]!, 'From brainstorming', 'Ada')
      expectOrigin(items[2]!, 'From reading', 'Bob')
      // One plain list, with no choice of layout.
      expect(items[0]!.closest('ol')).not.toHaveClass('grid')
      expect(within(region()).queryByRole('group', { name: 'Show notes as' })).toBeNull()
    })

    it('offers no Edit for a direct quotation, and sets it apart; it can still be deleted', async () => {
      fakeNotes([
        note('n1', 'Erosion loops.'),
        { ...note('n2', 'Exact words.', 'reading'), readingItemId: 'l1', quote: true },
      ])
      await open()
      await screen.findByText('Erosion loops.')
      expect(within(region()).getAllByRole('button', { name: /^Edit note/ })).toHaveLength(1)
      expect(within(region()).getByRole('button', { name: /^Edit note “Erosion/ })).toBeVisible()
      expect(within(region()).queryByRole('button', { name: /^Edit note “Exact/ })).toBeNull()
      expect(within(region()).getByText('Exact words.').closest('blockquote')).not.toBeNull()
      expect(within(region()).getByText('Erosion loops.').closest('blockquote')).toBeNull()
      const items = within(region()).getAllByRole('listitem')
      expectOrigin(items[1]!, 'Quoted from “A paper”', 'Ada')
      expect(within(region()).getByRole('button', { name: /^Delete note “Exact/ })).toBeVisible()
    })

    it('names the reading-list item a note was taken from, or just says reading if it is gone', async () => {
      fakeNotes([
        { ...note('n1', 'A quote.', 'reading'), readingItemId: 'l1' },
        { ...note('n2', 'From something removed.', 'reading'), readingItemId: null },
      ])
      await open()
      await screen.findByText('A quote.')
      const items = within(region()).getAllByRole('listitem')
      expectOrigin(items[0]!, 'From reading “A paper”', 'Ada')
      expectOrigin(items[1]!, 'From reading', 'Ada')
    })

    it('says "a former member" for a note whose author has left', async () => {
      fakeNotes([
        note('n1', 'Left behind.', 'entered', null),
        note('n2', 'Also.', 'brainstorm', null),
      ])
      await open()
      await screen.findByText('Left behind.')
      const items = within(region()).getAllByRole('listitem')
      expectOrigin(items[0]!, 'Added', 'A former member')
      expectOrigin(items[1]!, 'From brainstorming', 'A former member')
    })

    it('says so when there are no notes', async () => {
      await open()
      expect(await screen.findByText(/No notes yet/)).toBeInTheDocument()
    })

    it('explains when the notes cannot be loaded, and tries again', async () => {
      let fail = true
      const state = fakeNotes()
      server.use(
        http.get(notesUrl, () =>
          fail
            ? HttpResponse.json({ error: 'boom' }, { status: 500 })
            : HttpResponse.json(state.notes),
        ),
      )
      await open()
      await screen.findByRole('region', { name: 'Notes' })
      expect(await within(region()).findByRole('alert')).toHaveTextContent(
        "couldn't load the notes",
      )
      fail = false
      await fireEvent.click(within(region()).getByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('Erosion loops.')).toBeInTheDocument()
    })

    it('adds a note, shows it last, and clears the box ready for the next', async () => {
      const state = fakeNotes()
      await open()
      await screen.findByText('Erosion loops.')
      const box = screen.getByLabelText('Add a note')
      expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled() // nothing to add yet
      await fireEvent.update(box, 'Oxbow lakes form when a loop is cut off.')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

      expect(
        await screen.findByText('Oxbow lakes form when a loop is cut off.'),
      ).toBeInTheDocument()
      expect(state.sent).toEqual([{ text: 'Oxbow lakes form when a loop is cut off.' }])
      expect(texts().at(-1)).toBe('Oxbow lakes form when a loop is cut off.')
      expect(box).toHaveValue('')
      await waitFor(() => expect(box).toHaveFocus())
    })

    it('shows why a note was refused and keeps what was typed', async () => {
      fakeNotes()
      server.use(
        http.post(notesUrl, () =>
          HttpResponse.json({ error: 'An idea can have up to 200 notes.' }, { status: 409 }),
        ),
      )
      await open()
      const box = await screen.findByLabelText('Add a note')
      await fireEvent.update(box, 'One too many')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      expect(await screen.findByText('An idea can have up to 200 notes.')).toBeInTheDocument()
      expect(box).toHaveValue('One too many')
    })

    describe('editing', () => {
      const edit = async () => {
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Edit note “Erosion loops\.”/ }),
        )
        return screen.getByLabelText(/^Text of note “Erosion loops\.”/)
      }

      it('opens the note in a box with focus, and saves the new text', async () => {
        const state = fakeNotes()
        await open()
        const box = await edit()
        expect(box).toHaveValue('Erosion loops.')
        await waitFor(() => expect(box).toHaveFocus())
        await fireEvent.update(box, 'Erosion makes loops.')
        await fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

        expect(await screen.findByText('Erosion makes loops.')).toBeInTheDocument()
        expect(state.sent).toEqual([{ text: 'Erosion makes loops.' }])
        await waitFor(() =>
          expect(
            screen.getByRole('button', { name: /^Edit note “Erosion makes loops\.”/ }),
          ).toHaveFocus(),
        )
      })

      it('shows a refusal and stays open', async () => {
        fakeNotes()
        server.use(
          http.patch(`${notesUrl}/n1`, () =>
            HttpResponse.json({ error: 'Write something in the note' }, { status: 400 }),
          ),
        )
        await open()
        const box = await edit()
        await fireEvent.update(box, 'x')
        await fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
        expect(await screen.findByText('Write something in the note')).toBeInTheDocument()
        expect(box).toHaveValue('x')
      })

      it('cancels without saving, with the Escape key too', async () => {
        const state = fakeNotes()
        await open()
        const box = await edit()
        await fireEvent.update(box, 'changed')
        await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.getByText('Erosion loops.')).toBeInTheDocument()

        await edit()
        await fireEvent.keyDown(screen.getByLabelText(/^Text of note “Erosion loops\.”/), {
          key: 'Escape',
        })
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Save note' })).toBeNull())
        expect(state.sent).toEqual([])
      })
    })

    it('deletes a note only once it is confirmed, never on a single click', async () => {
      fakeNotes()
      await open()
      const button = await screen.findByRole('button', { name: /^Delete note “Erosion loops\.”/ })
      expect(button).toHaveAccessibleDescription(/Press and hold to confirm/)
      await fireEvent.click(button) // no hold: it only asks to be pressed again
      expect(await screen.findByText('Press again to confirm')).toBeInTheDocument()
      expect(screen.getByText('Erosion loops.')).toBeInTheDocument()
      await fireEvent.click(button)
      await waitFor(() => expect(screen.queryByText('Erosion loops.')).toBeNull())
      expect(texts()).toHaveLength(2)
    })

    describe('tags', () => {
      const tagged = () => [
        { ...note('n1', 'Erosion loops.'), tags: ['intro', 'draft 2'] },
        { ...note('n2', 'Deposition inside the bend.'), tags: ['draft 2'] },
        note('n3', 'Untagged thought.'),
        { ...note('n4', 'Oxbow lakes.'), tags: ['Intro'] },
      ]

      it('are shown on each note, and there is no filter until some note has one', async () => {
        fakeNotes(three)
        await open()
        await screen.findByText('Erosion loops.')
        expect(within(region()).queryByRole('group', { name: 'Show notes with a tag' })).toBeNull()
        expect(within(region()).queryByRole('list', { name: 'Tags' })).toBeNull()
      })

      it('shows the tags a note has, as a list on it', async () => {
        fakeNotes(tagged())
        await open()
        const first = (await screen.findByText('Erosion loops.')).closest('li')!
        const chips = within(first).getByRole('list', { name: 'Tags' })
        expect(
          within(chips)
            .getAllByRole('listitem')
            .map((li) => li.textContent?.trim()),
        ).toEqual(['intro', 'draft 2'])
      })

      it('can be used to show only the notes with one tag (ignoring case), and then all again', async () => {
        fakeNotes(tagged())
        await open()
        await screen.findByText('Erosion loops.')
        const filter = within(region()).getByRole('group', { name: 'Show notes with a tag' })
        // Each tag once, whatever its case, and "All" first.
        expect(
          within(filter)
            .getAllByRole('button')
            .map((b) => b.textContent?.trim()),
        ).toEqual(['All', 'intro', 'draft 2'])
        expect(within(filter).getByRole('button', { name: 'All' })).toHaveAttribute(
          'aria-pressed',
          'true',
        )

        await fireEvent.click(within(filter).getByRole('button', { name: 'intro' }))
        expect(texts()).toEqual(['Erosion loops.', 'Oxbow lakes.'])
        expect(within(filter).getByRole('button', { name: 'intro' })).toHaveAttribute(
          'aria-pressed',
          'true',
        )
        await fireEvent.click(within(filter).getByRole('button', { name: 'draft 2' }))
        expect(texts()).toEqual(['Erosion loops.', 'Deposition inside the bend.'])
        await fireEvent.click(within(filter).getByRole('button', { name: 'All' }))
        expect(texts()).toHaveLength(4)
      })

      it('lets the notes shown be put in order, leaving the hidden ones where they were', async () => {
        const api = fakeNotes(tagged())
        await open()
        await screen.findByText('Erosion loops.')
        await fireEvent.click(within(region()).getByRole('button', { name: 'draft 2' }))
        // Shown: n1, n2. Move n2 above n1; n3 and n4 are hidden and keep their places.
        await fireEvent.click(
          screen.getByRole('button', { name: /^Move note “Deposition inside the bend\.” up/ }),
        )
        await waitFor(() => expect(api.orders).toEqual([['n2', 'n1', 'n3', 'n4']]))
      })

      it('shows a note with a tag when the last note with it loses it, going back to all', async () => {
        fakeNotes([{ ...note('n1', 'Only one.'), tags: ['solo'] }, note('n2', 'Other.')])
        await open()
        await screen.findByText('Only one.')
        await fireEvent.click(within(region()).getByRole('button', { name: 'solo' }))
        expect(texts()).toEqual(['Only one.'])
        await fireEvent.click(screen.getByRole('button', { name: /^Edit note “Only one\.”/ }))
        await fireEvent.update(screen.getByLabelText(/^Tags for note/), '')
        await fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
        await waitFor(() => expect(texts()).toEqual(['Only one.', 'Other.']))
        expect(within(region()).queryByRole('group', { name: 'Show notes with a tag' })).toBeNull()
      })

      it('are edited with the note: tidied and sent as a whole set, without resending unchanged text', async () => {
        const api = fakeNotes(tagged())
        await open()
        await fireEvent.click(await screen.findByRole('button', { name: /^Edit note “Deposition/ }))
        const field = screen.getByLabelText(/^Tags for note “Deposition/)
        expect(field).toHaveValue('draft 2')
        expect(field).toHaveAccessibleDescription(/Separate tags with commas/)
        await fireEvent.update(field, '  draft 2 , Part   three,, PART THREE ')
        await fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

        await waitFor(() =>
          expect(api.tagged).toEqual([{ id: 'n2', tags: ['draft 2', 'Part three'] }]),
        )
        expect(api.sent).toEqual([]) // the text was not changed, so it was not sent
        expect(await screen.findByRole('button', { name: /^Edit note “Deposition/ })).toHaveFocus()
      })

      it('saves a changed text and changed tags together', async () => {
        const api = fakeNotes(tagged())
        await open()
        await fireEvent.click(await screen.findByRole('button', { name: /^Edit note “Untagged/ }))
        await fireEvent.update(screen.getByLabelText(/^Text of note/), 'Tagged thought.')
        await fireEvent.update(screen.getByLabelText(/^Tags for note/), 'intro')
        await fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
        await waitFor(() => expect(api.tagged).toEqual([{ id: 'n3', tags: ['intro'] }]))
        expect(api.sent).toEqual([{ text: 'Tagged thought.' }])
      })

      it('can be picked from the ones already used', async () => {
        fakeNotes(tagged())
        await open()
        await fireEvent.click(await screen.findByRole('button', { name: /^Edit note “Untagged/ }))
        await fireEvent.click(screen.getByRole('button', { name: 'Add the tag draft 2' }))
        await fireEvent.click(screen.getByRole('button', { name: 'Add the tag intro' }))
        expect(screen.getByLabelText(/^Tags for note/)).toHaveValue('draft 2, intro')
      })

      it('show the explanation when the tags are refused, and keep the form open', async () => {
        fakeNotes(tagged())
        server.use(
          http.put(`${notesUrl}/n3/tags`, () =>
            HttpResponse.json({ error: 'Use 10 tags or fewer on a note' }, { status: 400 }),
          ),
        )
        await open()
        await fireEvent.click(await screen.findByRole('button', { name: /^Edit note “Untagged/ }))
        await fireEvent.update(screen.getByLabelText(/^Tags for note/), 'a, b')
        await fireEvent.click(screen.getByRole('button', { name: 'Save note' }))
        expect(await screen.findByText('Use 10 tags or fewer on a note')).toBeInTheDocument()
        expect(screen.getByLabelText(/^Tags for note/)).toHaveValue('a, b')
      })
    })

    describe('merging and splitting', () => {
      const quote = () => ({ ...note('n9', 'Exact words.', 'reading'), quote: true })
      const startMerging = async () =>
        fireEvent.click(await screen.findByRole('button', { name: 'Merge notes' }))
      const tick = (start: string) =>
        screen.getByRole('checkbox', { name: new RegExp(`^Select note “${start}`) })

      it('offers merging only when there is more than one note', async () => {
        fakeNotes([note('n1', 'Only one.')])
        await open()
        await screen.findByText('Only one.')
        expect(screen.queryByRole('button', { name: 'Merge notes' })).toBeNull()
      })

      it('lets notes be ticked (never a quotation), and merges when two are, joining them into one', async () => {
        const api = fakeNotes([...three, quote()])
        await open()
        await startMerging()
        expect(screen.getByRole('button', { name: 'Stop merging' })).toHaveAttribute(
          'aria-pressed',
          'true',
        )
        expect(screen.getByText(/can't be merged/)).toBeInTheDocument()
        expect(screen.getAllByRole('checkbox', { name: /to merge$/ })).toHaveLength(3) // not the quotation

        const go = screen.getByRole('button', { name: 'Merge 0 notes' })
        expect(go).toBeDisabled()
        await fireEvent.click(tick('Deposition'))
        expect(screen.getByRole('button', { name: 'Merge 1 notes' })).toBeDisabled()
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(screen.getByRole('button', { name: 'Merge 2 notes' }))

        await waitFor(() => expect(api.merged).toEqual([['n2', 'n1']]))
        await waitFor(() => expect(texts()).toHaveLength(3))
        expect(texts()[0]).toContain('Erosion loops.')
        expect(await screen.findByRole('button', { name: 'Merge notes' })).toBeInTheDocument() // back to normal
        expect(screen.queryByRole('checkbox', { name: /to merge$/ })).toBeNull()
      })

      it('forgets what was ticked when merging is stopped', async () => {
        fakeNotes()
        await open()
        await startMerging()
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(screen.getByRole('button', { name: 'Stop merging' }))
        await startMerging()
        expect(tick('Erosion')).not.toBeChecked()
      })

      it("shows the server's reason when notes can't be merged, and stays open to change the choice", async () => {
        fakeNotes()
        server.use(
          http.post(`${notesUrl}/merge`, () =>
            HttpResponse.json(
              { error: "Notes that came from different places can't be merged." },
              { status: 409 },
            ),
          ),
        )
        await open()
        await startMerging()
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tick('Deposition'))
        await fireEvent.click(screen.getByRole('button', { name: 'Merge 2 notes' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('different places')
        expect(tick('Erosion')).toBeChecked()
      })

      describe('splitting', () => {
        const edit = async () => {
          await fireEvent.click(await screen.findByRole('button', { name: /^Edit note “Erosion/ }))
          return screen.getByLabelText(/^Text of note “Erosion/) as HTMLTextAreaElement
        }

        it('cuts the note being edited where the cursor is, into two, and shows both', async () => {
          const api = fakeNotes()
          await open()
          const box = await edit()
          await fireEvent.update(box, 'Erosion loops. Deposition builds bars.')
          box.setSelectionRange(14, 14)
          await fireEvent.click(
            screen.getByRole('button', { name: /^Split note “Erosion.*at the cursor/ }),
          )

          await waitFor(() =>
            expect(api.split).toEqual([
              { id: 'n1', before: 'Erosion loops.', after: ' Deposition builds bars.' },
            ]),
          )
          await waitFor(() => expect(texts()).toHaveLength(4))
          expect(texts().slice(0, 2)).toEqual(['Erosion loops.', 'Deposition builds bars.'])
          expect(screen.queryByRole('button', { name: 'Save note' })).toBeNull() // editing is over
        })

        it('explains when there are no words on one side, and keeps the form open', async () => {
          fakeNotes()
          server.use(
            http.post(`${notesUrl}/n1/split`, () =>
              HttpResponse.json(
                { error: 'Put the cursor inside the note, with some words on each side of it' },
                { status: 400 },
              ),
            ),
          )
          await open()
          const box = await edit()
          box.setSelectionRange(0, 0)
          await fireEvent.click(
            screen.getByRole('button', { name: /^Split note “Erosion.*at the cursor/ }),
          )
          expect(await screen.findByText(/Put the cursor inside the note/)).toBeInTheDocument()
          expect(screen.getByRole('button', { name: 'Save note' })).toBeInTheDocument()
        })

        it('is not offered for a quotation, which cannot be edited at all', async () => {
          fakeNotes([quote()])
          await open()
          await screen.findByText(/Exact words\./)
          expect(screen.queryByRole('button', { name: /^Edit note/ })).toBeNull()
        })
      })
    })

    describe('reordering', () => {
      it('moves a note with the buttons, sending the complete new order and announcing it', async () => {
        const state = fakeNotes()
        await open()
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Move note “A quote from the paper\.” up/ }),
        )
        await waitFor(() => expect(state.orders).toEqual([['n1', 'n3', 'n2']]))
        expect(texts()[1]).toBe('A quote from the paper.')
        expect(
          await screen.findByText(/^Moved note “A quote from the paper\.” to position 2 of 3/),
        ).toBeInTheDocument()
      })

      it('shows a move at once, while the server is still answering', async () => {
        const state = fakeNotes()
        let release!: () => void
        const held = new Promise<void>((resolve) => (release = resolve))
        server.use(
          http.put(`${notesUrl}/order`, async ({ request }) => {
            await held
            const { ids } = (await request.json()) as { ids: string[] }
            state.orders.push(ids)
            state.notes = ids.map((id) => state.notes.find((n) => n.id === id)!)
            return HttpResponse.json(state.notes)
          }),
        )
        await open()
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Move note “A quote from the paper\.” up/ }),
        )
        expect(texts()[1]).toBe('A quote from the paper.') // already there; nothing has been saved yet
        expect(state.orders).toEqual([])
        release()
        await waitFor(() => expect(state.orders).toEqual([['n1', 'n3', 'n2']]))
        expect(texts()).toEqual([
          'Erosion loops.',
          'A quote from the paper.',
          'Deposition inside the bend.\nSecond line.',
        ])
      })

      it('copes with several quick moves: one request at a time, and the order you made', async () => {
        const state = fakeNotes()
        let inFlight = 0
        let most = 0
        server.use(
          http.put(`${notesUrl}/order`, async ({ request }) => {
            inFlight++
            most = Math.max(most, inFlight)
            await new Promise((resolve) => setTimeout(resolve, 60))
            const { ids } = (await request.json()) as { ids: string[] }
            state.orders.push(ids)
            state.notes = ids.map((id) => state.notes.find((n) => n.id === id)!)
            inFlight--
            return HttpResponse.json(state.notes)
          }),
        )
        await open()
        const up = (text: string) =>
          screen.getByRole('button', { name: new RegExp(`^Move note “${text}” up`) })
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Move note “A quote from the paper\.” up/ }),
        )
        await fireEvent.click(up('A quote from the paper\\.')) // to the top, before the first save has answered
        await fireEvent.click(up('Deposition inside the bend\\.')) // then the one that is now last
        expect(texts()).toEqual([
          'A quote from the paper.',
          'Deposition inside the bend.\nSecond line.',
          'Erosion loops.',
        ])
        await waitFor(() => expect(state.orders.at(-1)).toEqual(['n3', 'n2', 'n1']))
        expect(most).toBe(1)
        await new Promise((resolve) => setTimeout(resolve, 150))
        expect(texts()).toEqual([
          'A quote from the paper.',
          'Deposition inside the bend.\nSecond line.',
          'Erosion loops.',
        ])
      })

      it('has no arrow that goes nowhere', async () => {
        fakeNotes()
        await open()
        expect(
          await screen.findByRole('button', { name: /^Move note “Erosion loops\.” up/ }),
        ).toBeDisabled()
        expect(
          screen.getByRole('button', { name: /^Move note “A quote from the paper\.” down/ }),
        ).toBeDisabled()
      })

      it("shows the server's explanation, and the server's list, when the order is out of date", async () => {
        const state = fakeNotes()
        server.use(
          http.put(`${notesUrl}/order`, () => {
            state.notes = [state.notes[2]!]
            return HttpResponse.json(
              {
                error:
                  'The notes have changed since you opened them. Reload the page and try again.',
              },
              { status: 409 },
            )
          }),
        )
        await open()
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Move note “A quote from the paper\.” up/ }),
        )
        expect(
          await screen.findByText(/The notes have changed since you opened them/),
        ).toBeInTheDocument()
        await waitFor(() => expect(texts()).toEqual(['A quote from the paper.']))
      })
    })
  })

  describe('reordering the drafts', () => {
    const three = {
      ...idea,
      drafts: [
        { id: 'd1', title: 'Part 1', updatedAt: '2026-01-02T00:00:00Z' },
        { id: 'd2', title: 'Part 2', updatedAt: '2026-01-03T00:00:00Z' },
        { id: 'd3', title: '', updatedAt: '2026-01-04T00:00:00Z' },
      ],
    }
    const titles = () =>
      within(screen.getByRole('region', { name: 'Drafts' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent)

    function fakeIdea() {
      const state = { current: three, orders: [] as string[][] }
      server.use(
        signedInAs(testUser),
        listProfiles,
        http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json([])),
        http.get(ideaUrl, () => HttpResponse.json(state.current)),
        http.put(`${ideaUrl}/drafts/order`, async ({ request }) => {
          const { ids } = (await request.json()) as { ids: string[] }
          state.orders.push(ids)
          state.current = {
            ...state.current,
            drafts: ids.map((id) => state.current.drafts.find((d) => d.id === id)!),
          }
          return HttpResponse.json(state.current)
        }),
      )
      return state
    }

    it('moves a draft with the buttons, sending the complete new order and showing it', async () => {
      const fake = fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.click(await screen.findByRole('button', { name: 'Move Untitled up' }))
      await waitFor(() => expect(fake.orders).toEqual([['d1', 'd3', 'd2']]))
      await waitFor(() =>
        expect(titles()).toEqual([
          expect.stringContaining('Part 1'),
          expect.stringContaining('Untitled'),
          expect.stringContaining('Part 2'),
        ]),
      )
      expect(await screen.findByText('Moved Untitled to position 2 of 3')).toBeInTheDocument()
    })

    it('shows a move at once, while the server is still answering', async () => {
      const fake = fakeIdea()
      let release!: () => void
      const held = new Promise<void>((resolve) => (release = resolve))
      server.use(
        http.put(`${ideaUrl}/drafts/order`, async ({ request }) => {
          await held
          const { ids } = (await request.json()) as { ids: string[] }
          fake.orders.push(ids)
          fake.current = {
            ...fake.current,
            drafts: ids.map((id) => fake.current.drafts.find((d) => d.id === id)!),
          }
          return HttpResponse.json(fake.current)
        }),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.click(await screen.findByRole('button', { name: 'Move Untitled up' }))
      expect(titles()).toEqual([
        expect.stringContaining('Part 1'),
        expect.stringContaining('Untitled'),
        expect.stringContaining('Part 2'),
      ])
      expect(fake.orders).toEqual([])
      release()
      await waitFor(() => expect(fake.orders).toEqual([['d1', 'd3', 'd2']]))
      expect(titles()[1]).toContain('Untitled')
    })

    it('cannot move the first draft up or the last one down, and a single draft not at all', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByRole('button', { name: 'Move Part 1 up' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Untitled down' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Part 2 up' })).toBeEnabled()
    })

    it('drags a draft by its grip', async () => {
      const fake = fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      await screen.findByRole('button', { name: 'Move Part 1 up' })
      const items = within(screen.getByRole('region', { name: 'Drafts' })).getAllByRole('listitem')
      const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }
      await fireEvent.dragStart(items[2]!.querySelector('[data-testid="grip"]')!, { dataTransfer })
      await fireEvent.dragOver(items[0]!, { clientY: -1, dataTransfer })
      await fireEvent.drop(items[0]!, { dataTransfer })
      await waitFor(() => expect(fake.orders).toEqual([['d3', 'd1', 'd2']]))
    })

    it('shows why a move failed, and the server’s list', async () => {
      fakeIdea()
      server.use(
        http.put(`${ideaUrl}/drafts/order`, () =>
          HttpResponse.json({ error: 'The drafts have changed.' }, { status: 409 }),
        ),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.click(await screen.findByRole('button', { name: 'Move Part 2 up' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('The drafts have changed.')
    })

    it('has no arrows when there are no drafts', async () => {
      server.use(
        signedInAs(testUser),
        listProfiles,
        http.get(ideaUrl, () => HttpResponse.json({ ...idea, drafts: [] })),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      await screen.findByText(/No drafts yet/)
      expect(screen.queryByRole('button', { name: /Move .* up/ })).not.toBeInTheDocument()
    })
  })

  it('says so when there are no drafts yet', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get(ideaUrl, () => HttpResponse.json({ ...idea, links: [], drafts: [] })),
    )
    await renderAt('/p/ada-substack/ideas/i1')
    await screen.findByText(/No drafts yet/)
    expect(screen.getByText('Nothing on the reading list yet.')).toBeInTheDocument()
  })

  it('asks before deleting, then returns to the profile', async () => {
    let deleted = false
    await open([
      http.delete(ideaUrl, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    ])
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete idea' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete this idea?' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(deleted).toBe(false)

    await fireEvent.click(screen.getByRole('button', { name: 'Delete idea' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, delete it' }),
    )
    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByRole('heading', { name: 'Ideas' })).toBeInTheDocument()
  })
})
