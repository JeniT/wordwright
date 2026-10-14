import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, sourcesList, testUser, useMockServer } from '../test-utils'

useMockServer()
beforeEach(() => server.use(sourcesList()))

const ada = { userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' }
const bob = { userId: 'u2', name: 'Bob', email: 'bob@example.com' }
const profile = (viewer: 'owner' | 'member', roles: { ada: string; bob: string }) => ({
  id: 'p1',
  name: 'Joint piece',
  siteUrl: null,
  imageUrl: null,
  description: null,
  role: viewer,
  members: [
    { ...ada, role: roles.ada },
    { ...bob, role: roles.bob },
  ],
})

/** The profile as the server holds it, changed by the role request. */
function serverWith(roles: { ada: string; bob: string }, viewer: 'owner' | 'member' = 'owner') {
  const state = { roles: { ...roles }, requests: [] as unknown[] }
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([profile(viewer, state.roles)])),
    http.get('*/api/profiles/p1/invitations', () => HttpResponse.json([])),
    http.get('*/api/profiles/p1/ideas', () => HttpResponse.json([])),
    http.put('*/api/profiles/p1/members/:userId/role', async ({ request, params }) => {
      const body = (await request.json()) as { role: string }
      state.requests.push({ userId: params.userId, ...body })
      if (params.userId === 'u2') state.roles.bob = body.role
      else state.roles.ada = body.role
      return HttpResponse.json(profile('owner', state.roles))
    }),
  )
  return state
}

describe('owners in the people list', () => {
  it('asks what will change before making a member an owner, then does it', async () => {
    const state = serverWith({ ada: 'owner', bob: 'member' })
    await renderAt('/p/p1/settings')
    await fireEvent.click(await screen.findByRole('button', { name: 'Make owner Bob' }))

    const dialog = await screen.findByRole('dialog', { name: 'Make Bob an owner of Joint piece?' })
    expect(within(dialog).getByText(/Bob will be able to/)).toBeInTheDocument()
    expect(within(dialog).getByText(/invite people and remove them/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    expect(state.requests).toEqual([])

    await fireEvent.click(within(dialog).getByRole('button', { name: 'Make Bob an owner' }))
    await waitFor(() => expect(state.requests).toEqual([{ userId: 'u2', role: 'owner' }]))
    expect(await screen.findByRole('button', { name: 'Remove as owner Bob' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByText('Bob is now an owner.')).toBeInTheDocument()
  })

  it('does nothing when the dialog is cancelled', async () => {
    const state = serverWith({ ada: 'owner', bob: 'member' })
    await renderAt('/p/p1/settings')
    await fireEvent.click(await screen.findByRole('button', { name: 'Make owner Bob' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(state.requests).toEqual([])
  })

  it('says what an owner loses when removing another owner', async () => {
    const state = serverWith({ ada: 'owner', bob: 'owner' })
    await renderAt('/p/p1/settings')
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove as owner Bob' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove Bob as an owner?' })
    expect(within(dialog).getByText(/no longer be able to/)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/stays a member and keeps their own drafts/i),
    ).toBeInTheDocument()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove as owner' }))
    await waitFor(() => expect(state.requests).toEqual([{ userId: 'u2', role: 'member' }]))
  })

  it('warns people stepping down that they lose these powers themselves', async () => {
    serverWith({ ada: 'owner', bob: 'owner' })
    await renderAt('/p/p1/settings')
    await fireEvent.click(await screen.findByRole('button', { name: 'Step down as owner' }))
    const dialog = await screen.findByRole('dialog', { name: 'Step down as owner of Joint piece?' })
    expect(within(dialog).getByText(/only another owner can give them back/i)).toBeInTheDocument()
  })

  it('does not offer to step down when you are the only owner, and says why', async () => {
    serverWith({ ada: 'owner', bob: 'member' })
    await renderAt('/p/p1/settings')
    const step = await screen.findByRole('button', { name: 'Step down as owner' })
    expect(step).toBeDisabled()
    expect(step).toHaveAccessibleDescription(/only owner.*make someone else an owner first/i)
  })

  it('offers members nothing but leaving', async () => {
    serverWith({ ada: 'owner', bob: 'member' }, 'member')
    await renderAt('/p/p1/settings')
    await screen.findByText('Ada Lovelace')
    expect(screen.queryByRole('button', { name: /owner/i })).toBeNull()
  })

  it("shows the server's reason if the change is refused", async () => {
    serverWith({ ada: 'owner', bob: 'member' })
    server.use(
      http.put('*/api/profiles/p1/members/u2/role', () =>
        HttpResponse.json({ error: 'There must be at least one owner.' }, { status: 409 }),
      ),
    )
    await renderAt('/p/p1/settings')
    await fireEvent.click(await screen.findByRole('button', { name: 'Make owner Bob' }))
    await fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Make Bob an owner' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one owner/)
  })
})
