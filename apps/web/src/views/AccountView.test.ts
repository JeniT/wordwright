import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { delay, http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const profile = {
  id: 'p1',
  name: "Ada's writing",
  siteUrl: null,
  imageUrl: null,
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
    await fireEvent.update(
      screen.getByLabelText('Password', { selector: 'input' }),
      'my password 123',
    )
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
    expect(screen.queryByLabelText('Password', { selector: 'input' })).toBeNull()
    expect(screen.getByText(/Linked sign-in: google/)).toBeInTheDocument()
  })

  it('shows the handle that profile addresses start with, and links to the profiles', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
    )
    await renderAt('/account')
    const section = (await screen.findByRole('heading', { name: 'Profiles' })).closest('section')!
    expect(section).toHaveTextContent('adalovelace')
    expect(within(section).getByRole('link', { name: 'your profiles' })).toHaveAttribute(
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
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
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
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
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
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
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
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
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

    await fireEvent.click(screen.getByRole('button', { name: 'Remove key' }))
    await screen.findByText('No API key yet.')
  })
})
