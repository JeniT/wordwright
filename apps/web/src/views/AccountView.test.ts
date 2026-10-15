import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const publication = {
  id: 'p1',
  name: "Ada's writing",
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [{ userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'owner' }],
}

describe('AccountView', () => {
  it('requires the typed email (and password) before deleting, then signs out', async () => {
    let body: unknown
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/account')
    await fireEvent.update(await screen.findByLabelText(/Type your email/), 'ada@example.com')
    await fireEvent.update(
      screen.getByLabelText('Password', { selector: 'input' }),
      'my password 123',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })
    expect(body).toBeUndefined() // nothing is deleted until the person confirms
    await fireEvent.click(within(dialog).getByRole('button', { name: /Yes, delete my account/ }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('register'))
    expect(body).toEqual({
      confirmEmail: 'ada@example.com',
      password: 'my password 123',
      keepName: true,
    })
  })

  it('asks whether to keep their name on their notes, and sends the answer', async () => {
    let body: { keepName?: boolean } = {}
    server.use(
      signedInAs({ ...testUser, hasPassword: false }),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', async ({ request }) => {
        body = (await request.json()) as typeof body
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/account')
    const keep = await screen.findByRole('radio', { name: /Keep my name on my notes/ })
    expect(keep).toBeChecked() // the default
    await fireEvent.click(screen.getByRole('radio', { name: /a former member/ }))
    await fireEvent.update(screen.getByLabelText(/Type your email/), 'ada@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    const dialog = await screen.findByRole('dialog')
    await fireEvent.click(within(dialog).getByRole('button', { name: /Yes, delete my account/ }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('register'))
    expect(body.keepName).toBe(false)
  })

  it('keeps the account if the person cancels the confirmation', async () => {
    let deleted = false
    server.use(
      signedInAs({ ...testUser, hasPassword: false }),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/account')
    await fireEvent.update(await screen.findByLabelText(/Type your email/), 'ada@example.com')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    await fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deleted).toBe(false)
    expect(router.currentRoute.value.name).toBe('account')
  })

  it('closes the confirmation and shows the problem if the deletion is refused', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', () =>
        HttpResponse.json({ error: 'That password is not right.' }, { status: 400 }),
      ),
    )
    await renderAt('/account')
    await fireEvent.update(await screen.findByLabelText(/Type your email/), 'ada@example.com')
    await fireEvent.update(screen.getByLabelText('Password', { selector: 'input' }), 'wrong')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    await fireEvent.click(await screen.findByRole('button', { name: /Yes, delete my account/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/password/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not ask for a password if the account has none', async () => {
    server.use(
      signedInAs({ ...testUser, hasPassword: false, linkedProviders: ['google'] }),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt('/account')
    await screen.findByLabelText(/Type your email/)
    expect(screen.queryByLabelText('Password', { selector: 'input' })).toBeNull()
    expect(screen.getByText(/Linked sign-in: google/)).toBeInTheDocument()
  })

  it('shows the handle that publication addresses start with, and links to the publications', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt('/account')
    const section = (await screen.findByRole('heading', { name: 'Publications' })).closest(
      'section',
    )!
    expect(section).toHaveTextContent('adalovelace')
    expect(within(section).getByRole('link', { name: 'your publications' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})

describe('AccountView: AI assistant key', () => {
  const noKey = { provider: 'anthropic', model: 'claude-sonnet-5-5', hasKey: false, keyHint: null }

  it('saves the key and model, then shows only a hint', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', () => HttpResponse.json(noKey)),
      http.put('*/api/llm', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({
          ...noKey,
          model: 'claude-haiku-5-5',
          hasKey: true,
          keyHint: '…7890',
        })
      }),
    )
    await renderAt('/account')
    await screen.findByText('No API key yet.')
    await fireEvent.update(screen.getByLabelText('Model'), 'claude-haiku-5-5')
    const field = screen.getByLabelText('Anthropic API key')
    expect(field).toHaveAttribute('type', 'password')
    await fireEvent.update(field, '  sk-ant-secret-1234567890  ')
    await fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)

    await screen.findByText(/Anthropic key saved \(…7890\)/)
    expect(sent).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
      apiKey: 'sk-ant-secret-1234567890',
    })
    expect(screen.queryByDisplayValue(/sk-ant/)).toBeNull() // the field is cleared
  })

  it('cannot be submitted before the saved settings have loaded (no empty model)', async () => {
    let sent: { model?: string } | undefined
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', async () => {
        await delay(150)
        return HttpResponse.json(noKey)
      }),
      http.put('*/api/llm', async ({ request }) => {
        sent = (await request.json()) as { model?: string }
        return HttpResponse.json({ ...noKey, hasKey: true, keyHint: '…7890' })
      }),
    )
    await renderAt('/account')
    const save = (await screen.findAllByRole('button', { name: 'Save' }))[0]!
    expect(save).toBeDisabled() // still loading
    await screen.findByText('No API key yet.')
    await fireEvent.update(screen.getByLabelText('Anthropic API key'), 'sk-ant-secret-1234567890')
    expect(save).toBeEnabled()
    await fireEvent.click(save)
    await screen.findByText(/Anthropic key saved/)
    expect(sent?.model).toBe('claude-sonnet-5-5')
  })

  it('shows why a key was refused', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', () => HttpResponse.json(noKey)),
      http.put('*/api/llm', () =>
        HttpResponse.json(
          { error: 'That API key was rejected by the provider. Please check it.' },
          { status: 400 },
        ),
      ),
    )
    await renderAt('/account')
    await screen.findByText('No API key yet.') // settings loaded, so Save is enabled
    await fireEvent.update(screen.getByLabelText('Anthropic API key'), 'sk-ant-wrong-1234567890')
    await fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected/)
  })

  it('lets a user keep their key and just change the model, or remove the key', async () => {
    let sent: unknown
    let removed = false
    const saved = { ...noKey, hasKey: true, keyHint: '…7890' }
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', () => HttpResponse.json(removed ? noKey : saved)),
      http.put('*/api/llm', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...saved, model: 'claude-opus-5-5' })
      }),
      http.delete('*/api/llm', () => {
        removed = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    await renderAt('/account')
    await screen.findByText(/Anthropic key saved/)
    await fireEvent.update(screen.getByLabelText('Model'), 'claude-opus-5-5')
    await fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[0]!)
    await waitFor(() => expect(sent).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' }))

    const removeKey = screen.getByRole('button', { name: 'Remove key' })
    await fireEvent.click(removeKey) // no hold: it only asks to be pressed again
    await fireEvent.click(removeKey)
    await screen.findByText('No API key yet.')
  })
})

