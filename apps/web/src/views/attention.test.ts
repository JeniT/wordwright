import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['publication'] })

const publication = {
  id: 'p1',
  name: 'Ada’s writing',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }],
}
const snapshot = (over: object = {}) => ({
  id: 's1',
  sentAt: '2026-02-01T00:00:00Z',
  open: 0,
  ended: 1,
  closed: 0,
  unresolved: 2,
  ...over,
})

function home(attention: object, calls: string[] = []) {
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([publication])),
    http.get('*/api/publications/p1/attention', () =>
      HttpResponse.json({ offered: [], waiting: [], reviews: [], ...attention }),
    ),
    http.get('*/api/publications/p1/ideas', () => HttpResponse.json([])),
    http.get('*/api/publications/p1/notes', () => HttpResponse.json([])),
    http.get('*/api/publications/p1/sources', () => HttpResponse.json([])),
    http.get('*/api/publications/p1/reading', () => HttpResponse.json([])),
    http.post('*/api/publications/p1/drafts/d1/handover/offer/accept', () => {
      calls.push('accept')
      return HttpResponse.json({})
    }),
    http.post('*/api/publications/p1/drafts/d1/handover/offer/decline', () => {
      calls.push('decline')
      return HttpResponse.json({})
    }),
    http.delete('*/api/publications/p1/drafts/d1/handover/offer', () => {
      calls.push('withdraw')
      return HttpResponse.json({})
    }),
  )
  return calls
}

describe('what is waiting, on the publication’s landing page (#159)', () => {
  it('shows nothing at all when nothing is waiting', async () => {
    home({})
    await renderAt('/p/p1')
    await screen.findByRole('heading', { name: 'Ada’s writing' })
    expect(screen.queryByRole('heading', { name: 'Waiting for you' })).toBeNull()
    expect(screen.queryByText('Reviews you sent')).toBeNull()
  })

  it('tells the person a draft was offered to them, who can accept or decline it there', async () => {
    const calls = home({ offered: [{ draftId: 'd1', title: 'Meanders', fromName: 'Bob Jones' }] })
    await renderAt('/p/p1')
    const section = await screen.findByRole('region', { name: 'Waiting for you' })
    expect(section).toHaveTextContent('Bob Jones has offered you the draft Meanders')
    expect(within(section).getByRole('link', { name: 'Meanders' })).toHaveAttribute(
      'href',
      '/p/p1/drafts/d1',
    )
    await fireEvent.click(within(section).getByRole('button', { name: 'Decline Meanders' }))
    await fireEvent.click(within(section).getByRole('button', { name: 'Accept Meanders' }))
    await waitFor(() => expect(calls.slice().sort()).toEqual(['accept', 'decline']))
  })

  it('tells the offerer who it is waiting for, with a way to withdraw', async () => {
    const calls = home({ waiting: [{ draftId: 'd1', title: 'Meanders', toName: 'Bob Jones' }] })
    await renderAt('/p/p1')
    const section = await screen.findByRole('region', { name: 'Waiting for you' })
    expect(section).toHaveTextContent('Waiting for Bob Jones to answer your offer of Meanders')
    await fireEvent.click(
      within(section).getByRole('button', { name: 'Withdraw the offer of Meanders' }),
    )
    await waitFor(() => expect(calls).toEqual(['withdraw']))
  })

  it('lists, per copy sent, how the reviews stand, and flags a draft whose reviews have finished', async () => {
    home({
      reviews: [
        {
          draftId: 'd1',
          title: 'Meanders',
          snapshots: [snapshot()],
          needsAttention: true,
        },
        {
          draftId: 'd2',
          title: 'Tides',
          snapshots: [snapshot({ id: 's2', open: 1, ended: 0, unresolved: 0 })],
          needsAttention: false,
        },
      ],
    })
    await renderAt('/p/p1')
    const list = await screen.findByRole('list', { name: 'Drafts sent for review' })
    const [meanders, tides] = Array.from(list.querySelectorAll(':scope > li'))
    expect(meanders).toHaveTextContent('Reviews finished, comments to answer')
    expect(meanders).toHaveTextContent('1 finished, 2 comments to answer')
    expect(tides).toHaveTextContent('1 still reading')
    expect(tides).not.toHaveTextContent('comments to answer')
    expect(tides).not.toHaveTextContent('Reviews finished')
  })

  it('says what went wrong if an answer is refused', async () => {
    home({ offered: [{ draftId: 'd1', title: 'Meanders', fromName: 'Bob Jones' }] })
    server.use(
      http.post('*/api/publications/p1/drafts/d1/handover/offer/accept', () =>
        HttpResponse.json({ error: 'There is no offer of this draft for you.' }, { status: 404 }),
      ),
    )
    await renderAt('/p/p1')
    await fireEvent.click(await screen.findByRole('button', { name: 'Accept Meanders' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no offer of this draft')
  })
})
