import { fireEvent, screen } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const noPublications = http.get('*/api/publications', () => HttpResponse.json([]))
const noLlm = http.get('*/api/llm', () =>
  HttpResponse.json({
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    hasKey: false,
    keyHint: null,
  }),
)
const googleOnly = { ...testUser, hasPassword: false, linkedProviders: ['google'] }

describe('changing a password', () => {
  it('sends both passwords, confirms, and clears the fields', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      noPublications,
      noLlm,
      http.post('*/api/account/password', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/account/security')
    const current = await screen.findByLabelText('Current password')
    expect(current).toHaveAttribute('type', 'password')
    await fireEvent.update(current, 'my old password')
    await fireEvent.update(screen.getByLabelText('New password'), 'a brand new password')
    await fireEvent.click(screen.getByRole('button', { name: 'Save password' }))

    await screen.findByText(/signed out your other devices/)
    expect(sent).toEqual({
      currentPassword: 'my old password',
      newPassword: 'a brand new password',
    })
    expect(screen.getByLabelText('Current password')).toHaveValue('')
    expect(screen.getByLabelText('New password')).toHaveValue('')
  })

  it('shows why it failed, e.g. a wrong current password', async () => {
    server.use(
      signedInAs(testUser),
      noPublications,
      noLlm,
      http.post('*/api/account/password', () =>
        HttpResponse.json({ error: 'Your current password is incorrect' }, { status: 403 }),
      ),
    )
    await renderAt('/account/security')
    await fireEvent.update(await screen.findByLabelText('Current password'), 'nope nope nope')
    await fireEvent.update(screen.getByLabelText('New password'), 'a brand new password')
    await fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Your current password is incorrect')
    expect(screen.queryByText(/signed out your other devices/)).toBeNull()
  })
})

describe('adding a password to a Google-only account', () => {
  it('explains, then emails a link instead of asking for a password on the page', async () => {
    let requested = false
    server.use(
      signedInAs(googleOnly),
      noPublications,
      noLlm,
      http.post('*/api/account/password/setup-email', () => {
        requested = true
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/account/security')
    await screen.findByText(/Add a password to sign in with email too/)
    expect(screen.queryByLabelText('Current password')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Email me a link' }))
    await screen.findByText(/Link sent/)
    expect(requested).toBe(true)
    expect(screen.queryByRole('button', { name: 'Email me a link' })).toBeNull()
  })

  it('shows an error if the request is refused', async () => {
    server.use(
      signedInAs(googleOnly),
      noPublications,
      noLlm,
      http.post('*/api/account/password/setup-email', () =>
        HttpResponse.json({ error: 'Too many attempts' }, { status: 429 }),
      ),
    )
    await renderAt('/account/security')
    await fireEvent.click(await screen.findByRole('button', { name: 'Email me a link' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })
})
