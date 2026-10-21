import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer, expectOrigin } from '../test-utils'

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
const idea = {
  id: 'i1',
  publicationId: 'ada-substack',
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
const ideaUrl = '*/api/publications/ada-substack/ideas/i1'
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
    http.get('*/api/publications', () => HttpResponse.json([publication])),
    http.get(ideaUrl, () => HttpResponse.json(idea)),
    http.get('*/api/publications/ada-substack/ideas', () => HttpResponse.json([])),
  )
  return renderAt(readingPath(linkId))
}

describe('reading page', () => {
  it('opens the page in a new tab, with a button that stands out and the site’s name above it', async () => {
    await open()
    expect(await screen.findByRole('heading', { level: 1, name: 'A paper' })).toBeInTheDocument()
    const page = screen.getByRole('link', { name: /Open the page/ })
    expect(page).toHaveAttribute('href', 'https://example.org/paper')
    expect(page).toHaveAttribute('target', '_blank')
    expect(page).toHaveAttribute('rel', 'noopener noreferrer')
    expect(page).toHaveClass('btn', 'btn-primary')
    const host = screen.getByText('example.org')
    expect(host.compareDocumentPosition(page) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The explanation is behind an icon, not a paragraph.
    expect(document.querySelector('.tutorial-note')).toBeNull()
    expect(screen.getByRole('link', { name: /Back to the reading list/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/read',
    )
  })

  it('puts the Read switch beside the button that opens the page, and the add panel after them', async () => {
    await open()
    const page = await screen.findByRole('link', { name: /Open the page/ })
    const read = screen.getByRole('switch', { name: 'Read' })
    const tabs = screen.getByRole('tablist', { name: 'Quick add' })
    expect(page.compareDocumentPosition(read) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(read.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('has the add button beside its field, in the same form as above a reading list', async () => {
    await open()
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add to reading list' }))
    const field = screen.getByLabelText('Web address')
    const button = screen.getByRole('button', { name: 'Add to reading list' })
    // One row: the field and the button share a parent that holds nothing else.
    expect(field.closest('div.flex')).toBe(button.closest('div.flex'))
    expect(field).toHaveAccessibleDescription('We will look up its title.')
  })

  it('has Create idea beside the Idea name field, on the publication’s own item', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/publications/ada-substack/reading', () => HttpResponse.json(idea.links)),
      http.get('*/api/publications/ada-substack/notes', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/reading/l1')
    await fireEvent.click(await screen.findByRole('tab', { name: 'New idea' }))
    const field = screen.getByLabelText('Idea name')
    expect(field.closest('div.flex')).toBe(
      screen.getByRole('button', { name: 'Create idea' }).closest('div.flex'),
    )
  })

  it('leaves out the hint under the quotation tick: what it does is in the explanation', async () => {
    await open()
    await screen.findByRole('checkbox', { name: 'This is a quotation' })
    expect(screen.queryByText('It can’t be edited afterwards.')).not.toBeInTheDocument()
  })

  describe('after a note is added', () => {
    const saved: ReturnType<typeof note>[] = []
    const addNote = async () => {
      saved.length = 0
      await open('l1', [
        http.get(notesUrl, () => HttpResponse.json(saved)),
        http.post(notesUrl, async ({ request }) => {
          const body = (await request.json()) as { text: string }
          const created = note('n1', body.text, 'l1')
          saved.push(created)
          return HttpResponse.json(created, { status: 201 })
        }),
      ])
      await fireEvent.update(await screen.findByLabelText('Note'), 'A thought.')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      return await screen.findByText('Note added.')
    }

    it('says so to a screen reader only: the note is in the list right below', async () => {
      const said = await addNote()
      expect(said).toHaveAttribute('role', 'status')
      expect(said).toHaveClass('sr-only')
    })

    it('marks the new note for a moment, then lets it go', async () => {
      await addNote()
      const row = (await screen.findByText('A thought.')).closest('div.border-l-4')!
      expect(row).toHaveClass('bg-accent-wash')
      await waitFor(() => expect(row).not.toHaveClass('bg-accent-wash'), { timeout: 4000 })
    })
  })

  it('takes away “Added …” under the reading form once the next address is started', async () => {
    await open('l1', [
      http.post(`${ideaUrl}/links`, () =>
        HttpResponse.json(
          {
            ...idea,
            links: [
              ...idea.links,
              {
                id: 'l3',
                url: 'https://example.org/new',
                title: 'New one',
                readAt: null,
                origin: 'entered',
              },
            ],
          },
          { status: 201 },
        ),
      ),
    ])
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add to reading list' }))
    await fireEvent.update(await screen.findByLabelText('Web address'), 'https://example.org/new')
    await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
    expect(await screen.findByText(/Added “New one”/)).toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText('Web address'), 'h')
    expect(screen.queryByText(/Added “New one”/)).not.toBeInTheDocument()
  })

  it('starts again on Add a note when the writer goes on to another item', async () => {
    const { router } = await open()
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add to reading list' }))
    await fireEvent.update(screen.getByLabelText('Web address'), 'example.org/new')
    await router.push(readingPath('l2'))
    await screen.findByRole('heading', { level: 1, name: 'https://example.org/other' })
    expect(screen.getByRole('tab', { name: 'Add a note' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Web address')).toHaveValue('')
  })

  it('opens on Add a note, then Add to reading list; an idea’s page has no New idea tab', async () => {
    await open()
    await screen.findByRole('heading', { level: 1, name: 'A paper' })
    const tabs = within(screen.getByRole('tablist', { name: 'Quick add' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Add a note', 'Add to reading list'])
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
  })

  describe('in tutorial mode', () => {
    /** Tutorial mode on. */
    const tutorial = () => [signedInAs({ ...testUser, tutorialMode: true })]

    it('writes out how to take notes beside the page, and what a quotation is', async () => {
      const handlers = tutorial()
      await open('l1', handlers)
      await screen.findByRole('heading', { level: 1, name: 'A paper' })
      expect(
        screen.getByText(
          'Arrange this page and the page you’re reading side-by-side in a split view to make taking notes easier.',
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/You can’t edit notes that are marked as quotations\./),
      ).toBeInTheDocument()
    })

    it('does the same on the publication’s own reading item, which also offers a New idea tab', async () => {
      const handlers = tutorial()
      server.use(
        ...handlers,
        signedInAs({ ...testUser, tutorialMode: true }),
        http.get('*/api/publications', () => HttpResponse.json([publication])),
        http.get('*/api/publications/ada-substack/reading', () => HttpResponse.json(idea.links)),
        http.get('*/api/publications/ada-substack/notes', () => HttpResponse.json([])),
      )
      const { router } = await renderAt('/p/ada-substack/reading/l1')
      expect(router.currentRoute.value.name).toBe('publication-reading-item')
      await screen.findByRole('heading', { level: 1, name: 'A paper' })
      expect(screen.getByText(/in a split view/)).toBeInTheDocument()
      const tabs = within(screen.getByRole('tablist', { name: 'Quick add' })).getAllByRole('tab')
      expect(tabs.map((t) => t.textContent?.trim())).toEqual([
        'Add a note',
        'Add to reading list',
        'New idea',
      ])
    })
  })

  it('is reached from the idea’s reading list, which has no Keep tick (only the publication’s list drops items)', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get(ideaUrl, () => HttpResponse.json(idea)),
    )
    await renderAt('/p/ada-substack/ideas/i1/read')
    expect(await screen.findByRole('link', { name: 'A paper' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Take notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: /^Keep:/ })).not.toBeInTheDocument()
  })

  it('moves items from an idea to the publication’s reading list or another idea, never to itself or a new idea', async () => {
    const moved: unknown[] = []
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get(ideaUrl, () => HttpResponse.json(idea)),
      http.get('*/api/publications/ada-substack/ideas', () =>
        HttpResponse.json([
          {
            id: 'i1',
            name: 'Why rivers meander',
            draftCount: 0,
            updatedAt: '2026-01-01T00:00:00Z',
          },
          { id: 'i2', name: 'Lakes', draftCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
        ]),
      ),
      http.post('*/api/publications/ada-substack/move/reading', async ({ request }) => {
        moved.push(await request.json())
        return HttpResponse.json({ batchId: 'b', readingItems: 1, merged: 0, copied: 0, notes: 0 })
      }),
    )
    await renderAt('/p/ada-substack/ideas/i1/read')
    await fireEvent.click(await screen.findByRole('checkbox', { name: 'Select A paper' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    const picker = await screen.findByLabelText(/^Move( .*)? to$/)
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['Choose where…', 'The publication’s reading list', 'Lakes'])
    await fireEvent.update(picker, 'publication')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 item' }))
    expect(
      await screen.findByText(/Moved 1 item to the publication’s reading list\./),
    ).toBeInTheDocument()
    expect(moved).toEqual([{ ids: ['l1'], to: { ideaId: null } }])
  })

  it('moves notes from an idea to the publication, another idea or a new idea', async () => {
    const moved: unknown[] = []
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get(ideaUrl, () => HttpResponse.json(idea)),
      http.get(notesUrl, () =>
        HttpResponse.json([
          note('n1', 'An idea note', null, 'entered'),
          note('n2', 'Another', null, 'entered'),
        ]),
      ),
      http.get('*/api/publications/ada-substack/ideas', () =>
        HttpResponse.json([
          {
            id: 'i1',
            name: 'Why rivers meander',
            draftCount: 0,
            updatedAt: '2026-01-01T00:00:00Z',
          },
          { id: 'i2', name: 'Lakes', draftCount: 0, updatedAt: '2026-01-01T00:00:00Z' },
        ]),
      ),
      http.post('*/api/publications/ada-substack/move/notes', async ({ request }) => {
        moved.push(await request.json())
        return HttpResponse.json({ batchId: 'b', readingItems: 0, merged: 0, copied: 0, notes: 1 })
      }),
    )
    await renderAt('/p/ada-substack/ideas/i1/notes')
    await fireEvent.click(
      await screen.findByRole('checkbox', { name: /^Select note “An idea note/ }),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Move to…' }))
    const picker = await screen.findByLabelText(/^Move( .*)? to$/)
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['Choose where…', 'The publication’s notes', 'Lakes', 'A new idea…'])
    await fireEvent.update(picker, 'publication')
    await fireEvent.click(screen.getByRole('button', { name: 'Move 1 note' }))
    expect(await screen.findByText(/Moved 1 note to the publication’s notes\./)).toBeInTheDocument()
    expect(moved).toEqual([{ ids: ['n1'], to: { ideaId: null } }])
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
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get(ideaUrl, () => HttpResponse.json(idea)),
    )
    await renderAt('/p/ada-substack/ideas/i1/read')
    const first = await screen.findByRole('link', { name: 'A paper' })
    expect(first).toHaveAttribute('href', readingPath('l1'))
    expect(screen.getByRole('link', { name: 'https://example.org/other' })).toHaveAttribute(
      'href',
      readingPath('l2'),
    )
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
      const list = await within(await screen.findByRole('main')).findByRole('list')
      const items = within(list).getAllByRole('listitem')
      expect(items).toHaveLength(1)
      expect(items[0]).toHaveTextContent('A quote from the paper.')
      expectOrigin(items[0]!, 'From A paper', 'Ada')
    })

    it('puts the box for a new note above the notes, so it never gets pushed out of sight', async () => {
      await open('l1', [
        http.get(notesUrl, () =>
          HttpResponse.json([note('n1', 'One.', 'l1'), note('n2', 'Two.', 'l1')]),
        ),
      ])
      const box = await screen.findByLabelText('Note')
      const list = await within(await screen.findByRole('main')).findByRole('list')
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
        within(screen.getByRole('main'))
          .getAllByRole('listitem')
          .map((li) => li.querySelector('p')?.textContent)
      await screen.findByText('Oldest.')
      expect(texts()).toEqual(['Middle.', 'Oldest.'])
      await fireEvent.update(screen.getByLabelText('Note'), 'Newest.')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      await waitFor(() => expect(texts()).toEqual(['Newest.', 'Middle.', 'Oldest.']))
    })

    it('name the authors of the page after its title, apart from the person who took the note', async () => {
      await open('l1', [
        http.get(ideaUrl, () =>
          HttpResponse.json({
            ...idea,
            links: [{ ...idea.links[0]!, authors: ['Ada Author', 'Bo Writer'] }, idea.links[1]!],
          }),
        ),
        http.get(notesUrl, () =>
          HttpResponse.json([{ ...note('n1', 'Exact words.', 'l1'), quote: true }]),
        ),
      ])
      const item = (await within(screen.getByRole('main')).findAllByRole('listitem'))[0]!
      expect(item).toHaveTextContent('From A paper')
      expect(item).not.toHaveTextContent('Ada Author') // the page's authors are on the page, not on each note
      // The title links to the page, in a new tab.
      const page = within(item).getByRole('link', { name: /A paper/ })
      expect(page).toHaveAttribute('href', 'https://example.org/paper')
      expect(page).toHaveAttribute('target', '_blank')
      expect(within(item).getByText('Ada', { exact: true })).toHaveClass('rounded-full')
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
      const box = await screen.findByLabelText('Note')
      const button = screen.getByRole('button', { name: 'Add note' })
      await fireEvent.update(box, '  “Meanders grow.”  ')
      await fireEvent.click(button)
      await waitFor(() =>
        expect(sent).toEqual([{ text: '  “Meanders grow.”  ', readingItemId: 'l1' }]),
      )
      const list = await within(await screen.findByRole('main')).findByRole('list')
      expect(within(list).getByText('“Meanders grow.”')).toBeInTheDocument()
      expectOrigin(list, 'From A paper', 'Ada')
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
      const box = await screen.findByLabelText('Note')
      const isQuote = screen.getByRole('checkbox', { name: /This is a quotation/ })
      expect(isQuote).not.toBeChecked() // a note is the writer's own words unless they say otherwise
      await fireEvent.update(box, 'Meanders grow.')
      await fireEvent.click(isQuote)
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      const list = await within(await screen.findByRole('main')).findByRole('list')
      expect(list.querySelector('blockquote')).toHaveTextContent('Meanders grow.')
      expectOrigin(list, 'From A paper', 'Ada')
      expect(screen.getByRole('checkbox', { name: /This is a quotation/ })).not.toBeChecked()

      await fireEvent.update(box, 'So bends move.')
      // The button is busy until the notes have been read again.
      const again = screen.getByRole('button', { name: 'Add note' })
      await waitFor(() => expect(again).toBeEnabled())
      await fireEvent.click(again)
      await waitFor(() => expect(list.querySelectorAll('li')).toHaveLength(2))
      expect(sent).toEqual([
        { text: 'Meanders grow.', readingItemId: 'l1', quote: true },
        { text: 'So bends move.', readingItemId: 'l1' },
      ])
      expect(list.querySelectorAll('blockquote')).toHaveLength(1)
    })

    describe('pasting', () => {
      const paste = (box: HTMLElement, text: string) =>
        fireEvent.paste(box, { clipboardData: { getData: () => text } })
      const quoteBox = () => screen.getByRole('checkbox', { name: /This is a quotation/ })

      it('ticks "This is a quotation" when words are pasted into the empty box, and says so', async () => {
        await open()
        const box = await screen.findByLabelText('Note')
        expect(quoteBox()).not.toBeChecked()
        await paste(box, 'Meanders grow because banks erode.')
        expect(quoteBox()).toBeChecked()
        expect(screen.getByText(/Ticked because you pasted it/)).toBeInTheDocument()
      })

      it('can be unticked, and then stays unticked; the message goes', async () => {
        await open()
        const box = await screen.findByLabelText('Note')
        await paste(box, 'Pasted words.')
        await fireEvent.click(quoteBox())
        expect(quoteBox()).not.toBeChecked()
        expect(screen.queryByText(/Ticked because you pasted/)).toBeNull()
      })

      it('also ticks it when everything already in the box is pasted over', async () => {
        await open()
        const box = (await screen.findByLabelText('Note')) as HTMLTextAreaElement
        await fireEvent.update(box, 'My own first thoughts.')
        box.setSelectionRange(0, box.value.length)
        await paste(box, 'Replacement words.')
        expect(quoteBox()).toBeChecked()
      })

      it("does not tick it for typing, for a paste into the middle of the writer's words, or for nothing", async () => {
        await open()
        const box = (await screen.findByLabelText('Note')) as HTMLTextAreaElement
        await fireEvent.update(box, 'Typed by hand.')
        expect(quoteBox()).not.toBeChecked()
        box.setSelectionRange(5, 5)
        await paste(box, 'inserted')
        expect(quoteBox()).not.toBeChecked()
        await fireEvent.update(box, '')
        await paste(box, '   ')
        expect(quoteBox()).not.toBeChecked()
      })

      it('starts again unticked for the next note, and sends the quote flag it was ticked for', async () => {
        const sent: unknown[] = []
        const saved: ReturnType<typeof note>[] = []
        await open('l1', [
          http.get(notesUrl, () => HttpResponse.json(saved)),
          http.post(notesUrl, async ({ request }) => {
            const body = (await request.json()) as { text: string; quote?: boolean }
            sent.push(body)
            const created = { ...note('n1', body.text, 'l1'), quote: !!body.quote }
            saved.push(created)
            return HttpResponse.json(created, { status: 201 })
          }),
        ])
        const box = await screen.findByLabelText('Note')
        await paste(box, 'Pasted words.') // the paste event comes first; then the words arrive in the box
        await fireEvent.update(box, 'Pasted words.')
        await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
        await waitFor(() =>
          expect(sent).toEqual([{ text: 'Pasted words.', readingItemId: 'l1', quote: true }]),
        )
        await waitFor(() => expect(quoteBox()).not.toBeChecked())
        expect(screen.queryByText(/Ticked because you pasted/)).toBeNull()
      })
    })

    it('shows the item as read once a note is added from it (the server marks it), and the writer can untick it', async () => {
      let readAt: string | null = null
      await open('l1', [
        http.get(ideaUrl, () =>
          HttpResponse.json({ ...idea, links: [{ ...idea.links[0]!, readAt }, idea.links[1]!] }),
        ),
        http.post(notesUrl, async ({ request }) => {
          const body = (await request.json()) as { text: string }
          readAt = '2026-01-03T00:00:00Z' // as the server now does when a note is taken from an item
          return HttpResponse.json(note('n1', body.text, 'l1'), { status: 201 })
        }),
        http.put(`${ideaUrl}/links/l1/read`, () => {
          readAt = null
          return HttpResponse.json({ ...idea, links: idea.links })
        }),
      ])
      const read = await screen.findByRole('switch', { name: 'Read' })
      expect(read).not.toBeChecked()
      await fireEvent.update(await screen.findByLabelText('Note'), 'A thought.')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      await waitFor(() => expect(screen.getByRole('switch', { name: 'Read' })).toBeChecked())
      await fireEvent.click(screen.getByRole('switch', { name: 'Read' }))
      await waitFor(() => expect(screen.getByRole('switch', { name: 'Read' })).not.toBeChecked())
    })

    it('keeps what was typed, and says what went wrong, when a note could not be saved', async () => {
      await open('l1', [
        http.post(notesUrl, () =>
          HttpResponse.json({ error: 'That note is too long.' }, { status: 400 }),
        ),
      ])
      const box = await screen.findByLabelText('Note')
      await fireEvent.update(box, 'Some words')
      await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
      expect(await screen.findByText('That note is too long.')).toBeInTheDocument()
      expect(box).toHaveValue('Some words')
    })
  })

  describe('the title and authors', () => {
    const detailed = (title: string, authors: string[] = []) => ({
      ...idea,
      links: [{ ...idea.links[0]!, title, authors }, idea.links[1]!],
    })
    const patchUrl = `${ideaUrl}/links/l1`
    const edit = async () =>
      fireEvent.click(await screen.findByRole('button', { name: 'Edit title and authors' }))

    it('are edited in place, sending the same address, the title and the names as a list', async () => {
      const sent: unknown[] = []
      await open('l1', [
        http.patch(patchUrl, async ({ request }) => {
          sent.push(await request.json())
          return HttpResponse.json(detailed('A better title', ['Ada Author', 'Bo Writer']))
        }),
      ])
      await edit()
      const field = screen.getByLabelText('Title')
      expect(field).toHaveFocus()
      expect(field).toHaveValue('A paper')
      expect(screen.getByLabelText('Authors')).toHaveValue('')
      await fireEvent.update(field, 'A better title')
      await fireEvent.update(screen.getByLabelText('Authors'), ' Ada Author,Bo Writer , ')
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(
        await screen.findByRole('heading', { level: 1, name: 'A better title' }),
      ).toBeInTheDocument()
      expect(sent).toEqual([
        {
          url: 'https://example.org/paper',
          title: 'A better title',
          authors: ['Ada Author', 'Bo Writer'],
        },
      ])
      expect(await screen.findByText('By Ada Author and Bo Writer')).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByLabelText('Title')).toBeNull())
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Edit title and authors' })).toHaveFocus(),
      )
    })

    it('start with the names already known, and clear them when emptied', async () => {
      const sent: { authors: string[] }[] = []
      await open('l1', [
        http.get(ideaUrl, () => HttpResponse.json(detailed('A paper', ['Ada Author']))),
        http.patch(patchUrl, async ({ request }) => {
          sent.push((await request.json()) as { authors: string[] })
          return HttpResponse.json(detailed('A paper'))
        }),
      ])
      expect(await screen.findByText('By Ada Author')).toBeInTheDocument()
      await edit()
      expect(screen.getByLabelText('Authors')).toHaveValue('Ada Author')
      await fireEvent.update(screen.getByLabelText('Authors'), '')
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(sent).toEqual([expect.objectContaining({ authors: [] })]))
    })

    it('say nothing about what is not known: the address stands in for the title', async () => {
      await open('l2')
      await screen.findByRole('heading', { level: 1, name: 'https://example.org/other' })
      expect(screen.queryByText(/couldn.t find this page.s title/)).toBeNull()
      expect(screen.queryByText(/who wrote it/)).toBeNull()
      expect(screen.queryByText(/^By /)).toBeNull()
    })

    it('can be cancelled, with Escape too, leaving them as they were', async () => {
      await open()
      await edit()
      await fireEvent.update(screen.getByLabelText('Title'), 'Changed my mind')
      await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('heading', { level: 1, name: 'A paper' })).toBeInTheDocument()
      await edit()
      await fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Escape' })
      expect(screen.queryByLabelText('Title')).toBeNull()
    })

    it('keeps what was typed, and says what went wrong, when they could not be saved', async () => {
      await open('l1', [
        http.patch(patchUrl, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      ])
      await edit()
      await fireEvent.update(screen.getByLabelText('Title'), 'Typed')
      await fireEvent.update(screen.getByLabelText('Authors'), 'Typed Name')
      await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => expect(screen.getByLabelText('Title')).toBeInvalid())
      expect(screen.getByLabelText('Title')).toHaveValue('Typed')
      expect(screen.getByLabelText('Authors')).toHaveValue('Typed Name')
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
      await fireEvent.click(await screen.findByRole('tab', { name: 'Add to reading list' }))
      const box = await screen.findByLabelText('Web address')
      expect(box).toHaveAccessibleDescription('We will look up its title.')
      await fireEvent.update(box, 'example.org/new')
      await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
      const status = (
        await screen.findByText(/Added “Fetched title” to this idea’s reading list\./)
      ).closest('p')!
      expect(status).toHaveAttribute('aria-live', 'polite')
      expect(sent).toEqual([{ url: 'example.org/new' }])
      expect(box).toHaveValue('')
      expect(within(status).getByRole('link', { name: 'Open “Fetched title”' })).toHaveAttribute(
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
      await fireEvent.click(await screen.findByRole('tab', { name: 'Add to reading list' }))
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
      await fireEvent.click(await screen.findByRole('tab', { name: 'Add to reading list' }))
      const box = await screen.findByLabelText('Web address')
      await fireEvent.update(box, 'example.org/paper')
      await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
      expect(await screen.findByText('That link is already in this idea.')).toBeInTheDocument()
      expect(box).toHaveValue('example.org/paper')
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
      const box = await screen.findByRole('switch', { name: 'Read' })
      expect(box).not.toBeChecked()
      await fireEvent.click(box)
      await waitFor(() => expect(sent).toEqual([{ read: true }]))
      await waitFor(() => expect(screen.getByRole('switch', { name: 'Read' })).toBeChecked())
      await fireEvent.click(screen.getByRole('switch', { name: 'Read' }))
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
      expect(await screen.findByRole('switch', { name: 'Read' })).toBeChecked()
    })

    it('says so when it could not be saved, and leaves it as it was', async () => {
      await open('l1', [
        http.put(`${ideaUrl}/links/l1/read`, () =>
          HttpResponse.json({ error: 'boom' }, { status: 500 }),
        ),
      ])
      await fireEvent.click(await screen.findByRole('switch', { name: 'Read' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, we couldn’t save that')
      expect(screen.getByRole('switch', { name: 'Read' })).not.toBeChecked()
    })
  })

  describe('when the item is not there', () => {
    it('says it may have been removed, and goes back to the idea', async () => {
      await open('gone')
      expect(await screen.findByRole('alert')).toHaveTextContent('Sorry, we couldn’t open that')
      expect(screen.getByRole('link', { name: 'Back to the reading list' })).toHaveAttribute(
        'href',
        '/p/ada-substack/ideas/i1/read',
      )
    })

    it('says so when the idea could not be loaded', async () => {
      await open('l1', [
        http.get(ideaUrl, () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      ])
      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this item")
    })
  })
})
