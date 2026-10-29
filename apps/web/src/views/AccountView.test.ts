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
  members: [
    { userId: 'u1', name: 'Ada Lovelace', handle: 'ada', email: 'ada@example.com', role: 'owner' },
  ],
}

describe('AccountView', () => {
  it('has the Appearance choice, which is not in the menu', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt('/account/display')
    const group = await screen.findByRole('radiogroup', {
      name: 'Appearance',
    })
    expect(
      within(screen.getByRole('main')).getByRole('radiogroup', {
        name: 'Appearance',
      }),
    ).toBe(group)
    expect(screen.getAllByRole('radiogroup', { name: 'Appearance' })).toHaveLength(1)
  })

  it('no longer has a Tutorial mode section: the switch is in the menu (#314)', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt('/account/display')
    await screen.findByRole('heading', { level: 1, name: 'Display' })
    expect(screen.queryByRole('region', { name: 'Tutorial mode' })).toBeNull()
  })

  it('keeps the long privacy advice off the page, with links to it and to the key guide', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt('/account/ai')
    expect(await screen.findByRole('heading', { level: 2, name: 'Your AI key' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'Protect what you write' })).toBeNull()
    expect(screen.getByText(/so Anthropic bills you, not us/)).toBeVisible()
    expect(screen.getByRole('link', { name: /Privacy advice/ })).toHaveAttribute(
      'href',
      '/help/privacy',
    )
    expect(screen.getByRole('link', { name: /How to get an API key/ })).toHaveAttribute(
      'href',
      '/help/api-key',
    )
    // The AI mark is explained on the help page, reached from the info icon; not written out here.
    expect(screen.getByRole('link', { name: 'Your AI settings' })).toHaveAttribute(
      'href',
      '/help/ai-settings',
    )
    expect(screen.queryByText(/turns into a spinner/)).toBeNull()
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim())
    expect(order).toEqual(['Your AI key', 'Critique limit'])
  })

  it('requires the password before deleting, then signs out', async () => {
    let body: unknown
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', async ({ request }) => {
        body = await request.json()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/account/delete')
    await fireEvent.update(
      await screen.findByLabelText('Password', { selector: 'input' }),
      'my password 123',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })
    expect(body).toBeUndefined() // nothing is deleted until the person confirms
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('register'))
    expect(router.currentRoute.value.query).toEqual({ deleted: '1' })
    expect(body).toEqual({
      password: 'my password 123',
      keepName: true,
    })
  })

  it('names what the deletion removes and what happens to their name', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt('/account/delete')
    await fireEvent.update(
      await screen.findByLabelText('Password', { selector: 'input' }),
      'my password 123',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    let dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })
    expect(within(dialog).getByText(/every publication only you belong to/)).toBeTruthy()
    expect(within(dialog).getByText(/your own ideas, notes and drafts/)).toBeTruthy()
    expect(within(dialog).getByText(/your saved AI key/)).toBeTruthy()
    expect(
      within(dialog).getByText(/Your name stays on your notes and comments there/),
    ).toBeTruthy()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await fireEvent.click(screen.getByRole('radio', { name: /a former member/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    dialog = await screen.findByRole('dialog', { name: 'Delete your account?' })
    expect(within(dialog).getByText(/show as “a former member”/)).toBeTruthy()
  })

  it('asks whether to keep their name on their notes, and sends the answer', async () => {
    let body: { keepName?: boolean } = {}
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', async ({ request }) => {
        body = (await request.json()) as typeof body
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/account/delete')
    const keep = await screen.findByRole('radio', { name: /Keep my display name on my notes/ })
    expect(keep).toBeChecked() // the default
    await fireEvent.click(screen.getByRole('radio', { name: /a former member/ }))
    await fireEvent.update(
      screen.getByLabelText('Password', { selector: 'input' }),
      'my password 123',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(router.currentRoute.value.name).toBe('register'))
    expect(body.keepName).toBe(false)
  })

  it('keeps the account if the person cancels the confirmation', async () => {
    let deleted = false
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { router } = await renderAt('/account/delete')
    await fireEvent.update(
      await screen.findByLabelText('Password', { selector: 'input' }),
      'my password 123',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    await fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(deleted).toBe(false)
    expect(router.currentRoute.value.name).toBe('account-delete')
  })

  it('closes the confirmation and shows the problem if the deletion is refused', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.delete('*/api/account', () =>
        HttpResponse.json({ error: 'That password is not right.' }, { status: 400 }),
      ),
    )
    await renderAt('/account/delete')
    await fireEvent.update(await screen.findByLabelText('Password', { selector: 'input' }), 'wrong')
    await fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
    await fireEvent.click(
      await within(await screen.findByRole('dialog')).findByRole('button', {
        name: 'Delete account',
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(/password/)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('points an account with no password to adding one, and does not let it delete', async () => {
    server.use(
      signedInAs({ ...testUser, hasPassword: false, linkedProviders: ['google'] }),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt('/account/delete')
    expect(
      await screen.findByText(/To delete your account, first add a password/),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Password', { selector: 'input' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete account' })).toBeNull()
  })

  it('sends /account to the details page, with no header block or Publications section', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    const { router } = await renderAt('/account')
    expect(await screen.findByRole('heading', { level: 1, name: 'Your details' })).toBeVisible()
    expect(router.currentRoute.value.path).toBe('/account/details')
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.trim())).toEqual(
      expect.arrayContaining(['Name', 'Username']),
    )
    expect(screen.queryByRole('heading', { name: 'Publications' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Your account' })).toBeNull()
  })

  it.each([
    ['details', 'Your details'],
    ['ai', 'Your AI'],
    ['display', 'Display'],
    ['security', 'Sign-in and security'],
    ['download', 'Download your writing'],
    ['delete', 'Delete account'],
  ])('/account/%s is titled “%s” and lists all six pages in the menu', async (page, title) => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
    )
    await renderAt(`/account/${page}`)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible()
    const menu = within(screen.getByRole('navigation', { name: 'Account settings' }))
    expect(menu.getAllByRole('link').map((a) => a.textContent)).toEqual([
      'Your details',
      'Your AI',
      'Display',
      'Sign-in and security',
      'Download your writing',
      'Delete account',
    ])
    expect(menu.getByRole('link', { current: 'page' })).toHaveTextContent(title)
    expect(menu.getAllByRole('link', { current: 'page' })).toHaveLength(1)
    const banner = within(screen.getByRole('banner'))
    expect(banner.getByRole('link', { name: '← All publications' })).toHaveAttribute('href', '/')
    expect(banner.getByRole('link', { name: 'Account settings', current: 'page' })).toHaveAttribute(
      'href',
      '/account',
    )
    expect(screen.queryByText('01')).toBeNull() // plain links, no step numbers
  })
})

