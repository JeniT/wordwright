import { fireEvent, screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'
import { http, HttpResponse } from 'msw'

useMockServer()

describe('Help', () => {
  it('lists the help pages, for someone who is signed out too', async () => {
    server.use(signedInAs(null))
    await renderAt('/help')
    expect(await screen.findByRole('heading', { level: 1, name: 'Help' })).toBeVisible()
    const list = screen.getByRole('list', { name: 'Help pages' })
    expect(within(list).getByRole('link', { name: 'How to get an API key' })).toHaveAttribute(
      'href',
      '/help/api-key',
    )
    expect(within(list).getByRole('link', { name: 'Privacy and your writing' })).toHaveAttribute(
      'href',
      '/help/privacy',
    )
  })

  it('walks through getting a key in five numbered steps with links to the Console', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help/api-key')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'How to get an API key' }),
    ).toBeVisible()
    const steps = screen.getByRole('main').querySelectorAll('ol > li')
    expect(steps).toHaveLength(5)
    expect(
      within(steps[0] as HTMLElement).getByRole('link', { name: /Anthropic Console/ }),
    ).toHaveAttribute('href', 'https://console.anthropic.com/')
    expect(screen.getByRole('link', { name: /API keys/ })).toHaveAttribute(
      'href',
      'https://console.anthropic.com/settings/keys',
    )
    // The way on once they have a key, and to the privacy page.
    expect(screen.getByRole('link', { name: 'privacy advice' })).toHaveAttribute(
      'href',
      '/help/privacy',
    )
  })

  it('explains the privacy checks on their own page', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help/privacy')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy and your writing' }),
    ).toBeVisible()
    expect(screen.getByText(/within 30 days/)).toBeInTheDocument()
  })

  it('explains the AI mark and the critique limit on their own page, and lists it', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help')
    const list = await screen.findByRole('list', { name: 'Help pages' })
    expect(within(list).getByRole('link', { name: 'Your AI settings' })).toHaveAttribute(
      'href',
      '/help/ai-settings',
    )
    await renderAt('/help/ai-settings')
    expect(await screen.findByRole('heading', { level: 1, name: 'Your AI settings' })).toBeVisible()
    expect(screen.getByText(/uses your key, so it costs tokens/)).toBeInTheDocument()
    expect(screen.getByText(/limits/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Critique limit' })).toHaveAttribute(
      'href',
      '/account/ai',
    )
  })

  it('has a Back link to where you were', async () => {
    server.use(signedInAs(testUser))
    const { router } = await renderAt('/help')
    await router.push('/help/api-key')
    await fireEvent.click(await screen.findByRole('link', { name: /Back/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Help' })).toBeVisible()
  })

  it('goes to the help list instead when there is nowhere to go back to', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help/privacy')
    expect(await screen.findByRole('link', { name: /All help/ })).toHaveAttribute('href', '/help')
  })

  it('says so when a help page does not exist, and points to the list', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help/nothing-here')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'No such help page' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'All help' })).toHaveAttribute('href', '/help')
  })

  it('is in the side menu footer for a signed-in person', async () => {
    server.use(
      signedInAs(testUser),
      http.get('*/api/publications', () => HttpResponse.json([])),
    )
    await renderAt('/account')
    const help = await screen.findByRole('link', { name: 'Help' })
    expect(help).toHaveAttribute('href', '/help')
  })

  it('explains what makes a useful description on its own page, and lists it', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help')
    const list = await screen.findByRole('list', { name: 'Help pages' })
    expect(within(list).getByRole('link', { name: 'Writing a description' })).toHaveAttribute(
      'href',
      '/help/description',
    )
    await fireEvent.click(within(list).getByRole('link', { name: 'Writing a description' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Writing a description' }),
    ).toBeVisible()
    const main = screen.getByRole('main')
    // The five things a description says, as a plain list, and the example.
    expect(main.querySelectorAll('ul > li')).toHaveLength(5)
    expect(main.querySelector('ol')).toBeNull()
    expect(main.querySelector('strong')).toBeNull()
    expect(within(main).getByText(/never as instructions/)).toBeInTheDocument()
    expect(within(main).getByText(/river engineering/)).toBeInTheDocument()
    expect(main).not.toHaveTextContent(/assistant/i)
  })
})
