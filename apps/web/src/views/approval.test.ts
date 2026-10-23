import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['waiting', 'admin', 'home'] })

const waiting = { ...testUser, approval: 'waiting' as const }
const declined = { ...testUser, approval: 'declined' as const }
const admin = { ...testUser, id: 'u0', name: 'Olive Owner', isAdmin: true }

const account = (over: object = {}) => ({
  id: 'a1',
  name: 'Bea Newcomer',
  email: 'bea@example.com',
  emailVerified: true,
  createdAt: '2026-02-01T00:00:00Z',
  approval: 'waiting',
  isAdmin: false,
  ...over,
})
const listOf = (...all: ReturnType<typeof account>[]) => ({
  waiting: all.filter((a) => a.approval === 'waiting'),
  all,
})

describe('the waiting page', () => {
  it('tells someone waiting that we will email them, and offers only the way out', async () => {
    server.use(signedInAs(waiting))
    const { router } = await renderAt('/')
    // Any page leads here: they have no app.
    expect(await screen.findByRole('heading', { name: 'Waiting for approval' })).toBeVisible()
    expect(router.currentRoute.value.name).toBe('waiting')
    expect(screen.getByText(/We’ll email you at/)).toHaveTextContent('ada@example.com')
    const header = within(screen.getByRole('banner'))
    expect(header.getByRole('button', { name: 'Sign out' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: /Publication|Idea/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Download your writing' })).toHaveAttribute(
      'href',
      '/account/download',
    )
    expect(screen.getByRole('link', { name: 'Delete your account' })).toHaveAttribute(
      'href',
      '/account/delete',
    )
    expect(screen.getByRole('link', { name: 'Why is there a wait?' })).toHaveAttribute(
      'href',
      '/help/waiting-for-approval',
    )
  })

  it('never asks the server for the app while waiting', async () => {
    let asked = false
    server.use(
      signedInAs(waiting),
      http.get('*/api/publications', () => {
        asked = true
        return HttpResponse.json([])
      }),
    )
    await renderAt('/p/abc')
    await screen.findByRole('heading', { name: 'Waiting for approval' })
    expect(asked).toBe(false)
  })

  it('says kindly, and without a reason, when the account was declined', async () => {
    server.use(signedInAs(declined))
    await renderAt('/')
    expect(await screen.findByRole('heading', { name: 'No access for now' })).toBeVisible()
    expect(screen.getByRole('main')).not.toHaveTextContent(/because|reason/i)
    expect(screen.queryByText(/We’ll email you at/)).toBeNull()
  })

  it('offers a new confirmation link while the address is unconfirmed', async () => {
    let sent = 0
    server.use(
      signedInAs({ ...waiting, emailVerified: false }),
      http.post('*/api/auth/resend-verification', () => {
        sent++
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/waiting')
    await fireEvent.click(await screen.findByRole('button', { name: 'Send a new link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('A new link is on its way.')
    expect(sent).toBe(1)
  })

  it('sends someone who is approved home instead', async () => {
    server.use(signedInAs(testUser))
    const { router } = await renderAt('/waiting')
    await waitFor(() => expect(router.currentRoute.value.name).toBe('home'))
  })

  it('explains the wait on a help page that anyone can open', async () => {
    server.use(signedInAs(null))
    await renderAt('/help/waiting-for-approval')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Waiting for approval' }),
    ).toBeVisible()
    expect(screen.getByText(/Nothing you write, and no API keys/)).toBeVisible()
  })
})

describe('the admin list', () => {
  it('shows who is waiting first, then everyone, with the date and status', async () => {
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/admin/accounts', () =>
        HttpResponse.json(
          listOf(
            account(),
            account({ id: 'a2', name: 'Cy In', email: 'cy@example.com', approval: 'approved' }),
            account({ id: 'a3', name: 'Di Out', email: 'di@example.com', approval: 'declined' }),
          ),
        ),
      ),
    )
    await renderAt('/admin')
    expect(await screen.findByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible()
    const waitingList = await screen.findByRole('list', { name: 'Accounts waiting for approval' })
    expect(within(waitingList).getByText('Bea Newcomer')).toBeVisible()
    expect(waitingList).toHaveTextContent('bea@example.com')
    expect(waitingList).toHaveTextContent(/signed up/)
    const all = screen.getByRole('list', { name: 'All accounts' })
    expect(within(all).getByText('Approved')).toBeVisible()
    expect(within(all).getByText('Declined')).toBeVisible()
  })

  it('approves and declines with buttons, and shows the list the server answers with', async () => {
    const decisions: unknown[] = []
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/admin/accounts', () => HttpResponse.json(listOf(account()))),
      http.post('*/api/admin/accounts/:id/decision', async ({ request, params }) => {
        decisions.push([params.id, await request.json()])
        return HttpResponse.json(listOf(account({ approval: 'approved' })))
      }),
    )
    await renderAt('/admin')
    await fireEvent.click(await screen.findByRole('button', { name: 'Approve Bea Newcomer' }))
    await waitFor(() => expect(decisions).toEqual([['a1', { decision: 'approve' }]]))
    expect(await screen.findByText('No one is waiting.')).toBeVisible()
    // Now in the full list, where it can be declined again.
    expect(screen.getByRole('button', { name: 'Decline Bea Newcomer' })).toBeVisible()
  })

  it('offers no buttons for an admin or for yourself', async () => {
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/admin/accounts', () =>
        HttpResponse.json(
          listOf(
            account({ id: 'u0', name: 'Olive Owner', approval: 'approved', isAdmin: true }),
            account({ id: 'a9', name: 'Other Admin', approval: 'approved', isAdmin: true }),
          ),
        ),
      ),
    )
    await renderAt('/admin')
    await screen.findByRole('list', { name: 'All accounts' })
    expect(screen.queryByRole('button', { name: /Decline|Approve/ })).toBeNull()
    expect(screen.getAllByText('Admin')).toHaveLength(2)
  })

  it('says when no one is waiting, and when there are no accounts', async () => {
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/admin/accounts', () => HttpResponse.json(listOf())),
    )
    await renderAt('/admin')
    expect(await screen.findByText('No one is waiting.')).toBeVisible()
    expect(screen.getByText('No accounts yet.')).toBeVisible()
  })

  it('says what could not be loaded, and tries again', async () => {
    let fail = true
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/admin/accounts', () =>
        fail
          ? HttpResponse.json({ error: 'no' }, { status: 500 })
          : HttpResponse.json(listOf(account())),
      ),
    )
    await renderAt('/admin')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load the accounts/)
    fail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findAllByText('Bea Newcomer')).length).toBeGreaterThan(0)
  })

  it('shows what went wrong when a decision fails', async () => {
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/admin/accounts', () => HttpResponse.json(listOf(account()))),
      http.post('*/api/admin/accounts/:id/decision', () =>
        HttpResponse.json(
          { error: 'That is a lot of decisions. Try again later.' },
          { status: 429 },
        ),
      ),
    )
    await renderAt('/admin')
    await fireEvent.click(await screen.findByRole('button', { name: 'Decline Bea Newcomer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again later')
  })

  it('pages a long list', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      account({ id: `a${i}`, name: `Person ${i}`, approval: 'approved' }),
    )
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/admin/accounts', () => HttpResponse.json(listOf(...many))),
    )
    await renderAt('/admin')
    const all = await screen.findByRole('list', { name: 'All accounts' })
    expect(within(all).getAllByRole('listitem')).toHaveLength(5)
    await fireEvent.click(screen.getAllByRole('button', { name: /^Next/ })[0]!)
    expect(
      within(screen.getByRole('list', { name: 'All accounts' })).getAllByRole('listitem'),
    ).toHaveLength(2)
  })

  it('is not there for anyone who is not an admin: no link, and the address leads home', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
    )
    const { router } = await renderAt('/admin')
    await waitFor(() => expect(router.currentRoute.value.name).toBe('home'))
    expect(screen.queryByRole('link', { name: 'Accounts' })).toBeNull()
  })

  it('has a link in the menu for an admin', async () => {
    server.use(
      signedInAs(admin),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/publications', () => HttpResponse.json([])),
    )
    await renderAt('/')
    expect(await screen.findByRole('link', { name: 'Accounts' })).toHaveAttribute('href', '/admin')
  })
})
