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
const idea = {
  id: 'i1',
  profileId: 'ada-substack',
  name: 'Why rivers meander',
  notes: '',
  links: [
    {
      id: 'l1',
      url: 'https://example.org/paper',
      title: 'A paper',
      readAt: null as string | null,
      origin: 'entered',
    },
    { id: 'l2', url: 'https://example.org/other', title: '', readAt: null, origin: 'entered' },
  ],
  drafts: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const ideaUrl = '*/api/profiles/ada-substack/ideas/i1'
const notesUrl = `${ideaUrl}/notes`
const readingPath = (linkId: string) => `/p/ada-substack/ideas/i1/reading/${linkId}`

const note = (id: string, text: string, readingItemId: string | null, origin = 'reading') => ({
  id,
  text,
  origin,
  authorId: 'u1',
  authorName: 'Ada',
  readingItemId,
  tags: [] as string[],
  quote: false,
  addedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

const open = (linkId = 'l1', extra: Parameters<typeof server.use> = []) => {
  // Handlers listed first win, so a test's own come before the usual ones.
  server.use(
    ...extra,
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([profile])),
    http.get(ideaUrl, () => HttpResponse.json(idea)),
    http.get('*/api/profiles/ada-substack/ideas', () => HttpResponse.json([])),
  )
  return renderAt(readingPath(linkId))
}

describe('reading page', () => {
  it('opens the page in a new tab and says why it is not shown here', async () => {
    await open()
    expect(await screen.findByRole('heading', { level: 1, name: 'A paper' })).toBeInTheDocument()
    const page = screen.getByRole('link', { name: /Open the page/ })
    expect(page).toHaveAttribute('href', 'https://example.org/paper')
    expect(page).toHaveAttribute('target', '_blank')
    expect(page).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText(/can't be shown inside another page/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to “Why rivers meander”/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1',
    )
  })

  it('is called by its address when the item has no title', async () => {
    await open('l2')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'https://example.org/other' }),
    ).toBeInTheDocument()
  })

  it('is reached from the reading list on the idea page', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      http.get(ideaUrl, () => HttpResponse.json(idea)),
    )
    await renderAt('/p/ada-substack/ideas/i1')
    const [first, second] = await screen.findAllByRole('link', { name: 'Take notes' })
    expect(first).toHaveAttribute('href', readingPath('l1'))
    expect(second).toHaveAttribute('href', readingPath('l2'))
    expect(first).toHaveAccessibleDescription(/A paper/) // so each one says which item it is for
  })

  describe('the notes', () => {
    it('shows only notes taken from this item, each with its source', async () => {
      await open('l1', [
        http.get(notesUrl, () =>
          HttpResponse.json([
            note('n1', 'Erosion loops.', null, 'entered'),
            note('n2', 'A quote from the paper.', 'l1'),
            note('n3', 'From the other page.', 'l2'),
          ]),
        ),
      ])
      const list = await screen.findByRole('list')
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(1)
      expect(items[0]).toHaveTextContent('A quote from the paper.')
      expect(items[0]).toHaveTextContent('From reading “A paper”, by Ada')
    })

    it('puts the box for a new note above the notes, so it never gets pushed out of sight', async () => {
      await open('l1', [
        http.get(notesUrl, () =>
          HttpResponse.json([note('n1', 'One.', 'l1'), note('n2', 'Two.', 'l1')]),
        ),
      ])
      const box = await screen.findByLabelText('Add a note from this page')
      const list = await screen.findByRole('list')
      expect(box.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('lists the newest first, so a note just added appears under the box for it', async () => {
      const at = (n: ReturnType<typeof note>, createdAt: string) => ({ ...n, createdAt })
      const saved = [
        at(note('n1', 'Oldest.', 'l1'), '2026-01-01T00:00:00.000Z'),
        at(note('n2', 'Middle.', 'l1'), '2026-01-02T00:00:00.000Z'),
      ]
      await open('l1', [
        http.get(notesUrl, () => HttpResponse.json(saved)),
        http.post(notesUrl, async ({ request }) => {
          const body = (await request.json()) as { text: string }
          const created = at(note('n3', body.text, 'l1'), '2026-01-03T00:00:00.000Z')
          saved.push(created)
          return HttpResponse.json(created, { status: 201 })
        }),
      ])
      const texts = () =>
        screen.getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
      await screen.findByText('Oldest.')
      expect(texts()).toEqual(['Middle.', 'Oldest.'])
      await fireEvent.update(screen.getByLabelText('Add a note from this page'), 'Newest.')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      await waitFor(() => expect(texts()).toEqual(['Newest.', 'Middle.', 'Oldest.']))
    })

    it('says so when there are none yet', async () => {
      await open()
      expect(await screen.findByText(/No notes from this page yet/)).toBeInTheDocument()
    })

    it('says so when they could not be loaded, and tries again on request', async () => {
      let fail = true
      await open('l1', [
        http.get(notesUrl, () =>
          fail
            ? HttpResponse.json({ error: 'boom' }, { status: 500 })
            : HttpResponse.json([note('n2', 'Now it works.', 'l1')]),
        ),
      ])
      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the notes")
      fail = false
      await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
      expect(await screen.findByText('Now it works.')).toBeInTheDocument()
    })

    it('adds a note against this item, then clears the box and shows the note', async () => {
      const sent: unknown[] = []
      const saved: ReturnType<typeof note>[] = []
      await open('l1', [
        http.get(notesUrl, () => HttpResponse.json(saved)),
        http.post(notesUrl, async ({ request }) => {
          const body = (await request.json()) as { text: string }
          sent.push(body)
          const created = note('n1', body.text.trim(), 'l1')
          saved.push(created)
          return HttpResponse.json(created, { status: 201 })
        }),
      ])
      const box = await screen.findByLabelText('Add a note from this page')
      const button = screen.getByRole('button', { name: 'Add note' })
      expect(button).toBeDisabled() // nothing to add yet
      await fireEvent.update(box, '  “Meanders grow.”  ')
      await fireEvent.click(button)
      await waitFor(() =>
        expect(sent).toEqual([{ text: '  “Meanders grow.”  ', readingItemId: 'l1' }]),
      )
      const list = await screen.findByRole('list')
      expect(within(list).getByText('“Meanders grow.”')).toBeInTheDocument()
      expect(list).toHaveTextContent('From reading “A paper”, by Ada')
      expect(box).toHaveValue('')
    })

    it('adds a direct quote when asked, sets it apart, and clears the choice for the next note', async () => {
      const sent: unknown[] = []
      const saved: ReturnType<typeof note>[] = []
      await open('l1', [
        http.get(notesUrl, () => HttpResponse.json(saved)),
        http.post(notesUrl, async ({ request }) => {
          const body = (await request.json()) as { text: string; quote?: boolean }
          sent.push(body)
          const created = { ...note(`n${saved.length + 1}`, body.text, 'l1'), quote: !!body.quote }
          saved.push(created)
          return HttpResponse.json(created, { status: 201 })
        }),
      ])
      const box = await screen.findByLabelText('Add a note from this page')
      const isQuote = screen.getByRole('checkbox', { name: /This is a direct quote/ })
      expect(isQuote).not.toBeChecked() // a note is the writer's own words unless they say otherwise
      await fireEvent.update(box, 'Meanders grow.')
      await fireEvent.click(isQuote)
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      const list = await screen.findByRole('list')
      expect(list.querySelector('blockquote')).toHaveTextContent('Meanders grow.')
      expect(list).toHaveTextContent('Quoted while reading “A paper”, by Ada')
      expect(screen.getByRole('checkbox', { name: /This is a direct quote/ })).not.toBeChecked()

      await fireEvent.update(box, 'So bends move.')
      await fireEvent.click(await screen.findByRole('button', { name: 'Add note' }))
      await waitFor(() => expect(list.querySelectorAll('li')).toHaveLength(2))
      expect(sent).toEqual([
        { text: 'Meanders grow.', readingItemId: 'l1', quote: true },
        { text: 'So bends move.', readingItemId: 'l1' },
      ])
      expect(list.querySelectorAll('blockquote')).toHaveLength(1)
    })

    it('keeps what was typed, and says what went wrong, when a note could not be saved', async () => {
      await open('l1', [
        http.post(notesUrl, () =>
          HttpResponse.json({ error: 'That note is too long.' }, { status: 400 }),
        ),
      ])
      const box = await screen.findByLabelText('Add a note from this page')
      await fireEvent.update(box, 'Some words')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      expect(await screen.findByText('That note is too long.')).toBeInTheDocument()
      expect(box).toHaveValue('Some words')
    })
  })

  describe('the title', () => {
    const titled = (title: string) => ({
      ...idea,
      links: [{ ...idea.links[0]!, title }, idea.links[1]!],
    })
    const patchUrl = `${ideaUrl}/links/l1`

    it('is edited in place, sending the same address and the new title', async () => {
      const sent: unknown[] = []
      await open('l1', [
        http.patch(patchUrl, async ({ request }) => {
          sent.push(await request.json())
          return HttpResponse.json(titled('A better title'))
        }),
      ])
      await fireEvent.click(await screen.findByRole('button', { name: 'Edit title' }))
      const field = screen.getByLabelText('Title')
      expect(field).toHaveFocus()
      expect(field).toHaveValue('A paper')
      await fireEvent.update(field, 'A better title')
      await fireEvent.click(screen.getByRole('button', { name: 'Save title' }))
      expect(
        await screen.findByRole('heading', { level: 1, name: 'A better title' }),
      ).toBeInTheDocument()
      expect(sent).toEqual([{ url: 'https://example.org/paper', title: 'A better title' }])
      await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull())
      await waitFor(() => expect(screen.getByRole('button', { name: 'Edit title' })).toHaveFocus())
    })

    it('says when none was found, and offers to add one', async () => {
      await open('l2')
      expect(await screen.findByText(/couldn't find this page's title/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add a title' })).toBeInTheDocument()
    })

    it('does not say that for an item that has a title', async () => {
      await open()
      await screen.findByRole('heading', { level: 1, name: 'A paper' })
      expect(screen.queryByText(/couldn't find this page's title/)).toBeNull()
    })

    it('can be cancelled, with Escape too, leaving it as it was', async () => {
      await open()
      await fireEvent.click(await screen.findByRole('button', { name: 'Edit title' }))
      await fireEvent.update(screen.getByLabelText('Title'), 'Changed my mind')
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('heading', { level: 1, name: 'A paper' })).toBeInTheDocument()
      await fireEvent.click(screen.getByRole('button', { name: 'Edit title' }))
      await fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
      expect(screen.queryByLabelText('Title')).toBeNull()
    })

    it('keeps what was typed, and says what went wrong, when it could not be saved', async () => {
      await open('l1', [
        http.patch(patchUrl, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      ])
      await fireEvent.click(await screen.findByRole('button', { name: 'Edit title' }))
      await fireEvent.update(screen.getByLabelText('Title'), 'Typed')
      await fireEvent.click(screen.getByRole('button', { name: 'Save title' }))
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInvalid())
      expect(screen.getByLabelText('Title')).toHaveValue('Typed')
    })
  })

  describe('adding another page to the reading list', () => {
    const added = (title: string) => ({
      ...idea,
      links: [
        ...idea.links,
        { id: 'l3', url: 'https://example.org/new', title, readAt: null, origin: 'entered' },
      ],
    })

    it('sends just the address, clears the box, and offers to read the new page next', async () => {
      const sent: unknown[] = []
      await open('l1', [
        http.post(`${ideaUrl}/links`, async ({ request }) => {
          sent.push(await request.json())
          return HttpResponse.json(added('Fetched title'), { status: 201 })
        }),
      ])
      const box = await screen.findByLabelText('Web address')
      await fireEvent.update(box, 'example.org/new')
      await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
      const status = await screen.findByRole('status')
      await waitFor(() => expect(status).toHaveTextContent('Added “Fetched title”'))
      expect(sent).toEqual([{ url: 'example.org/new' }])
      expect(box).toHaveValue('')
      expect(within(status).getByRole('link', { name: 'Read it and take notes' })).toHaveAttribute(
        'href',
        readingPath('l3'),
      )
      // Still on the page being read, with its notes box untouched.
      expect(screen.getByRole('heading', { level: 1, name: 'A paper' })).toBeInTheDocument()
    })

    it('calls a page with no title by its address', async () => {
      await open('l1', [
        http.post(`${ideaUrl}/links`, () => HttpResponse.json(added(''), { status: 201 })),
      ])
      await fireEvent.update(await screen.findByLabelText('Web address'), 'example.org/new')
      await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
      expect(await screen.findByText(/Added “https:\/\/example\.org\/new”/)).toBeInTheDocument()
    })

    it('keeps what was typed, and says what is wrong, when it could not be added', async () => {
      await open('l1', [
        http.post(`${ideaUrl}/links`, () =>
          HttpResponse.json({ error: 'That link is already in this idea.' }, { status: 409 }),
        ),
      ])
      const box = await screen.findByLabelText('Web address')
      await fireEvent.update(box, 'example.org/paper')
      await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
      expect(await screen.findByText('That link is already in this idea.')).toBeInTheDocument()
      expect(box).toHaveValue('example.org/paper')
      expect(screen.queryByText(/to the reading list\./)).toBeNull()
    })
  })

  describe('marking it read', () => {
    it('saves read, then unread', async () => {
      const sent: unknown[] = []
      await open('l1', [
        http.put(`${ideaUrl}/links/l1/read`, async ({ request }) => {
          const body = (await request.json()) as { read: boolean }
          sent.push(body)
          return HttpResponse.json({
            ...idea,
            links: [
              { ...idea.links[0]!, readAt: body.read ? '2026-01-03T00:00:00Z' : null },
              idea.links[1]!,
            ],
          })
        }),
      ])
      const box = await screen.findByRole('checkbox', { name: 'I have read this' })
      expect(box).not.toBeChecked()
      await fireEvent.click(box)
      await waitFor(() => expect(sent).toEqual([{ read: true }]))
      await waitFor(() =>
        expect(screen.getByRole('checkbox', { name: 'I have read this' })).toBeChecked(),
      )
      await fireEvent.click(screen.getByRole('checkbox', { name: 'I have read this' }))
      await waitFor(() => expect(sent).toEqual([{ read: true }, { read: false }]))
    })

    it('shows an item already read as ticked', async () => {
      await open('l1', [
        http.get(ideaUrl, () =>
          HttpResponse.json({
            ...idea,
            links: [{ ...idea.links[0]!, readAt: '2026-01-03T00:00:00Z' }, idea.links[1]!],
          }),
        ),
      ])
      expect(await screen.findByRole('checkbox', { name: 'I have read this' })).toBeChecked()
    })

    it('says so when it could not be saved, and leaves it as it was', async () => {
      await open('l1', [
        http.put(`${ideaUrl}/links/l1/read`, () =>
          HttpResponse.json({ error: 'boom' }, { status: 500 }),
        ),
      ])
      await fireEvent.click(await screen.findByRole('checkbox', { name: 'I have read this' }))
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't save that")
      expect(screen.getByRole('checkbox', { name: 'I have read this' })).not.toBeChecked()
    })
  })

  describe('when the item is not there', () => {
    it('says it may have been removed, and goes back to the idea', async () => {
      await open('gone')
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "We couldn't open that reading-list item",
      )
      expect(screen.getByRole('link', { name: 'Back to the idea' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1',
      )
    })

    it('says so when the idea could not be loaded', async () => {
      await open('l1', [
        http.get(ideaUrl, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      ])
      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't open that")
    })
  })
})
