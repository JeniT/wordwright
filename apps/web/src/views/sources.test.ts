import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  llmSettings,
  renderAt,
  server,
  showArrows,
  signedInAs,
  testUser,
  useMockServer,
} from '../test-utils'

useMockServer()

const profile = (role: 'owner' | 'editor') => ({
  id: 'adalovelace-blog',
  name: 'Blog',
  siteUrl: null,
  imageUrl: null,
  role,
  members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role }],
})
const source = (id: string, host: string, extra = {}) => ({
  id,
  url: `https://${host}/feed`,
  title: null,
  description: null,
  siteUrl: null,
  iconUrl: null,
  ...extra,
})
const A = source('s1', 'a.example', {
  title: 'Alpha Notes',
  description: 'Essays on reading and thinking',
  iconUrl: '/api/profiles/adalovelace-blog/sources/s1/icon?v=1',
})
const B = source('s2', 'b.example', { title: 'Beta Weekly' })
const C = source('s3', 'c.example') // added before feeds were read: no title

/** A tiny fake of the sources endpoints that remembers what it was sent. */
function fakeSources(initial = [A, B, C]) {
  const state = { list: [...initial], orders: [] as string[][], added: [] as string[] }
  server.use(
    http.get('*/api/profiles/:id/sources', () => HttpResponse.json(state.list)),
    http.get('*/api/profiles/:id/sources/recent', () =>
      HttpResponse.json({ days: 30, posts: [], omitted: 0, undated: 0, failed: [] }),
    ),
    http.post('*/api/profiles/:id/sources', async ({ request }) => {
      const { url } = (await request.json()) as { url: string }
      state.added.push(url)
      const added = source(`n${state.list.length}`, url.replace('/feed', ''), {
        title: `Feed of ${url}`,
      })
      state.list.push(added)
      return HttpResponse.json(added, { status: 201 })
    }),
    http.put('*/api/profiles/:id/sources/order', async ({ request }) => {
      const { ids } = (await request.json()) as { ids: string[] }
      state.orders.push(ids)
      state.list = ids.map((id) => state.list.find((s) => s.id === id)!)
      return HttpResponse.json(state.list)
    }),
    http.delete('*/api/profiles/:id/sources/:sourceId', ({ params }) => {
      state.list = state.list.filter((s) => s.id !== params.sourceId)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return state
}

async function openSearch(role: 'owner' | 'editor' = 'owner') {
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([profile(role)])),
  )
  await renderAt('/p/adalovelace-blog/search')
  return screen.findByRole('heading', { name: 'Feeds' })
}
/**
 * jsdom has no DragEvent, so a plain event stands in and the pointer position is set by hand.
 * Rows have no height here, so any positive clientY is the bottom half and any negative the top.
 */
const dragOver = (row: Element, clientY: number, dataTransfer: object) => {
  const event = createEvent.dragOver(row, { dataTransfer })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return fireEvent(row, event)
}
const rows = () =>
  screen.getAllByRole('listitem').filter((li) => li.querySelector('[data-testid="grip"]'))

beforeEach(() =>
  server.use(
    llmSettings(true),
    // Owners' settings pages also list pending invitations.
    http.get('*/api/profiles/:id/invitations', () => HttpResponse.json([])),
  ),
)

describe('feeds on the Search page', () => {
  it('lists the sources in order with their title, description and address', async () => {
    fakeSources()
    await openSearch()
    await screen.findByText('Alpha Notes')
    const [first, second, third] = rows()
    expect(first).toHaveTextContent('Alpha Notes')
    expect(first).toHaveTextContent('Essays on reading and thinking')
    expect(first).toHaveTextContent('a.example/feed') // the address, without "https://"
    expect(second).toHaveTextContent('Beta Weekly')
    expect(third).toHaveTextContent('c.example/feed') // no title yet: the address stands in
  })

  it('shows each feed’s icon, and a lettered tile when it has none', async () => {
    fakeSources()
    await openSearch()
    await screen.findByText('Alpha Notes')
    const [first, second] = rows()
    expect(first!.querySelector('img')).toHaveAttribute('src', A.iconUrl)
    expect(first!.querySelector('img')).toHaveAttribute('alt', '') // the name is beside it
    expect(second!.querySelector('img')).toBeNull()
    expect(within(second!).getByText('B')).toBeInTheDocument()
  })

  it('explains an empty list and what to do', async () => {
    fakeSources([])
    await openSearch()
    expect(await screen.findByText(/No sources yet/)).toBeInTheDocument()
    expect(screen.getByLabelText('Add a feed')).toBeInTheDocument()
  })

  it('says what went wrong loading, and tries again on request', async () => {
    let attempts = 0
    server.use(
      http.get('*/api/profiles/:id/sources', () =>
        ++attempts === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json([A]),
      ),
    )
    await openSearch()
    expect(await screen.findByText(/couldn't load the sources/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Alpha Notes')).toBeInTheDocument()
  })

  it('adds a pasted link to the end of the list and clears the field', async () => {
    const fake = fakeSources([A])
    await openSearch()
    await screen.findByText('Alpha Notes')
    await fireEvent.update(screen.getByLabelText('Add a feed'), 'new.example/feed')
    await fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    expect(await screen.findByText('Feed of new.example/feed')).toBeInTheDocument()
    expect(fake.added).toEqual(['new.example/feed'])
    expect(screen.getByLabelText('Add a feed')).toHaveValue('')
    expect(screen.getByText('Added Feed of new.example/feed')).toBeInTheDocument()
  })

  it('tells the person we are reading the feed while it is being added', async () => {
    fakeSources([A])
    let release: () => void = () => {}
    const released = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/profiles/:id/sources', async () => {
        await released
        return HttpResponse.json(B, { status: 201 })
      }),
    )
    await openSearch()
    await screen.findByText('Alpha Notes')
    await fireEvent.update(screen.getByLabelText('Add a feed'), 'b.example')
    await fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    expect(await screen.findByRole('button', { name: 'Reading the feed…' })).toBeDisabled()
    release()
    await screen.findByRole('button', { name: 'Add source' })
  })

  it('shows why a link was refused, and keeps what was typed', async () => {
    fakeSources([A])
    server.use(
      http.post('*/api/profiles/:id/sources', () =>
        HttpResponse.json(
          { error: 'That address doesn’t look like an RSS or Atom feed.' },
          { status: 422 },
        ),
      ),
    )
    await openSearch()
    await screen.findByText('Alpha Notes')
    await fireEvent.update(screen.getByLabelText('Add a feed'), 'a.example/page')
    await fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('RSS or Atom')
    expect(screen.getByLabelText('Add a feed')).toHaveValue('a.example/page')
  })

  it('removes a source', async () => {
    fakeSources()
    await openSearch()
    const remove = await screen.findByRole('button', { name: 'Remove Beta Weekly' })
    await fireEvent.click(remove) // no hold: it only asks to be pressed again
    expect(screen.getByText('Beta Weekly')).toBeInTheDocument()
    await fireEvent.click(remove)
    await waitFor(() => expect(screen.queryByText('Beta Weekly')).not.toBeInTheDocument())
    expect(screen.getByText('Alpha Notes')).toBeInTheDocument()
    expect(screen.getByText('Removed Beta Weekly')).toBeInTheDocument()
  })

  it('moves a source up or down with the buttons, sending the complete new order', async () => {
    const fake = fakeSources()
    await openSearch()
    await showArrows()
    await fireEvent.click(screen.getByRole('button', { name: 'Move c.example/feed up' }))
    await waitFor(() => expect(fake.orders).toEqual([['s1', 's3', 's2']]))
    await fireEvent.click(screen.getByRole('button', { name: 'Move Alpha Notes down' }))
    await waitFor(() => expect(fake.orders[1]).toEqual(['s3', 's1', 's2']))
    expect(rows().map((li) => li.textContent)).toEqual([
      expect.stringContaining('c.example/feed'),
      expect.stringContaining('Alpha Notes'),
      expect.stringContaining('Beta Weekly'),
    ])
  })

  it('shows a move at once, while the server is still answering', async () => {
    const fake = fakeSources()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.put('*/api/profiles/:id/sources/order', async ({ request }) => {
        await held
        const { ids } = (await request.json()) as { ids: string[] }
        fake.orders.push(ids)
        fake.list = ids.map((id) => fake.list.find((s) => s.id === id)!)
        return HttpResponse.json(fake.list)
      }),
    )
    await openSearch()
    await showArrows()
    await fireEvent.click(screen.getByRole('button', { name: 'Move c.example/feed up' }))
    expect(rows()[1]).toHaveTextContent('c.example/feed') // already there, nothing has been saved yet
    expect(fake.orders).toEqual([])
    release()
    await waitFor(() => expect(fake.orders).toEqual([['s1', 's3', 's2']]))
    expect(rows()[1]).toHaveTextContent('c.example/feed')
  })

  it('cannot move the first source up or the last one down', async () => {
    fakeSources()
    await openSearch()
    await showArrows()
    expect(screen.getByRole('button', { name: 'Move Alpha Notes up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move c.example/feed down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Beta Weekly up' })).toBeEnabled()
  })

  it('keeps keyboard focus on the moved source', async () => {
    fakeSources()
    await openSearch()
    await showArrows()
    const down = screen.getByRole('button', { name: 'Move Alpha Notes down' })
    down.focus()
    await fireEvent.click(down)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move Alpha Notes down' })).toHaveFocus(),
    )
  })

  it('shows the server’s list again when a move is refused as out of date', async () => {
    fakeSources()
    server.use(
      http.put('*/api/profiles/:id/sources/order', () =>
        HttpResponse.json({ error: 'The list has changed since you opened it.' }, { status: 409 }),
      ),
    )
    await openSearch()
    await showArrows()
    await showArrows()
    await fireEvent.click(screen.getByRole('button', { name: 'Move Beta Weekly up' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('list has changed')
  })

  describe('dragging', () => {
    /** Drags the row at `from` onto the top or bottom half of the row at `to`. */
    async function drag(from: number, to: number, half: 'top' | 'bottom') {
      const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }
      const items = rows()
      await fireEvent.dragStart(items[from]!.querySelector('[data-testid="grip"]')!, {
        dataTransfer,
      })
      // jsdom has no layout, so every row's box is empty at y = 0: a pointer below 0 is the "top".
      await dragOver(items[to]!, half === 'top' ? -1 : 1, dataTransfer)
      await fireEvent.drop(items[to]!, { dataTransfer })
      await fireEvent.dragEnd(items[from]!.querySelector('[data-testid="grip"]')!, { dataTransfer })
    }

    it('drops a source before another, sending the complete new order', async () => {
      const fake = fakeSources()
      await openSearch()
      await screen.findByText('Alpha Notes')
      await drag(2, 0, 'top')
      await waitFor(() => expect(fake.orders).toEqual([['s3', 's1', 's2']]))
      expect(rows()[0]).toHaveTextContent('c.example/feed')
      expect(
        await screen.findByText(/Moved c\.example\/feed to position 1 of 3/),
      ).toBeInTheDocument()
    })

    it('drops a source after another', async () => {
      const fake = fakeSources()
      await openSearch()
      await screen.findByText('Alpha Notes')
      await drag(0, 2, 'bottom')
      await waitFor(() => expect(fake.orders).toEqual([['s2', 's3', 's1']]))
    })

    it('does nothing when a source is dropped where it already is', async () => {
      const fake = fakeSources()
      await openSearch()
      await screen.findByText('Alpha Notes')
      await drag(1, 1, 'top')
      await drag(0, 1, 'top') // before Beta, where Alpha already is
      expect(fake.orders).toEqual([])
    })

    it('draws a line where the source will land, and removes it afterwards', async () => {
      fakeSources()
      await openSearch()
      await screen.findByText('Alpha Notes')
      const dataTransfer = { setData() {}, setDragImage() {}, effectAllowed: '', dropEffect: '' }
      const items = rows()
      await fireEvent.dragStart(items[2]!.querySelector('[data-testid="grip"]')!, { dataTransfer })
      await dragOver(items[0]!, -1, dataTransfer)
      expect(items[0]!.className).toContain('border-t-accent')
      await fireEvent.dragEnd(items[2]!.querySelector('[data-testid="grip"]')!, { dataTransfer })
      expect(items[0]!.className).not.toContain('border-t-accent')
    })

    it('ignores things dragged in from elsewhere', async () => {
      const fake = fakeSources()
      await openSearch()
      await screen.findByText('Alpha Notes')
      const items = rows()
      await fireEvent.dragOver(items[0]!, { dataTransfer: { dropEffect: '' } })
      await fireEvent.drop(items[0]!, { dataTransfer: {} })
      expect(fake.orders).toEqual([])
    })
  })

  it('lets an editor, not just the owner, add, move and remove sources', async () => {
    const fake = fakeSources()
    await openSearch('editor')
    expect(await screen.findByText('Alpha Notes')).toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText('Add a feed'), 'new.example/feed')
    await fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    await screen.findByText('Feed of new.example/feed')
    await showArrows()
    await fireEvent.click(screen.getByRole('button', { name: 'Move Beta Weekly up' }))
    await waitFor(() => expect(fake.orders).toHaveLength(1))
    const remove = screen.getByRole('button', { name: 'Remove Alpha Notes' })
    await fireEvent.click(remove) // no hold: it only asks to be pressed again
    expect(screen.getByText('Alpha Notes')).toBeInTheDocument()
    await fireEvent.click(remove)
    await waitFor(() => expect(screen.queryByText('Alpha Notes')).not.toBeInTheDocument())
  })
})