describe('AccountView: critiques of a draft', () => {
  const mock = (saved: number[] = [], rounds = 3) =>
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/account/critique-settings', () => HttpResponse.json({ rounds })),
      http.put('*/api/account/critique-settings', async ({ request }) => {
        const body = (await request.json()) as { rounds: number }
        saved.push(body.rounds)
        return HttpResponse.json(body)
      }),
    )

  it('shows the current number, suggests three, and saves a change', async () => {
    const saved: number[] = []
    mock(saved, 2)
    await renderAt('/account')
    const select = await screen.findByLabelText('Critiques each draft gets')
    await waitFor(() => expect(select).toHaveValue('2'))
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['1', '2', '3 (suggested)', '4', '5'])
    // The same setting limits the rounds in a Rephrase window (#161), and the page says so.
    expect(screen.getByRole('region', { name: 'Critiques of a draft' })).toHaveTextContent(
      /limits Rephrase/,
    )
    await fireEvent.update(select, '5')
    await fireEvent.click(
      within(screen.getByRole('region', { name: 'Critiques of a draft' })).getByRole('button', {
        name: 'Save',
      }),
    )
    await screen.findByText('Saved')
    expect(saved).toEqual([5])
  })

  it('cannot be changed until the saved number has arrived, so it cannot be overwritten by it', async () => {
    let arrive!: () => void
    const held = new Promise<void>((resolve) => (arrive = resolve))
    const saved: number[] = []
    mock(saved, 3)
    server.use(
      http.get('*/api/account/critique-settings', async () => {
        await held
        return HttpResponse.json({ rounds: 3 })
      }),
    )
    await renderAt('/account')
    const select = await screen.findByLabelText('Critiques each draft gets')
    expect(select).toBeDisabled()
    arrive()
    await waitFor(() => expect(select).toBeEnabled())
    expect(select).toHaveValue('3')
    await fireEvent.update(select, '1')
    await fireEvent.click(
      within(screen.getByRole('region', { name: 'Critiques of a draft' })).getByRole('button', {
        name: 'Save',
      }),
    )
    await screen.findByText('Saved')
    expect(saved).toEqual([1])
  })

  it('says what went wrong when saving is refused', async () => {
    mock()
    server.use(
      http.put('*/api/account/critique-settings', () =>
        HttpResponse.json({ error: 'Choose a number from 1 to 5' }, { status: 400 }),
      ),
    )
    await renderAt('/account')
    const save = within(
      await screen.findByRole('region', { name: 'Critiques of a draft' }),
    ).getByRole('button', { name: 'Save' })
    await waitFor(() => expect(save).toBeEnabled()) // not until the saved number has arrived
    await fireEvent.click(save)
    await screen.findByText('Choose a number from 1 to 5')
  })
})
