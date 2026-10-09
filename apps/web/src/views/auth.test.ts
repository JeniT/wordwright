import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const noProviders = http.get('*/api/auth/config', () => HttpResponse.json({ providers: [] }))
const noProfiles = http.get('*/api/profiles', () => HttpResponse.json([]))

describe('route guards', () => {
  it('sends signed-out visitors to the sign-in page, remembering where they were going', async () => {
    server.use(signedInAs(null), noProviders)
    const { router } = await renderAt('/p/abc')
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(router.currentRoute.value.query.next).toBe('/p/abc')
  })

  it('keeps signed-in users away from the sign-in page', async () => {
    server.use(signedInAs(testUser), noProfiles)
    const { router } = await renderAt('/login')
    await waitFor(() => expect(router.currentRoute.value.name).not.toBe('login'))
  })
})

describe('sign in', () => {
  it('shows server errors', async () => {
    server.use(
      signedInAs(null),
      noProviders,
      http.post('*/api/auth/login', () =>
        HttpResponse.json({ error: 'Invalid email or password' }, { status: 401 }),
      ),
    )
    await renderAt('/login')
    await fireEvent.update(await screen.findByLabelText('Email'), 'ada@example.com')
    await fireEvent.update(screen.getByLabelText('Password'), 'wrong password')
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('offers configured identity providers', async () => {
    server.use(
      signedInAs(null),
      http.get('*/api/auth/config', () =>
        HttpResponse.json({ providers: [{ id: 'google', label: 'Google' }] }),
      ),
    )
    await renderAt('/login')
    const link = await screen.findByRole('link', { name: 'Continue with Google' })
    expect(link).toHaveAttribute('href', '/api/auth/oauth/google/start')
  })

  it('explains a failed provider login', async () => {
    server.use(signedInAs(null), noProviders)
    await renderAt('/login?error=email_not_verified')
    expect(await screen.findByRole('alert')).toHaveTextContent(/not verified/)
  })

  it('signs in and lands on the first profile', async () => {
    let signedIn = false
    server.use(
      http.get('*/api/auth/me', () =>
        signedIn ? HttpResponse.json(testUser) : HttpResponse.json({ error: 'x' }, { status: 401 }),
      ),
      noProviders,
      http.post('*/api/auth/login', () => {
        signedIn = true
        return HttpResponse.json(testUser)
      }),
      http.get('*/api/profiles', () =>
        HttpResponse.json([{ id: 'p1', name: "Ada's writing", role: 'owner', members: [] }]),
      ),
      http.get('*/api/profiles/p1/drafts', () => HttpResponse.json([])),
    )
    const { router } = await renderAt('/login')
    await fireEvent.update(await screen.findByLabelText('Email'), 'ada@example.com')
    await fireEvent.update(screen.getByLabelText('Password'), 'a good password')
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText(/Nothing here yet/)
    expect(router.currentRoute.value.fullPath).toBe('/p/p1')
  })
})

describe('registration', () => {
  it('shows a duplicate-email error from the server', async () => {
    server.use(
      signedInAs(null),
      http.post('*/api/auth/register', () =>
        HttpResponse.json({ error: 'An account with this email already exists' }, { status: 409 }),
      ),
    )
    await renderAt('/register')
    await fireEvent.update(await screen.findByLabelText('Name'), 'Ada')
    await fireEvent.update(screen.getByLabelText('Email'), 'ada@example.com')
    await fireEvent.update(screen.getByLabelText('Password'), 'a good password')
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/)
  })
})

describe('password recovery', () => {
  it('confirms without revealing whether the address has an account', async () => {
    server.use(
      signedInAs(null),
      http.post('*/api/auth/forgot-password', () => HttpResponse.json({ ok: true })),
    )
    await renderAt('/forgot-password')
    await fireEvent.update(await screen.findByLabelText('Email'), 'whoever@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/If there's an account/)
  })

  it('submits the token from the link with the new password', async () => {
    let body: unknown
    server.use(
      signedInAs(null),
      http.post('*/api/auth/reset-password', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/reset-password?token=abc123')
    await fireEvent.update(await screen.findByLabelText('New password'), 'a brand new password')
    await fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
    await screen.findByText(/Your password has been changed/)
    expect(body).toEqual({ token: 'abc123', password: 'a brand new password' })
  })

  it('flags a reset page opened without a token', async () => {
    server.use(signedInAs(null))
    await renderAt('/reset-password')
    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete/)
  })
})