describe('AccountView: AI assistant key', () => {
  const noKey = { provider: 'anthropic', model: 'claude-sonnet-5-5', hasKey: false, keyHint: null }

  it('saves the key, then shows only a hint; the model is chosen once there is a key', async () => {
    let sent: unknown
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', () => HttpResponse.json(noKey)),
      http.put('*/api/llm', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...noKey, hasKey: true, keyHint: 'sk-ant-api03-AbC...7890' })
      }),
    )
    await renderAt('/account/ai')
    const save = (await screen.findAllByRole('button', { name: 'Save key' }))[0]!
    expect(save).toBeDisabled() // nothing to save yet
    expect(screen.getByLabelText('Anthropic API key')).toHaveAttribute('placeholder', 'sk-ant-...')
    expect(screen.queryByLabelText('Model')).toBeNull() // the provider lists models for a key
    expect(screen.getByText('Save a key to choose a model.')).toBeInTheDocument()
    const field = screen.getByLabelText('Anthropic API key')
    expect(field).toHaveAttribute('type', 'password')
    await fireEvent.update(field, '  sk-ant-secret-1234567890  ')
    await waitFor(() => expect(save).toBeEnabled()) // typed, and the saved settings have loaded
    await fireEvent.click(save)

    // The saved key now shows, elided, in the empty field, with the way to keep it.
    await screen.findByPlaceholderText('sk-ant-api03-AbC...7890')
    expect(screen.getByText('Leave as is to keep the current one')).toBeInTheDocument()
    expect(sent).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-secret-1234567890' })
    expect(screen.queryByDisplayValue(/sk-ant/)).toBeNull() // the field is cleared
    expect(await screen.findByLabelText('Model')).toBeInTheDocument()
  })

  it('cannot be submitted before the saved settings have loaded', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', async () => {
        await delay(150)
        return HttpResponse.json(noKey)
      }),
      http.put('*/api/llm', async ({ request }) => {
        await request.json()
        return HttpResponse.json({ ...noKey, hasKey: true, keyHint: 'sk-ant-api03-AbC...7890' })
      }),
    )
    await renderAt('/account/ai')
    const save = (await screen.findAllByRole('button', { name: 'Save key' }))[0]!
    expect(save).toBeDisabled() // still loading, and nothing typed
    await fireEvent.update(screen.getByLabelText('Anthropic API key'), 'sk-ant-secret-1234567890')
    await waitFor(() => expect(save).toBeEnabled()) // typed, and the saved settings have loaded
    await fireEvent.click(save)
    await screen.findByPlaceholderText('sk-ant-api03-AbC...7890')
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
    await renderAt('/account/ai')
    const save = (await screen.findAllByRole('button', { name: 'Save key' }))[0]!
    await fireEvent.update(screen.getByLabelText('Anthropic API key'), 'sk-ant-wrong-1234567890')
    await waitFor(() => expect(save).toBeEnabled()) // settings loaded
    await fireEvent.click(save)
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected/)
  })

  it('lets a user keep their key and just change the model, or remove the key', async () => {
    let sent: unknown
    let removed = false
    const saved = { ...noKey, hasKey: true, keyHint: 'sk-ant-api03-AbC...7890' }
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
    await renderAt('/account/ai')
    await screen.findByPlaceholderText('sk-ant-api03-AbC...7890')
    const model = await screen.findByLabelText('Model')
    // The provider's own names, not ours.
    expect(
      within(model)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Claude Sonnet 5.5', 'Claude Opus 5.5', 'Claude Haiku 5.5'])
    await fireEvent.update(model, 'claude-opus-5-5')
    await fireEvent.click(screen.getAllByRole('button', { name: 'Save key' })[0]!)
    await waitFor(() => expect(sent).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' }))

    const removeKey = screen.getByRole('button', { name: 'Remove key' })
    await fireEvent.click(removeKey) // no hold: it only asks to be pressed again
    await fireEvent.click(removeKey)
    await screen.findByPlaceholderText('sk-ant-...')
  })
})