describe('recent posts from all the feeds', () => {
  const post = (id: string, sourceId: string, title: string, publishedAt: string, extra = {}) => ({
    id,
    sourceId,
    title,
    url: `https://${sourceId}.example/${id}`,
    summary: null,
    authors: [],
    publishedAt,
    ...extra,
  })
  const answer = (extra = {}) => ({
    days: 30,
    posts: [
      post('p1', 's2', 'Newest from Beta', '2026-10-10T10:00:00.000Z', { authors: ['Bo Writer'] }),
      post('p2', 's1', 'Older from Alpha', '2026-10-01T10:00:00.000Z', {
        summary: 'The start of it',
      }),
    ],
    omitted: 0,
    undated: 0,
    failed: [],
    ...extra,
  })
  /** Records the query string of each request for the combined list. */
  function fakeRecent(
    reply: (url: URL) => Response | Promise<Response> = () => HttpResponse.json(answer()),
  ) {
    const asked: string[] = []
    server.use(
      http.get('*/api/profiles/:id/sources/recent', ({ request }) => {
        const url = new URL(request.url)
        asked.push(url.search)
        return reply(url)
      }),
    )
    return asked
  }
  const section = () => screen.findByRole('region', { name: 'Recent posts' })

  it('lists posts from every feed in one list, each with its feed’s name and a link', async () => {
    fakeSources([A, B])
    fakeRecent()
    await openSearch()
    const recent = await section()
    const items = await within(recent).findAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByRole('link', { name: /Newest from Beta/ })).toHaveAttribute(
      'href',
      'https://s2.example/p1',
    )
    expect(items[0]).toHaveTextContent('Beta Weekly')
    expect(items[0]).toHaveTextContent('Bo Writer')
    expect(items[1]).toHaveTextContent('Alpha Notes')
    expect(items[1]).toHaveTextContent('The start of it')
    // The feed’s logo stands for it (decorative: its name is written beside it).
    expect(within(items[1]!).getByRole('img', { hidden: true })).toHaveAttribute(
      'src',
      expect.stringContaining('/sources/s1/icon'),
    )
  })

  it('asks for the last month, and again for a different period when it is changed', async () => {
    fakeSources([A, B])
    const asked = fakeRecent()
    await openSearch()
    await section()
    await waitFor(() => expect(asked).toEqual(['?days=30']))
    await fireEvent.update(screen.getByLabelText('Show posts from'), '7')
    await waitFor(() => expect(asked).toEqual(['?days=30', '?days=7']))
  })

  it('says nothing was posted in the period, and suggests a longer one', async () => {
    fakeSources([A])
    fakeRecent(() => HttpResponse.json(answer({ posts: [] })))
    await openSearch()
    expect(await screen.findByText(/Nothing has been posted in the last month/)).toBeInTheDocument()
  })

  it('invites adding a feed when there are none, without asking for posts', async () => {
    fakeSources([])
    const asked = fakeRecent()
    await openSearch()
    expect(await screen.findByText(/Add a feed below and its newest posts/)).toBeInTheDocument()
    expect(asked).toEqual([])
    expect(screen.getByRole('button', { name: 'Check for new posts' })).toBeDisabled()
  })

  it('shows what went wrong, and tries again on request', async () => {
    fakeSources([A])
    let fail = true
    fakeRecent(() =>
      fail
        ? HttpResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
        : HttpResponse.json(answer()),
    )
    await openSearch()
    const recent = await section()
    expect(await within(recent).findByRole('alert')).toHaveTextContent('Something went wrong')
    fail = false
    await fireEvent.click(within(recent).getByRole('button', { name: 'Try again' }))
    expect(await within(recent).findByText('Newest from Beta')).toBeInTheDocument()
  })

  it('names feeds that could not be read, and says how many posts are hidden or undated', async () => {
    fakeSources([A, B])
    fakeRecent(() =>
      HttpResponse.json(
        answer({ failed: [{ sourceId: 's1', error: 'x' }], omitted: 3, undated: 1 }),
      ),
    )
    await openSearch()
    const recent = await section()
    expect(
      await within(recent).findByText(/couldn’t read Alpha Notes just now/),
    ).toBeInTheDocument()
    expect(
      within(recent).getByText(/3 older posts in this period aren’t shown/),
    ).toBeInTheDocument()
    expect(within(recent).getByText(/1 post has no date/)).toBeInTheDocument()
  })

  it('checks the feeds again on request, and shows the fresh list', async () => {
    fakeSources([A, B])
    const asked = fakeRecent((url) =>
      HttpResponse.json(
        url.searchParams.get('refresh')
          ? answer({ posts: [post('p9', 's1', 'Brand new', '2026-10-11T10:00:00.000Z')] })
          : answer(),
      ),
    )
    await openSearch()
    const recent = await section()
    await within(recent).findByText('Newest from Beta')
    await fireEvent.click(within(recent).getByRole('button', { name: 'Check for new posts' }))
    expect(await within(recent).findByText('Brand new')).toBeInTheDocument()
    expect(asked.at(-1)).toBe('?days=30&refresh=true')
  })
})

