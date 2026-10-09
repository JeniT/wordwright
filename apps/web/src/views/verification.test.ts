import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const unverified = { ...testUser, emailVerified: false }
const noProfiles = http.get('*/api/profiles', () => HttpResponse.json([]))
const profile = {
  id: 'p1',
  name: "Ada's writing",
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }],
}

describe('confirm-email page', () => {
  it('confirms the address from the link, with no one signed in', async () => {
    let sent: unknown
    server.use(
      signedInAs(null),
      http.post('*/api/auth/verify-email', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/verify-email?token=abc123')
    await screen.findByText(/your email address is confirmed/)
    expect(sent).toEqual({ token: 'abc123' })
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('refreshes the signed-in user so the banner disappears', async () => {
    let verified = false
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json(verified ? testUser : unverified)),
      noProfiles,
      http.post('*/api/auth/verify-email', () => {
        verified = true
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/verify-email?token=abc123')
    await screen.findByText(/your email address is confirmed/)
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Email confirmation' })).toBeNull(),
    )
    expect(screen.getByRole('link', { name: 'Continue writing' })).toBeInTheDocument()
  })

  it('explains an expired link and, if signed in, offers a new one', async () => {
    let resent = false
    server.use(
      signedInAs(unverified),
      noProfiles,
      http.post('*/api/auth/verify-email', () =>
        HttpResponse.json(
          { error: 'This verification link is invalid or has expired' },
          { status: 400 },
        ),
      ),
      http.post('*/api/auth/resend-verification', () => {
        resent = true
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/verify-email?token=old')
    expect(await screen.findByText(/invalid or has expired/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Send me a new link' }))
    await screen.findByText('A new link is on its way.')
    expect(resent).toBe(true)
  })

  it('tells signed-out people to sign in for a new link', async () => {
    server.use(
      signedInAs(null),
      http.post('*/api/auth/verify-email', () =>
        HttpResponse.json(
          { error: 'This verification link is invalid or has expired' },
          { status: 400 },
        ),
      ),
    )
    await renderAt('/verify-email?token=old')
    await screen.findByText(/to request a new link/)
    expect(screen.queryByRole('button', { name: 'Send me a new link' })).toBeNull()
  })

  it('flags a link with no token', async () => {
    server.use(signedInAs(null))
    await renderAt('/verify-email')
    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete/)
  })
})

describe('confirmation banner', () => {
  it('asks unconfirmed people to confirm, and can resend', async () => {
    server.use(
      signedInAs(unverified),
      noProfiles,
      http.post('*/api/auth/resend-verification', () => HttpResponse.json({ ok: true })),
    )
    await renderAt('/account')
    const banner = await screen.findByRole('region', { name: 'Email confirmation' })
    expect(banner).toHaveTextContent('ada@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Resend' }))
    await screen.findByText('Sent. Check your inbox.')
  })

  it('shows why a resend failed (e.g. throttled)', async () => {
    server.use(
      signedInAs(unverified),
      noProfiles,
      http.post('*/api/auth/resend-verification', () =>
        HttpResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 }),
      ),
    )
    await renderAt('/account')
    await fireEvent.click(await screen.findByRole('button', { name: 'Resend' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })

  it('is absent once confirmed', async () => {
    server.use(signedInAs(testUser), noProfiles)
    await renderAt('/account')
    await screen.findByRole('heading', { name: 'Your account' })
    expect(screen.queryByRole('region', { name: 'Email confirmation' })).toBeNull()
  })
})

describe('sharing needs a confirmed address', () => {
  it('replaces the share form with an explanation', async () => {
    server.use(
      signedInAs(unverified),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
    )
    await renderAt('/account')
    await screen.findByText(/Confirm your email address to share this profile/)
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
  })
})
