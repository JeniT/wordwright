import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const waiting = {
  id: 'i1',
  publicationName: 'Joint piece',
  inviterName: 'Ada Lovelace',
  expiresAt: '2026-10-25T00:00:00.000Z',
}
const own = {
  id: 'own',
  name: 'My blog',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [],
}
const home = (list: unknown[]) =>
  server.use(
    signedInAs(testUser),
    llmSettings(true),
    http.get('*/api/reviews', () => HttpResponse.json([])),
    http.get('*/api/publications', () => HttpResponse.json([own])),
    http.get('*/api/invitations/mine', () => HttpResponse.json(list)),
  )
const panel = () => screen.getByRole('region', { name: 'Invitations' })

describe('Home: invitations waiting for you', () => {
  it('shows nothing when none are waiting', async () => {
    home([])
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Your publications' })
    expect(screen.queryByRole('region', { name: 'Invitations' })).toBeNull()
  })

  it('says who invited you to what, with a way to join and a way to decline', async () => {
    home([waiting])
    await renderAt('/')
    const row = within(await screen.findByRole('list', { name: 'Invitations' }))
    expect(row.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(row.getByText('Joint piece')).toBeInTheDocument()
    expect(row.getByRole('button', { name: 'Join Joint piece' })).toBeEnabled()
    expect(row.getByRole('button', { name: 'Decline Joint piece' })).toBeEnabled()
  })

  it('joins and lands in the publication', async () => {
    home([waiting])
    let joined = 0
    server.use(
      http.post('*/api/invitations/mine/i1/accept', () => {
        joined++
        return HttpResponse.json({ publicationId: 'p1' })
      }),
      http.get('*/api/publications/p1/ideas', () => HttpResponse.json([])),
    )
    const { router } = await renderAt('/')
    await fireEvent.click(await screen.findByRole('button', { name: 'Join Joint piece' }))
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/p/p1'))
    expect(joined).toBe(1)
  })

  it('says why joining failed and stays put', async () => {
    home([waiting])
    server.use(
      http.post('*/api/invitations/mine/i1/accept', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('button', { name: 'Join Joint piece' }))
    expect(await within(panel()).findByRole('alert')).toHaveTextContent('Not found')
  })

  it('declines, optionally stopping invitations from the sender, without telling them', async () => {
    home([waiting])
    let body: unknown
    server.use(
      http.post('*/api/invitations/mine/i1/decline', async ({ request }) => {
        body = await request.json()
        // Once declined, nothing is waiting any more.
        server.use(http.get('*/api/invitations/mine', () => HttpResponse.json([])))
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/')
    await fireEvent.click(await screen.findByRole('button', { name: 'Decline Joint piece' }))
    expect(screen.getByText(/isn't told that you declined/)).toBeInTheDocument()
    await fireEvent.click(screen.getByLabelText('Stop invitations from Ada Lovelace'))
    await fireEvent.click(within(panel()).getAllByRole('button', { name: 'Decline' }).at(-1)!)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Invitations' })).toBeNull())
    expect(body).toEqual({ block: 'sender' })
  })

  it('says what went wrong, and offers to try again, when the invitations cannot load', async () => {
    home([])
    server.use(
      http.get('*/api/invitations/mine', () => HttpResponse.json({ error: 'x' }, { status: 500 })),
    )
    await renderAt('/')
    expect(await screen.findByText(/We couldn't load your invitations/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
