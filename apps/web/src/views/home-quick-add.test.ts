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
  ...over,
})

beforeEach(() => localStorage.clear())

describe('Home: Pick up (#192)', () => {
  it('lists the drafts you edit, each with a link to continue', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      http.get('*/api/drafts/recent', () =>
        HttpResponse.json([recentDraft(), recentDraft({ id: 'd2', title: '', ideaName: 'Other' })]),
      ),
    )
    await renderAt('/')
    const section = (await screen.findByRole('heading', { name: 'Pick up' })).closest('section')!
    const items = await within(section).findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Why we write')
    expect(items[0]).toHaveTextContent('Writing · Blog')
    expect(within(items[0]!).getByRole('link', { name: /Continue/ })).toHaveAttribute(
      'href',
      '/p/ada-blog/drafts/d1',
    )
    expect(items[1]).toHaveTextContent('Untitled draft')
  })

  it('is not there at all when there is nothing to pick up', async () => {
    server.use(signedInAs(testUser), publications(blog), llmSettings(true))
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Quick add' })
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Pick up' })).toBeNull()
  })

  it('says when it could not load, and lets you try again', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      http.get('*/api/drafts/recent', () => HttpResponse.json({ error: 'no' }, { status: 500 })),
    )
    await renderAt('/')
    const section = (await screen.findByRole('heading', { name: 'Pick up' })).closest('section')!
    expect(await within(section).findByRole('alert')).toHaveTextContent(/couldn't load your drafts/)
    expect(within(section).getByRole('button', { name: /try again/i })).toBeVisible()
  })

  it('is not offered before there is a publication', async () => {
    server.use(signedInAs(testUser), publications(), llmSettings(false))
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Get started' })
    expect(screen.queryByRole('heading', { name: 'Pick up' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Quick add' })).toBeNull()
  })
})

describe('Home: Quick add (#192)', () => {
  it('has no publication picker when there is only one', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', []),
    )
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Quick add' })
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
      http.get('*/api/drafts/recent', () =>
        HttpResponse.json([
          recentDraft({ publicationId: 'ada-letters', publicationName: 'Letters' }),
        ]),
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

  it('makes New idea the main button only while the chosen publication has no ideas', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog, letters),
      llmSettings(true),
      ideasFor('ada-blog', []),
      ideasFor('ada-letters', ['An idea']),
    )
    await renderAt('/')
    const button = await screen.findByRole('button', { name: 'New idea' })
    await waitFor(() => expect(button).toHaveClass('btn-primary'))
    await fireEvent.update(screen.getByLabelText('Add to publication'), 'ada-letters')
    await waitFor(() => expect(button).toHaveClass('btn-outline'))
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
          createdAt: '2026-10-16T00:00:00Z',
          updatedAt: '2026-10-16T00:00:00Z',
        }),
      ),
    )
    const { router } = await renderAt('/')
    await fireEvent.click(await screen.findByRole('button', { name: 'New idea' }))
    await fireEvent.update(screen.getByLabelText('Idea name'), 'On endings')
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
    const open = await screen.findByRole('button', { name: 'Add a note' })
    await fireEvent.click(open)
    const field = screen.getByLabelText('Note')
    expect(field).toHaveFocus()
    await fireEvent.update(field, 'A thought')
    await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText(/Added to Blog’s notes./)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Open the notes' })).toHaveAttribute(
      'href',
      '/p/ada-blog/notes',
    )
    expect(sent).toMatchObject([{ text: 'A thought' }])
    expect(screen.getByLabelText('Note')).toHaveValue('')
  })

  it('adds something to read to the publication’s reading list', async () => {
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
    await fireEvent.click(await screen.findByRole('button', { name: 'Add something to read' }))
    await fireEvent.update(screen.getByLabelText('Web address'), 'https://example.com/post')
    await fireEvent.click(screen.getByRole('button', { name: 'Add to reading list' }))
    expect(await screen.findByText(/Added to Blog’s reading list./)).toBeVisible()
    expect(sent).toMatchObject([{ url: 'https://example.com/post' }])
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
    await fireEvent.click(await screen.findByRole('button', { name: 'Add a note' }))
    await fireEvent.update(screen.getByLabelText('Note'), 'Words')
    await fireEvent.click(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That note is too long.')
    expect(screen.getByLabelText('Note')).toHaveValue('Words')
  })

  it('closes with Cancel or Escape and gives focus back to the button', async () => {
    server.use(
      signedInAs(testUser),
      publications(blog),
      llmSettings(true),
      ideasFor('ada-blog', ['x']),
    )
    await renderAt('/')
    const open = await screen.findByRole('button', { name: 'Add a note' })
    await fireEvent.click(open)
    expect(open).toHaveAttribute('aria-expanded', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Note')).toBeNull()
    await waitFor(() => expect(open).toHaveFocus())
    await fireEvent.click(open)
    await fireEvent.keyDown(screen.getByLabelText('Note'), { key: 'Escape' })
    expect(screen.queryByLabelText('Note')).toBeNull()
  })
})
