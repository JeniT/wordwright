import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ResearchItem, ResearchRun } from '@wordwright/core'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const idea = {
  id: 'i1',
  publicationId: 'ada-substack',
  name: 'Why rivers meander',
  notes: 'Erosion loops.',
  links: [],
  drafts: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const base = '*/api/publications/ada-substack/ideas/i1/research'
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
  createdAt: `2026-01-03T00:00:${String(counter).padStart(2, '0')}Z`,
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
    http.get('*/api/publications', () => HttpResponse.json([])),
    http.get('*/api/publications/ada-substack/ideas/i1', () => HttpResponse.json(idea)),
    http.get(base, () => HttpResponse.json(state.runs)),
    http.post(base, async ({ request }) => {
      const body = (await request.json()) as { areas: string }
      state.posts.push(body)
      const created = run({ areas: body.areas, items: state.finds })
      state.runs.unshift(created) // the server lists the newest first; the page puts it last
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
  it('starts empty, with the form and a way on', async () => {
    mockResearch()
    await renderAt(page)
    expect(await screen.findByRole('heading', { name: 'Research', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Next: 02 Read/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/read',
    )
    expect(await screen.findByText('No research yet.')).toBeInTheDocument()
    // The page ends with the button alone, no sentence beside it.
    expect(screen.getByRole('navigation', { name: 'Next step' })).toHaveTextContent(
      /^Next: 02 Read\s*→$/,
    )
    expect(screen.queryByText(/the text of your drafts never is/)).toBeNull() // the form says what is sent
    expect(screen.queryByRole('navigation', { name: /Research, above/ })).toBeNull() // one run: no paging
    expect(screen.getByRole('button', { name: 'Research' })).toBeDisabled() // nothing described yet
  })

  it('searches for the areas described, and shows what it found, with the earlier research a step back', async () => {
    const api = mockResearch([run({ areas: 'An earlier topic' })])
    api.finds = [item({ fetchedTitle: 'River Physics: a primer' })]
    await renderAt(page)
    await fireEvent.update(await areasBox(), '  Straightening of rivers ')
    await fireEvent.click(screen.getByRole('button', { name: 'Research' }))

    expect(await screen.findByText('Straightening of rivers')).toBeInTheDocument()
    expect(api.posts).toEqual([{ areas: 'Straightening of rivers' }])
    expect(screen.getByText('River Physics: a primer')).toBeInTheDocument()
    expect(screen.queryByText('An earlier topic')).toBeNull() // one run at a time
    await fireEvent.click(screen.getAllByRole('button', { name: 'Earlier research' })[0]!)
    expect(await screen.findByText('An earlier topic')).toBeInTheDocument()
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
    // The button keeps its label (and its width), is busy, and the wait is read out once.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Research' })).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Research' })).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelector('[aria-live=polite]')).toHaveTextContent(
      'Searching the web. This can take up to a minute.',
    )
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
    expect(within(alert).getByRole('link', { name: 'Add your AI key' })).toHaveAttribute(
      'href',
      '/account/ai',
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
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/publications/ada-substack/ideas/i1', () =>
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

  it('lists each page like the Scan page does: title as a link, host and author, and the AI’s reason marked', async () => {
    const { article } = await open()
    expect(article.getByRole('link', { name: /Page A/ })).toHaveAttribute('target', '_blank')
    expect(article.getByRole('link', { name: /Page A/ })).toHaveAttribute(
      'rel',
      expect.stringContaining('noopener'),
    )
    expect(article.getAllByText(/example\.org/).length).toBeGreaterThan(0)
    expect(article.getByText(/Ada Author/)).toBeInTheDocument()
    expect(article.queryByText(/The search called it/)).toBeNull()
    expect(
      article.getByText('Highlighted text is your AI’s reason for suggesting this item.'),
    ).toHaveClass('bg-mark')
    expect(article.queryByText(/Your AI’s reason:/)).toBeNull()
    expect(article.getAllByText('Looks relevant to the area.')).toHaveLength(4)
    expect(article.getAllByText('Looks relevant to the area.')[0]).toHaveClass('bg-mark')
    expect(article.queryAllByRole('checkbox')).toHaveLength(0)
    expect(article.getAllByRole('listitem')).toHaveLength(4)
  })

  it('warns about a page with no readable title, and rules out pages that do not exist or are not public', async () => {
    const { article } = await open()
    expect(article.getByText('We couldn’t confirm the title of this page.')).toBeInTheDocument()
    expect(article.getByRole('button', { name: 'Add to reading list: Page B' })).toBeEnabled()
    expect(
      article.getByText('We couldn’t find a website at this address, so it can’t be added.'),
    ).toBeInTheDocument()
    expect(
      article.getByText('This address isn’t a public website, so it can’t be added.'),
    ).toBeInTheDocument()
    expect(article.getByRole('button', { name: 'Add to reading list: Page C' })).toBeDisabled()
    expect(article.getByRole('button', { name: 'Add to reading list: Page D' })).toBeDisabled()
    expect(article.getByRole('button', { name: 'Ignore: Page C' })).toBeEnabled() // clears it off the list
  })

  it('adds a page with one click, then shows it as in the reading list with a way back, at the end', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Add to reading list: Page A' }))
    await waitFor(() => expect(api.posts).toEqual([{ add: ['a'] }]))

    expect(await article.findByRole('img', { name: 'In the reading list' })).toBeInTheDocument()
    await waitFor(() =>
      expect(
        article.getByRole('button', { name: 'Take off the reading list: Page A' }),
      ).toBeEnabled(),
    )
    expect(article.queryByRole('button', { name: 'Add to reading list: Page A' })).toBeNull()
    expect(article.getAllByText('Looks relevant to the area.')).toHaveLength(3) // the other three
    // Decided pages drop to the end, as on the Scan page.
    const rows = article.getAllByRole('listitem')
    expect(rows[rows.length - 1]).toHaveTextContent('Page A')
    expect(await article.findByText('Added “Page A” to the reading list.')).toBeInTheDocument()
  })

  it('ignores a page with one click, and can stop ignoring it', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Ignore: Page B' }))
    await waitFor(() => expect(api.posts).toEqual([{ dismiss: ['b'] }]))
    expect(await article.findByRole('img', { name: 'Ignored' })).toBeInTheDocument()
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Stop ignoring: Page B' })).toBeEnabled(),
    )
    expect(article.queryByRole('button', { name: 'Ignore: Page B' })).toBeNull()
    await fireEvent.click(article.getByRole('button', { name: 'Stop ignoring: Page B' }))
    await waitFor(() => expect(api.posts).toContainEqual({ reconsider: ['b'] }))
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Ignore: Page B' })).toBeEnabled(),
    )
    expect(article.queryByRole('img', { name: 'Ignored' })).toBeNull()
  })

  it('lets a page that cannot be added be ignored', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Ignore: Page C' }))
    await waitFor(() => expect(api.posts).toEqual([{ dismiss: ['c'] }]))
  })

  it('taking an added page off the reading list brings its buttons back', async () => {
    const { api, article } = await open()
    await fireEvent.click(article.getByRole('button', { name: 'Add to reading list: Page A' }))
    await fireEvent.click(
      await article.findByRole('button', { name: 'Take off the reading list: Page A' }),
    )
    await waitFor(() => expect(api.posts).toContainEqual({ reconsider: ['a'] }))
    await waitFor(() =>
      expect(article.getByRole('button', { name: 'Add to reading list: Page A' })).toBeEnabled(),
    )
    expect(article.queryByRole('img', { name: 'In the reading list' })).toBeNull()
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
    await fireEvent.click(article.getByRole('button', { name: 'Add to reading list: Page A' }))
    expect(await article.findByRole('alert')).toHaveTextContent('already on the reading list')
    expect(article.getByRole('button', { name: 'Add to reading list: Page A' })).toBeEnabled()
    await fireEvent.click(article.getByRole('button', { name: 'Dismiss' }))
    expect(article.queryByRole('alert')).toBeNull()
  })

  it('says so when a run found nothing', async () => {
    mockResearch([run({ items: [] })])
    await renderAt(page)
    expect(await screen.findByText(/Nothing worth reading turned up/)).toBeInTheDocument()
  })

  it('has the delete button on the same line as the topic', async () => {
    const { article } = await open()
    const heading = article.getByRole('heading', { name: 'How fast bends migrate' })
    expect(heading.parentElement).toContainElement(
      article.getByRole('button', { name: /^Delete this research/ }),
    )
  })

  it('says the highlight is the AI’s reason only while a page is waiting for a decision', async () => {
    const { article } = await open([item({ id: 'a', fetchedTitle: 'Page A' })])
    const line = 'Highlighted text is your AI’s reason for suggesting this item.'
    expect(article.getByText(line)).toBeInTheDocument()
    await fireEvent.click(article.getByRole('button', { name: 'Ignore: Page A' }))
    await waitFor(() => expect(article.queryByText(line)).toBeNull())
  })

  it('deletes a run only once it is confirmed, and says pages already added stay', async () => {
    const { article } = await open()
    const button = article.getByRole('button', { name: /^Delete this research/ })
    button.focus()
    expect(document.querySelector('[data-tip]')).toHaveTextContent(/stay there/)
    button.blur()
    await fireEvent.click(button) // no hold: it only asks to be pressed again
    expect(await screen.findByText('Delete?')).toBeInTheDocument()
    expect(screen.getByText('How fast bends migrate')).toBeInTheDocument()
    await fireEvent.click(button)
    await waitFor(() => expect(screen.queryByText('How fast bends migrate')).toBeNull())
  })
})

