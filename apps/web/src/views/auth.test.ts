import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const noProviders = http.get('*/api/auth/config', () => HttpResponse.json({ providers: [] }))
const noProfiles = http.get('*/api/profiles', () => HttpResponse.json([]))

describe('route guards', () => {
  it('sends signed-out visitors to the sign-in page, remembering where they were going', async () => {
    server.use(signedInAs(null), noProviders)
    const { router } = await renderAt('/p/abc')
    await screen.findByRole('heading', { name: 'Sign in' })
    // /p/abc is a front door to the profile's Ideas step, and that is where they were going.
    expect(router.currentRoute.value.query.next).toBe('/p/abc/ideas')
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

  it('signs in and lands on the list of profiles', async () => {
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
        HttpResponse.json([
          {
            id: 'p1',
            name: "Ada's writing",
            siteUrl: null,
            imageUrl: null,
            role: 'owner',
            members: [],
          },
        ]),
      ),
    )
    const { router } = await renderAt('/login')
    await fireEvent.update(await screen.findByLabelText('Email'), 'ada@example.com')
    await fireEvent.update(screen.getByLabelText('Password'), 'a good password')
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByRole('heading', { name: 'Your profiles' })
    expect(await screen.findByRole('link', { name: /Ada's writing/ })).toHaveAttribute(
      'href',
      '/p/p1',
    )
    expect(router.currentRoute.value.fullPath).toBe('/')
  })
})

describe('registration', () => {
  const fill = async (username: string) => {
    await fireEvent.update(await screen.findByLabelText('What should we call you?'), 'Ada')
    await fireEvent.update(screen.getByLabelText('Username'), username)
    await fireEvent.update(screen.getByLabelText('Email'), 'ada@example.com')
    await fireEvent.update(screen.getByLabelText('Password'), 'a good password')
  }

  it('asks what to call them, and asks browsers to autofill just a first name', async () => {
    server.use(signedInAs(null))
    await renderAt('/register')
    const name = await screen.findByLabelText('What should we call you?')
    expect(name).toHaveAttribute('autocomplete', 'given-name')
    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocomplete', 'off')
  })

  it('sends the chosen username with the rest of the details', async () => {
    let body: unknown
    server.use(
      signedInAs(null),
      http.get('*/api/auth/handle-available', () => HttpResponse.json({ available: true })),
      http.post('*/api/auth/register', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ error: 'stop here' }, { status: 400 })
      }),
    )
    await renderAt('/register')
    await fill('countess')
    await screen.findByText(/“countess” is available/)
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await screen.findByRole('alert')
    expect(body).toEqual({
      name: 'Ada',
      handle: 'countess',
      email: 'ada@example.com',
      password: 'a good password',
    })
  })

  it('tells them as they type when a username is taken, and will not submit it', async () => {
    server.use(
      signedInAs(null),
      http.get('*/api/auth/handle-available', ({ request }) =>
        HttpResponse.json({
          available: new URL(request.url).searchParams.get('handle') !== 'countess',
        }),
      ),
    )
    await renderAt('/register')
    await fill('countess')
    const hint = await screen.findByText('That username is already taken. Try another.')
    expect(screen.getByLabelText('Username')).toBeInvalid()
    expect(hint).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDisabled()

    await fireEvent.update(screen.getByLabelText('Username'), 'lovelace')
    await screen.findByText(/“lovelace” is available/)
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('explains an unusable username without asking the server', async () => {
    let asked = false
    server.use(
      signedInAs(null),
      http.get('*/api/auth/handle-available', () => {
        asked = true
        return HttpResponse.json({ available: true })
      }),
    )
    await renderAt('/register')
    await fill('ada lovelace')
    await screen.findByText('Use only letters and numbers in your username')
    await new Promise((r) => setTimeout(r, 500)) // longer than the typing pause
    expect(asked).toBe(false)
  })

  it('still lets them submit if the availability check fails (the server decides)', async () => {
    server.use(
      signedInAs(null),
      http.get('*/api/auth/handle-available', () => HttpResponse.error()),
    )
    await renderAt('/register')
    await fill('countess')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled(),
    )
    await new Promise((r) => setTimeout(r, 500))
    expect(screen.getByRole('button', { name: 'Create account' })).toBeEnabled()
  })

  it('shows a duplicate-email error from the server', async () => {
    server.use(
      signedInAs(null),
      http.get('*/api/auth/handle-available', () => HttpResponse.json({ available: true })),
      http.post('*/api/auth/register', () =>
        HttpResponse.json({ error: 'An account with this email already exists' }, { status: 409 }),
      ),
    )
    await renderAt('/register')
    await fill('countess')
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

describe('when the server is unavailable', () => {
  it.each([
    ['is down (network error)', () => HttpResponse.error()],
    [
      'returns a server error',
      () => HttpResponse.json({ error: 'Internal server error' }, { status: 500 }),
    ],
  ])(
    'explains the problem instead of showing a blank page or a sign-in form (server %s)',
    async (_label, respond) => {
      server.use(http.get('*/api/auth/me', respond))
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      await renderAt('/')
      expect(await screen.findByRole('alert')).toHaveTextContent(/can't reach the server/i)
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
      expect(logged).toHaveBeenCalled() // and it is logged, not swallowed
    },
  )
})
