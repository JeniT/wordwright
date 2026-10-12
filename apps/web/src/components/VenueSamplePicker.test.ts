import { fireEvent, render, screen, waitFor, within } from '@testing-library/vue'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { server, useMockServer } from '../test-utils'
import VenueSamplePicker from './VenueSamplePicker.vue'

useMockServer()

const post = (n: number) => ({
  id: `p${n}`,
  title: `Post ${n}`,
  url: `https://venue.example/${n}`,
  summary: null,
  authors: [],
  publishedAt: '2026-01-05T00:00:00Z',
})
const ok = (url: string, title: string | null = 'A post') => ({
  ok: true,
  url,
  title,
  text: 'Some words about the garden.',
  truncated: false,
})

function show(siteUrl: string | null = 'https://venue.example/') {
  const view = render(VenueSamplePicker, {
    props: { profileId: 'ada-venue', siteUrl },
    global: {
      plugins: [
        [
          VueQueryPlugin,
          { queryClientConfig: { defaultOptions: { mutations: { retry: false } } } },
        ],
      ],
    },
  })
  return view
}

const findPosts = http.post('*/api/profiles/ada-venue/venue/posts', () =>
  HttpResponse.json({ posts: [1, 2, 3, 4, 5, 6].map(post), notice: null }),
)

