import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const here = {
  id: 's-this',
  deviceLabel: 'Safari on macOS',
  lastUsedAt: '2026-10-16T09:30:00.000Z',
  current: true,
}
const phone = {
  id: 's-phone',
  deviceLabel: 'Firefox on Linux',
  lastUsedAt: '2026-10-15T18:00:00.000Z',
  current: false,
}
const old = {
  id: 's-old',
  deviceLabel: 'Unknown device',
  lastUsedAt: '2026-09-01T08:00:00.000Z',
  current: false,
}

/** The account page, with the server's list of devices in `state.devices` (the tests change it as the server would). */
const open = async (state: { devices: unknown[] } = { devices: [here] }) => {
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([])),
    http.get('*/api/account/sessions', () => HttpResponse.json(state.devices)),
  )
  await renderAt('/account/security')
  return screen.findByRole('region', { name: "Where you're signed in" })
}

describe("Where you're signed in", () => {
  it('says it is loading, then lists each device, marking this one with no button', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/account/sessions', async () => {
        await delay(50)
        return HttpResponse.json([here, phone])
      }),
    )
    await renderAt('/account/security')
    const section = await screen.findByRole('region', { name: "Where you're signed in" })
    expect(within(section).getByText('Loading…')).toBeInTheDocument()
    expect(await within(section).findByText('Firefox on Linux')).toBeInTheDocument()
    const items = within(section).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Safari on macOS')
    expect(items[0]).toHaveTextContent('This device')
    expect(within(items[0]!).queryByRole('button')).toBeNull()
    expect(items[1]).toHaveTextContent(/Last used/)
    expect(within(section).getByText(/Changing or resetting your password/)).toBeInTheDocument()
  })

  it('says only this device is signed in, with nothing to sign out', async () => {
    const section = await open()
    expect(await within(section).findByText('Only this device is signed in')).toBeInTheDocument()
    expect(within(section).queryByRole('button', { name: /Sign out/ })).toBeNull()
  })

  it('says what to do when it cannot load, and tries again', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
      http.get('*/api/account/sessions', () => new HttpResponse(null, { status: 500 })),
    )
    await renderAt('/account/security')
    const section = await screen.findByRole('region', { name: "Where you're signed in" })
    const alert = await within(section).findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't load where you're signed in/)
    expect(alert).toHaveTextContent(/try again/i)
    server.use(http.get('*/api/account/sessions', () => HttpResponse.json([here, phone])))
    await fireEvent.click(within(section).getByRole('button', { name: 'Try again' }))
    expect(await within(section).findByText('Firefox on Linux')).toBeInTheDocument()
  })

  it('signs out one device at once, and says so', async () => {
    const state = { devices: [here, phone, old] }
    let asked = ''
    server.use(
      http.delete('*/api/account/sessions/:id', ({ params }) => {
        asked = String(params.id)
        state.devices = state.devices.filter((d) => (d as { id: string }).id !== params.id)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const section = await open(state)
    await fireEvent.click(
      await within(section).findByRole('button', { name: /^Sign out Firefox on Linux/ }),
    )
    await waitFor(() => expect(within(section).queryByText('Firefox on Linux')).toBeNull())
    expect(asked).toBe('s-phone')
    expect(await within(section).findByRole('status')).toHaveTextContent(
      'Signed out of Firefox on Linux',
    )
    expect(within(section).getByText('Unknown device')).toBeInTheDocument()
  })

  it('asks before signing out everywhere else, then says how many it ended', async () => {
    const state = { devices: [here, phone, old] }
    let calls = 0
    server.use(
      http.delete('*/api/account/sessions', () => {
        calls++
        state.devices = [here]
        return HttpResponse.json({ count: 2 })
      }),
    )
    const section = await open(state)
    await fireEvent.click(
      await within(section).findByRole('button', { name: 'Sign out everywhere else' }),
    )
    const dialog = await screen.findByRole('dialog', { name: 'Sign out everywhere else?' })
    expect(calls).toBe(0) // nothing happens until the person confirms
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls).toBe(0)

    await fireEvent.click(within(section).getByRole('button', { name: 'Sign out everywhere else' }))
    const again = await screen.findByRole('dialog')
    await fireEvent.click(within(again).getByRole('button', { name: 'Sign out everywhere else' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await within(section).findByText('Signed out of 2 other devices')).toBeInTheDocument()
    expect(await within(section).findByText('Only this device is signed in')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('says what went wrong when signing out fails, and keeps the list', async () => {
    server.use(
      http.delete('*/api/account/sessions/:id', () =>
        HttpResponse.json({ error: 'Not found' }, { status: 404 }),
      ),
    )
    const section = await open({ devices: [here, phone] })
    await fireEvent.click(await within(section).findByRole('button', { name: /^Sign out Firefox/ }))
    expect(await within(section).findByRole('alert')).toHaveTextContent('Not found')
    expect(within(section).getByText('Firefox on Linux')).toBeInTheDocument()
  })

  it('can be used from the keyboard: each button has a name of its own', async () => {
    const section = await open({ devices: [here, phone, old] })
    const buttons = await within(section).findAllByRole('button', { name: /^Sign out .*last used/ })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      expect.stringMatching(/^Sign out Firefox on Linux, last used /),
      expect.stringMatching(/^Sign out Unknown device, last used /),
    ])
    for (const b of buttons) expect(b.tagName).toBe('BUTTON')
  })
})
