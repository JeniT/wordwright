import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ResearchItem, ResearchRun } from '@lfwa/core'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const idea = {
  id: 'i1',
  profileId: 'ada-substack',
  name: 'Why rivers meander',
  notes: 'Erosion loops.',
  links: [],
  drafts: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const base = '*/api/profiles/ada-substack/ideas/i1/research'
const page = '/p/ada-substack/ideas/i1/research'

let counter = 0
const item = (overrides: Partial<ResearchItem> = {}): ResearchItem => ({
  id: `item${++counter}`,
  url: `https://example.org/page-${counter}`,
  title: `Search title ${counter}`,
  why: 'Looks relevant to the area.',
  check: 'found',
  fetchedTitle: `Real title ${counter}`,
  fetchedAuthors: [],
  status: 'suggested',
  ...overrides,
})
const run = (overrides: Partial<ResearchRun> = {}): ResearchRun => ({
  id: `run${++counter}`,
  areas: 'How fast bends migrate',
  createdByName: 'Ada',
  model: 'claude-sonnet-5-5',
  createdAt: '2026-01-03T00:00:00Z',
  items: [],
  ...overrides,
})

/** A pretend API that keeps the runs, as the real one does. */
function mockResearch(initial: ResearchRun[] = [], extra: Parameters<typeof server.use> = []) {
  const state = {
    runs: [...initial],
    posts: [] as unknown[],
    /** What a new search finds. */
    finds: [] as ResearchItem[],
  }
  const find = (id: string) => state.runs.find((r) => r.id === id)!
  server.use(
    signedInAs(testUser),
    ...extra,
    http.get('*/api/profiles', () => HttpResponse.json([])),
    http.get('*/api/profiles/ada-substack/ideas/i1', () => HttpResponse.json(idea)),
    http.get(base, () => HttpResponse.json(state.runs)),
    http.post(base, async ({ request }) => {
      const body = (await request.json()) as { areas: string }
      state.posts.push(body)
      const created = run({ areas: body.areas, items: state.finds })
      state.runs.unshift(created)
      return HttpResponse.json(created, { status: 201 })
    }),
    http.post(`${base}/:runId/add`, async ({ request, params }) => {
      const { itemIds } = (await request.json()) as { itemIds: string[] }
      state.posts.push({ add: itemIds })
      const r = find(params.runId as string)
      r.items = r.items.map((i) => (itemIds.includes(i.id) ? { ...i, status: 'added' } : i))
      return HttpResponse.json(r)
    }),
    http.post(`${base}/:runId/dismiss`, async ({ request, params }) => {
      const { itemIds } = (await request.json()) as { itemIds: string[] }
      state.posts.push({ dismiss: itemIds })
      const r = find(params.runId as string)
      r.items = r.items.map((i) => (itemIds.includes(i.id) ? { ...i, status: 'dismissed' } : i))
      return HttpResponse.json(r)
    }),
    http.post(`${base}/:runId/reconsider`, async ({ request, params }) => {
      const { itemIds } = (await request.json()) as { itemIds: string[] }
      state.posts.push({ reconsider: itemIds })
      const r = find(params.runId as string)
      r.items = r.items.map((i) => (itemIds.includes(i.id) ? { ...i, status: 'suggested' } : i))
      return HttpResponse.json(r)
    }),
    http.delete(`${base}/:runId`, ({ params }) => {
      state.runs = state.runs.filter((r) => r.id !== params.runId)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return state
}

const areasBox = () => screen.findByLabelText('What areas do you want to research?')

describe('the research page', () => {
  it('says what is sent and who sees it, and starts empty', async () => {
    mockResearch()
    await renderAt(page)
    expect(await screen.findByRole('heading', { name: 'Research', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Back to the idea' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1',
    )
    expect(screen.getByText(/including some that may not agree with you/)).toBeInTheDocument()
    expect(screen.getByText(/the text of your drafts never is/)).toBeInTheDocument()
    expect(screen.getByText(/Everyone in this profile sees the research/)).toBeInTheDocument()
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Research' })).toBeDisabled() // nothing described yet
  })

  it('searches for the areas described, and shows what it found at the top', async () => {
    const api = mockResearch([run({ areas: 'An earlier topic' })])
    api.finds = [item({ fetchedTitle: 'River Physics: a primer' })]
    await renderAt(page)
    await fireEvent.update(await areasBox(), '  Straightening of rivers ')
    await fireEvent.click(screen.getByRole('button', { name: 'Research' }))

    expect(await screen.findByText('Straightening of rivers')).toBeInTheDocument()
    expect(api.posts).toEqual([{ areas: 'Straightening of rivers' }])
    const articles = screen.getAllByRole('article').filter((a) => a.getAttribute('aria-labelledby'))
    expect(within(articles[0]!).getByText('River Physics: a primer')).toBeInTheDocument()
    expect(screen.getByText('An earlier topic')).toBeInTheDocument()
    await waitFor(() => expect(areasBox()).resolves.toHaveValue('')) // ready for another topic
  })

  it('shows that it is searching, and holds the form meanwhile', async () => {
    mockResearch()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post(base, async () => {
        await held
        return HttpResponse.json(run(), { status: 201 })
      }),
    )
    await renderAt(page)
    await fireEvent.update(await areasBox(), 'Anything')
    await fireEvent.click(screen.getByRole('button', { name: 'Research' }))
    expect(await screen.findByRole('button', { name: 'Searching…' })).toBeDisabled()
    expect(screen.getByText(/Searching the web. This can take up to a minute./)).toBeInTheDocument()
    expect(screen.getByLabelText('What areas do you want to research?')).toBeDisabled()
    release()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Research' })).toBeDisabled())
  })

  it('says what happened when the search fails, with account settings for a key problem', async () => {
    mockResearch()
    server.use(
      http.post(base, () =>
        HttpResponse.json(
          { error: 'Your AI provider rejected your API key. Update it in your account settings.' },
          { status: 409 },
        ),
      ),
    )
    await renderAt(page)
    await fireEvent.update(await areasBox(), 'Anything')
    await fireEvent.click(screen.getByRole('button', { name: 'Research' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('rejected your API key')
    expect(within(alert).getByRole('link', { name: 'Go to account settings' })).toHaveAttribute(
      'href',
      '/account',
    )
    expect(screen.getByLabelText('What areas do you want to research?')).toHaveValue('Anything')
  })

  it('shows another failure without the settings link', async () => {
    mockResearch()
    server.use(
      http.post(base, () =>
        HttpResponse.json({ error: 'The search took too long. Try again.' }, { status: 504 }),
      ),
    )
    await renderAt(page)
    await fireEvent.update(await areasBox(), 'Anything')
    await fireEvent.click(screen.getByRole('button', { name: 'Research' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The search took too long.')
    expect(within(alert).queryByRole('link')).toBeNull()
  })

  it('says so when the research cannot be loaded', async () => {
    mockResearch([], [http.get(base, () => HttpResponse.json({ error: 'no' }, { status: 500 }))])
    await renderAt(page)
    expect(await screen.findByText(/We couldn't load the research/)).toBeInTheDocument()
  })

  it('says so when the idea cannot be opened', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([])),
      http.get('*/api/profiles/ada-substack/ideas/i1', () =>
        HttpResponse.json({ error: 'no' }, { status: 404 }),
      ),
      http.get(base, () => HttpResponse.json([])),
    )
    await renderAt(page)
    expect(await screen.findByText("We couldn't open that idea")).toBeInTheDocument()
  })
})

describe('reviewing what research found', () => {
  const found = () => [
    item({
      id: 'a',
      fetchedTitle: 'Page A',
      title: 'Search title A',
      fetchedAuthors: ['Ada Author'],
    }),
    item({ id: 'b', fetchedTitle: null, title: 'Page B', check: 'no-title' }),
    item({ id: 'c', fetchedTitle: null, title: 'Page C', check: 'not-found' }),
    item({ id: 'd', fetchedTitle: null, title: 'Page D', check: 'not-public' }),
  ]
  const open = async (items = found()) => {
    const api = mockResearch([run({ id: 'r1', items })])
    await renderAt(page)
    return {
      api,
      article: within(await screen.findByRole('article', { name: 'How fast bends migrate' })),
    }
  }

  it('shows each page with both titles, any author, and the AI’s reason as unchecked, and no checkboxes', async () => {
    const { article } = await open()
    expect(article.getByText('Page A')).toBeInTheDocument()
    expect(article.getByText(/The search called it:/)).toBeInTheDocument()
    expect(article.getByText('Search title A')).toBeInTheDocument()
    expect(article.getByText('Ada Author')).toBeInTheDocument()
    expect(article.getAllByText(/Why the AI suggests it \(unchecked\):/)).toHaveLength(4)
    expect(article.queryAllByRole('checkbox')).toHaveLength(0)
    expect(article.queryByRole('button', { name: /Tick all|ticked/ })).toBeNull()
    const link = article.getAllByRole('link', { name: /Open the page/ })[0]!
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('warns about a page with no readable title, and rules out pages that do not exist or are not public', async () => {
    const { article } = await open()
    expect(article.getByText(/couldn't read a title from this page/)).toBeInTheDocument()
    expect(article.getByRole('button', { name: 'Add to the reading list: Page B' })).toBeEnabled()
    expect(
      article.getByText(/Problem: we couldn't find a website at this address/),
    ).toBeInTheDocument()
    expect(article.getByText(/Problem: this address isn't a public website/)).toBeInTheDocument()
    expect(article.getByRole('button', { name: 'Add to the reading list: Page C' })).toBeDisabled()
    expect(article.getByRole('button', { name: 'Add to the reading list: Page D' })).toBeDisabled()
    expect(article.getByRole('button', { name: 'Ignore: Page C' })).toBeEnabled() // clears it off the list
  })

  it('adds a page with one click, then collapses it to its title with a green tick and a way back', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Add to the reading list: Page A' }))
    await waitFor(() => expect(api.posts).toEqual([{ add: ['a'] }]))

    expect(
      await article.findByRole('img', { name: 'Added to the reading list' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Reconsider: Page A' })).toBeEnabled(),
    )
    // Collapsed: the details and the decision buttons are gone, the title stays.
    expect(article.getByText('Page A')).toBeInTheDocument()
    expect(article.queryByText('Search title A')).toBeNull()
    expect(article.queryByRole('button', { name: 'Add to the reading list: Page A' })).toBeNull()
    expect(article.queryByRole('button', { name: 'Ignore: Page A' })).toBeNull()
    expect(article.getAllByText(/Why the AI suggests it/)).toHaveLength(3) // the other three
  })

  it('ignores a page with one click, then collapses it to its title with a red cross', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Ignore: Page B' }))
    await waitFor(() => expect(api.posts).toEqual([{ dismiss: ['b'] }]))
    expect(await article.findByRole('img', { name: 'Ignored' })).toBeInTheDocument()
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Reconsider: Page B' })).toBeEnabled(),
    )
    expect(article.queryByRole('button', { name: 'Ignore: Page B' })).toBeNull()
  })

  it('lets a page that cannot be added be ignored', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Ignore: Page C' }))
    await waitFor(() => expect(api.posts).toEqual([{ dismiss: ['c'] }]))
  })

  it('reconsidering expands a page again, whether it was added or ignored', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Add to the reading list: Page A' }))
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Reconsider: Page A' })).toBeEnabled(),
    )
    await fireEvent.click(article.getByRole('button', { name: 'Ignore: Page B' }))
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Reconsider: Page B' })).toBeEnabled(),
    )
    await fireEvent.click(article.getByRole('button', { name: 'Reconsider: Page A' }))
    await waitFor(() => expect(api.posts).toContainEqual({ reconsider: ['a'] }))

    await waitFor(() =>
      expect(
        article.getByRole('button', { name: 'Add to the reading list: Page A' }),
      ).toBeEnabled(),
    )
    expect(article.getByText('Search title A')).toBeInTheDocument() // the details are back
    expect(article.queryByRole('img', { name: 'Added to the reading list' })).toBeNull()
    expect(article.getByRole('img', { name: 'Ignored' })).toBeInTheDocument() // B is still ignored

    await fireEvent.click(article.getByRole('button', { name: 'Reconsider: Page B' }))
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Ignore: Page B' })).toBeEnabled(),
    )
    expect(article.queryByRole('img', { name: 'Ignored' })).toBeNull()
  })

  it('shows why a decision was refused, and leaves the page as it was', async () => {
    mockResearch(
      [run({ id: 'r1', items: found() })],
      [
        http.post(`${base}/r1/add`, () =>
          HttpResponse.json(
            { error: '“Page A” is already on the reading list. Remove it.' },
            { status: 409 },
          ),
        ),
      ],
    )
    await renderAt(page)
    const article = within(await screen.findByRole('article', { name: 'How fast bends migrate' }))
    await fireEvent.click(article.getByRole('button', { name: 'Add to the reading list: Page A' }))
    expect(await article.findByRole('alert')).toHaveTextContent('already on the reading list')
    expect(article.getByRole('button', { name: 'Add to the reading list: Page A' })).toBeEnabled()
    await fireEvent.click(article.getByRole('button', { name: 'Dismiss' }))
    expect(article.queryByRole('alert')).toBeNull()
  })

  it('says so when a run found nothing', async () => {
    mockResearch([run({ items: [] })])
    await renderAt(page)
    expect(await screen.findByText(/Nothing new turned up/)).toBeInTheDocument()
  })

  it('deletes a run only after asking, and says pages already added stay', async () => {
    const { article } = await open()
    await fireEvent.click(article.getByRole('button', { name: /^Delete this research/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this research?' })
    expect(dialog).toHaveTextContent('Pages you already added to the reading list stay there.')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('How fast bends migrate')).toBeInTheDocument()

    await fireEvent.click(article.getByRole('button', { name: /^Delete this research/ }))
    await fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, delete it' }),
    )
    await waitFor(() => expect(screen.queryByText('How fast bends migrate')).toBeNull())
  })
})