describe('deciding about the recent posts', () => {
  const post = (id: string, title: string, status = 'new') => ({
    id,
    sourceId: 's1',
    title,
    url: `https://s1.example/${id}`,
    summary: null,
    authors: [],
    publishedAt: '2026-10-10T10:00:00.000Z',
    status,
  })
  /** A small fake of the list and its decisions, remembering what it was sent. */
  function fake(initial = [post('p1', 'First post'), post('p2', 'Second post')]) {
    const state = { posts: [...initial], sent: [] as { what: string; postId: string }[] }
    server.use(
      http.get('*/api/profiles/:id/sources/recent', () =>
        HttpResponse.json({ days: 30, posts: state.posts, omitted: 0, undated: 0, failed: [] }),
      ),
      http.post('*/api/profiles/:id/sources/recent/:what', async ({ params, request }) => {
        const { posts } = (await request.json()) as {
          posts: { sourceId: string; postId: string }[]
        }
        const what = params.what as string
        for (const { postId } of posts) state.sent.push({ what, postId })
        state.posts = state.posts.map((p) =>
          posts.some((x) => x.postId === p.id)
            ? { ...p, status: what === 'add' ? 'added' : what === 'ignore' ? 'ignored' : 'new' }
            : p,
        )
        return HttpResponse.json({
          results: posts.map((x) => ({
            ...x,
            status: state.posts.find((p) => p.id === x.postId)!.status,
          })),
        })
      }),
    )
    return state
  }
  const section = () => screen.findByRole('region', { name: 'Recent posts' })

  it('puts a post on the reading list with one click, and says so', async () => {
    fakeSources([A])
    const state = fake()
    await openSearch()
    const recent = await section()
    await fireEvent.click(
      await within(recent).findByRole('button', { name: 'Add to the reading list: First post' }),
    )
    await waitFor(() => expect(state.sent).toEqual([{ what: 'add', postId: 'p1' }]))
    const row = (await within(recent).findByText(/on a reading list/)).closest('li')!
    expect(row).toHaveTextContent('First post')
    expect(within(row).getByRole('img', { name: 'On a reading list' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: /^Add/ })).not.toBeInTheDocument()
    expect(within(recent).getByText('Added “First post” to the reading list.')).toBeInTheDocument()
    // The other post still waits for a decision.
    await waitFor(() =>
      expect(
        within(recent).getByRole('button', { name: 'Add to the reading list: Second post' }),
      ).toBeEnabled(),
    )
  })

  it('ignores a post, which stays listed but marked, and can be reconsidered', async () => {
    fakeSources([A])
    const state = fake()
    await openSearch()
    const recent = await section()
    await fireEvent.click(
      await within(recent).findByRole('button', { name: 'Ignore: Second post' }),
    )
    const row = (await within(recent).findByText(/· ignored/)).closest('li')!
    expect(within(row).getByRole('img', { name: 'Ignored' })).toBeInTheDocument()
    expect(within(row).getByText(/Second post/)).toBeInTheDocument()

    await fireEvent.click(within(row).getByRole('button', { name: 'Reconsider: Second post' }))
    await waitFor(() => expect(state.sent.at(-1)).toEqual({ what: 'reconsider', postId: 'p2' }))
    expect(
      await within(recent).findByRole('button', { name: 'Add to the reading list: Second post' }),
    ).toBeInTheDocument()
  })

  it('moves a post to the end of the list when it is decided, and stays on the same page', async () => {
    fakeSources([A])
    // The server puts decided posts last; the fake does the same.
    const state = fake(
      Array.from({ length: 8 }, (_, i) => post(`p${i + 1}`, `Post number ${i + 1}`)),
    )
    server.use(
      http.get('*/api/profiles/:id/sources/recent', () => {
        const waiting = state.posts.filter((p) => p.status === 'new')
        const decided = state.posts.filter((p) => p.status !== 'new')
        return HttpResponse.json({
          days: 30,
          posts: [...waiting, ...decided],
          omitted: 0,
          undated: 0,
          failed: [],
        })
      }),
    )
    await openSearch()
    const recent = await section()
    const titles = () =>
      within(recent)
        .getAllByRole('listitem')
        .map((li) => li.textContent!.match(/Post number (\d)/)![1])
    await within(recent).findByText('Post number 1')
    await fireEvent.click(within(recent).getAllByRole('button', { name: /Next/ })[0]!)
    expect(titles()).toEqual(['6', '7', '8'])

    await fireEvent.click(within(recent).getByRole('button', { name: 'Ignore: Post number 7' }))
    // Post 7 went to the end, behind the one still waiting; we are still looking at the same page.
    await waitFor(() => expect(titles()).toEqual(['6', '8', '7']))
    expect(within(recent).getAllByText('Posts 6–8 of 8')).toHaveLength(2)
    await fireEvent.click(within(recent).getAllByRole('button', { name: /Previous/ })[0]!)
    expect(titles()).toEqual(['1', '2', '3', '4', '5'])
  })

  it('takes an add back, with Reconsider, so the post is waiting again', async () => {
    fakeSources([A])
    fake([post('p1', 'First post', 'added')])
    await openSearch()
    const recent = await section()
    await fireEvent.click(
      await within(recent).findByRole('button', { name: 'Reconsider: First post' }),
    )
    expect(
      await within(recent).findByRole('button', { name: 'Add to the reading list: First post' }),
    ).toBeInTheDocument()
  })

  it('shows posts decided earlier, by anyone, as decided', async () => {
    fakeSources([A])
    fake([
      post('p1', 'Added earlier', 'added'),
      post('p2', 'Ignored earlier', 'ignored'),
      post('p3', 'Not yet'),
    ])
    await openSearch()
    const recent = await section()
    expect(await within(recent).findByText(/Added earlier/)).toBeInTheDocument()
    expect(
      within(recent).queryByRole('button', { name: /Add to the reading list: Added earlier/ }),
    ).toBeNull()
    expect(within(recent).queryByRole('button', { name: /Ignore: Ignored earlier/ })).toBeNull()
    expect(within(recent).getByRole('button', { name: 'Ignore: Not yet' })).toBeInTheDocument()
  })

  it('says why it could not, and keeps the post waiting', async () => {
    fakeSources([A])
    fake()
    server.use(
      http.post('*/api/profiles/:id/sources/recent/add', () =>
        HttpResponse.json(
          {
            error:
              'A profile can have up to 50 links. Remove some you no longer need to make room.',
          },
          { status: 409 },
        ),
      ),
    )
    await openSearch()
    const recent = await section()
    await fireEvent.click(
      await within(recent).findByRole('button', { name: 'Add to the reading list: First post' }),
    )
    const alert = await within(recent).findByRole('alert')
    expect(alert).toHaveTextContent('A profile can have up to 50 links')
    expect(
      within(recent).getByRole('button', { name: 'Add to the reading list: First post' }),
    ).toBeEnabled()
    await fireEvent.click(within(alert).getByRole('button', { name: 'Dismiss' }))
    expect(within(recent).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('stops other decisions while one is being made', async () => {
    fakeSources([A])
    fake()
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/profiles/:id/sources/recent/ignore', async () => {
        await gate
        return HttpResponse.json({ results: [{ sourceId: 's1', postId: 'p1', status: 'ignored' }] })
      }),
    )
    await openSearch()
    const recent = await section()
    await fireEvent.click(await within(recent).findByRole('button', { name: 'Ignore: First post' }))
    await waitFor(() =>
      expect(
        within(recent).getByRole('button', { name: 'Add to the reading list: Second post' }),
      ).toBeDisabled(),
    )
    release()
  })
})

