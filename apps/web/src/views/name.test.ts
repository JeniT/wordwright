import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const open = () => {
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([])),
    llmSettings(true),
  )
  return renderAt('/account')
}

describe('your name on the account page', () => {
  it('starts with the current name, and offers no change until it is edited', async () => {
    await open()
    const field = await screen.findByLabelText('What should we call you?')
    expect(field).toHaveValue('Ada Lovelace')
    expect(screen.getByRole('button', { name: 'Change name' })).toBeDisabled()
    await fireEvent.update(field, '   ')
    expect(screen.getByRole('button', { name: 'Change name' })).toBeDisabled()
    await fireEvent.update(field, 'Ada Lovelace') // the same name is not a change
    expect(screen.getByRole('button', { name: 'Change name' })).toBeDisabled()
  })

  it('saves the new name and shows it everywhere the page does', async () => {
    let sent: unknown
    server.use(
      http.put('*/api/account/name', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...testUser, name: 'Ada King' })
      }),
    )
    await open()
    await fireEvent.update(await screen.findByLabelText('What should we call you?'), 'Ada King')
    await fireEvent.click(screen.getByRole('button', { name: 'Change name' }))
    await waitFor(() => expect(sent).toEqual({ name: 'Ada King' }))
    expect(await screen.findByText(/People now see/)).toHaveTextContent('Ada King')
    // The account heading and the name in the menu foot follow the change.
    expect(screen.getByText(/Ada King · ada@example.com/)).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByText('Ada King')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change name' })).toBeDisabled()
  })

  it("shows the server's explanation and keeps what was typed", async () => {
    server.use(
      http.put('*/api/account/name', () =>
        HttpResponse.json({ error: 'Use 100 characters or fewer for the name' }, { status: 400 }),
      ),
    )
    await open()
    const field = await screen.findByLabelText('What should we call you?')
    await fireEvent.update(field, 'A different name')
    await fireEvent.click(screen.getByRole('button', { name: 'Change name' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('100 characters or fewer')
    expect(field).toHaveValue('A different name')
  })

  it('says it is saving, and cannot be pressed twice', async () => {
    let calls = 0
    server.use(
      http.put('*/api/account/name', async () => {
        calls++
        await new Promise((r) => setTimeout(r, 100))
        return HttpResponse.json({ ...testUser, name: 'Slow Ada' })
      }),
    )
    await open()
    await fireEvent.update(await screen.findByLabelText('What should we call you?'), 'Slow Ada')
    const button = screen.getByRole('button', { name: 'Change name' })
    await fireEvent.click(button)
    expect(button).toBeDisabled()
    await fireEvent.click(button)
    await screen.findByText(/People now see/)
    expect(calls).toBe(1)
  })
})
