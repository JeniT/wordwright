import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, sourcesList, testUser, useMockServer } from '../test-utils'

useMockServer()
// Profile settings also lists the profile's idea sources.
beforeEach(() => server.use(sourcesList()))

const preview = {
  profileName: 'Joint piece',
  inviterName: 'Ada Lovelace',
  email: 'bob@example.com',
}
const bob = { ...testUser, id: 'u2', name: 'Bob', email: 'bob@example.com' }
const previewOk = http.post('*/api/invitations/preview', () => HttpResponse.json(preview))
const noProfiles = http.get('*/api/profiles', () => HttpResponse.json([]))
const profile = {
  id: 'p1',
  name: 'Joint piece',
  siteUrl: null,
  imageUrl: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }],
}

describe('accept-invitation page', () => {
  it('signed out: says who invited you and offers sign-up or sign-in with the invited address', async () => {
    server.use(signedInAs(null), previewOk)
    await renderAt('/accept-invite?token=abc')
    await screen.findByText(/Ada Lovelace/)
    expect(screen.getByText(/Joint piece/)).toBeInTheDocument()
    expect(screen.getByText('bob@example.com')).toBeInTheDocument()

    const signUp = screen.getByRole('link', { name: 'Create an account' })
    const url = new URL(signUp.getAttribute('href')!, 'http://x')
    expect(url.pathname).toBe('/register')
    expect(url.searchParams.get('email')).toBe('bob@example.com')
    expect(url.searchParams.get('next')).toBe('/accept-invite?token=abc')
    expect(screen.getByRole('link', { name: 'I already have one' }).getAttribute('href')).toContain(
      '/login',
    )
  })

  it('signed in as the invitee: joins and lands in the profile', async () => {
    let accepted: unknown
    server.use(
      signedInAs(bob),
      previewOk,
      noProfiles,
      http.post('*/api/invitations/accept', async ({ request }) => {
        accepted = await request.json()
        return HttpResponse.json({ profileId: 'p1' })
      }),
      http.get('*/api/profiles/p1/ideas', () => HttpResponse.json([])),
    )
    const { router } = await renderAt('/accept-invite?token=abc')
    await fireEvent.click(await screen.findByRole('button', { name: 'Join Joint piece' }))
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe('/p/p1'))
    expect(accepted).toEqual({ token: 'abc' })
  })

  it('signed in as someone else: explains rather than offering to join', async () => {
    server.use(signedInAs(testUser), previewOk, noProfiles)
    await renderAt('/accept-invite?token=abc')
    expect(await screen.findByRole('alert')).toHaveTextContent(/sent to bob@example.com/)
    expect(screen.queryByRole('button', { name: /^Join/ })).toBeNull()
  })

  it('shows the server’s reason if accepting fails', async () => {
    server.use(
      signedInAs(bob),
      previewOk,
      noProfiles,
      http.post('*/api/invitations/accept', () =>
        HttpResponse.json({ error: 'This invitation is invalid or has expired' }, { status: 400 }),
      ),
    )
    await renderAt('/accept-invite?token=abc')
    await fireEvent.click(await screen.findByRole('button', { name: 'Join Joint piece' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/)
  })

  it('explains an invalid or expired link, and one with no token', async () => {
    server.use(
      signedInAs(null),
      http.post('*/api/invitations/preview', () =>
        HttpResponse.json({ error: 'This invitation is invalid or has expired' }, { status: 400 }),
      ),
    )
    await renderAt('/accept-invite?token=old')
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/)
  })

  it('flags a link without a token', async () => {
    server.use(signedInAs(null))
    await renderAt('/accept-invite')
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has expired/)
  })
})

