import { fireEvent, screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { llmSettings, renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const noPublications = http.get('*/api/publications', () => HttpResponse.json([]))

describe('landing page: connecting an AI key', () => {
  it('walks a new user through getting a key, with a field to paste it into', async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(false))
    await renderAt('/')
    const heading = await screen.findByRole('heading', { name: 'Connect your AI key (Anthropic)' })
    const section = heading.closest('section')!

    // The steps live on a help page; the screen links to it (in a new tab, so a half-typed key isn't lost).
    expect(section.querySelector('ol')).toBeNull()
    const how = within(section).getByRole('link', {
      name: 'How to get an API key (opens in a new tab)',
    })
    expect(how).toHaveAttribute('href', '/help/api-key')
    expect(how).toHaveAttribute('target', '_blank')
    expect(within(section).getByRole('link', { name: /privacy implications/ })).toHaveAttribute(
      'href',
      '/help/privacy',
    )
    expect(within(section).getByLabelText('Anthropic API key')).toHaveAttribute('type', 'password')
    // The full privacy advice is on its own help page, not here.
    expect(within(section).queryByText('Protect what you write')).toBeNull()
    // The model choice can wait for the account page.
    expect(within(section).queryByLabelText('Model')).toBeNull()

    // A brand-new user is also pointed at their first publication.
    expect(screen.getByText(/Welcome, Ada Lovelace/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a publication' })).toHaveAttribute(
      'href',
      '/publications/new',
    )
  })

  it('saves the key, then replaces the instructions with a confirmation', async () => {
    let sent: unknown
    let saved = false
    server.use(
      signedInAs(testUser),
      noPublications,
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
    // The step stays on the page, marked done, while the publication step is still waiting.
    expect(
      screen.getByRole('heading', { name: /Connect your AI key \(Anthropic\)/ }),
    ).toHaveTextContent('done')
    expect(screen.getByRole('link', { name: 'Start a publication' })).toBeVisible()
    expect(sent).toEqual({
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      apiKey: 'sk-ant-secret-1234567890',
    })
    expect(screen.queryByLabelText('Anthropic API key')).toBeNull()
  })

  it('shows why a key was refused, and keeps the instructions', async () => {
    server.use(
      signedInAs(testUser),
      noPublications,
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
    expect(screen.getByRole('heading', { name: 'Connect your AI key (Anthropic)' })).toBeVisible()
  })

  it('also reminds people who already have publications but no key', async () => {
    const publication = {
      id: 'adalovelace-blog',
      name: 'Blog',
      siteUrl: null,
      imageUrl: null,
      siteIconUrl: null,
      description: null,
      role: 'owner',
      members: [],
    }
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      llmSettings(false),
    )
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Connect your AI key (Anthropic)' })
    expect(await screen.findByRole('link', { name: /Blog/ })).toBeInTheDocument()
  })

  it('stays out of the way once a key is saved', async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(true))
    await renderAt('/')
    await screen.findByRole('heading', { name: 'Create your first publication' })
    expect(screen.queryByLabelText('Anthropic API key')).toBeNull()
    expect(screen.getByRole('heading', { name: /Connect your AI key/ })).toHaveTextContent('done')
  })

  it('shows a done step for the publication and still asks for the key', async () => {
    const publication = {
      id: 'adalovelace-blog',
      name: 'Blog',
      siteUrl: null,
      imageUrl: null,
      siteIconUrl: null,
      description: null,
      role: 'owner',
      members: [],
    }
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([publication])),
      llmSettings(false),
    )
    await renderAt('/')
    await screen.findByLabelText('Anthropic API key')
    const steps = screen.getAllByRole('listitem').filter((li) => li.dataset.step)
    expect(steps).toHaveLength(2)
    expect(steps[0]).toHaveTextContent('Create your first publication · done')
    expect(within(steps[0]!).queryByRole('link')).toBeNull()
    expect(within(steps[1]!).getByLabelText('Anthropic API key')).toBeVisible()
  })

  it('numbers the two steps when neither is done, and neither blocks the other', async () => {
    server.use(signedInAs(testUser), noPublications, llmSettings(false))
    await renderAt('/')
    await screen.findByLabelText('Anthropic API key')
    const steps = screen.getAllByRole('listitem').filter((li) => li.dataset.step)
    expect(steps[0]).toHaveTextContent('01')
    expect(steps[1]).toHaveTextContent('02')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'Start a publication' })).toBeVisible()
  })

  it('goes away when both are done', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () =>
        HttpResponse.json([
          {
            id: 'adalovelace-blog',
            name: 'Blog',
            siteUrl: null,
            imageUrl: null,
            siteIconUrl: null,
            description: null,
            role: 'owner',
            members: [],
          },
        ]),
      ),
      llmSettings(true),
    )
    await renderAt('/')
    await screen.findByRole('link', { name: /Blog/ })
    expect(screen.queryByRole('heading', { name: /Two steps/ })).toBeNull()
    expect(screen.queryByRole('listitem', { name: /01/ })).toBeNull()
  })

  it('says what went wrong and lets you try again when the publications cannot load', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json({ error: 'nope' }, { status: 500 })),
      llmSettings(false),
    )
    await renderAt('/')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeVisible()
  })

  it('still shows the publication step, and explains the problem, when the key settings cannot load', async () => {
    server.use(
      signedInAs(testUser),
      noPublications,
      http.get('*/api/llm', () => HttpResponse.json({ error: 'nope' }, { status: 500 })),
    )
    await renderAt('/')
    expect(await screen.findByRole('link', { name: 'Start a publication' })).toBeVisible()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
