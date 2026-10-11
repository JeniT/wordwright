import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

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

async function openInspiration(role: 'owner' | 'editor' = 'owner') {
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([profile(role)])),
  )
  await renderAt('/p/adalovelace-blog/inspiration')
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

describe('feeds on the Inspiration page', () => {
  it('lists the sources in order with their title, description and address', async () => {
    fakeSources()
    await openInspiration()
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
    await openInspiration()
    await screen.findByText('Alpha Notes')
    const [first, second] = rows()
    expect(first!.querySelector('img')).toHaveAttribute('src', A.iconUrl)
    expect(first!.querySelector('img')).toHaveAttribute('alt', '') // the name is beside it
    expect(second!.querySelector('img')).toBeNull()
    expect(within(second!).getByText('B')).toBeInTheDocument()
  })

  it('explains an empty list and what to do', async () => {
    fakeSources([])
    await openInspiration()
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
    await openInspiration()
    expect(await screen.findByText(/couldn't load the sources/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Alpha Notes')).toBeInTheDocument()
  })

  it('adds a pasted link to the end of the list and clears the field', async () => {
    const fake = fakeSources([A])
    await openInspiration()
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
    await openInspiration()
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
    await openInspiration()
    await screen.findByText('Alpha Notes')
    await fireEvent.update(screen.getByLabelText('Add a feed'), 'a.example/page')
    await fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('RSS or Atom')
    expect(screen.getByLabelText('Add a feed')).toHaveValue('a.example/page')
  })

  it('removes a source', async () => {
    fakeSources()
    await openInspiration()
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove Beta Weekly' }))
    await waitFor(() => expect(screen.queryByText('Beta Weekly')).not.toBeInTheDocument())
    expect(screen.getByText('Alpha Notes')).toBeInTheDocument()
    expect(screen.getByText('Removed Beta Weekly')).toBeInTheDocument()
  })

  it('moves a source up or down with the buttons, sending the complete new order', async () => {
    const fake = fakeSources()
    await openInspiration()
    await fireEvent.click(await screen.findByRole('button', { name: 'Move c.example/feed up' }))
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
    await openInspiration()
    await fireEvent.click(await screen.findByRole('button', { name: 'Move c.example/feed up' }))
    expect(rows()[1]).toHaveTextContent('c.example/feed') // already there, nothing has been saved yet
    expect(fake.orders).toEqual([])
    release()
    await waitFor(() => expect(fake.orders).toEqual([['s1', 's3', 's2']]))
    expect(rows()[1]).toHaveTextContent('c.example/feed')
  })

  it('cannot move the first source up or the last one down', async () => {
    fakeSources()
    await openInspiration()
    expect(await screen.findByRole('button', { name: 'Move Alpha Notes up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move c.example/feed down' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Beta Weekly up' })).toBeEnabled()
  })

  it('keeps keyboard focus on the moved source', async () => {
    fakeSources()
    await openInspiration()
    const down = await screen.findByRole('button', { name: 'Move Alpha Notes down' })
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
    await openInspiration()
    await fireEvent.click(await screen.findByRole('button', { name: 'Move Beta Weekly up' }))
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
      await openInspiration()
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
      await openInspiration()
      await screen.findByText('Alpha Notes')
      await drag(0, 2, 'bottom')
      await waitFor(() => expect(fake.orders).toEqual([['s2', 's3', 's1']]))
    })

    it('does nothing when a source is dropped where it already is', async () => {
      const fake = fakeSources()
      await openInspiration()
      await screen.findByText('Alpha Notes')
      await drag(1, 1, 'top')
      await drag(0, 1, 'top') // before Beta, where Alpha already is
      expect(fake.orders).toEqual([])
    })

    it('draws a line where the source will land, and removes it afterwards', async () => {
      fakeSources()
      await openInspiration()
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
      await openInspiration()
      await screen.findByText('Alpha Notes')
      const items = rows()
      await fireEvent.dragOver(items[0]!, { dataTransfer: { dropEffect: '' } })
      await fireEvent.drop(items[0]!, { dataTransfer: {} })
      expect(fake.orders).toEqual([])
    })
  })

  it('lets an editor, not just the owner, add, move and remove sources', async () => {
    const fake = fakeSources()
    await openInspiration('editor')
    expect(await screen.findByText('Alpha Notes')).toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText('Add a feed'), 'new.example/feed')
    await fireEvent.click(screen.getByRole('button', { name: 'Add source' }))
    await screen.findByText('Feed of new.example/feed')
    await fireEvent.click(screen.getByRole('button', { name: 'Move Beta Weekly up' }))
    await waitFor(() => expect(fake.orders).toHaveLength(1))
    await fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha Notes' }))
    await waitFor(() => expect(screen.queryByText('Alpha Notes')).not.toBeInTheDocument())
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
    await openInspiration()
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
    await openInspiration()
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
    await openInspiration()
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
    await openInspiration()
    await open('Alpha Notes')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t read this feed just now',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('It last worked on')
    expect(screen.getByRole('link', { name: /Why notes matter/ })).toBeInTheDocument()
  })

  it('marks a feed in the list whose last read failed', async () => {
    fakeSources([{ ...A, lastError: 'It moved.' } as typeof A, B])
    await openInspiration()
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
    await openInspiration()
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
    await openInspiration()
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
    await openInspiration()
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
    await openInspiration()
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
    await openInspiration()
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
    await fireEvent.click(await screen.findByRole('link', { name: 'Inspiration' }))
    expect(await screen.findByRole('heading', { name: 'Inspiration' })).toBeInTheDocument()
    expect(await screen.findByText('Alpha Notes')).toBeInTheDocument()
  })
})