describe('sign-up and sign-in from an invitation', () => {
  it('prefills the invited address on registration', async () => {
    server.use(signedInAs(null))
    await renderAt('/register?email=bob%40example.com&next=%2Faccept-invite%3Ftoken%3Dabc')
    expect(await screen.findByLabelText('Email')).toHaveValue('bob@example.com')
  })

  it('returns to the invitation after registering', async () => {
    let signedIn = false
    server.use(
      http.get('*/api/auth/me', () =>
        signedIn ? HttpResponse.json(bob) : HttpResponse.json({ error: 'x' }, { status: 401 }),
      ),
      http.post('*/api/auth/register', () => {
        signedIn = true
        return HttpResponse.json(bob, { status: 201 })
      }),
      previewOk,
      noProfiles,
    )
    const { router } = await renderAt(
      '/register?email=bob%40example.com&next=%2Faccept-invite%3Ftoken%3Dabc',
    )
    await fireEvent.update(await screen.findByLabelText('What should we call you?'), 'Bob')
    await fireEvent.update(screen.getByLabelText('Username'), 'bob')
    await fireEvent.update(screen.getByLabelText('Password'), 'a good password')
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await screen.findByRole('button', { name: 'Join Joint piece' })
    expect(router.currentRoute.value.fullPath).toBe('/accept-invite?token=abc')
  })

  it('ignores a "next" that points to another site', async () => {
    let signedIn = false
    server.use(
      http.get('*/api/auth/me', () =>
        signedIn ? HttpResponse.json(bob) : HttpResponse.json({ error: 'x' }, { status: 401 }),
      ),
      http.post('*/api/auth/login', () => {
        signedIn = true
        return HttpResponse.json(bob)
      }),
      http.get('*/api/auth/config', () => HttpResponse.json({ providers: [] })),
      noProfiles,
    )
    const { router } = await renderAt('/login?next=%2F%2Fevil.example')
    await fireEvent.update(await screen.findByLabelText('Email'), 'bob@example.com')
    await fireEvent.update(screen.getByLabelText('Password'), 'a good password')
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.currentRoute.value.name).not.toBe('login'))
    expect(router.currentRoute.value.fullPath).not.toContain('evil')
  })

  it('passes the destination to Google sign-in', async () => {
    server.use(
      signedInAs(null),
      http.get('*/api/auth/config', () =>
        HttpResponse.json({ providers: [{ id: 'google', label: 'Google' }] }),
      ),
    )
    await renderAt('/login?next=%2Faccept-invite%3Ftoken%3Dabc')
    const link = await screen.findByRole('link', { name: 'Continue with Google' })
    expect(link.getAttribute('href')).toBe(
      '/api/auth/oauth/google/start?next=%2Faccept-invite%3Ftoken%3Dabc',
    )
  })
})

describe('inviting from the profile settings page', () => {
  it('sends an invitation, shows a reply that reveals nothing about the address, and lists it as pending', async () => {
    let sent: unknown
    const pending: { id: string; email: string; expiresAt: string }[] = []
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      http.get('*/api/profiles/p1/invitations', () => HttpResponse.json(pending)),
      http.post('*/api/profiles/p1/invitations', async ({ request }) => {
        sent = await request.json()
        pending.push({ id: 'i1', email: 'bob@example.com', expiresAt: '2030-01-08T00:00:00Z' })
        return HttpResponse.json({ ok: true }, { status: 202 })
      }),
    )
    await renderAt('/p/p1/settings')
    await fireEvent.update(await screen.findByLabelText(/Invite someone to/), 'bob@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))

    await screen.findByText(/emailed an invitation to bob@example.com/)
    expect(sent).toEqual({ email: 'bob@example.com' })
    await screen.findByText('Waiting for a reply')
    expect(screen.getByText(/bob@example.com/, { selector: 'span' })).toBeInTheDocument()
  })

  it('revokes and resends pending invitations', async () => {
    let revoked = ''
    let resent: unknown
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      http.get('*/api/profiles/p1/invitations', () =>
        HttpResponse.json([
          { id: 'i1', email: 'bob@example.com', expiresAt: '2030-01-08T00:00:00Z' },
        ]),
      ),
      http.post('*/api/profiles/p1/invitations', async ({ request }) => {
        resent = await request.json()
        return HttpResponse.json({ ok: true }, { status: 202 })
      }),
      http.delete('*/api/profiles/p1/invitations/i1', () => {
        revoked = 'i1'
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt('/p/p1/settings')
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Resend invitation to bob@example.com' }),
    )
    await waitFor(() => expect(resent).toEqual({ email: 'bob@example.com' }))
    const revoke = screen.getByRole('button', { name: 'Revoke invitation to bob@example.com' })
    await fireEvent.click(revoke) // no hold: it only asks to be pressed again
    expect(revoked).toBe('')
    await fireEvent.click(revoke)
    await waitFor(() => expect(revoked).toBe('i1'))
  })

  it('shows why sending failed (e.g. rate limited)', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      http.get('*/api/profiles/p1/invitations', () => HttpResponse.json([])),
      http.post('*/api/profiles/p1/invitations', () =>
        HttpResponse.json(
          { error: 'You have sent a lot of invitations. Try again later.' },
          { status: 429 },
        ),
      ),
    )
    await renderAt('/p/p1/settings')
    await fireEvent.update(await screen.findByLabelText(/Invite someone to/), 'bob@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/lot of invitations/)
  })
})
