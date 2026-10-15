import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const DEFAULT = 'You are a writing coach.\n\nBe curious.'
const url = '*/api/account/brainstorm-prompt'

const signedIn = [signedInAs(testUser), http.get('*/api/publications', () => HttpResponse.json([]))]

/** The account page has other Save buttons and statuses, so look only inside this section. */
async function renderSection() {
  await renderAt('/account')
  const heading = await screen.findByRole('heading', { name: 'Brainstorming prompt' })
  return within(heading.closest('section')!)
}

describe('brainstorming prompt (account page)', () => {
  it('shows the default prompt, and says it is the default', async () => {
    server.use(
      ...signedIn,
      http.get(url, () => HttpResponse.json({ prompt: DEFAULT, isDefault: true })),
    )
    const ui = await renderSection()
    const box = await ui.findByLabelText('Prompt')
    expect(box).toHaveValue(DEFAULT)
    expect(ui.getByText('You are using the default prompt.')).toBeInTheDocument()
    expect(ui.getByText(`${DEFAULT.length} of 8,000 characters.`)).toBeInTheDocument()
    expect(box).toHaveAccessibleDescription(/of 8,000 characters/)
    expect(ui.getByText(/never writes your drafts/)).toBeInTheDocument()
    // Nothing to save or reset yet.
    expect(ui.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(ui.getByRole('button', { name: 'Reset to default' })).toBeDisabled()
  })

  it('shows a loading state, then an error that says what to do', async () => {
    server.use(
      ...signedIn,
      http.get(url, async () => {
        await delay(50)
        return HttpResponse.json({ error: 'boom' }, { status: 500 })
      }),
    )
    const ui = await renderSection()
    expect(await ui.findByText('Loading…')).toBeInTheDocument()
    expect(await ui.findByText(/couldn't load your brainstorming prompt/)).toBeInTheDocument()
    expect(ui.queryByLabelText('Prompt')).toBeNull()
  })

  it('saves an edited prompt and then calls it the person’s own', async () => {
    let sent: unknown
    server.use(
      ...signedIn,
      http.get(url, () => HttpResponse.json({ prompt: DEFAULT, isDefault: true })),
      http.put(url, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ prompt: 'Be kind.', isDefault: false })
      }),
    )
    const ui = await renderSection()
    await fireEvent.update(await ui.findByLabelText('Prompt'), '  Be kind.  ')
    await fireEvent.click(ui.getByRole('button', { name: 'Save' }))

    await ui.findByText('You are using your own version of the prompt.')
    expect(sent).toEqual({ prompt: '  Be kind.  ' }) // the server trims it
    expect(ui.getByLabelText('Prompt')).toHaveValue('Be kind.')
    expect(ui.getAllByRole('status').some((s) => s.textContent === 'Saved.')).toBe(true)
    // The button says "Saving…" until the request has fully settled.
    await waitFor(() => expect(ui.getByRole('button', { name: 'Save' })).toBeDisabled())
    expect(ui.getByRole('button', { name: 'Reset to default' })).toBeEnabled()
  })

  it('shows the server’s reason when a save is refused, and keeps the text', async () => {
    server.use(
      ...signedIn,
      http.get(url, () => HttpResponse.json({ prompt: DEFAULT, isDefault: true })),
      http.put(url, () =>
        HttpResponse.json(
          { error: 'Use 8,000 characters or fewer in the prompt' },
          { status: 400 },
        ),
      ),
    )
    const ui = await renderSection()
    await fireEvent.update(await ui.findByLabelText('Prompt'), 'Something')
    await fireEvent.click(ui.getByRole('button', { name: 'Save' }))
    expect(await ui.findByRole('alert')).toHaveTextContent('8,000 characters or fewer')
    expect(ui.getByLabelText('Prompt')).toHaveValue('Something')
  })

  describe('resetting', () => {
    const own = http.get(url, () => HttpResponse.json({ prompt: 'My own.', isDefault: false }))

    it('asks first, because the person’s own version would be lost', async () => {
      let reset = false
      server.use(
        ...signedIn,
        own,
        http.delete(url, () => {
          reset = true
          return HttpResponse.json({ prompt: DEFAULT, isDefault: true })
        }),
      )
      const ui = await renderSection()
      await ui.findByDisplayValue('My own.')
      await fireEvent.click(ui.getByRole('button', { name: 'Reset to default' }))
      const dialog = screen.getByRole('dialog', { name: 'Go back to the default prompt?' })
      await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(reset).toBe(false)
      expect(ui.getByLabelText('Prompt')).toHaveValue('My own.')

      await fireEvent.click(ui.getByRole('button', { name: 'Reset to default' }))
      await fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, reset it' }),
      )
      await waitFor(() => expect(ui.getByLabelText('Prompt')).toHaveValue(DEFAULT))
      expect(ui.getByText('You are using the default prompt.')).toBeInTheDocument()
      expect(reset).toBe(true)
      expect(
        ui.getAllByRole('status').some((s) => s.textContent === 'Back to the default prompt.'),
      ).toBe(true)
    })

    it('just drops unsaved edits, without asking or calling the server, when the default is in use', async () => {
      let called = false
      server.use(
        ...signedIn,
        http.get(url, () => HttpResponse.json({ prompt: DEFAULT, isDefault: true })),
        http.delete(url, () => {
          called = true
          return HttpResponse.json({ prompt: DEFAULT, isDefault: true })
        }),
      )
      const ui = await renderSection()
      await fireEvent.update(await ui.findByLabelText('Prompt'), 'Half-typed')
      await fireEvent.click(ui.getByRole('button', { name: 'Reset to default' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(ui.getByLabelText('Prompt')).toHaveValue(DEFAULT)
      expect(called).toBe(false)
    })

    it('says so if the reset fails', async () => {
      server.use(
        ...signedIn,
        own,
        http.delete(url, () => HttpResponse.json({ error: 'Nope' }, { status: 500 })),
      )
      const ui = await renderSection()
      await ui.findByDisplayValue('My own.')
      await fireEvent.click(ui.getByRole('button', { name: 'Reset to default' }))
      await fireEvent.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Yes, reset it' }),
      )
      expect(await ui.findByRole('alert')).toHaveTextContent('Nope')
      expect(ui.getByLabelText('Prompt')).toHaveValue('My own.')
    })
  })
})