describe('VenueSamplePicker', () => {
  it('asks nothing of the server until a button is pressed', async () => {
    let asked = 0
    server.use(
      http.post('*/api/profiles/ada-venue/venue/*', () => {
        asked++
        return HttpResponse.json({ posts: [], notice: null, samples: [] })
      }),
    )
    show()
    expect(await screen.findByRole('button', { name: 'Find recent posts' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Read these posts' })).toBeDisabled()
    expect(asked).toBe(0)
  })

  it('offers the venue’s recent posts to tick, up to five', async () => {
    server.use(findPosts)
    show()
    await fireEvent.click(screen.getByRole('button', { name: 'Find recent posts' }))
    const list = await screen.findByRole('list')
    const boxes = within(list).getAllByRole('checkbox')
    expect(boxes).toHaveLength(6)
    for (const box of boxes.slice(0, 5)) await fireEvent.click(box)
    expect(screen.getByText('5 of 5 posts chosen.')).toBeInTheDocument()
    expect(boxes[5]).toBeDisabled() // five is the most
    expect(boxes[0]).toBeEnabled() // but a ticked one can be unticked
    await fireEvent.click(boxes[0]!)
    expect(boxes[5]).toBeEnabled()
    expect(screen.getByText('4 of 5 posts chosen.')).toBeInTheDocument()
    expect(within(list).getAllByRole('link')[0]).toHaveAttribute('href', 'https://venue.example/1')
  })

  it('shows the sentence the server gives when there is nothing to offer, and still takes pasted links', async () => {
    server.use(
      http.post('*/api/profiles/ada-venue/venue/posts', () =>
        HttpResponse.json({
          posts: [],
          notice:
            'We couldn’t find a feed on that site. Paste links to a few of its posts instead.',
        }),
      ),
    )
    show()
    await fireEvent.click(screen.getByRole('button', { name: 'Find recent posts' }))
    expect(await screen.findByText(/couldn’t find a feed/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()
    await fireEvent.update(screen.getByLabelText('Post links'), 'https://a.example/x')
    expect(screen.getByRole('button', { name: 'Read these posts' })).toBeEnabled()
  })

  it('says why when the posts could not be looked up', async () => {
    server.use(
      http.post('*/api/profiles/ada-venue/venue/posts', () =>
        HttpResponse.json(
          { error: 'You have looked at a lot of sample posts. Try again in a little while.' },
          { status: 429 },
        ),
      ),
    )
    show()
    await fireEvent.click(screen.getByRole('button', { name: 'Find recent posts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again in a little while')
  })

  it('has no recent-posts section without a website, only the box for links', async () => {
    show(null)
    expect(screen.queryByRole('button', { name: 'Find recent posts' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Paste links to posts' })).toBeInTheDocument()
  })

  it('counts ticked and pasted posts together, and refuses more than five', async () => {
    server.use(findPosts)
    show()
    await fireEvent.click(screen.getByRole('button', { name: 'Find recent posts' }))
    await fireEvent.click((await screen.findAllByRole('checkbox'))[0]!)
    await fireEvent.update(
      screen.getByLabelText('Post links'),
      'https://a.example/1\nhttps://a.example/2 https://a.example/3\nhttps://a.example/4\nhttps://venue.example/1',
    )
    // The ticked post pasted again counts once.
    expect(screen.getByText('5 of 5 posts chosen.')).toBeInTheDocument()
    await fireEvent.update(screen.getByLabelText('Post links'), 'a b c d e f')
    expect(screen.getByText(/That is 7 posts\. Choose 5 or fewer\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read these posts' })).toBeDisabled()
  })

  it('reads the posts, says which could not be read and why, and hands over the rest', async () => {
    let sent: unknown
    server.use(
      http.post('*/api/profiles/ada-venue/venue/samples', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          samples: [
            ok('https://a.example/1', 'First post'),
            { ...ok('https://a.example/2', null), truncated: true },
            {
              ok: false,
              url: 'https://b.example/gone',
              message: 'We couldn’t read that page. Paste a different link, or leave this one out.',
            },
          ],
        })
      }),
    )
    const view = show(null)
    await fireEvent.update(
      screen.getByLabelText('Post links'),
      'https://a.example/1\nhttps://a.example/2\nhttps://b.example/gone',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Read these posts' }))
    const results = await screen.findByRole('list', { name: 'Posts read' })
    expect(sent).toEqual({
      urls: ['https://a.example/1', 'https://a.example/2', 'https://b.example/gone'],
    })
    const items = within(results).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('First post')
    expect(items[0]).toHaveTextContent('5 words')
    expect(items[1]).toHaveTextContent('https://a.example/2') // no title: the address stands in
    expect(items[1]).toHaveTextContent('the start of a long post')
    expect(items[2]).toHaveTextContent('couldn’t read that page')
    await fireEvent.click(screen.getByRole('button', { name: 'Use these posts' }))
    const used = view.emitted().use as unknown[][]
    expect(used).toHaveLength(1)
    expect((used[0]![0] as { url: string }[]).map((s) => s.url)).toEqual([
      'https://a.example/1',
      'https://a.example/2',
    ])
  })

  it('offers nothing to use when no post could be read', async () => {
    server.use(
      http.post('*/api/profiles/ada-venue/venue/samples', () =>
        HttpResponse.json({
          samples: [
            { ok: false, url: 'https://b.example/gone', message: 'We couldn’t read that page.' },
          ],
        }),
      ),
    )
    const view = show(null)
    await fireEvent.update(screen.getByLabelText('Post links'), 'https://b.example/gone')
    await fireEvent.click(screen.getByRole('button', { name: 'Read these posts' }))
    expect(await screen.findByText(/None of those could be read/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use these posts' })).toBeDisabled()
    expect(view.emitted().use).toBeUndefined()
  })

  it('says why when reading fails altogether, keeping what was chosen', async () => {
    server.use(
      http.post('*/api/profiles/ada-venue/venue/samples', () =>
        HttpResponse.json({ error: 'Choose up to 5 posts' }, { status: 400 }),
      ),
    )
    show(null)
    await fireEvent.update(screen.getByLabelText('Post links'), 'https://a.example/1')
    await fireEvent.click(screen.getByRole('button', { name: 'Read these posts' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose up to 5 posts')
    await waitFor(() =>
      expect(screen.getByLabelText('Post links')).toHaveValue('https://a.example/1'),
    )
  })
})
