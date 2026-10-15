import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const preview = {
  publicationName: 'Joint piece',
  inviterName: 'Ada Lovelace',
  email: 'bob@example.com',
}
const previewOk = http.post('*/api/invitations/preview', () => HttpResponse.json(preview))
const noPublications = http.get('*/api/publications', () => HttpResponse.json([]))

describe('decline-invitation page', () => {
  it('explains first and does nothing until Decline is pressed', async () => {
    let sent: unknown
    server.use(
      signedInAs(null),
      previewOk,
      http.post('*/api/invitations/decline', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/decline-invite?token=abc')
    await screen.findByText(/They won't be told that you declined/)
    expect(sent).toBeUndefined()
    expect(screen.getByLabelText('Just decline this invitation')).toBeChecked()

    await fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Declined')
    expect(sent).toEqual({ token: 'abc', block: 'none' })
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('can also stop invitations from that person', async () => {
    let sent: unknown
    server.use(
      signedInAs(null),
      previewOk,
      http.post('*/api/invitations/decline', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/decline-invite?token=abc')
    await fireEvent.click(await screen.findByLabelText('Also stop invitations from Ada Lovelace'))
    await fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(await screen.findByRole('status')).toHaveTextContent('from this person again')
    expect(sent).toEqual({ token: 'abc', block: 'sender' })
  })

  it('can stop invitations from everyone, naming the address', async () => {
    let sent: unknown
    server.use(
      signedInAs(null),
      previewOk,
      http.post('*/api/invitations/decline', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/decline-invite?token=abc')
    await fireEvent.click(
      await screen.findByLabelText('Stop invitations from everyone, to bob@example.com'),
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    expect(await screen.findByRole('status')).toHaveTextContent('anyone at this address')
    expect(sent).toEqual({ token: 'abc', block: 'all' })
  })

  it('says so when the invitation is no longer open', async () => {
    server.use(
      signedInAs(null),
      http.post('*/api/invitations/preview', () =>
        HttpResponse.json({ error: 'This invitation is invalid or has expired' }, { status: 400 }),
      ),
    )
    await renderAt('/decline-invite?token=old')
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer open')
    expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull()
  })

  it('shows a failure to decline and lets them try again', async () => {
    server.use(
      signedInAs(null),
      previewOk,
      http.post('*/api/invitations/decline', () =>
        HttpResponse.json({ error: 'Something went wrong' }, { status: 500 }),
      ),
    )
    await renderAt('/decline-invite?token=abc')
    await fireEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('button', { name: 'Decline' })).toBeEnabled()
  })

  it('is reachable from the invitation page', async () => {
    server.use(signedInAs(null), previewOk)
    await renderAt('/accept-invite?token=abc')
    const link = await screen.findByRole('link', { name: 'Decline, or stop invitations' })
    expect(link).toHaveAttribute('href', expect.stringContaining('/decline-invite?token=abc'))
  })

  it('flags a link with no token', async () => {
    server.use(signedInAs(null))
    await renderAt('/decline-invite')
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer open')
  })
})

describe('"Who can invite you" on the account page', () => {
  const section = async () =>
    (await screen.findByRole('heading', { name: 'Who can invite you' })).closest('section')!
  const base = [noPublications, llmSettings(false)]

  it('lists blocked people and unblocks one', async () => {
    let blocks = { all: false, senders: [{ id: 's1', name: 'Ada Lovelace' }] }
    server.use(
      signedInAs(testUser),
      ...base,
      http.get('*/api/invitations/blocks', () => HttpResponse.json(blocks)),
      http.delete('*/api/invitations/blocks/senders/s1', () => {
        blocks = { all: false, senders: [] }
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt('/account')
    const s = within(await section())
    await fireEvent.click(await s.findByRole('button', { name: 'Unblock Ada Lovelace' }))
    expect(await s.findByText(/You haven't blocked anyone/)).toBeInTheDocument()
  })

  it('turns blocking everyone on', async () => {
    let sent: unknown
    let blocks = { all: false, senders: [] as { id: string; name: string }[] }
    server.use(
      signedInAs(testUser),
      ...base,
      http.get('*/api/invitations/blocks', () => HttpResponse.json(blocks)),
      http.put('*/api/invitations/blocks/all', async ({ request }) => {
        sent = await request.json()
        blocks = { ...blocks, all: (sent as { blocked: boolean }).blocked }
        return HttpResponse.json({ ok: true })
      }),
    )
    await renderAt('/account')
    const box = await within(await section()).findByLabelText(
      /Don't accept invitations from anyone/,
    )
    expect(box).not.toBeChecked()
    await fireEvent.click(box)
    await waitFor(() => expect(sent).toEqual({ blocked: true }))
    await waitFor(() => expect(box).toBeChecked())
  })

  it('asks unconfirmed accounts to confirm first', async () => {
    server.use(signedInAs({ ...testUser, emailVerified: false }), ...base)
    await renderAt('/account')
    expect(within(await section()).getByText(/Confirm your email address/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Don't accept invitations/)).toBeNull()
  })

  it('shows an error if the settings cannot be loaded', async () => {
    server.use(
      signedInAs(testUser),
      ...base,
      http.get('*/api/invitations/blocks', () =>
        HttpResponse.json({ error: 'Something went wrong' }, { status: 500 }),
      ),
    )
    await renderAt('/account')
    expect(await within(await section()).findByRole('alert')).toHaveTextContent(
      'Something went wrong',
    )
  })
})
