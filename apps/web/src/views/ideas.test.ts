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
const listProfiles = http.get('*/api/profiles', () => HttpResponse.json([profile]))

const idea = {
  id: 'i1',
  profileId: 'ada-substack',
  name: 'Why rivers meander',
  notes: 'Erosion loops.',
  links: [{ id: 'l1', url: 'https://example.org/paper', title: 'A paper' }],
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
    expect(screen.getByLabelText('Expand on your idea here')).toHaveValue('Erosion loops.')
    const link = screen.getByRole('link', { name: /A paper/ })
    expect(link).toHaveAttribute('href', 'https://example.org/paper')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: /Part 1/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/drafts/d1',
    )
  })

  it('has a Brainstorm button that is not available yet, and says so', async () => {
    await open()
    const button = await screen.findByRole('button', { name: 'Brainstorm' })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(/isn't ready yet/)
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

  it('saves changes to the name and notes', async () => {
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
    expect(sent).toEqual({ name: 'Meanders', notes: 'Erosion loops.' })
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
          links: [...idea.links, { id: 'l2', url: 'https://example.org/untitled', title: '' }],
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

  describe('adding a link', () => {
    it('sends just the address, then shows the link and clears the field, keeping unsaved notes', async () => {
      let sent: unknown
      const added = {
        ...idea,
        links: [
          ...idea.links,
          { id: 'l2', url: 'https://example.org/new', title: 'Fetched title' },
        ],
      }
      await open([
        http.post(`${ideaUrl}/links`, async ({ request }) => {
          sent = await request.json()
          return HttpResponse.json(added, { status: 201 })
        }),
      ])
      expect(screen.queryByLabelText(/Title/)).toBeNull() // adding a link doesn't ask for a title
      await fireEvent.update(await screen.findByLabelText('Expand on your idea here'), 'Unsaved')
      await fireEvent.update(screen.getByLabelText('Web address'), 'example.org/new')
      await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))

      await waitFor(() => expect(screen.getByLabelText('Web address')).toHaveValue(''))
      expect(sent).toEqual({ url: 'example.org/new' })
      expect(await screen.findByRole('link', { name: /Fetched title/ })).toBeInTheDocument()
      expect(screen.getByLabelText('Expand on your idea here')).toHaveValue('Unsaved')
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
            links: [{ id: 'l1', url: 'https://example.org/better', title: 'Better title' }],
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

  it('says so when there are no drafts yet', async () => {
    server.use(
      signedInAs(testUser),
      listProfiles,
      http.get(ideaUrl, () => HttpResponse.json({ ...idea, links: [], drafts: [] })),
    )
    await renderAt('/p/ada-substack/ideas/i1')
    await screen.findByText(/No drafts yet/)
    expect(screen.getByText('No links yet.')).toBeInTheDocument()
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
