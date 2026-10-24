import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const publication = (id: string, name: string) => ({
  id,
  name,
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [],
})
const blog = publication('ada-blog', 'Blog')
const letters = publication('ada-letters', 'Letters')

const publications = (...list: ReturnType<typeof publication>[]) =>
  http.get('*/api/publications', () => HttpResponse.json(list))
const ideasFor = (id: string, names: string[]) =>
  http.get(`*/api/publications/${id}/ideas`, () =>
    HttpResponse.json(
      names.map((name, i) => ({
        id: `i${i}`,
        name,
        draftCount: 0,
        updatedAt: '2026-10-01T00:00:00Z',
      })),
    ),
  )
const recentDraft = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  title: 'Why we write',
  ideaId: 'i1',
  ideaName: 'Writing',
  publicationId: 'ada-blog',
  publicationName: 'Blog',
  updatedAt: '2026-10-02T00:00:00Z',
  review: null,
  ...over,
})

beforeEach(() => localStorage.clear())

describe('Home: Quick add (#192)', () => {
  it('reads Add: then Idea, Note, Article, keeping the longer names for screen readers', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', []),
    )
    await renderAt('/')
    const region = await screen.findByRole('region', { name: 'Quick add' })
    expect(within(region).getByText('Add:')).toBeVisible()
    const tabs = within(region).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Idea', 'Note', 'Article'])
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual([
      'New idea',
      'Add a note',
      'Add article',
    ])
  })

  it('has no publication picker when there is only one', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', []),
    )
    await renderAt('/')
    await screen.findByRole('region', { name: 'Quick add' })
    expect(screen.queryByLabelText('Add to publication')).toBeNull()
  })

  it('starts from the publication you last worked in, if you still have it', async () => {
    localStorage.setItem('wordwright:last-publication', 'ada-letters')
    server.use(signedInAs(testUser), publications(blog, letters), llmSettings(true))
    await renderAt('/')
    expect(await screen.findByLabelText('Add to publication')).toHaveValue('ada-letters')
  })

  it('ignores a remembered publication that is gone, and uses the one with the newest draft', async () => {
    localStorage.setItem('wordwright:last-publication', 'ada-deleted')
    server.use(
      signedInAs(testUser),
      publications(blog, letters),
      llmSettings(true),
      http.get('*/api/drafts/active', () =>
        HttpResponse.json({
          drafts: [recentDraft({ publicationId: 'ada-letters', publicationName: 'Letters' })],
          hasMore: false,
        }),
      ),
    )
    await renderAt('/')
    const picker = await screen.findByLabelText('Add to publication')
    await waitFor(() => expect(picker).toHaveValue('ada-letters'))
  })

  it('falls back to the first publication, and remembers a different one when you pick it', async () => {
    server.use(signedInAs(testUser), publications(blog, letters), llmSettings(true))
    await renderAt('/')
    const picker = await screen.findByLabelText('Add to publication')
    expect(picker).toHaveValue('ada-blog')
    await fireEvent.update(picker, 'ada-letters')
    expect(localStorage.getItem('wordwright:last-publication')).toBe('ada-letters')
  })

  it('creates an idea and goes to it', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', []),
      http.post('*/api/publications/ada-blog/ideas', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          {
            id: 'new1',
            publicationId: 'ada-blog',
            name: 'On endings',
            notes: '',
            links: [],
            drafts: [],
            pendingSuggestions: 0,
            createdAt: '2026-10-16T00:00:00Z',
            updatedAt: '2026-10-16T00:00:00Z',
          },
          { status: 201 },
        )
      }),
      http.get('*/api/publications/ada-blog/ideas/new1', () =>
        HttpResponse.json({
          id: 'new1',
          publicationId: 'ada-blog',
          name: 'On endings',
          notes: '',
          links: [],
          drafts: [],
          pendingSuggestions: 0,
          createdAt: '2026-10-16T00:00:00Z',
          updatedAt: '2026-10-16T00:00:00Z',
        }),
      ),
    )
    const { router } = await renderAt('/')
    await fireEvent.update(await screen.findByLabelText('Idea name'), 'On endings')
    await fireEvent.click(screen.getByRole('button', { name: 'Create idea' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('idea'))
    expect(sent).toMatchObject({ name: 'On endings' })
    expect(router.currentRoute.value.params).toMatchObject({
      publicationId: 'ada-blog',
      id: 'new1',
    })
  })

  it('adds a note to the publication’s own notes, says so, and stays ready for another', async () => {
    const sent: unknown[] = []
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', ['x']),
      http.post('*/api/publications/ada-blog/notes', async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json(
          {
            id: 'n1',
            text: 'A thought',
            origin: 'entered',
            authorId: null,
            authorName: null,
            tags: [],
            readingItemId: null,
            quote: false,
            addedAt: null,
            createdAt: '2026-10-16T00:00:00Z',
            updatedAt: '2026-10-16T00:00:00Z',
          },
          { status: 201 },
        )
      }),
    )
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add a note' }))
    const field = screen.getByRole('textbox', { name: 'Note' })
    await fireEvent.update(field, 'A thought')
    await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText(/Added to Blog’s notes./)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open the notes' })).toHaveAttribute(
      'href',
      '/p/ada-blog/notes',
    )
    expect(sent).toMatchObject([{ text: 'A thought' }])
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('')
    // It points to notes that are not on this page, so it stays until the next note is started.
    await fireEvent.update(screen.getByRole('textbox', { name: 'Note' }), 'Another')
    expect(screen.queryByText(/Added to Blog’s notes./)).not.toBeInTheDocument()
  })

  it('adds something to read to the publication’s articles', async () => {
    const sent: unknown[] = []
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', ['x']),
      http.post('*/api/publications/ada-blog/reading', async ({ request }) => {
        sent.push(await request.json())
        return HttpResponse.json([])
      }),
    )
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add article' }))
    await fireEvent.update(screen.getByLabelText('Web address'), 'https://example.com/post')
    await fireEvent.click(screen.getByRole('button', { name: 'Add article' }))
    expect(await screen.findByText(/Added to Blog’s articles./)).toBeVisible()
    expect(sent).toMatchObject([{ url: 'https://example.com/post' }])
  })

  it('names the new page and where it went, with a link to it', async () => {
    let listed = false
    server.use(
      signedInAs(testUser),
      publications(blog, letters),
      llmSettings(true),
      ideasFor('ada-letters', ['x']),
      http.get('*/api/publications/ada-letters/reading', () => {
        listed = true
        return HttpResponse.json([])
      }),
      http.post('*/api/publications/ada-letters/reading', () =>
        HttpResponse.json(
          [
            {
              id: 'l9',
              url: 'https://example.com/post',
              title: 'A good post',
              authors: [],
              readAt: null,
              origin: 'entered',
              tags: [],
            },
          ],
          { status: 201 },
        ),
      ),
    )
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add article' }))
    const box = screen.getByLabelText('Web address')
    expect(box).toHaveAccessibleDescription('We will look up its title.')
    // Changing the publication keeps the address, and the form then adds to the new one.
    await fireEvent.update(box, 'example.com/post')
    await fireEvent.update(screen.getByLabelText('Add to publication'), 'ada-letters')
    expect(box).toHaveValue('example.com/post')
    // The new page is told apart from the list already there, so that has to have loaded.
    await waitFor(() => expect(listed).toBe(true))
    await fireEvent.click(screen.getByRole('button', { name: 'Add article' }))
    const status = (await screen.findByText(/Added “A good post” to Letters’s articles\./)).closest(
      'p',
    )!
    expect(within(status).getByRole('link', { name: 'Open “A good post”' })).toHaveAttribute(
      'href',
      '/p/ada-letters/reading/l9',
    )
    expect(box).toHaveValue('')
  })

  it('says what went wrong when adding fails, and keeps what was typed', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', ['x']),
      http.post('*/api/publications/ada-blog/notes', () =>
        HttpResponse.json({ error: 'That note is too long.' }, { status: 400 }),
      ),
    )
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add a note' }))
    await fireEvent.update(screen.getByRole('textbox', { name: 'Note' }), 'Words')
    await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That note is too long.')
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveValue('Words')
  })

  it.each([
    ['New idea', 'Idea name', 'Create idea', 'ideas', 'Words'],
    ['Add article', 'Web address', 'Add article', 'reading', 'https://a.example'],
  ])(
    'says what went wrong when %s fails, and keeps what was typed',
    async (open, label, submit, path, text) => {
      server.use(
        signedInAs(testUser),
        publications(blog),
        llmSettings(true),
        ideasFor('ada-blog', ['x']),
        http.post(`*/api/publications/ada-blog/${path}`, () =>
          HttpResponse.json({ error: 'Sorry, that did not work.' }, { status: 500 }),
        ),
      )
      await renderAt('/')
      await fireEvent.click(await screen.findByRole('tab', { name: open }))
      await fireEvent.update(screen.getByLabelText(label), text)
      await fireEvent.click(screen.getByRole('button', { name: submit }))
      expect(await screen.findByText('Sorry, that did not work.')).toBeVisible()
      expect(screen.getByLabelText(label)).toHaveValue(text)
    },
  )

  it('keeps adding to the publication you were shown when Keep writing loads late', async () => {
    const posted: string[] = []
    server.use(
      signedInAs(testUser),
      publications(blog, letters),
      llmSettings(true),
      ideasFor('ada-blog', ['x']),
      ideasFor('ada-letters', ['x']),
      http.get('*/api/drafts/active', async () => {
        await new Promise((r) => setTimeout(r, 200))
        return HttpResponse.json({
          drafts: [recentDraft({ publicationId: 'ada-letters', publicationName: 'Letters' })],
          hasMore: false,
        })
      }),
      http.post('*/api/publications/:id/reading', ({ params }) => {
        posted.push(String(params.id))
        return HttpResponse.json([])
      }),
    )
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add article' }))
    await fireEvent.update(screen.getByLabelText('Web address'), 'https://a.example')
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.getByLabelText('Add to publication')).toHaveValue('ada-blog')
    await fireEvent.click(screen.getByRole('button', { name: 'Add article' }))
    await screen.findByText(/Added to Blog’s articles/)
    expect(posted).toEqual(['ada-blog'])
  })

  it('remembers a publication when you open any page of it, an idea or a draft included', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog, letters),
      llmSettings(true),
      http.get('*/api/publications/ada-letters/ideas/i1', () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    )
    const { router } = await renderAt('/')
    await router.push({ name: 'idea', params: { publicationId: 'ada-letters', id: 'i1' } })
    expect(localStorage.getItem('wordwright:last-publication')).toBe('ada-letters')
  })

  it('shows New idea first, and one form at a time as you change tab', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', ['x']),
    )
    await renderAt('/')
    const idea = await screen.findByRole('tab', { name: 'New idea' })
    const note = screen.getByRole('tab', { name: 'Add a note' })
    expect(idea).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('Idea name')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
    await fireEvent.click(note)
    expect(note).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('textbox', { name: 'Note' })).toBeVisible()
    expect(screen.getByLabelText('Idea name')).not.toBeVisible()
  })

  it('shows the publication picker once, inside the form that is showing', async () => {
    server.use(signedInAs(testUser), publications(blog, letters), llmSettings(true))
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('tab', { name: 'Add a note' }))
    const picker = screen.getByLabelText('Add to publication')
    expect(picker.closest('form')).toBe(
      screen.getByRole('textbox', { name: 'Note' }).closest('form'),
    )
  })
})
