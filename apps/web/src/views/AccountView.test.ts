import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const profile = {
  id: 'p1',
  name: "Ada's writing",
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }],
}

describe('AccountView', () => {
  it('requires the typed email (and password) before deleting, then signs out', async () => {
    let body: unknown
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      http.delete('*/api/account', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/account')
    await fireEvent.update(await screen.findByLabelText(/Type your email/), 'ada@example.com')
    await fireEvent.update(screen.getByLabelText('Password'), 'my password 123')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('register'))
    expect(body).toEqual({ confirmEmail: 'ada@example.com', password: 'my password 123' })
  })

  it('does not ask for a password if the account has none', async () => {
    server.use(
      signedInAs({ ...testUser, hasPassword: false, linkedProviders: ['google'] }),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
    )
    await renderAt('/account')
    await screen.findByLabelText(/Type your email/)
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.getByText(/Linked sign-in: google/)).toBeInTheDocument()
  })

  it('lists profiles with their members and lets the owner share', async () => {
    let shared: unknown
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      http.post('*/api/profiles/p1/members', async ({ request }) => {
        shared = await request.json()
        return HttpResponse.json(profile, { status: 201 })
      }),
    )
    await renderAt('/account')
    await screen.findByText(/ada@example.com, owner/)
    await fireEvent.update(screen.getByLabelText(/Share/), 'bob@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    await waitFor(() => expect(shared).toEqual({ email: 'bob@example.com' }))
  })
})