describe('paging through the research', () => {
  const three = () => [
    run({ areas: 'First topic', items: [item()] }),
    run({ areas: 'Second topic', items: [item()] }),
    run({ areas: 'Third topic', items: [item()] }),
  ]
  const nav = (where: 'above' | 'below') =>
    within(screen.getByRole('navigation', { name: `Research, ${where} the list` }))

  it('shows the newest run, with Earlier research on the left and Later research on the right', async () => {
    mockResearch(three().reverse()) // the server sends the newest first
    await renderAt(page)
    expect(await screen.findByText('Third topic')).toBeInTheDocument()
    expect(screen.queryByText('Second topic')).toBeNull()
    expect(nav('above').getByText('Research 3 of 3')).toBeInTheDocument()
    expect(nav('above').getByRole('button', { name: 'Later research' })).toBeDisabled()

    await fireEvent.click(nav('above').getByRole('button', { name: 'Earlier research' }))
    expect(await screen.findByText('Second topic')).toBeInTheDocument()
    await fireEvent.click(nav('below').getByRole('button', { name: 'Earlier research' }))
    expect(await screen.findByText('First topic')).toBeInTheDocument()
    expect(nav('above').getByRole('button', { name: 'Earlier research' })).toBeDisabled()
    await fireEvent.click(nav('above').getByRole('button', { name: 'Later research' }))
    expect(await screen.findByText('Second topic')).toBeInTheDocument()
  })

  it('has no paging below a run that found nothing', async () => {
    mockResearch([run({ areas: 'First topic' }), run({ areas: 'Empty topic', items: [] })])
    await renderAt(page)
    expect(await screen.findByText('Empty topic')).toBeInTheDocument()
    expect(nav('above').getByText('Research 2 of 2')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Research, below the list' })).toBeNull()
  })

  it('jumps to a new run when one is made', async () => {
    mockResearch(three().reverse())
    await renderAt(page)
    await fireEvent.click((await screen.findAllByRole('button', { name: 'Earlier research' }))[0]!)
    expect(await screen.findByText('Second topic')).toBeInTheDocument()
    await fireEvent.update(await areasBox(), 'Fourth topic')
    await fireEvent.click(screen.getByRole('button', { name: 'Research' }))
    expect(await screen.findByText('Fourth topic')).toBeInTheDocument()
    expect(screen.getAllByText('Research 4 of 4').length).toBeGreaterThan(0)
  })
})

describe('the research page: tutorial mode', () => {
  const text =
    /^Describe the areas you want to look into and your AI will suggest pages worth reading, aiming for a range of opinions\. Add the ones you want to your reading list\.$/
  const setup = async (on: boolean) => {
    mockResearch()
    server.use(signedInAs(on ? { ...testUser, tutorialMode: true } : testUser))
    // The route 'idea-research' is this kind of page (see tutorial-routes.test.ts).
    await renderAt(page)
    await screen.findByText('No research yet.')
  }

  it('writes out what the page is for', async () => {
    await setup(true)
    expect(screen.getByText(text)).toBeVisible()
  })

  it('says none of it when it is off', async () => {
    await setup(false)
    expect(screen.queryByText(text)).toBeNull()
  })
})