describe('AccountView: the model', () => {
  const saved = {
    provider: 'anthropic',
    model: 'claude-opus-5-5',
    hasKey: true,
    keyHint: 'sk-ant-api03-AbC...7890',
  }

  it('shows the current model and a way to try again when the list will not load', async () => {
    let fail = true
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', () => HttpResponse.json(saved)),
      http.get('*/api/llm/models', () =>
        fail
          ? HttpResponse.json({ error: 'down' }, { status: 502 })
          : HttpResponse.json({ models: [{ id: 'claude-opus-5-5', label: 'Claude Opus 5.5' }] }),
      ),
    )
    await renderAt('/account/ai')
    expect(await screen.findByText(/Couldn.t load models/)).toBeInTheDocument()
    expect(screen.getByText('claude-opus-5-5')).toBeInTheDocument()
    fail = false
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByLabelText('Model')).toHaveValue('claude-opus-5-5')
  })

  it('says so when the saved model is no longer offered, and keeps it selected until another is chosen', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', () => HttpResponse.json({ ...saved, model: 'claude-retired-1' })),
    )
    await renderAt('/account/ai')
    const model = await screen.findByLabelText('Model')
    expect(model).toHaveValue('claude-retired-1')
    expect(screen.getByText(/no longer offered/)).toBeInTheDocument()
  })
})

describe('AccountView: replacing a key while the saved model is retired', () => {
  it('sends only the key, so the server keeps or replaces the model rather than refusing it', async () => {
    let sent: unknown
    const retired = {
      provider: 'anthropic',
      model: 'claude-retired-1',
      hasKey: true,
      keyHint: 'sk-ant-api03-AbC...7890',
    }
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      http.get('*/api/llm', () => HttpResponse.json(retired)),
      http.put('*/api/llm', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json({ ...retired, model: 'claude-sonnet-5-5' })
      }),
    )
    await renderAt('/account/ai')
    await screen.findByText(/no longer offered/)
    await fireEvent.update(
      screen.getByLabelText('Anthropic API key'),
      'sk-ant-replacement-1234567890',
    )
    await fireEvent.click(screen.getAllByRole('button', { name: 'Save key' })[0]!)
    await waitFor(() =>
      expect(sent).toEqual({ provider: 'anthropic', apiKey: 'sk-ant-replacement-1234567890' }),
    )
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
    await renderAt('/account/ai')
    const select = await screen.findByLabelText('Critiques per draft')
    await waitFor(() => expect(select).toHaveValue('2'))
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent?.trim()),
    ).toEqual(['1', '2', '3 (suggested)', '4', '5'])
    // The same setting limits the rounds in a Rephrase window (#161), and the page says so.
    expect(screen.getByRole('region', { name: 'Critique limit' })).toHaveTextContent(
      /rephrase parts of your drafts/,
    )
    await fireEvent.update(select, '5')
    await fireEvent.click(
      within(screen.getByRole('region', { name: 'Critique limit' })).getByRole('button', {
        name: 'Save limit',
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
    await renderAt('/account/ai')
    const select = await screen.findByLabelText('Critiques per draft')
    expect(select).toBeDisabled()
    arrive()
    await waitFor(() => expect(select).toBeEnabled())
    expect(select).toHaveValue('3')
    await fireEvent.update(select, '1')
    await fireEvent.click(
      within(screen.getByRole('region', { name: 'Critique limit' })).getByRole('button', {
        name: 'Save limit',
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
    await renderAt('/account/ai')
    const save = within(await screen.findByRole('region', { name: 'Critique limit' })).getByRole(
      'button',
      { name: 'Save limit' },
    )
    expect(save).toBeDisabled() // nothing to save until the number is changed
    await fireEvent.update(screen.getByLabelText('Critiques per draft'), '2')
    await waitFor(() => expect(save).toBeEnabled())
    await fireEvent.click(save)
    await screen.findByText('Choose a number from 1 to 5')
  })
})
