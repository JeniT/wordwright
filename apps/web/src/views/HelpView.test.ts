import { fireEvent, screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { TOOLS } from '../lib/editor-tools'
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
    expect(
      within(list).getByRole('link', { name: 'Your AI provider and privacy' }),
    ).toHaveAttribute('href', '/help/privacy')
  })

  it('publishes an accessibility statement, linked from the help list', async () => {
    server.use(signedInAs(null))
    await renderAt('/help')
    await fireEvent.click(await screen.findByRole('link', { name: 'Accessibility statement' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Accessibility statement' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /report it on GitHub/ })).toHaveAttribute(
      'target',
      '_blank',
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
      await screen.findByRole('heading', { level: 1, name: 'Your AI provider and privacy' }),
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

  it('explains the draft’s formatting buttons and Markdown mode on their own page, and lists it', async () => {
    server.use(signedInAs(testUser))
    await renderAt('/help')
    const list = await screen.findByRole('list', { name: 'Help pages' })
    await fireEvent.click(within(list).getByRole('link', { name: 'Formatting your draft' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Formatting your draft' }),
    ).toBeVisible()
    const main = screen.getByRole('main')
    expect(within(main).getByText(/Edit as Markdown/)).toBeInTheDocument()
    // The shortcuts it lists are the ones on the buttons' tooltips.
    for (const tool of Object.values(TOOLS)) {
      if (tool.shortcut) {
        expect(main.textContent, tool.label).toContain(tool.shortcut.replace('Mod', 'Ctrl'))
      }
    }
    expect(within(main).getByText(/The Comment and Rephrase buttons wait/)).toBeInTheDocument()
  })

  it('publishes the privacy notice, terms and cookie statement, listed in Help and linked from the footer', async () => {
    server.use(signedInAs(null))
    await renderAt('/help')
    const list = await screen.findByRole('list', { name: 'Help pages' })
    for (const [title, href] of [
      ['Privacy notice', '/help/privacy-notice'],
      ['Terms of use', '/help/terms'],
      ['Cookies', '/help/cookies'],
    ]) {
      expect(within(list).getByRole('link', { name: title }), title).toHaveAttribute('href', href)
      expect(
        within(screen.getByRole('navigation', { name: 'Legal' })).getByRole('link', {
          name: title,
        }),
        title,
      ).toHaveAttribute('href', href)
    }
  })

  it.each([
    ['/help/privacy-notice', 'Privacy notice', /ZB302880/],
    ['/help/terms', 'Terms of use', /This is an alpha/],
    ['/help/cookies', 'Cookies', /wordwright_session/],
  ])('shows %s to someone who is signed out', async (path, title, text) => {
    server.use(signedInAs(null))
    await renderAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible()
    expect(screen.getByRole('main')).toHaveTextContent(text)
    if (path !== '/help/cookies')
      expect(screen.getByRole('heading', { name: 'In short' })).toBeVisible()
    expect(screen.getByRole('main')).not.toHaveTextContent(/!|\bwe[’']ll\b/i)
  })

  it.each(['/help/privacy-notice', '/help/accessibility'])(
    'gives the contact address on %s',
    async (path) => {
      server.use(signedInAs(null))
      await renderAt(path)
      const links = await screen.findAllByRole('link', { name: 'hello@wordwright.io' })
      for (const link of links) expect(link).toHaveAttribute('href', 'mailto:hello@wordwright.io')
    },
  )
})
