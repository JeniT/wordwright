import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['draft'] })

const ada = { userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' }
const bob = { userId: 'u2', name: 'Bob Jones', email: 'bob@example.com' }
const cy = { userId: 'u3', name: 'Cy Young', email: 'cy@example.com' }

const draft = {
  id: 'd1',
  profileId: 'p1',
  ideaId: 'i1',
  title: 'T',
  body: 'Some text',
  editorId: 'u1',
  editorName: 'Ada Lovelace',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}
const state = (over: object = {}) => ({
  editorId: 'u1',
  editorName: 'Ada Lovelace',
  offer: null,
  asks: [],
  history: [],
  ...over,
})

/** The draft page as `me` sees it: `role` in the profile, `editor` as the draft's editor, `handover` as the server has it. */
function mockPage(me: typeof ada, { role = 'member', editor = 'u1', handover = state() } = {}) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const record =
    (method: string) =>
    async ({ request }: { request: Request }) => {
      const path = new URL(request.url).pathname.split('/handover')[1] ?? ''
      const body =
        request.method === 'POST' ? await request.json().catch(() => undefined) : undefined
      calls.push({ method, path, body })
      return HttpResponse.json(handover)
    }
  server.use(
    signedInAs({ ...testUser, id: me.userId, name: me.name }),
    http.get('*/api/profiles', () =>
      HttpResponse.json([
        {
          id: 'p1',
          name: 'A profile',
          siteUrl: null,
          imageUrl: null,
          siteIconUrl: null,
          description: null,
          role,
          members: [
            { ...ada, role: 'owner' },
            { ...bob, role: 'member' },
            { ...cy, role: 'member' },
          ],
        },
      ]),
    ),
    http.get('*/api/profiles/p1/ideas/i1', () =>
      HttpResponse.json({
        id: 'i1',
        profileId: 'p1',
        name: 'An idea',
        notes: '',
        links: [],
        drafts: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    ),
    http.get('*/api/profiles/p1/ideas/i1/notes', () => HttpResponse.json([])),
    http.get('*/api/profiles/p1/drafts/d1', () =>
      HttpResponse.json({ ...draft, editorId: editor, editorName: 'Ada Lovelace' }),
    ),
    http.get('*/api/profiles/p1/drafts/d1/critique', () =>
      HttpResponse.json({ round: null, used: 0, allowed: 3 }),
    ),
    http.get('*/api/profiles/p1/drafts/d1/insertions', () => HttpResponse.json([])),
    http.get('*/api/profiles/p1/drafts/d1/handover', () => HttpResponse.json(handover)),
    http.post('*/api/profiles/p1/drafts/d1/handover/*', record('POST')),
    http.delete('*/api/profiles/p1/drafts/d1/handover/*', record('DELETE')),
  )
  return calls
}

describe('handing a draft over (#155)', () => {
  it('lets the editor offer the draft to a named member, and says they stay editor until it is accepted', async () => {
    const calls = mockPage(ada, { role: 'owner' })
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByText('Hand this draft to someone'))
    const choose = screen.getByLabelText('Offer it to')
    expect(within(choose).queryByRole('option', { name: 'Ada Lovelace' })).toBeNull() // not oneself
    await fireEvent.update(choose, 'u2')
    await fireEvent.click(screen.getByRole('button', { name: 'Offer the draft' }))
    await waitFor(() =>
      expect(calls).toEqual([{ method: 'POST', path: '/offer', body: { userId: 'u2' } }]),
    )
  })

  it('shows an open offer with a way to withdraw it', async () => {
    const calls = mockPage(ada, {
      handover: state({ offer: { id: 'h1', toId: 'u2', toName: 'Bob Jones', createdAt: 'x' } }),
    })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText(/You stay its editor until they accept/)).toBeTruthy()
    expect(screen.queryByText('Hand this draft to someone')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Withdraw the offer' }))
    await waitFor(() => expect(calls).toEqual([{ method: 'DELETE', path: '/offer' }]))
  })

  it('shows requests to the editor, who can offer to the asker or say not now', async () => {
    const calls = mockPage(ada, {
      handover: state({ asks: [{ id: 'a1', byId: 'u2', byName: 'Bob Jones', createdAt: 'x' }] }),
    })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText(/asked for this draft/)).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Offer it to Bob Jones' }))
    await waitFor(() =>
      expect(calls).toEqual([
        { method: 'DELETE', path: '/asks/a1' },
        { method: 'POST', path: '/offer', body: { userId: 'u2' } },
      ]),
    )
  })

  it('tells the offered member, who can accept or decline', async () => {
    const calls = mockPage(bob, {
      handover: state({ offer: { id: 'h1', toId: 'u2', toName: 'Bob Jones', createdAt: 'x' } }),
    })
    await renderAt('/p/p1/drafts/d1')
    const offered = await screen.findByTestId('offered-to-me')
    expect(offered).toHaveTextContent('Ada Lovelace has offered you this draft')
    await fireEvent.click(within(offered).getByRole('button', { name: 'Decline' }))
    await fireEvent.click(within(offered).getByRole('button', { name: 'Accept' }))
    await waitFor(() =>
      expect(calls.map((c) => c.path)).toEqual(['/offer/decline', '/offer/accept']),
    )
  })

  it('lets another member ask, and take the request back', async () => {
    const calls = mockPage(cy)
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Ask Ada Lovelace for this draft' }),
    )
    await waitFor(() => expect(calls).toEqual([{ method: 'POST', path: '/asks', body: {} }]))
  })

  it('shows a member who has asked that nothing changes unless the editor offers', async () => {
    const calls = mockPage(cy, {
      handover: state({ asks: [{ id: 'a9', byId: 'u3', byName: 'Cy Young', createdAt: 'x' }] }),
    })
    await renderAt('/p/p1/drafts/d1')
    expect(await screen.findByText(/Nothing changes unless they offer it to you/)).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'Take back my request' }))
    await waitFor(() => expect(calls).toEqual([{ method: 'DELETE', path: '/asks/a9' }]))
  })

  it('lets an owner who is not the editor reassign it', async () => {
    const calls = mockPage(bob, { role: 'owner', editor: 'u1' })
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByText('Reassign this draft (owners)'))
    await fireEvent.update(screen.getByLabelText('Make this person the editor'), 'u3')
    await fireEvent.click(screen.getByRole('button', { name: 'Reassign the draft' }))
    await waitFor(() =>
      expect(calls).toEqual([{ method: 'POST', path: '/reassign', body: { userId: 'u3' } }]),
    )
  })

  it('offers reassignment to owners only', async () => {
    mockPage(cy, { role: 'member' })
    await renderAt('/p/p1/drafts/d1')
    await screen.findByRole('button', { name: 'Ask Ada Lovelace for this draft' })
    expect(screen.queryByText('Reassign this draft (owners)')).toBeNull()
  })

  it('lists the history in words, naming a gone account as a former member', async () => {
    mockPage(ada, {
      handover: state({
        history: [
          {
            id: '4',
            kind: 'reassign',
            status: 'done',
            actorName: null,
            memberName: 'Ada Lovelace',
            createdAt: '2026-04-01T00:00:00Z',
            resolvedAt: null,
            automatic: true,
          },
          {
            id: '3',
            kind: 'reassign',
            status: 'done',
            actorName: 'Jo Park',
            memberName: 'Ada Lovelace',
            createdAt: '2026-03-01T00:00:00Z',
            resolvedAt: null,
            automatic: false,
          },
          {
            id: '2',
            kind: 'offer',
            status: 'declined',
            actorName: 'Ada Lovelace',
            memberName: 'Bob Jones',
            createdAt: '2026-02-01T00:00:00Z',
            resolvedAt: null,
            automatic: false,
          },
          {
            id: '1',
            kind: 'ask',
            status: 'withdrawn',
            actorName: null,
            memberName: 'Ada Lovelace',
            createdAt: '2026-01-01T00:00:00Z',
            resolvedAt: null,
            automatic: false,
          },
        ],
      }),
    })
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(await screen.findByText(/Who has edited this draft \(4\)/))
    expect(screen.getByText(/Passed to Ada Lovelace when the previous editor left/)).toBeTruthy()
    expect(screen.getByText(/Reassigned by Jo Park to Ada Lovelace/)).toBeTruthy()
    expect(screen.getByText(/Ada Lovelace offered the draft to Bob Jones: declined/)).toBeTruthy()
    expect(screen.getByText(/a former member asked for the draft: withdrawn/)).toBeTruthy()
  })

  it('says why when an action is refused', async () => {
    mockPage(cy)
    server.use(
      http.post('*/api/profiles/p1/drafts/d1/handover/asks', () =>
        HttpResponse.json(
          { error: 'You have already asked Ada Lovelace for this draft.' },
          { status: 409 },
        ),
      ),
    )
    await renderAt('/p/p1/drafts/d1')
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Ask Ada Lovelace for this draft' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('already asked')
  })
})