describe('paging through the recent posts', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `m${i}`,
      sourceId: 's1',
      title: `Post number ${i + 1}`,
      url: `https://s1.example/${i}`,
      summary: null,
      authors: [],
      publishedAt: new Date(Date.UTC(2026, 9, 10) - i * 3_600_000).toISOString(),
    }))
  const reply = (n: number) =>
    server.use(
      http.get('*/api/profiles/:id/sources/recent', ({ request }) =>
        HttpResponse.json({
          days: Number(new URL(request.url).searchParams.get('days')),
          posts: many(n),
          omitted: 0,
          undated: 0,
          failed: [],
        }),
      ),
    )
  const titles = (recent: HTMLElement) =>
    within(recent)
      .getAllByRole('listitem')
      .map((li) => li.textContent!.match(/Post number (\d+)/)![1])
  const section = () => screen.findByRole('region', { name: 'Recent posts' })

  const above = (recent: HTMLElement) =>
    within(within(recent).getByRole('navigation', { name: /above the list/ }))
  const below = (recent: HTMLElement) =>
    within(within(recent).getByRole('navigation', { name: /below the list/ }))

  it('shows five at a time, with where you are, and moves forwards and back', async () => {
    fakeSources([A])
    reply(23)
    await openSearch()
    const recent = await section()
    await within(recent).findByText('Post number 1')
    expect(titles(recent)).toEqual(['1', '2', '3', '4', '5'])
    expect(above(recent).getByText('Posts 1–5 of 23')).toBeInTheDocument()
    expect(above(recent).getByRole('button', { name: /Previous/ })).toBeDisabled()

    await fireEvent.click(above(recent).getByRole('button', { name: /Next/ }))
    expect(titles(recent)).toEqual(['6', '7', '8', '9', '10'])
    expect(above(recent).getByText('Posts 6–10 of 23')).toBeInTheDocument()

    for (let i = 0; i < 3; i++) {
      await fireEvent.click(above(recent).getByRole('button', { name: /Next/ }))
    }
    expect(titles(recent)).toEqual(['21', '22', '23'])
    expect(above(recent).getByText('Posts 21–23 of 23')).toBeInTheDocument()
    expect(above(recent).getByRole('button', { name: /Next/ })).toBeDisabled()

    await fireEvent.click(above(recent).getByRole('button', { name: /Previous/ }))
    expect(titles(recent)[0]).toBe('16')
  })

  it('has the same controls below the list, kept in step with those above', async () => {
    fakeSources([A])
    reply(23)
    await openSearch()
    const recent = await section()
    await within(recent).findByText('Post number 1')
    expect(below(recent).getByText('Posts 1–5 of 23')).toBeInTheDocument()
    await fireEvent.click(below(recent).getByRole('button', { name: /Next/ }))
    expect(above(recent).getByText('Posts 6–10 of 23')).toBeInTheDocument()
    expect(below(recent).getByText('Posts 6–10 of 23')).toBeInTheDocument()
    // Only the upper range is announced, so a screen reader doesn't say it twice.
    expect(above(recent).getByText('Posts 6–10 of 23')).toHaveAttribute('aria-live', 'polite')
    expect(below(recent).getByText('Posts 6–10 of 23')).not.toHaveAttribute('aria-live')
  })

  it('takes you back to the top of the list from the bottom controls, but not from the top ones', async () => {
    fakeSources([A])
    reply(23)
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled
    await openSearch()
    const recent = await section()
    await within(recent).findByText('Post number 1')

    await fireEvent.click(above(recent).getByRole('button', { name: /Next/ }))
    expect(scrolled).not.toHaveBeenCalled()

    await fireEvent.click(below(recent).getByRole('button', { name: /Next/ }))
    expect(scrolled).toHaveBeenCalledTimes(1)
    expect(scrolled.mock.contexts[0]).toBe(
      within(recent).getByRole('heading', { name: 'Recent posts' }),
    )
    // Keyboard focus goes there too, so the next Tab continues from the top of the list.
    expect(within(recent).getByRole('heading', { name: 'Recent posts' })).toHaveFocus()
  })

  it('has no paging when five or fewer posts fit on one page', async () => {
    fakeSources([A])
    reply(5)
    await openSearch()
    const recent = await section()
    await within(recent).findByText('Post number 5')
    expect(within(recent).queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('goes back to the first page when the period changes', async () => {
    fakeSources([A])
    reply(25)
    await openSearch()
    const recent = await section()
    await within(recent).findByText('Post number 1')
    await fireEvent.click(above(recent).getByRole('button', { name: /Next/ }))
    expect(titles(recent)[0]).toBe('6')
    await fireEvent.update(screen.getByLabelText('Show posts from'), '7')
    await waitFor(() => expect(titles(recent)[0]).toBe('1'))
    expect(above(recent).getByText('Posts 1–5 of 25')).toBeInTheDocument()
  })
})

describe('recent posts of a feed', () => {
  const posts = (extra = {}) => ({
    items: [
      {
        id: 'p1',
        title: 'Why notes matter',
        url: 'https://a.example/why-notes',
        summary: 'A short start',
        authors: ['Ada Lovelace'],
        publishedAt: '2026-10-09T10:00:00.000Z',
      },
      {
        id: 'p2',
        title: 'Second post',
        url: 'https://a.example/second',
        summary: null,
        authors: [],
        publishedAt: null,
      },
    ],
    checkedAt: '2026-10-10T10:00:00.000Z',
    lastWorkedAt: '2026-10-10T10:00:00.000Z',
    lastError: null,
    ...extra,
  })
  /** Records the sources whose posts were asked for. */
  function fakeItems(
    answer: () => Response | Promise<Response> = () => HttpResponse.json(posts()),
  ) {
    const asked: string[] = []
    server.use(
      http.get('*/api/profiles/:id/sources/:sourceId/items', ({ params }) => {
        asked.push(params.sourceId as string)
        return answer()
      }),
    )
    return asked
  }
  const open = async (name: string) => {
    await fireEvent.click(
      within(await screen.findByText(name).then((el) => el.closest('li')!)).getByText(
        'Recent posts',
      ),
    )
  }

  it('asks for nothing until someone opens a feed’s recent posts, then lists them as links', async () => {
    fakeSources([A, B])
    const asked = fakeItems()
    await openSearch()
    await screen.findByText('Alpha Notes')
    expect(asked).toEqual([])
    await open('Alpha Notes')
    const link = await screen.findByRole('link', { name: /Why notes matter/ })
    expect(link).toHaveAttribute('href', 'https://a.example/why-notes')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText(/Ada Lovelace, /)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Second post/ })).toBeInTheDocument()
    expect(asked).toEqual(['s1'])
  })

  it('says it is reading while it waits, and says when a feed has no posts', async () => {
    fakeSources([A])
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    fakeItems(async () => {
      await gate
      return HttpResponse.json(posts({ items: [] }))
    })
    await openSearch()
    await open('Alpha Notes')
    expect(await screen.findByText('Reading the feed…')).toBeInTheDocument()
    release()
    expect(await screen.findByText('This feed has no posts in it yet.')).toBeInTheDocument()
  })

  it('shows why it failed and tries again on request', async () => {
    fakeSources([A])
    let fail = true
    fakeItems(() =>
      fail
        ? HttpResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 })
        : HttpResponse.json(posts()),
    )
    await openSearch()
    await open('Alpha Notes')
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    fail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('link', { name: /Why notes matter/ })).toBeInTheDocument()
  })

  it('says a feed that has stopped working has, and keeps showing its older posts', async () => {
    fakeSources([A])
    fakeItems(() =>
      HttpResponse.json(
        posts({
          lastError: 'That address doesn’t look like an RSS or Atom feed.',
          lastWorkedAt: '2026-09-01T10:00:00.000Z',
        }),
      ),
    )
    await openSearch()
    await open('Alpha Notes')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t read this feed just now',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('It last worked on')
    expect(screen.getByRole('link', { name: /Why notes matter/ })).toBeInTheDocument()
  })

  it('marks a feed in the list whose last read failed', async () => {
    fakeSources([{ ...A, lastError: 'It moved.' } as typeof A, B])
    await openSearch()
    await screen.findByText('Alpha Notes')
    expect(screen.getAllByText(/couldn’t read this feed on the last try/)).toHaveLength(1)
  })

  it('shows only the latest few, and says how many more there are', async () => {
    fakeSources([A])
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `m${i}`,
      title: `Post ${i}`,
      url: `https://a.example/${i}`,
      summary: null,
      authors: [],
      publishedAt: null,
    }))
    fakeItems(() => HttpResponse.json(posts({ items: many })))
    await openSearch()
    await open('Alpha Notes')
    await screen.findByRole('link', { name: /Post 0/ })
    expect(screen.queryByRole('link', { name: /Post 5/ })).not.toBeInTheDocument()
    expect(screen.getByText('and 3 more')).toBeInTheDocument()
  })
})

