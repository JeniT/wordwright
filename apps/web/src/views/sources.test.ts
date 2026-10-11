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
