import { fireEvent, screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const noProfiles = http.get('*/api/profiles', () => HttpResponse.json([]))

describe('landing page: connecting an AI key', () => {
  it('walks a new user through getting a key, with a field to paste it into', async () => {
    server.use(signedInAs(testUser), noProfiles, llmSettings(false))
    await renderAt('/')
    const heading = await screen.findByRole('heading', { name: 'First, connect your AI assistant' })
    const section = heading.closest('section')!

    const steps = within(section).getAllByRole('listitem')
    expect(steps).toHaveLength(5)
    expect(within(section).getByRole('link', { name: 'Anthropic Console' })).toHaveAttribute(
      'href',
      'https://console.anthropic.com/',
    )
    expect(within(section).getByRole('link', { name: 'API keys' })).toHaveAttribute(
      'href',
      'https://console.anthropic.com/settings/keys',
    )
    expect(within(section).getByLabelText('Anthropic API key')).toHaveAttribute('type', 'password')
    // The model choice can wait for the account page.
    expect(within(section).queryByLabelText('Model')).toBeNull()

    // A brand-new user is also pointed at their first profile.
    expect(screen.getByText(/Welcome, Ada Lovelace/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create your first profile' })).toHaveAttribute(
      'href',
      '/profiles/new',
    )
  })

  it('saves the key, then replaces the instructions with a confirmation', async () => {
    let sent: unknown
    let saved = false
    server.use(
      signedInAs(testUser),
      noProfiles,
      http.get('*/api/llm', () =>
        HttpResponse.json({
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          hasKey: saved,
          keyHint: saved ? '…7890' : null,
        }),
      ),
      http.put('*/api/llm', async ({ request }) => {
        sent = await request.json()
        saved = true
        return HttpResponse.json({
          provider: 'anthropic',
          model: 'claude-sonnet-5-5',
          hasKey: true,
          keyHint: '…7890',
        })
      }),
    )
    await renderAt('/')
    await fireEvent.update(
      await screen.findByLabelText('Anthropic API key'),
      ' sk-ant-secret-1234567890 ',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/key is saved/)
    expect(sent).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      apiKey: 'sk-ant-secret-1234567890',
    })
    expect(screen.queryByRole('heading', { name: 'First, connect your AI assistant' })).toBeNull()
  })

  it('shows why a key was refused, and keeps the instructions', async () => {
    server.use(
      signedInAs(testUser),
      noProfiles,
      llmSettings(false),
      http.put('*/api/llm', () =>
        HttpResponse.json({ error: 'That API key was rejected by the provider.' }, { status: 400 }),
      ),
    )
    await renderAt('/')
    await fireEvent.update(
      await screen.findByLabelText('Anthropic API key'),
      'sk-ant-wrong-1234567890',
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected/)
    expect(screen.getByRole('heading', { name: 'First, connect your AI assistant' })).toBeVisible()
  })

  it('also reminds people who already have profiles but no key', async () => {
    const profile = {
      id: 'adalovelace-blog',
      name: 'Blog',
      siteUrl: null,
      imageUrl: null,
      role: 'owner',
      members: [],
    }
    server.use(
      signedInAs(testUser),
      http.get('*/api/profiles', () => HttpResponse.json([profile])),
      llmSettings(false),
    )
    await renderAt('/')
    await screen.findByRole('heading', { name: 'First, connect your AI assistant' })
    expect(screen.queryByText(/Welcome/)).toBeNull()
    expect(await screen.findByRole('link', { name: /Blog/ })).toBeInTheDocument()
  })

  it('stays out of the way once a key is saved', async () => {
    server.use(signedInAs(testUser), noProfiles, llmSettings(true))
    await renderAt('/')
    await screen.findByText('Next, create your first profile')
    expect(screen.queryByRole('heading', { name: 'First, connect your AI assistant' })).toBeNull()
    expect(screen.queryByLabelText('Anthropic API key')).toBeNull()
  })
})