describe('a website that offers several feeds', () => {
  const choices = (extra: Record<string, unknown> = {}) => ({
    choices: [
      { url: 'https://s.example/feed', title: 'Posts', comments: false, alreadyAdded: false },
      { url: 'https://s.example/podcast', title: null, comments: false, alreadyAdded: false },
      {
        url: 'https://s.example/comments',
        title: 'Comments',
        comments: true,
        alreadyAdded: false,
        ...extra,
      },
    ],
  })
  /** Answers the site address with choices; any feed address is added. */
  function fakeSite(answer: (url: string) => Response | null = () => null) {
    const asked: string[] = []
    server.use(
      http.post('*/api/profiles/:id/sources', async ({ request }) => {
        const { url } = (await request.json()) as { url: string }
        asked.push(url)
        const custom = answer(url)
        if (custom) return custom
        if (url === 's.example') return HttpResponse.json(choices())
        return HttpResponse.json(
          source(`n${asked.length}`, url.replace('https://', '').replace('/feed', ''), {
            title: `Feed ${url}`,
          }),
          { status: 201 },
        )
      }),
    )
    return asked
  }
  const ask = async () => {
    await screen.findByText('Alpha Notes')
    await fireEvent.update(screen.getByLabelText('Add a feed'), 's.example')
    await fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    return screen.findByRole('group', {
      name: 'That site has more than one feed. Which would you like?',
    })
  }

  it('lists the feeds on offer, labels comments, and adds nothing until one is chosen', async () => {
    fakeSources([A])
    const asked = fakeSite()
    await openSearch()
    const group = await ask()
    expect(within(group).getByLabelText(/Posts/)).not.toBeChecked()
    expect(within(group).getByLabelText(/s\.example\/podcast/)).toBeInTheDocument() // untitled: its address
    expect(within(group).getByLabelText(/Comments \(comments\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add chosen feed' })).toBeDisabled()
    expect(asked).toEqual(['s.example'])
  })

  it('adds each ticked feed, and clears the choice and the address', async () => {
    fakeSources([A])
    const asked = fakeSite()
    await openSearch()
    const group = await ask()
    await fireEvent.click(within(group).getByLabelText(/Posts/))
    await fireEvent.click(within(group).getByLabelText(/s\.example\/podcast/))
    await fireEvent.click(screen.getByRole('button', { name: 'Add chosen feeds' }))
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /more than one feed/ })).not.toBeInTheDocument(),
    )
    expect(asked).toEqual(['s.example', 'https://s.example/feed', 'https://s.example/podcast'])
    expect(screen.getByLabelText('Add a feed')).toHaveValue('')
  })

  it('keeps the feeds that could not be added, with the reason, and drops the rest', async () => {
    fakeSources([A])
    fakeSite((url) =>
      url === 'https://s.example/podcast'
        ? HttpResponse.json({ error: 'That feed is already in your list.' }, { status: 409 })
        : null,
    )
    await openSearch()
    const group = await ask()
    await fireEvent.click(within(group).getByLabelText(/Posts/))
    await fireEvent.click(within(group).getByLabelText(/s\.example\/podcast/))
    await fireEvent.click(screen.getByRole('button', { name: 'Add chosen feeds' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already in your list')
    const left = screen.getByRole('group', { name: /more than one feed/ })
    expect(within(left).queryByLabelText(/Posts/)).not.toBeInTheDocument()
    expect(within(left).getByLabelText(/s\.example\/podcast/)).toBeInTheDocument()
  })

  it('does not offer a feed that is already listed, and lets the person back out', async () => {
    fakeSources([A])
    fakeSite((url) =>
      url === 's.example'
        ? HttpResponse.json({
            choices: [
              {
                url: 'https://s.example/feed',
                title: 'Posts',
                comments: false,
                alreadyAdded: true,
              },
              {
                url: 'https://s.example/podcast',
                title: 'Podcast',
                comments: false,
                alreadyAdded: false,
              },
            ],
          })
        : null,
    )
    await openSearch()
    const group = await ask()
    expect(within(group).getByLabelText(/Posts/)).toBeDisabled()
    expect(group).toHaveTextContent('already in your list')
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: /more than one feed/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Add a feed')).toHaveValue('s.example')
  })
})

describe('where the feeds live', () => {
  it('is reached from the profile page, and is no longer in Settings', async () => {
    fakeSources([A])
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile('owner')])),
      http.get('*/api/profiles/:id/ideas', () => HttpResponse.json([])),
      http.get('*/api/profiles/:id/invitations', () => HttpResponse.json([])),
    )
    await renderAt('/p/adalovelace-blog')
    await fireEvent.click(await screen.findByRole('link', { name: 'Search' }))
    expect(await screen.findByRole('heading', { name: 'Search' })).toBeInTheDocument()
    expect(await screen.findByText('Alpha Notes')).toBeInTheDocument()
  })
})
