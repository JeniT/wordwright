import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import {
  openFilters,
  renderAt,
  server,
  showArrows,
  signedInAs,
  testUser,
  useMockServer,
  expectOrigin,
  chooseTag,
  suggestedTags,
} from '../test-utils'

useMockServer({ warm: ['publication'] })

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
const listPublications = http.get('*/api/publications', () => HttpResponse.json([publication]))

const idea = {
  id: 'i1',
  publicationId: 'ada-substack',
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
  drafts: [
    {
      id: 'd1',
      title: 'Part 1',
      updatedAt: '2026-01-02T00:00:00Z',
      editorId: 'u1',
      editorName: 'Ada',
      publishedAt: null,
      publishedUrl: null,
    },
  ],
  pendingSuggestions: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const ideaUrl = '*/api/publications/ada-substack/ideas/i1'

describe('ideas on the publication page', () => {
  it('lists them with their draft counts and links to each', async () => {
    server.use(
      signedInAs(testUser),
      listPublications,
      http.get('*/api/publications/ada-substack/ideas', () =>
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
  })

  it('has an empty state', async () => {
    server.use(
      signedInAs(testUser),
      listPublications,
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack')
    await screen.findByText(/No ideas yet/)
  })

  it('says what to do when they cannot be loaded', async () => {
    server.use(
      signedInAs(testUser),
      listPublications,
      http.get('*/api/publications/ada-substack/ideas', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    )
    await renderAt('/p/ada-substack')
    expect(await screen.findByText(/couldn't load ideas/)).toBeInTheDocument()
  })
})

describe('moving ideas to another publication', () => {
  const poems = { ...publication, id: 'ada-poems', name: 'Poems' }
  const rows = [
    { id: 'i1', name: 'Why rivers meander', draftCount: 2, updatedAt: '2026-01-02T00:00:00Z' },
    { id: 'i2', name: 'Tides', draftCount: 1, updatedAt: '2026-01-01T00:00:00Z' },
  ]
  const preview = {
    ideas: 1,
    drafts: 2,
    notes: 5,
    links: 3,
    losingAccess: ['Bob', 'Cy'],
    problem: null as string | null,
  }
  function fake(publications = [publication, poems]) {
    const moves: unknown[] = []
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json(publications)),
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json(rows)),
      http.get('*/api/publications/ada-poems/ideas', () => HttpResponse.json([])),
      http.get('*/api/publications/ada-poems/ideas/i1', () =>
        HttpResponse.json({ ...idea, publicationId: 'ada-poems' }),
      ),
      http.post('*/api/publications/ada-substack/move/ideas', async ({ request }) => {
        moves.push(await request.json())
        return HttpResponse.json({ publicationId: 'ada-poems', ideaIds: ['i1'] })
      }),
    )
    return { moves }
  }
  const choose = async () => {
    await renderAt('/p/ada-substack/ideas')
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Why rivers meander' }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    await fireEvent.update(await screen.findByLabelText('Move to'), 'ada-poems')
  }

  it('offers no way to move to someone with one publication', async () => {
    fake([publication])
    await renderAt('/p/ada-substack/ideas')
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Why rivers meander' }),
    )
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move to…' })).toBeNull()
  })

  it('lists only the other publications, then says what moves and who loses sight of it', async () => {
    fake()
    server.use(
      http.post('*/api/publications/ada-substack/move/ideas/preview', () =>
        HttpResponse.json(preview),
      ),
    )
    await renderAt('/p/ada-substack/ideas')
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Select Why rivers meander' }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    const select = await screen.findByLabelText('Move to')
    expect(within(select).queryByRole('option', { name: 'Substack' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Move 1 idea' })).toBeDisabled() // nowhere chosen yet
    await fireEvent.update(select, 'ada-poems')
    const says = await waitFor(() => {
      const el = document.querySelector('[data-move-says]')!
      expect(el).toHaveTextContent('1 idea, 2 drafts, 5 notes, 3 links will move to “Poems”.')
      return el
    })
    expect(says).toHaveTextContent(
      'Bob and Cy aren’t members of “Poems”, so will no longer be able to see it.',
    )
    expect(screen.getByRole('button', { name: 'Move 1 idea' })).toBeEnabled()
  })

  it('moves one idea from its own Move button, whatever else is ticked', async () => {
    const f = fake()
    server.use(
      http.post('*/api/publications/ada-substack/move/ideas/preview', () =>
        HttpResponse.json({ ...preview, losingAccess: [] }),
      ),
    )
    await renderAt('/p/ada-substack/ideas')
    await fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Tides' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Move Why rivers meander' }))
    const dialog = screen.getByRole('dialog', { name: 'Move Why rivers meander' })
    expect(within(dialog).getByRole('button', { name: 'Move idea' })).toBeDisabled() // nowhere chosen yet
    await fireEvent.update(await within(dialog).findByLabelText('Move to'), 'ada-poems')
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Move idea' })).toBeEnabled(),
    )
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Move idea' }))
    await waitFor(() =>
      expect(f.moves).toEqual([{ ids: ['i1'], to: { publicationId: 'ada-poems' } }]),
    )
  })

  it('moves them, then opens the idea where it is now', async () => {
    const f = fake()
    server.use(
      http.post('*/api/publications/ada-substack/move/ideas/preview', () =>
        HttpResponse.json({ ...preview, losingAccess: [] }),
      ),
    )
    await choose()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move 1 idea' })).toBeEnabled())
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 idea' }))
    await waitFor(() =>
      expect(f.moves).toEqual([{ ids: ['i1'], to: { publicationId: 'ada-poems' } }]),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Why rivers meander' }),
    ).toBeInTheDocument()
  })

  it('says what is in the way, and does not allow the move', async () => {
    fake()
    server.use(
      http.post('*/api/publications/ada-substack/move/ideas/preview', () =>
        HttpResponse.json({
          ...preview,
          problem: 'Ask Bob to join Poems first, or hand the draft over.',
        }),
      ),
    )
    await choose()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ask Bob to join Poems first, or hand the draft over.',
    )
    expect(screen.getByRole('button', { name: 'Move 1 idea' })).toBeDisabled()
  })

  it('says so while it checks, and when it could not', async () => {
    fake()
    server.use(
      http.post('*/api/publications/ada-substack/move/ideas/preview', () => new Promise(() => {})),
    )
    await choose()
    expect(await screen.findByText('Checking what will move…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move 1 idea' })).toBeDisabled()
  })

  it('shows why a check or a move failed', async () => {
    fake()
    server.use(
      http.post('*/api/publications/ada-substack/move/ideas/preview', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await choose()
    expect(await screen.findByRole('alert')).toHaveTextContent('Not found')
    expect(screen.getByRole('button', { name: 'Move 1 idea' })).toBeDisabled()
  })
})

describe('the old new idea page', () => {
  it('leads to the publication’s page, where Quick add starts ideas', async () => {
    server.use(signedInAs(testUser), listPublications)
    const { router } = await renderAt('/p/ada-substack/ideas/new')
    await waitFor(() => expect(router.currentRoute.value.path).toBe('/p/ada-substack'))
  })
})

describe('idea page', () => {
  // An idea is a set of pages (steps); each test opens the one it is about.
  const openAt = (path: string, extra: Parameters<typeof server.use> = []) => {
    server.use(
      signedInAs(testUser),
      listPublications,
      http.get(ideaUrl, () => HttpResponse.json(idea)),
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
      ...extra,
    )
    return renderAt(`/p/ada-substack/ideas/i1${path}`)
  }
  const open = (extra: Parameters<typeof server.use> = []) => openAt('/read', extra)

  it('shows the idea’s links on the Read step', async () => {
    await open()
    // The title opens the item's page for notes; the host name beneath it opens the article itself.
    expect(await screen.findByRole('link', { name: 'A paper' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/reading/l1',
    )
    const article = screen.getByRole('link', { name: /example\.org.*A paper/ })
    expect(article).toHaveAttribute('href', 'https://example.org/paper')
    expect(article).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('titles the Read step, and leads on to Note', async () => {
    await open()
    expect(await screen.findByRole('heading', { level: 1, name: 'Read' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Next: 03 Note/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/notes',
    )
  })

  it('shows its drafts, in order, on the Draft step, each row a link', async () => {
    await openAt('/drafts')
    expect(await screen.findByRole('link', { name: /Part 1/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/drafts/d1',
    )
  })

  it('washes a published draft green, marks it in words, links to the post beside the row, and keeps its place', async () => {
    server.use(
      http.get(ideaUrl, () =>
        HttpResponse.json({
          ...idea,
          drafts: [
            {
              id: 'd1',
              title: 'Part 1',
              updatedAt: '2026-01-02T00:00:00Z',
              editorId: 'u1',
              editorName: 'Ada',
              publishedAt: '2026-10-14T09:00:00Z',
              publishedUrl: 'https://example.com/part-1',
            },
            {
              id: 'd2',
              title: 'Part 2',
              updatedAt: '2026-01-03T00:00:00Z',
              editorId: 'u1',
              editorName: 'Ada',
              publishedAt: '2026-10-15T09:00:00Z',
              publishedUrl: null,
            },
            {
              id: 'd3',
              title: 'Part 3',
              updatedAt: '2026-01-04T00:00:00Z',
              editorId: 'u1',
              editorName: 'Ada',
              publishedAt: null,
              publishedUrl: null,
            },
          ],
        }),
      ),
      signedInAs(testUser),
      listPublications,
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/ideas/i1/drafts')
    const rows = await within(await screen.findByRole('region', { name: 'Drafts' })).findAllByRole(
      'listitem',
    )
    // The order the writer set is kept: published drafts are not moved to the bottom.
    expect(rows.map((r) => /Part \d/.exec(r.textContent ?? '')?.[0])).toEqual([
      'Part 1',
      'Part 2',
      'Part 3',
    ])
    expect(rows[0]).toHaveTextContent('Published Oct 14, 2026')
    expect(rows[1]).toHaveTextContent('Published Oct 15, 2026')
    expect(rows[2]).not.toHaveTextContent('Published')
    expect(rows[0]!.querySelector('.bg-ok-wash')).not.toBeNull()
    expect(rows[2]!.querySelector('.bg-ok-wash')).toBeNull()
    // "View post" is its own link beside the row's, only where there is a link to the post.
    const post = within(rows[0]!).getByRole('link', { name: /View post/ })
    expect(post).toHaveAttribute('href', 'https://example.com/part-1')
    expect(post).toHaveAttribute('target', '_blank')
    expect(post).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(post.closest('a')).toBe(post)
    expect(within(rows[1]!).queryByRole('link', { name: /View post/ })).toBeNull()
    expect(within(rows[0]!).getByRole('link', { name: /^Part 1/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/drafts/d1',
    )
  })

  it('names the editor of every draft on the Draft step, including your own, as the notes’ author chip does', async () => {
    server.use(
      http.get(ideaUrl, () =>
        HttpResponse.json({
          ...idea,
          drafts: [
            {
              id: 'd1',
              title: 'Mine',
              updatedAt: '2026-01-02T00:00:00Z',
              editorId: 'u1',
              editorName: 'Ada',
              publishedAt: null,
              publishedUrl: null,
            },
            {
              id: 'd2',
              title: 'Bob’s',
              updatedAt: '2026-01-03T00:00:00Z',
              editorId: 'u2',
              editorName: 'Bob',
              publishedAt: null,
              publishedUrl: null,
            },
          ],
        }),
      ),
      signedInAs(testUser),
      listPublications,
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/ideas/i1/drafts')
    const rows = await within(await screen.findByRole('region', { name: 'Drafts' })).findAllByRole(
      'listitem',
    )
    expect(rows[0]).toHaveTextContent('Mine')
    expect(rows[0]).toHaveTextContent('Editor: Ada')
    expect(rows[1]).toHaveTextContent('Bob’s')
    expect(rows[1]).toHaveTextContent('Editor: Bob')
    expect(within(rows[1]!).getByRole('link', { name: /Bob’s/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/drafts/d2',
    )
    expect(rows[1]).toHaveTextContent(/Last changed/)
  })

  it('explains when the idea cannot be opened', async () => {
    server.use(
      signedInAs(testUser),
      listPublications,
      http.get(ideaUrl, () => HttpResponse.json({ error: 'Not found' }, { status: 404 })),
    )
    await renderAt('/p/ada-substack/ideas/i1')
    expect(await screen.findByRole('alert')).toHaveTextContent("couldn't open that idea")
  })

  it('saves a change to the name', async () => {
    let sent: unknown
    await openAt('/settings', [
      http.patch(ideaUrl, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...idea, name: 'Meanders' })
      }),
    ])
    await fireEvent.update(await screen.findByLabelText("What's your core idea?"), 'Meanders')
    await fireEvent.click(screen.getByRole('button', { name: 'Save idea' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'))
    expect(sent).toEqual({ name: 'Meanders' }) // the notes have their own routes
    // The menu, which names the idea, follows the change.
    expect(within(screen.getByRole('banner')).getAllByText('Meanders').length).toBeGreaterThan(0)
  })

  it('shows why a save failed', async () => {
    await openAt('/settings', [
      http.patch(ideaUrl, () =>
        HttpResponse.json({ error: 'Describe your idea in a few words' }, { status: 400 }),
      ),
    ])
    await fireEvent.update(await screen.findByLabelText("What's your core idea?"), 'A new idea')
    await fireEvent.click(await screen.findByRole('button', { name: 'Save idea' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Describe your idea')
  })

  it('says it is loading until the idea arrives', async () => {
    let arrive: () => void = () => {}
    const held = new Promise<void>((resolve) => (arrive = resolve))
    server.use(
      signedInAs(testUser),
      listPublications,
      http.get(ideaUrl, async () => {
        await held
        return HttpResponse.json(idea)
      }),
      http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
    )
    void renderAt('/p/ada-substack/ideas/i1/settings')
    expect((await screen.findAllByText('Loading…')).length).toBeGreaterThan(0)
    arrive()
    expect(await screen.findByLabelText("What's your core idea?")).toHaveValue('Why rivers meander')
  })

  it('says it is saving on the button while the save runs', async () => {
    let finish: () => void = () => {}
    const held = new Promise<void>((resolve) => (finish = resolve))
    await openAt('/settings', [
      http.patch(ideaUrl, async () => {
        await held
        return HttpResponse.json(idea)
      }),
    ])
    await fireEvent.update(await screen.findByLabelText("What's your core idea?"), 'A new idea')
    await fireEvent.click(await screen.findByRole('button', { name: 'Save idea' }))
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
    finish()
    await screen.findByRole('button', { name: 'Save idea' })
  })

  it('says what deleting takes with it, and points to the download first', async () => {
    await openAt('/settings')
    const box = await screen.findByRole('region', { name: 'Delete idea' })
    expect(
      within(box).getByText(/This can’t be undone\. Its notes, articles and drafts go too\./),
    ).toBeInTheDocument()
    expect(within(box).getByRole('link', { name: 'Download your writing' })).toHaveAttribute(
      'href',
      '/p/ada-substack/settings/download',
    )
    expect(within(box).queryByText(/links/)).toBeNull()
  })

  it('shows a link by its title, with just its host beneath (one link per item), and by its address when it has no title', async () => {
    server.use(
      signedInAs(testUser),
      listPublications,
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
    await renderAt('/p/ada-substack/ideas/i1/read')
    const titled = await screen.findByRole('link', { name: 'A paper' })
    expect(titled).not.toHaveTextContent('https://example.org/paper')
    expect(titled.closest('li')).toHaveTextContent('example.org')
    expect(screen.getAllByRole('link', { name: 'A paper' })).toHaveLength(1) // the host's name adds the title
    const untitled = screen.getByRole('link', { name: 'https://example.org/untitled' })
    expect(untitled).toHaveAttribute('href', '/p/ada-substack/ideas/i1/reading/l2')
    expect(untitled.textContent).toContain('https://example.org/untitled')
  })

  describe('the articles', () => {
    it('is headed Articles, and says to tick off what has been read', async () => {
      await open()
      const section = (await screen.findByRole('heading', { name: 'Articles' })).closest('section')!
      expect(within(section).getByText(/Mark each one/)).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Related work' })).toBeNull()
    })

    it('shows which items are read, and where an item that was not added by hand came from', async () => {
      server.use(
        signedInAs(testUser),
        listPublications,
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
                why: 'Challenges the usual account of erosion.',
              },
            ],
          }),
        ),
      )
      await renderAt('/p/ada-substack/ideas/i1/read')
      // Read items are out of the way until asked for.
      expect(await screen.findByRole('switch', { name: 'Read: Unread one' })).not.toBeChecked()
      expect(screen.queryByRole('switch', { name: 'Read: Read one' })).not.toBeInTheDocument()
      await openFilters()
      await fireEvent.click(screen.getByRole('switch', { name: 'Show read items (1)' }))
      expect(await screen.findByRole('switch', { name: 'Read: Read one' })).toBeChecked()
      // The AI's reason is highlighted, with one line above the list saying what the highlight is.
      expect(screen.getByText('Challenges the usual account of erosion.')).toHaveClass('bg-mark')
      expect(
        screen.getByText('Highlighted text is your AI’s reason for suggesting this item.'),
      ).toHaveClass('bg-mark')
      expect(document.querySelectorAll('.bg-mark')).toHaveLength(2) // only where an AI gave a reason
      // No badge says where an item came from.
      for (const badge of [
        'Suggested in brainstorming',
        'Found by research',
        'From idea generation',
      ])
        expect(screen.queryByText(badge)).toBeNull()
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
      const box = await screen.findByRole('switch', { name: 'Read: A paper' })
      expect(box).not.toBeChecked()
      await fireEvent.click(box)
      await waitFor(() => expect(sent).toEqual([{ read: true }]))
      await waitFor(() =>
        expect(screen.getByRole('switch', { name: 'Read: A paper' })).toBeChecked(),
      )
      await fireEvent.click(screen.getByRole('switch', { name: 'Read: A paper' }))
      await waitFor(() => expect(sent).toEqual([{ read: true }, { read: false }]))
      await waitFor(() =>
        expect(screen.getByRole('switch', { name: 'Read: A paper' })).not.toBeChecked(),
      )
    })

    it('says so when it could not be saved, and leaves the item as it was', async () => {
      await open([
        http.put(`${ideaUrl}/links/l1/read`, () =>
          HttpResponse.json({ error: 'boom' }, { status: 500 }),
        ),
      ])
      await fireEvent.click(await screen.findByRole('switch', { name: 'Read: A paper' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, we couldn’t save that')
      expect(screen.getByRole('switch', { name: 'Read: A paper' })).not.toBeChecked()
    })
  })

  describe('adding a link', () => {
    it('sends just the address, then shows the link and clears the field', async () => {
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
      await fireEvent.update(await screen.findByLabelText('Web address'), 'example.org/new')
      await fireEvent.click(screen.getByRole('button', { name: 'Add article' }))

      await waitFor(() => expect(screen.getByLabelText('Web address')).toHaveValue(''))
      expect(sent).toEqual({ url: 'example.org/new' })
      expect(await screen.findByRole('link', { name: 'Fetched title' })).toBeInTheDocument()
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
        await fireEvent.click(screen.getByRole('button', { name: 'Add article' }))

        const hint = await screen.findByText(message)
        expect(hint).toHaveClass('text-danger')
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
      await fireEvent.click(screen.getByRole('button', { name: 'Add article' }))
      await screen.findByText('That link is already in this idea.')
      await fireEvent.update(field, 'example.org/paper2')
      expect(screen.queryByText('That link is already in this idea.')).toBeNull()
      expect(field).not.toHaveAttribute('aria-invalid')
    })
  })

  describe('tags on links', () => {
    const tagged = {
      ...idea,
      links: [
        { ...idea.links[0]!, tags: ['background', 'part 2'] },
        {
          id: 'l2',
          url: 'https://example.org/other',
          title: 'Other',
          readAt: null,
          origin: 'entered',
          tags: [],
        },
        {
          id: 'l3',
          url: 'https://example.org/third',
          title: 'Third',
          readAt: null,
          origin: 'entered',
          tags: ['Background'],
        },
      ],
    }

    /** The usual idea page, but with the tagged links (a test's own handlers come first). */
    const openTagged = (extra: Parameters<typeof server.use> = []) => {
      server.use(
        ...extra,
        signedInAs(testUser),
        listPublications,
        http.get(ideaUrl, () => HttpResponse.json(tagged)),
        http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
      )
      return renderAt('/p/ada-substack/ideas/i1/read')
    }

    it('shows each link’s tags, and a filter once any link has one', async () => {
      await openTagged()
      await screen.findByRole('link', { name: 'A paper' })
      expect(screen.getAllByRole('list', { name: 'Tags' })).toHaveLength(2)
      await openFilters()
      const select = screen.getByRole('combobox', { name: 'Filter by tag' })
      expect(await suggestedTags(select)).toEqual([
        'background', // "Background" and "background" are one tag
        'part 2',
      ])
      await chooseTag(select, 'part 2')
      expect(screen.getByRole('link', { name: 'A paper' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Other' })).toBeNull()
      // Tags narrow the list: an item needs all of them.
      await chooseTag(select, 'background')
      expect(screen.getByRole('link', { name: 'A paper' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Third' })).toBeNull()
      await fireEvent.click(screen.getByRole('button', { name: 'Stop filtering by part 2' }))
      expect(screen.getByRole('link', { name: 'Third' })).toBeInTheDocument()
      await fireEvent.click(screen.getByRole('button', { name: 'Stop filtering by background' }))
      expect(screen.getByRole('link', { name: 'Other' })).toBeInTheDocument()
    })

    it('folds the filters behind a funnel button, which says what is filtering while they are closed', async () => {
      await openTagged()
      await screen.findByRole('link', { name: 'A paper' })
      const funnel = screen.getByRole('button', { name: 'Filter' })
      expect(funnel).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByRole('combobox', { name: 'Filter by tag' })).toBeNull()
      await fireEvent.click(funnel)
      expect(funnel).toHaveAttribute('aria-expanded', 'true')
      await chooseTag(screen.getByRole('combobox', { name: 'Filter by tag' }), 'part 2')
      await fireEvent.click(screen.getByRole('button', { name: 'Close the filters' }))
      expect(screen.queryByRole('combobox', { name: 'Filter by tag' })).toBeNull()
      // Still filtering, and the header says so.
      expect(screen.getByRole('button', { name: 'Filter (on: part 2)' })).toBeInTheDocument()
      expect(screen.getByText('part 2', { selector: '.chip' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Other' })).toBeNull()
    })

    it('selects only the links showing, not the ones a filter hides', async () => {
      await openTagged()
      await screen.findByRole('link', { name: 'A paper' })
      await openFilters()
      await chooseTag(screen.getByRole('combobox', { name: 'Filter by tag' }), 'background')
      await fireEvent.click(screen.getByRole('checkbox', { name: 'Select all items on this page' }))
      expect(screen.getByText('2 selected')).toBeInTheDocument() // A paper and Third, not Other
      expect(screen.getByRole('checkbox', { name: 'Select A paper' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Select Third' })).toBeChecked()
      expect(screen.queryByRole('checkbox', { name: 'Select Other' })).toBeNull()
    })

    it('has no filter, and no funnel, while nothing is tagged or read', async () => {
      await open()
      await screen.findByRole('link', { name: 'A paper' })
      expect(screen.queryByRole('combobox', { name: 'Filter by tag' })).toBeNull()
      expect(screen.queryByRole('button', { name: /^Filter/ })).toBeNull()
    })

    it('adds and removes a link’s tags under it, one at a time, saving each', async () => {
      const sent: string[][] = []
      await openTagged([
        http.put(`${ideaUrl}/links/l1/tags`, async ({ request }) => {
          const tags = ((await request.json()) as { tags: string[] }).tags
          sent.push(tags)
          return HttpResponse.json({
            ...tagged,
            links: [{ ...tagged.links[0]!, tags }, ...tagged.links.slice(1)],
          })
        }),
      ])
      await fireEvent.click(await screen.findByRole('button', { name: 'Add tags to A paper' }))
      const field = screen.getByLabelText('Add a tag to A paper')
      await fireEvent.update(field, 'new one')
      await fireEvent.keyDown(field, { key: 'Enter' })
      await waitFor(() => expect(sent).toEqual([['background', 'part 2', 'new one']]))
      expect(field).toHaveValue('')
      await fireEvent.click(
        screen.getByRole('button', { name: 'Remove the tag background from A paper' }),
      )
      await waitFor(() => expect(sent.at(-1)).toEqual(['part 2', 'new one']))
      await fireEvent.click(screen.getByRole('button', { name: 'Done tagging A paper' }))
      expect(screen.queryByLabelText('Add a tag to A paper')).toBeNull()
      expect(
        within(screen.getAllByRole('list', { name: 'Tags' })[0]!).getByText('new one'),
      ).toBeInTheDocument()
    })

    it('is not part of the edit form any more, which is for the address and title', async () => {
      await openTagged()
      await fireEvent.click(await screen.findByRole('button', { name: 'Edit A paper' }))
      expect(screen.queryByLabelText(/^Tags for/)).toBeNull()
      expect(screen.getByLabelText('Title of this item (optional)')).toBeInTheDocument()
    })

    it('says why a tag could not be saved, and takes it off again', async () => {
      await openTagged([
        http.put(`${ideaUrl}/links/l1/tags`, () =>
          HttpResponse.json({ error: 'Use 10 tags or fewer on a note' }, { status: 400 }),
        ),
      ])
      await fireEvent.click(await screen.findByRole('button', { name: 'Add tags to A paper' }))
      const field = screen.getByLabelText('Add a tag to A paper')
      await fireEvent.update(field, 'a')
      await fireEvent.keyDown(field, { key: 'Enter' })
      expect(await screen.findByText('Use 10 tags or fewer on a note')).toHaveClass('text-danger')
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Remove the tag a from A paper' })).toBeNull(),
      )
    })
  })

  describe('tagging several links at once', () => {
    const two = {
      ...idea,
      links: [
        { ...idea.links[0]!, tags: ['background'] },
        {
          id: 'l2',
          url: 'https://example.org/other',
          title: 'Other',
          readAt: null,
          origin: 'entered',
          tags: [],
        },
        {
          id: 'l3',
          url: 'https://example.org/third',
          title: 'Third',
          readAt: null,
          origin: 'entered',
          tags: [],
        },
      ],
    }
    /** The idea page with these links; `extra` handlers come first. */
    const openWith = (data: typeof two, extra: Parameters<typeof server.use> = []) => {
      server.use(
        ...extra,
        signedInAs(testUser),
        listPublications,
        http.get(ideaUrl, () => HttpResponse.json(data)),
        http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
      )
      return renderAt('/p/ada-substack/ideas/i1/read')
    }
    const tick = (title: string) => screen.getByRole('checkbox', { name: `Select ${title}` })
    const tagButton = () => screen.getByRole('button', { name: 'Tag…' })

    it('has Tag… in the header only once links are selected', async () => {
      await openWith(two)
      await screen.findByRole('link', { name: 'A paper' })
      expect(screen.queryByRole('button', { name: 'Tag…' })).toBeNull()
      await fireEvent.click(tick('A paper'))
      expect(tagButton()).toBeEnabled()
    })

    it('adds and removes tags on all the selected links in one request, and shows them', async () => {
      const sent: unknown[] = []
      await openWith(two, [
        http.post(`${ideaUrl}/links/tags`, async ({ request }) => {
          const change = (await request.json()) as {
            ids: string[]
            add: string[]
            remove: string[]
          }
          sent.push(change)
          return HttpResponse.json({
            ...two,
            links: two.links.map((l) =>
              change.ids.includes(l.id)
                ? {
                    ...l,
                    tags: [...l.tags.filter((t) => !change.remove.includes(t)), ...change.add],
                  }
                : l,
            ),
          })
        }),
      ])
      await screen.findByRole('link', { name: 'A paper' })
      await fireEvent.click(tick('A paper'))
      await fireEvent.click(tick('Other'))
      await fireEvent.click(tagButton())
      const panel = screen.getByRole('form', { name: 'Tag 2 items' })
      const drop = within(panel).getByRole('button', { name: 'Remove “background”' })
      expect(drop).toHaveAttribute('title', 'On 1 of the 2 selected')
      await fireEvent.click(drop)
      await fireEvent.update(screen.getByLabelText('Add a tag'), 'part 2')
      await fireEvent.keyDown(screen.getByLabelText('Add a tag'), { key: 'Enter' })
      await fireEvent.click(screen.getByRole('button', { name: 'Tag 2 items' }))
      await waitFor(() =>
        expect(sent).toEqual([{ ids: ['l1', 'l2'], add: ['part 2'], remove: ['background'] }]),
      )
      await waitFor(() => expect(screen.queryByLabelText('Add a tag')).toBeNull())
      expect(screen.getAllByRole('list', { name: 'Tags' })).toHaveLength(2)
      expect(screen.getByText('Tagged 2 items.')).toBeInTheDocument()
      expect(screen.getByText('2 selected')).toBeInTheDocument() // the header is back, with the choice kept
    })

    it("shows the server's reason, and keeps the panel and the words", async () => {
      await openWith(two, [
        http.post(`${ideaUrl}/links/tags`, () =>
          HttpResponse.json({ error: 'A link can have up to 10 tags' }, { status: 409 }),
        ),
      ])
      await screen.findByRole('link', { name: 'A paper' })
      await fireEvent.click(tick('A paper'))
      await fireEvent.click(tagButton())
      await fireEvent.update(screen.getByLabelText('Add a tag'), 'x')
      await fireEvent.keyDown(screen.getByLabelText('Add a tag'), { key: 'Enter' })
      await fireEvent.click(screen.getByRole('button', { name: 'Tag 1 item' }))
      expect(await screen.findByText('A link can have up to 10 tags')).toBeInTheDocument()
      expect(screen.getByRole('list', { name: 'Tags to add' })).toHaveTextContent('x')
    })

    it('works for the publication’s own list too, and one form replaces the other', async () => {
      const sent: unknown[] = []
      server.use(
        signedInAs(testUser),
        listPublications,
        http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
        http.get('*/api/publications/ada-substack/reading', () => HttpResponse.json(two.links)),
        http.post('*/api/publications/ada-substack/reading/tags', async ({ request }) => {
          sent.push(await request.json())
          return HttpResponse.json(two.links)
        }),
      )
      await renderAt('/p/ada-substack/read')
      await screen.findByRole('link', { name: 'A paper' })
      await fireEvent.click(tick('Other'))
      await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
      expect(screen.queryByRole('button', { name: 'Tag…' })).toBeNull() // the move form has the header
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      await fireEvent.click(tagButton())
      expect(screen.queryByLabelText('Move to')).toBeNull()
      await fireEvent.update(screen.getByLabelText('Add a tag'), 'later')
      await fireEvent.keyDown(screen.getByLabelText('Add a tag'), { key: 'Enter' })
      await fireEvent.click(screen.getByRole('button', { name: 'Tag 1 item' }))
      await waitFor(() => expect(sent).toEqual([{ ids: ['l2'], add: ['later'], remove: [] }]))
    })
  })

  describe('editing a link', () => {
    const edit = async () => {
      await fireEvent.click(await screen.findByRole('button', { name: 'Edit A paper' }))
      return {
        address: screen.getByLabelText('Web address of this item'),
        title: screen.getByLabelText('Title of this item (optional)'),
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
      await fireEvent.click(screen.getByRole('button', { name: 'Save item' }))

      expect(await screen.findByRole('link', { name: 'Better title' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/reading/l1',
      )
      expect(screen.getByRole('link', { name: /example\.org.*Better title/ })).toHaveAttribute(
        'href',
        'https://example.org/better',
      )
      expect(sent).toEqual({ url: 'example.org/better', title: 'Better title' })
      // Back to reading the list, with focus returned to the Edit button.
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Edit Better title' })).toHaveFocus(),
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
      await fireEvent.click(screen.getByRole('button', { name: 'Save item' }))
      const hint = await screen.findByText('That link is already in this idea.')
      expect(hint).toHaveClass('text-danger')
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
      expect(screen.queryByLabelText('Web address of this item')).toBeNull()
      expect(screen.getByRole('link', { name: 'A paper' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/reading/l1',
      )

      await fireEvent.click(screen.getByRole('button', { name: 'Edit A paper' }))
      await fireEvent.keyDown(screen.getByLabelText('Web address of this item'), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Save item' })).toBeNull())
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
    // Removing is held, like deleting anything that can't be got back; a screen reader's activation asks twice.
    const remove = await screen.findByRole('button', { name: 'Remove A paper' })
    await fireEvent.click(remove)
    expect(removed).toBe(false)
    await fireEvent.click(remove)
    await waitFor(() => expect(removed).toBe(true))
  })

  it('adds a draft and opens it', async () => {
    let sent: unknown
    await openAt('/drafts', [
      http.post(`${ideaUrl}/drafts`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          {
            id: 'd2',
            publicationId: 'ada-substack',
            ideaId: 'i1',
            title: 'Untitled',
            body: '',
            editorId: 'u1',
            editorName: 'Ada Lovelace',
            version: 1,
            publishedAt: null,
            publishedUrl: null,
            createdAt: '2026-01-03T00:00:00Z',
            updatedAt: '2026-01-03T00:00:00Z',
          },
          { status: 201 },
        )
      }),
      http.get('*/api/publications/ada-substack/drafts/d2', () =>
        HttpResponse.json({
          id: 'd2',
          publicationId: 'ada-substack',
          ideaId: 'i1',
          title: 'Untitled',
          body: '',
          editorId: 'u1',
          editorName: 'Ada Lovelace',
          version: 1,
          publishedAt: null,
          publishedUrl: null,
          createdAt: '2026-01-03T00:00:00Z',
          updatedAt: '2026-01-03T00:00:00Z',
        }),
      ),
    ])
    await fireEvent.click(await screen.findByRole('button', { name: 'New draft' }))
    // The new draft opens in the editor, which links back to the idea's drafts.
    expect(await screen.findByRole('link', { name: '← All drafts' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/drafts',
    )
    expect(sent).toEqual({})
  })

  describe('notes', () => {
    const open = (extra: Parameters<typeof server.use> = []) => openAt('/notes', extra)
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
        bulkTagged: [] as { ids: string[]; add: string[]; remove: string[] }[],
        merged: [] as string[][],
        split: [] as { id: string; before: string; after: string }[],
      }
      server.use(
        http.get(notesUrl, () => HttpResponse.json(state.notes)),
        http.post(notesUrl, async ({ request }) => {
          const body = (await request.json()) as { text: string; first?: boolean }
          state.sent.push(body)
          const created = note(`n${state.notes.length + 1}`, body.text.trim())
          state.notes = body.first ? [created, ...state.notes] : [...state.notes, created]
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
        http.post(`${notesUrl}/tags`, async ({ request }) => {
          const { ids, add, remove } = (await request.json()) as {
            ids: string[]
            add: string[]
            remove: string[]
          }
          state.bulkTagged.push({ ids, add, remove })
          state.notes = state.notes.map((n) =>
            ids.includes(n.id)
              ? {
                  ...n,
                  tags: [
                    ...n.tags.filter(
                      (t) => !remove.some((r) => r.toLowerCase() === t.toLowerCase()),
                    ),
                    ...add.filter((a) => !n.tags.some((t) => t.toLowerCase() === a.toLowerCase())),
                  ],
                }
              : n,
          )
          return HttpResponse.json(state.notes)
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
      expectOrigin(items[1]!, 'From conversation with your AI', 'Ada')
      // It goes to this idea’s Refine page.
      const chat = within(items[1]!).getByRole('link', { name: 'conversation with your AI' })
      expect(chat).toHaveAttribute('href', expect.stringMatching(/\/refine$/))
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
      expectOrigin(items[1]!, 'From A paper', 'Ada')
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
      expectOrigin(items[0]!, 'From A paper', 'Ada')
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
      expectOrigin(items[1]!, 'From conversation with their AI', 'A former member')
    })

    it('names the author of a note whose account is gone when they chose to leave their name (#153)', async () => {
      fakeNotes([{ ...note('n1', 'Still credited.', 'entered', 'Bob'), authorId: null }])
      await open()
      await screen.findByText('Still credited.')
      expectOrigin(within(region()).getAllByRole('listitem')[0]!, 'Added', 'Bob')
      expect(screen.queryByText('A former member')).toBeNull()
    })

    it('says so when there are no notes, with no link to a list of articles of its own', async () => {
      await open()
      expect(await screen.findByText(/^No notes yet\. Add one above\.$/)).toBeInTheDocument()
    })

    it('has the add form above the list, and leads on to Refine with just the button', async () => {
      fakeNotes()
      await open()
      const box = await screen.findByRole('textbox', { name: 'Note' })
      expect(
        box.compareDocumentPosition(within(region()).getAllByRole('list')[0]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
      const next = within(screen.getByRole('navigation', { name: 'Next step' }))
      expect(next.getByRole('link', { name: /Next: 04 Refine/ })).toBeInTheDocument()
      expect(screen.queryByText(/Happy with the notes/)).toBeNull()
    })

    describe('in tutorial mode', () => {
      // The route 'idea-notes' is this kind of page (see tutorial-routes.test.ts).
      const tutorial = async (on: boolean) => {
        fakeNotes()
        // Set up in full here: `open` puts its own signed-in user ahead of any handler passed to it.
        server.use(
          signedInAs(on ? { ...testUser, tutorialMode: true } : testUser),
          listPublications,
          http.get(ideaUrl, () => HttpResponse.json(idea)),
          http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
        )
        await renderAt('/p/ada-substack/ideas/i1/notes')
        await screen.findByText('Erosion loops.')
      }

      it('writes out what the notes are, and that they can be tagged, put in order and moved', async () => {
        await tutorial(true)
        expect(
          screen.getByText(
            /^These are the notes for this idea\. You can add tags to help group them, drag them into order, and move them to other ideas\.$/,
          ),
        ).toBeVisible()
      })

      it('says nothing of it when it is off', async () => {
        await tutorial(false)
        expect(screen.queryByText(/These are the notes for this idea/)).toBeNull()
      })
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

    it('adds a note at the top, under the form, and clears the box ready for the next', async () => {
      const state = fakeNotes()
      await open()
      await screen.findByText('Erosion loops.')
      const box = screen.getByRole('textbox', { name: 'Note' })
      expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled() // nothing to add yet
      await fireEvent.update(box, 'Oxbow lakes form when a loop is cut off.')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))

      expect(
        await screen.findByText('Oxbow lakes form when a loop is cut off.'),
      ).toBeInTheDocument()
      expect(state.sent).toEqual([
        { text: 'Oxbow lakes form when a loop is cut off.', first: true },
      ])
      expect(texts()[0]).toBe('Oxbow lakes form when a loop is cut off.')
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
      const box = await screen.findByRole('textbox', { name: 'Note' })
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
      expect(await screen.findByText('Delete?')).toBeInTheDocument()
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
        expect(within(region()).queryByRole('combobox', { name: 'Filter by tag' })).toBeNull()
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

      it('can be used to narrow the notes to those with all the chosen tags (ignoring case), and then to all again', async () => {
        fakeNotes(tagged())
        await open()
        await screen.findByText('Erosion loops.')
        await openFilters()
        const select = within(region()).getByRole('combobox', { name: 'Filter by tag' })
        // Each tag once, whatever its case, and no "All".
        expect(await suggestedTags(select)).toEqual(['intro', 'draft 2'])

        await chooseTag(select, 'intro')
        expect(texts()).toEqual(['Erosion loops.', 'Oxbow lakes.'])
        await chooseTag(select, 'draft 2')
        // A note needs both tags.
        expect(texts()).toEqual(['Erosion loops.'])
        await fireEvent.click(
          within(region()).getByRole('button', { name: 'Stop filtering by intro' }),
        )
        expect(texts()).toEqual(['Erosion loops.', 'Deposition inside the bend.'])
        await fireEvent.click(
          within(region()).getByRole('button', { name: 'Stop filtering by draft 2' }),
        )
        expect(texts()).toHaveLength(4)
      })

      it('says so when no note has all the chosen tags', async () => {
        fakeNotes([
          { ...note('n1', 'Erosion loops.'), tags: ['intro'] },
          { ...note('n2', 'Oxbow lakes.'), tags: ['draft 2'] },
        ])
        await open()
        await screen.findByText('Erosion loops.')
        await openFilters()
        const select = within(region()).getByRole('combobox', { name: 'Filter by tag' })
        await chooseTag(select, 'draft 2')
        await chooseTag(select, 'intro')
        expect(screen.getByText('No notes have all these tags.')).toBeInTheDocument()
      })

      it('lets the notes shown be put in order, leaving the hidden ones where they were', async () => {
        const api = fakeNotes(tagged())
        await open()
        await screen.findByText('Erosion loops.')
        await openFilters()
        await chooseTag(
          within(region()).getByRole('combobox', { name: 'Filter by tag' }),
          'draft 2',
        )
        await showArrows()
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
        await openFilters()
        await chooseTag(within(region()).getByRole('combobox', { name: 'Filter by tag' }), 'solo')
        expect(texts()).toEqual(['Only one.'])
        await fireEvent.click(
          screen.getByRole('button', { name: /^Add tags to note “Only one\.”/ }),
        )
        await fireEvent.click(
          screen.getByRole('button', { name: /^Remove the tag solo from note “Only one\.”/ }),
        )
        await waitFor(() => expect(texts()).toEqual(['Only one.', 'Other.']))
        expect(within(region()).queryByRole('combobox', { name: 'Filter by tag' })).toBeNull()
      })

      it('are added one at a time under the note: Enter saves a tag and keeps the field, the tick closes it', async () => {
        const api = fakeNotes(tagged())
        await open()
        const opener = await screen.findByRole('button', { name: /^Add tags to note “Deposition/ })
        await fireEvent.click(opener)
        const field = screen.getByLabelText(/^Add a tag to note “Deposition/)
        await waitFor(() => expect(field).toHaveFocus())
        await fireEvent.update(field, '  Part   three ')
        await fireEvent.keyDown(field, { key: 'Enter' })
        await waitFor(() =>
          expect(api.tagged).toEqual([{ id: 'n2', tags: ['draft 2', 'Part three'] }]),
        )
        expect(field).toHaveValue('') // emptied, and still there for the next
        expect(field).toHaveFocus()
        await fireEvent.update(field, 'PART THREE')
        await fireEvent.keyDown(field, { key: 'Enter' }) // already there, ignoring case
        await fireEvent.update(field, 'a, b')
        await fireEvent.keyDown(field, { key: 'Enter' }) // a comma separates too
        await waitFor(() =>
          expect(api.tagged.at(-1)).toEqual({
            id: 'n2',
            tags: ['draft 2', 'Part three', 'a', 'b'],
          }),
        )
        await fireEvent.click(
          screen.getByRole('button', { name: /^Done tagging note “Deposition/ }),
        )
        expect(screen.queryByLabelText(/^Add a tag to note/)).toBeNull()
        expect(
          await screen.findByRole('button', { name: /^Add tags to note “Deposition/ }),
        ).toHaveFocus()
        expect(api.sent).toEqual([]) // no text was sent
      })

      it('can be taken off again while the field is open', async () => {
        const api = fakeNotes(tagged())
        await open()
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Add tags to note “Deposition/ }),
        )
        await fireEvent.click(
          screen.getByRole('button', { name: /^Remove the tag draft 2 from note “Deposition/ }),
        )
        await waitFor(() => expect(api.tagged).toEqual([{ id: 'n2', tags: [] }]))
      })

      it('also tag a quotation, whose words cannot be edited', async () => {
        const api = fakeNotes([{ ...note('n9', 'Exact words.', 'reading'), quote: true }])
        await open()
        await screen.findByText('Exact words.')
        expect(screen.queryByRole('button', { name: /^Edit note/ })).toBeNull()
        await fireEvent.click(
          screen.getByRole('button', { name: /^Add tags to note “Exact words/ }),
        )
        const field = screen.getByLabelText(/^Add a tag to note “Exact words/)
        await fireEvent.update(field, 'cited')
        await fireEvent.keyDown(field, { key: 'Enter' })
        await waitFor(() => expect(api.tagged).toEqual([{ id: 'n9', tags: ['cited'] }]))
      })

      it('offer the tags already used as the person types', async () => {
        fakeNotes(tagged())
        await open()
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Add tags to note “Untagged/ }),
        )
        const options = [...document.querySelectorAll('datalist option')].map((o) =>
          o.getAttribute('value'),
        )
        expect(options).toEqual(['intro', 'draft 2'])
      })

      it('say why a tag was refused, and take it off the note again', async () => {
        fakeNotes(tagged())
        server.use(
          http.put(`${notesUrl}/n3/tags`, () =>
            HttpResponse.json({ error: 'Use 10 tags or fewer on a note' }, { status: 400 }),
          ),
        )
        await open()
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Add tags to note “Untagged/ }),
        )
        const field = screen.getByLabelText(/^Add a tag to note “Untagged/)
        await fireEvent.update(field, 'a')
        await fireEvent.keyDown(field, { key: 'Enter' })
        expect(await screen.findByText('Use 10 tags or fewer on a note')).toBeInTheDocument()
        await waitFor(() =>
          expect(
            screen.queryByRole('button', { name: /^Remove the tag a from note “Untagged/ }),
          ).toBeNull(),
        )
      })

      it('stop at ten, saying so, without asking the server', async () => {
        const full = Array.from({ length: 10 }, (_, i) => `t${i}`)
        const api = fakeNotes([{ ...note('n1', 'Full.'), tags: full }])
        await open()
        await fireEvent.click(
          await screen.findByRole('button', { name: /^Add tags to note “Full/ }),
        )
        const field = screen.getByLabelText(/^Add a tag to note “Full/)
        await fireEvent.update(field, 'eleven')
        await fireEvent.keyDown(field, { key: 'Enter' })
        expect(await screen.findByText(/Use 10 tags or fewer/)).toBeInTheDocument()
        expect(api.tagged).toEqual([])
      })
    })

    describe('tagging several at once', () => {
      const tick = (start: string) =>
        screen.getByRole('checkbox', { name: new RegExp(`^Select note “${start}`) })
      const tagButton = () => screen.getByRole('button', { name: 'Tag…' })
      const tagged = (tags: string[]) => ({ ...note('n1', 'Erosion loops.'), tags })
      const enter = async (text: string) => {
        const field = screen.getByLabelText('Add a tag')
        await fireEvent.update(field, text)
        await fireEvent.keyDown(field, { key: 'Enter' })
      }

      it('has Tag… in the header only once notes are selected', async () => {
        fakeNotes()
        await open()
        await screen.findByText('Erosion loops.')
        expect(screen.queryByRole('button', { name: 'Tag…' })).toBeNull()
        await fireEvent.click(tick('Erosion'))
        expect(tagButton()).toBeEnabled()
      })

      it('adds tags to every selected note and keeps the selection', async () => {
        const api = fakeNotes([tagged(['intro']), ...three.slice(1)])
        await open()
        await screen.findByText('Erosion loops.')
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tick('Deposition'))
        await fireEvent.click(tagButton())
        const send = () => screen.getByRole('button', { name: 'Tag 2 notes' })
        expect(send()).toBeDisabled() // nothing to do yet
        await enter('Part 2')
        await enter('intro')
        await fireEvent.click(send())
        await waitFor(() =>
          expect(api.bulkTagged).toEqual([
            { ids: ['n1', 'n2'], add: ['Part 2', 'intro'], remove: [] },
          ]),
        )
        // Shown on the notes, the panel closes, and the two are still selected.
        expect(await screen.findAllByText('Part 2')).not.toHaveLength(0)
        await waitFor(() => expect(screen.queryByLabelText('Add a tag')).toBeNull())
        expect(screen.getByText('2 selected')).toBeInTheDocument()
        expect(screen.getByText('Tagged 2 notes.')).toBeInTheDocument()
      })

      it('offers the tags already used, and a switch for each tag the selection carries', async () => {
        const api = fakeNotes([
          tagged(['intro', 'draft']),
          { ...note('n2', 'Deposition inside the bend.'), tags: ['intro'] },
          note('n3', 'A quote from the paper.'),
        ])
        await open()
        await screen.findByText('Erosion loops.')
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tick('Deposition'))
        await fireEvent.click(tagButton())
        expect(
          [...document.querySelectorAll('datalist option')].map((o) => o.getAttribute('value')),
        ).toEqual(['intro', 'draft'])
        await enter('draft')
        const panel = screen.getByRole('form', { name: 'Tag 2 notes' })
        const drop = within(panel).getByRole('button', { name: 'Remove “intro”' })
        expect(drop).toHaveAttribute('title', 'On 2 of the 2 selected')
        expect(within(panel).getByRole('button', { name: 'Remove “draft”' })).toHaveAttribute(
          'title',
          'On 1 of the 2 selected',
        )
        expect(drop).toHaveAttribute('aria-pressed', 'false')
        await fireEvent.click(drop)
        expect(drop).toHaveAttribute('aria-pressed', 'true')
        await fireEvent.click(screen.getByRole('button', { name: 'Tag 2 notes' }))
        await waitFor(() =>
          expect(api.bulkTagged).toEqual([
            { ids: ['n1', 'n2'], add: ['draft'], remove: ['intro'] },
          ]),
        )
      })

      it('cancels without changing anything', async () => {
        const api = fakeNotes()
        await open()
        await screen.findByText('Erosion loops.')
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tagButton())
        await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByLabelText('Add a tag')).toBeNull()
        expect(api.bulkTagged).toEqual([])
      })

      it("shows the server's reason when it can't, and keeps the panel and the words", async () => {
        fakeNotes()
        server.use(
          http.post(`${notesUrl}/tags`, () =>
            HttpResponse.json({ error: 'A note can have up to 10 tags' }, { status: 409 }),
          ),
        )
        await open()
        await screen.findByText('Erosion loops.')
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tagButton())
        await enter('x')
        await fireEvent.click(screen.getByRole('button', { name: 'Tag 1 note' }))
        expect(await screen.findByText('A note can have up to 10 tags')).toBeInTheDocument()
        expect(screen.getByRole('list', { name: 'Tags to add' })).toHaveTextContent('x')
        await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.getByText('1 selected')).toBeInTheDocument() // the choice is kept
      })

      it('takes over the header: the other actions go while its form is open, and come back on cancel', async () => {
        fakeNotes()
        await open()
        await screen.findByText('Erosion loops.')
        await fireEvent.click(tick('Erosion'))
        for (const name of ['Tag…', 'Merge', 'Move to…', 'Delete 1'])
          expect(screen.getByRole('button', { name })).toBeInTheDocument()
        await fireEvent.click(tagButton())
        expect(screen.getByLabelText('Add a tag')).toBeInTheDocument()
        for (const name of ['Tag…', 'Merge', 'Move to…', 'Delete 1'])
          expect(screen.queryByRole('button', { name })).toBeNull()
        await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
        expect(screen.getByRole('button', { name: 'Move to…' })).toBeInTheDocument()
        await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
        expect(await screen.findByLabelText('Move 1 note to')).toBeInTheDocument()
        expect(screen.queryByLabelText('Add a tag')).toBeNull()
      })

      it('closes the form when the selection empties, and explains itself behind an info icon', async () => {
        fakeNotes()
        await open()
        await screen.findByText('Erosion loops.')
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tagButton())
        expect(
          screen.getByRole('button', { name: 'About tagging several at once' }),
        ).toHaveAccessibleDescription(/up to 10 each/)
        await fireEvent.click(tick('Erosion')) // deselect it
        await waitFor(() => expect(screen.queryByLabelText('Add a tag')).toBeNull())
      })
    })

    describe('merging and splitting', () => {
      const quote = () => ({ ...note('n9', 'Exact words.', 'reading'), quote: true })
      const tick = (start: string) =>
        screen.getByRole('checkbox', { name: new RegExp(`^Select note “${start}`) })
      const merge = () => screen.getByRole('button', { name: 'Merge' })

      it('has Merge in the header once something is selected, and only enabled for two or more notes', async () => {
        fakeNotes([note('n1', 'Only one.'), note('n2', 'Another.')])
        await open()
        await screen.findByText('Only one.')
        expect(screen.queryByRole('button', { name: 'Merge' })).toBeNull()
        await fireEvent.click(tick('Only one'))
        expect(merge()).toBeDisabled()
        await fireEvent.click(tick('Another'))
        expect(merge()).toBeEnabled()
      })

      it('merges the selected notes into one, and clears the selection', async () => {
        const api = fakeNotes([...three, quote()])
        await open()
        await screen.findAllByRole('checkbox', { name: /^Select note/ })
        expect(screen.getAllByRole('checkbox', { name: /^Select note/ })).toHaveLength(4) // quotation too
        await fireEvent.click(tick('Deposition'))
        await fireEvent.click(tick('Erosion'))
        expect(screen.getByText('2 selected')).toBeInTheDocument()
        await fireEvent.click(merge())

        await waitFor(() => expect(api.merged).toEqual([['n1', 'n2']]))
        await waitFor(() => expect(texts()).toHaveLength(3))
        expect(texts()[0]).toContain('Erosion loops.')
        expect(await screen.findByText('0 selected')).toBeInTheDocument()
      })

      it('will not merge a quotation, which must stay as written, and says why', async () => {
        fakeNotes([...three, quote()])
        await open()
        await screen.findAllByRole('checkbox', { name: /^Select note/ })
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tick('Exact'))
        expect(merge()).toBeDisabled()
        expect(merge()).toHaveAttribute(
          'title',
          expect.stringMatching(/Quotations must stay as written/),
        )
      })

      it("shows the server's reason when notes can't be merged, and keeps the choice", async () => {
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
        await screen.findAllByRole('checkbox', { name: /^Select note/ })
        await fireEvent.click(tick('Erosion'))
        await fireEvent.click(tick('Deposition'))
        await fireEvent.click(merge())
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
        await showArrows()
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
        await showArrows()
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
        await showArrows()
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
        await showArrows()
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
        await showArrows()
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
        {
          id: 'd1',
          title: 'Part 1',
          updatedAt: '2026-01-02T00:00:00Z',
          editorId: 'u1',
          editorName: 'Ada',
          publishedAt: null,
          publishedUrl: null,
        },
        {
          id: 'd2',
          title: 'Part 2',
          updatedAt: '2026-01-03T00:00:00Z',
          editorId: 'u1',
          editorName: 'Ada',
          publishedAt: null,
          publishedUrl: null,
        },
        {
          id: 'd3',
          title: '',
          updatedAt: '2026-01-04T00:00:00Z',
          editorId: 'u1',
          editorName: 'Ada',
          publishedAt: null,
          publishedUrl: null,
        },
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
        listPublications,
        http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
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
      await renderAt('/p/ada-substack/ideas/i1/drafts')
      await showArrows()
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
      await renderAt('/p/ada-substack/ideas/i1/drafts')
      await showArrows()
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
      await renderAt('/p/ada-substack/ideas/i1/drafts')
      await showArrows()
      expect(await screen.findByRole('button', { name: 'Move Part 1 up' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Untitled down' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Move Part 2 up' })).toBeEnabled()
    })

    it('drags a draft by its grip', async () => {
      const fake = fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1/drafts')
      await showArrows()
      await screen.findByRole('button', { name: 'Move Part 1 up' })
      const items = within(screen.getByRole('region', { name: 'Drafts' })).getAllByRole('listitem')
      const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }
      await fireEvent.dragStart(items[2]!.querySelector('[data-testid="rail"]')!, { dataTransfer })
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
      await renderAt('/p/ada-substack/ideas/i1/drafts')
      await showArrows()
      await fireEvent.click(await screen.findByRole('button', { name: 'Move Part 2 up' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('The drafts have changed.')
    })

    it('says what a draft is only in tutorial mode', async () => {
      fakeIdea()
      await renderAt('/p/ada-substack/ideas/i1/drafts')
      await screen.findByText('Part 1')
      expect(screen.queryByText(/A draft is one piece of writing/)).toBeNull()
      expect(screen.queryByRole('button', { name: 'More information' })).toBeNull()
    })

    it('writes out what a draft is in tutorial mode', async () => {
      fakeIdea()
      server.use(signedInAs({ ...testUser, tutorialMode: true }))
      const { router } = await renderAt('/p/ada-substack/ideas/i1/drafts')
      expect(await screen.findByText(/A draft is one piece of writing/)).toBeInTheDocument()
      expect(router.currentRoute.value.name).toBe('idea-drafts')
    })

    it('has no arrows when there are no drafts', async () => {
      server.use(
        signedInAs(testUser),
        listPublications,
        http.get(ideaUrl, () => HttpResponse.json({ ...idea, drafts: [] })),
      )
      await renderAt('/p/ada-substack/ideas/i1/drafts')
      await screen.findByText(/No drafts yet/)
      expect(screen.queryByRole('button', { name: /Move .* up/ })).not.toBeInTheDocument()
    })
  })

  it('says so when there are no drafts yet', async () => {
    server.use(
      signedInAs(testUser),
      listPublications,
      http.get(ideaUrl, () => HttpResponse.json({ ...idea, links: [], drafts: [] })),
    )
    await renderAt('/p/ada-substack/ideas/i1/read')
    expect(await screen.findByText(/Nothing to read yet/)).toBeInTheDocument()
  })

  it('asks before deleting, then returns to the publication', async () => {
    let deleted = false
    await openAt('/settings', [
      http.delete(ideaUrl, () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    ])
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete idea' }))
    const dialog = screen.getByRole('dialog', { name: 'Delete “Why rivers meander”?' })
    expect(dialog).toHaveTextContent('This can’t be undone. Its notes, articles and drafts go too.')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(deleted).toBe(false)

    await fireEvent.click(screen.getByRole('button', { name: 'Delete idea' }))
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete idea' }),
    )
    await waitFor(() => expect(deleted).toBe(true))
    expect(await screen.findByRole('heading', { name: 'Ideas' })).toBeInTheDocument()
  })
})
