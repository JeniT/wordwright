import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const publication = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada', handle: 'ada', email: 'ada@example.com', role: 'owner' }],
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
  publicationId: 'ada-substack',
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

const message = (n: number, role: 'user' | 'assistant', text: string) => ({
  id: `m${n}`,
  role,
  kind: 'message' as const,
  text,
  authorName: role === 'user' ? 'Ada' : null,
  model: role === 'assistant' ? 'fake-model' : null,
  status: 'complete' as const,
  stopReason: null,
  proposals: [] as unknown[],
  notes: [] as unknown[],
  createdAt: `2026-01-0${n}T00:00:00Z`,
})

const ideaUrl = '*/api/publications/ada-substack/ideas/i1'

/** A pretend API for the idea; `calls` records anything that would cost money or change something. */
function fakeIdea(
  options: {
    idea?: ReturnType<typeof idea>
    notes?: ReturnType<typeof note>[]
    messages?: ReturnType<typeof message>[]
  } = {},
) {
  const state = {
    notes: [...(options.notes ?? [])],
    researched: [] as string[],
    drafts: [] as unknown[],
    requests: [] as string[],
  }
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([publication])),
    http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
    http.get(ideaUrl, () => HttpResponse.json(options.idea ?? idea())),
    http.get(`${ideaUrl}/notes`, () => HttpResponse.json(state.notes)),
    http.post(`${ideaUrl}/notes`, async ({ request }) => {
      const { text } = (await request.json()) as { text: string }
      const made = note(state.notes.length + 1, text)
      state.notes.push(made)
      return HttpResponse.json(made, { status: 201 })
    }),
    http.get(`${ideaUrl}/research`, () => HttpResponse.json([])),
    http.get(`${ideaUrl}/conversations`, () =>
      HttpResponse.json({
        conversations: options.messages?.length
          ? [
              {
                id: 'c1',
                createdAt: '2026-01-05T10:00:00Z',
                startedByName: 'Ada',
                title: null,
                titleByAi: false,
              },
            ]
          : [],
      }),
    ),
    http.get(`${ideaUrl}/conversations/c1`, () =>
      HttpResponse.json({
        id: 'c1',
        createdAt: '2026-01-05T10:00:00Z',
        startedByName: 'Ada',
        title: null,
        titleByAi: false,
        messages: options.messages ?? [],
        replyingNow: null,
      }),
    ),
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
          publicationId: 'ada-substack',
          ideaId: 'i1',
          title: 'Untitled',
          body: '',
          editorId: 'u1',
          editorName: 'Ada Lovelace',
          version: 1,
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
  it('is titled with the idea’s name, with the publication above as a way up, and opens here', async () => {
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
      /^03\s*Notes$/,
    )
    expect(screen.getByRole('region', { name: 'Read' }).querySelector('h2')).toHaveTextContent(
      /^02\s*Read$/,
    )
    expect(screen.getByRole('region', { name: 'Draft' }).querySelector('h2')).toHaveTextContent(
      /^05\s*Draft$/,
    )
  })

  it('says when the idea cannot be opened', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
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
    it('always has the box to ask the AI, and links to the research so far', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Research' })
      expect(within(region).getByLabelText('What areas do you want to research?')).toBeVisible()
      expect(within(region).getByRole('link', { name: 'See all research' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/research',
      )
      expect(region.querySelector('h2')).toHaveTextContent(/^01\s*Research$/)
    })

    it('puts what is sent in the same row as the button, to its right', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Research' })
      const button = await within(region).findByRole('button', { name: 'Research' })
      const note = within(region).getByText(/^This will send this publication’s description/)
      expect(button.parentElement).toBe(note.parentElement)
      expect(button.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('has the same box as the Research page: an example only, and one line on what is sent', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Research' })
      expect(
        within(region).getByText(
          'For example: how fast river bends move, and what engineers have learned from straightening rivers.',
        ),
      ).toBeVisible()
      expect(within(region).queryByText(/You can research other areas afterwards/)).toBeNull()
      expect(within(region).queryByText(/up to a minute/)).toBeNull()
      expect(
        within(region).getByText(
          /^This will send this publication’s description and this idea’s title and notes, reading list, and the areas you want to research to your AI\. It will not send your drafts\.$/,
        ),
      ).toBeVisible()
    })

    it('says what is sent to the AI provider, next to the button', async () => {
      fakeIdea({
        idea: idea(
          [link(1)].map((l) => ({ ...l, readAt: '2026-01-01T00:00:00Z' })),
          [draft(1)],
        ),
      })
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Research' })
      expect(
        within(region).getByText(/^This will send this publication’s description/),
      ).toBeInTheDocument()
    })

    it('starts the research only when the button is pressed, then shows the results', async () => {
      const state = fakeIdea({
        idea: idea(
          [link(1)].map((l) => ({ ...l, readAt: '2026-01-01T00:00:00Z' })),
          [draft(1)],
        ),
      })
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
        expect(router.currentRoute.value.path).toBe('/p/ada-substack/ideas/i1/research'),
      )
    })

    it('says what went wrong, and keeps the words, when the research fails', async () => {
      fakeIdea({
        idea: idea(
          [link(1)].map((l) => ({ ...l, readAt: '2026-01-01T00:00:00Z' })),
          [draft(1)],
        ),
      })
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

  describe('read', () => {
    it('shows the unread reading, and links to the whole list', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Read' })
      const list = await within(region).findByRole('list', { name: 'To read' })
      expect(within(list).getAllByRole('link')).toHaveLength(2)
      expect(within(region).getByRole('link', { name: 'See the reading list' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/read',
      )
    })

    it('says so when there is nothing on the list', async () => {
      fakeIdea({ idea: idea([], []) })
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Read' })
      expect(
        await within(region).findByText('Nothing on the reading list yet.'),
      ).toBeInTheDocument()
    })
  })

  describe('notes', () => {
    it('says so when there are none', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
    })

    it('shows the five most recent, and links to all of them', async () => {
      fakeIdea({ notes: [1, 2, 3, 4, 5, 6, 7].map((n) => note(n)) })
      await renderAt('/p/ada-substack/ideas/i1')
      const list = await screen.findByRole('list', { name: 'Recent notes' })
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((li) => li.querySelector('p')?.textContent?.trim()),
      ).toEqual(['Note 7', 'Note 6', 'Note 5', 'Note 4', 'Note 3'])
      expect(screen.getByRole('link', { name: /See all notes/ })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/notes',
      )
    })

    it('adds a note from Quick add without leaving the page', async () => {
      fakeIdea({ notes: [note(1)] })
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      await screen.findByText('Note 1')
      const quick = within(screen.getByRole('region', { name: 'Quick add' }))
      // An idea's Quick add has no New idea tab: a new idea belongs to the publication.
      expect(quick.getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual([
        'Add a note',
        'Add to reading list',
      ])
      await fireEvent.update(quick.getByLabelText('Note'), 'A new thought')
      await fireEvent.click(quick.getByRole('button', { name: 'Add note' }))
      expect(await screen.findByText(/Note added/)).toBeInTheDocument()
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
      expect(screen.getByRole('link', { name: 'See all drafts' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/drafts',
      )
    })

    it('says so when there are none, and still offers to start one', async () => {
      fakeIdea({ idea: idea([], []) })
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByText(/No drafts yet/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'New draft' })).toBeInTheDocument()
    })

    it('starts a draft and opens it', async () => {
      const state = fakeIdea({ idea: idea([], []) })
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.click(await screen.findByRole('button', { name: 'New draft' }))
      await waitFor(() => expect(state.drafts).toEqual([{ title: 'Untitled' }]))
      await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-substack/drafts/d9'))
    })

    it('says what went wrong when a draft can’t be started', async () => {
      fakeIdea({ idea: idea([], []) })
      server.use(
        http.post(`${ideaUrl}/drafts`, () => HttpResponse.json({ error: 'Nope' }, { status: 500 })),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      await fireEvent.click(await screen.findByRole('button', { name: 'New draft' }))
      expect(
        await screen.findByText('Sorry, we couldn’t start a draft. Please try again.'),
      ).toBeInTheDocument()
    })
  })

  describe('refine', () => {
    it('invites you to start when there is no conversation, and goes to Refine to start it', async () => {
      const state = fakeIdea()
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Refine' })
      expect(region.querySelector('h2')).toHaveTextContent(/^04\s*Refine$/)
      const button = await within(region).findByRole('button', { name: 'Refine with your AI' })
      expect(within(region).queryByText('Talk it through')).toBeNull()
      // What leaves the system is said next to the button, in one line.
      expect(
        within(region).getByText(
          /^This will send this publication’s description and this idea’s title and notes and reading list to your AI\. It will not send your drafts\.$/,
        ),
      ).toBeVisible()
      expect(button.parentElement).toBe(
        within(region).getByText(/^This will send this publication’s description/).parentElement,
      )
      expect(state.requests).toEqual([]) // nothing started by looking
      await fireEvent.click(button)
      // The AI makes the first move on the Refine page, so the person enters nothing here.
      await waitFor(() => expect(router.currentRoute.value.name).toBe('brainstorm'))
      expect(router.currentRoute.value.query).toEqual({ start: '1' })
    })

    it('summarises the newest of several conversations and links to them all', async () => {
      fakeIdea({ messages: [message(1, 'assistant', 'From the newest.')] })
      const summaries = [
        {
          id: 'c0',
          createdAt: '2026-01-01T10:00:00Z',
          startedByName: 'Ada',
          title: null,
          titleByAi: false,
        },
        {
          id: 'c1',
          createdAt: '2026-01-05T10:00:00Z',
          startedByName: 'Ada',
          title: null,
          titleByAi: false,
        },
      ]
      server.use(
        http.get(`${ideaUrl}/conversations`, () => HttpResponse.json({ conversations: summaries })),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Refine' })
      expect(await within(region).findByText('From the newest.')).toBeInTheDocument()
      expect(within(region).getByRole('link', { name: 'See all conversations' })).toBeVisible()
      expect(within(region).queryByRole('button', { name: 'Refine with your AI' })).toBeNull()
    })

    it('shows the latest message from the AI, not the writer’s own', async () => {
      fakeIdea({
        messages: [
          message(1, 'assistant', 'First question?'),
          message(2, 'user', 'My answer'),
          message(3, 'assistant', 'A **sharper** question?'),
          message(4, 'user', 'Another answer'),
        ],
      })
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Refine' })
      expect(await within(region).findByText('sharper')).toBeInTheDocument()
      expect(within(region).queryByText('First question?')).toBeNull()
      expect(within(region).getByText(/^Your AI/)).toBeInTheDocument()
      expect(within(region).queryByText(/Coach/)).toBeNull()
      expect(within(region).queryByText(/fake-model/)).toBeNull() // which model replied is not shown
      expect(within(region).getByRole('link', { name: 'See all conversations' })).toBeVisible()
      expect(within(region).queryByText('Read in full')).toBeNull()
    })

    it('cuts a long reply at a paragraph and links to the rest', async () => {
      const long = `${'First paragraph. '.repeat(20)}\n\n${'Second paragraph. '.repeat(40)}`
      fakeIdea({ messages: [message(1, 'assistant', long)] })
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Refine' })
      expect(await within(region).findByText(/First paragraph/)).toBeInTheDocument()
      expect(within(region).queryByText(/Second paragraph/)).toBeNull()
      expect(within(region).getByRole('link', { name: 'Read in full' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/refine',
      )
    })

    it('sends a reply through the Refine page, where it joins the thread', async () => {
      const sent: unknown[] = []
      fakeIdea({ messages: [message(1, 'assistant', 'What is the point?')] })
      server.use(
        http.post(`${ideaUrl}/conversations/c1/messages`, async ({ request }) => {
          sent.push(await request.json())
          return new HttpResponse('', {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream' },
          })
        }),
      )
      const { router } = await renderAt('/p/ada-substack/ideas/i1')
      const reply = await screen.findByLabelText('Your reply')
      expect(screen.queryByText(/Sending takes you to the conversation/)).toBeNull()
      await fireEvent.update(reply, 'Rivers are lazy')
      expect(sent).toEqual([])
      await fireEvent.click(screen.getByRole('button', { name: 'Send' }))
      await waitFor(() => expect(router.currentRoute.value.name).toBe('brainstorm'))
      // The text is not in the address.
      expect(router.currentRoute.value.fullPath).not.toContain('lazy')
      await waitFor(() => expect(sent).toEqual([{ text: 'Rivers are lazy' }]))
    })

    it('says when the conversation can’t be loaded', async () => {
      fakeIdea()
      server.use(
        http.get(`${ideaUrl}/conversations`, () =>
          HttpResponse.json({ error: 'Nope' }, { status: 500 }),
        ),
      )
      await renderAt('/p/ada-substack/ideas/i1')
      expect(await screen.findByText(/couldn't load the conversation/)).toBeInTheDocument()
    })

    it('says the AI has not replied yet, without a second link to the conversation', async () => {
      fakeIdea({ messages: [message(1, 'user', 'A thought')] })
      await renderAt('/p/ada-substack/ideas/i1')
      const region = await screen.findByRole('region', { name: 'Refine' })
      expect(await within(region).findByText('Your AI hasn’t replied yet.')).toBeInTheDocument()
      expect(within(region).getAllByRole('link', { name: /conversation/ })).toHaveLength(1)
    })
  })

  it('shows notes as the Notes step does: with their tags and where they came from', async () => {
    fakeIdea({ notes: [{ ...note(1), tags: ['intro'] }] })
    await renderAt('/p/ada-substack/ideas/i1')
    const list = await screen.findByRole('list', { name: 'Recent notes' })
    expect(within(list).getByText('intro')).toBeInTheDocument()
    expect(within(list).getByText(/recorded by/)).toBeInTheDocument()
  })
})

describe('an idea’s landing page: tutorial mode (#232)', () => {
  const setup = async (user: typeof testUser) => {
    fakeIdea()
    server.use(signedInAs(user))
    // The route 'idea' is this kind of page (see tutorial-routes.test.ts).
    await renderAt('/p/ada-substack/ideas/i1')
    await screen.findByRole('region', { name: 'Draft' })
  }
  const texts = [
    /^This is your idea’s home\. Gather reading and notes, ask your AI to help you research and refine it, then start a draft\.$/,
    /^Describe the areas you want to look into and your AI will suggest some pages worth reading\. You can choose whether to add them to your reading list\.$/,
    /^Read the articles on this idea’s reading list and take notes on them\. Items can be tagged and moved to another idea\.$/,
    /^Review, tag and arrange your notes\. They are what you draw on when you write\.$/,
    /^Use your AI to help you refine your idea\. It will ask you questions and suggest the points you make as notes\.$/,
    /^Write your draft\. You can ask for human reviews as well as getting your AI to critique or suggest options to rephrase a short passage\.$/,
  ]

  it('writes out what the page and each step are for', async () => {
    await setup({ ...testUser, tutorialMode: true })
    for (const text of texts) expect(screen.getByText(text)).toBeVisible()
  })

  it('says none of it when it is off, and leaves no explanation paragraph on the page', async () => {
    await setup({ ...testUser, tutorialMode: false })
    for (const text of texts) expect(screen.queryByText(text)).toBeNull()
    expect(screen.queryByText(/Your AI searches the web for pages worth reading/)).toBeNull()
  })
})
