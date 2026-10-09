import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const noProfiles = http.get('*/api/profiles', () => HttpResponse.json([]))

describe('changing your email on the account page', () => {
  it('asks for the new address and password, then says where the link went', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      noProfiles,
      llmSettings(false),
      http.post('*/api/account/email', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/account')
    const form = (await screen.findByRole('heading', { name: 'Email address' })).closest('section')!
    expect(form).toHaveTextContent('ada@example.com')

    await fireEvent.update(screen.getByLabelText('New email address'), ' New@Example.com ')
    await fireEvent.update(screen.getByLabelText('Confirm with your password'), 'my password')
    await fireEvent.click(screen.getByRole('button', { name: 'Email me a link to confirm' }))

    expect(await within(form).findByRole('status')).toHaveTextContent('new@example.com')
    expect(sent).toEqual({ newEmail: 'New@Example.com', password: 'my password' })
    expect(screen.getByLabelText<HTMLInputElement>('New email address').value).toBe('')
  })

  it('shows what went wrong, e.g. an address already in use', async () => {
    server.use(
      signedInAs(testUser),
      noProfiles,
      llmSettings(false),
      http.post('*/api/account/email', () =>
        HttpResponse.json({ error: 'An account with this email already exists' }, { status: 409 }),
      ),
    )
    await renderAt('/account')
    const form = (await screen.findByRole('heading', { name: 'Email address' })).closest('section')!
    await fireEvent.update(screen.getByLabelText('New email address'), 'bob@example.com')
    await fireEvent.update(screen.getByLabelText('Confirm with your password'), 'my password')
    await fireEvent.click(screen.getByRole('button', { name: 'Email me a link to confirm' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('already exists')
    expect(within(form).queryByRole('status')).toBeNull()
  })

  it('disables the button while sending', async () => {
    server.use(
      signedInAs(testUser),
      noProfiles,
      llmSettings(false),
      http.post('*/api/account/email', async () => {
        await new Promise((r) => setTimeout(r, 50))
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/account')
    const form = (await screen.findByRole('heading', { name: 'Email address' })).closest('section')!
    await fireEvent.update(screen.getByLabelText('New email address'), 'bob@example.com')
    await fireEvent.update(screen.getByLabelText('Confirm with your password'), 'my password')
    await fireEvent.click(screen.getByRole('button', { name: 'Email me a link to confirm' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Email me a link to confirm' })).toBeDisabled(),
    )
    await within(form).findByRole('status')
  })

  it('explains, instead of showing a form, when there is no password yet', async () => {
    server.use(
      signedInAs({ ...testUser, hasPassword: false, linkedProviders: ['google'] }),
      noProfiles,
      llmSettings(false),
    )
    await renderAt('/account')
    const section = (await screen.findByRole('heading', { name: 'Email address' })).closest(
      'section',
    )!
    expect(section).toHaveTextContent('first add a password')
    expect(screen.queryByLabelText('New email address')).toBeNull()
  })
})

describe('confirm-new-email page', () => {
  it('switches the address from the link, with no one signed in', async () => {
    let sent: unknown
    server.use(
      signedInAs(null),
      http.post('*/api/auth/confirm-email-change', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/confirm-email-change?token=abc123')
    await screen.findByText(/your email address has been changed/)
    expect(sent).toEqual({ token: 'abc123' })
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the new address to someone who is signed in', async () => {
    let changed = false
    server.use(
      http.get('*/api/auth/me', () =>
        HttpResponse.json(changed ? { ...testUser, email: 'new@example.com' } : testUser),
      ),
      noProfiles,
      http.post('*/api/auth/confirm-email-change', () => {
        changed = true
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/confirm-email-change?token=abc123')
    await screen.findByText(/your email address has been changed/)
    expect(screen.getByRole('link', { name: 'Back to your account' })).toBeInTheDocument()
  })

  it('explains an expired link and what to do next', async () => {
    server.use(
      signedInAs(testUser),
      noProfiles,
      http.post('*/api/auth/confirm-email-change', () =>
        HttpResponse.json({ error: 'This link is invalid or has expired' }, { status: 400 }),
      ),
    )
    await renderAt('/confirm-email-change?token=old')
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired')
    expect(screen.getByText(/to ask for a new link/)).toBeInTheDocument()
  })

  it('flags a link with no token', async () => {
    server.use(signedInAs(null))
    await renderAt('/confirm-email-change')
    expect(await screen.findByRole('alert')).toHaveTextContent(/incomplete/)
  })
})
