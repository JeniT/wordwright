import { fireEvent, screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

// The side menu follows you: what it lists depends on where you are. See docs/design.md.

const publication = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: null,
  role: 'owner',
  members: [
    { userId: 'u1', name: 'Ada', handle: 'ada', email: 'ada@example.com', role: 'owner' },
    { userId: 'u2', name: 'Bo', handle: 'bouser', email: 'bo@example.com', role: 'member' },
  ],
}
const idea = {
  id: 'i1',
  publicationId: 'ada-substack',
  name: 'Why rivers meander',
  notes: '',
  links: [
    { id: 'l1', url: 'https://example.org/a', title: 'A', readAt: null, origin: 'entered' },
    { id: 'l2', url: 'https://example.org/b', title: 'B', readAt: null, origin: 'entered' },
  ],
  drafts: [{ id: 'd1', title: 'Part 1', updatedAt: '2026-01-02T00:00:00Z' }],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}
const draft = {
  id: 'd1',
  publicationId: 'ada-substack',
  ideaId: 'i1',
  title: 'Part 1',
  body: 'Erosion loops.\n\nBends migrate.',
  editorId: 'u1',
  editorName: 'Ada Lovelace',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}

function mockApp() {
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([publication])),
    http.get('*/api/publications/ada-substack/ideas', () =>
      HttpResponse.json([
        { id: 'i1', name: idea.name, draftCount: 1, updatedAt: idea.updatedAt },
        { id: 'i2', name: 'Tides', draftCount: 0, updatedAt: idea.updatedAt },
      ]),
    ),
    http.get('*/api/publications/ada-substack/ideas/i1', () => HttpResponse.json(idea)),
    http.get('*/api/publications/ada-substack/drafts/d1', () => HttpResponse.json(draft)),
  )
}

const menu = async () => within(await screen.findByRole('banner'))

describe('the menu at home', () => {
  it('lists the publications page, and leaves settings to the button by the person’s name', async () => {
    mockApp()
    await renderAt('/')
    const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
    expect(nav.getByRole('link', { name: 'Publications' })).toHaveAttribute('href', '/')
    expect(nav.queryByRole('link', { name: 'Account settings' })).toBeNull()
  })
})

describe('the settings buttons', () => {
  it('sit by the account name in the menu foot, which has a Sign out button and no "Signed in as"', async () => {
    mockApp()
    await renderAt('/')
    const banner = await menu()
    const gear = await banner.findByRole('link', { name: 'Account settings' })
    expect(gear).toHaveAttribute('href', '/account')
    expect(banner.getByText(testUser.name)).not.toHaveAttribute('href')
    expect(banner.queryByRole('link', { name: testUser.name })).toBeNull()
    expect(banner.queryByText('Signed in as')).toBeNull()
    expect(banner.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    // Appearance is a setting, so it lives on the account page now.
    expect(banner.queryByRole('radiogroup', { name: 'Appearance' })).toBeNull()
  })

  it('sit by the publication’s name in the menu and its page title, and are current on the settings page', async () => {
    mockApp()
    await renderAt('/p/ada-substack')
    const gears = await screen.findAllByRole('link', { name: 'Publication settings' })
    expect(gears).toHaveLength(2) // the menu header and the landing page title
    for (const gear of gears) expect(gear).toHaveAttribute('href', '/p/ada-substack/settings')
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: 'Publication settings' }),
    ).toBeInTheDocument()
  })

  it('are current while on the settings page', async () => {
    mockApp()
    await renderAt('/p/ada-substack/settings/sharing')
    const gear = await (await menu()).findByRole('link', { name: 'Publication settings' })
    expect(gear).toHaveAttribute('aria-current', 'page')
  })

  it('sit by the idea’s name in the menu and its page title', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1')
    const gears = await screen.findAllByRole('link', { name: 'Idea settings' })
    expect(gears).toHaveLength(2)
    for (const gear of gears) {
      expect(gear).toHaveAttribute('href', '/p/ada-substack/ideas/i1/settings')
    }
  })

  it('show on a step page only in the menu, where the idea’s name is', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/notes')
    const gears = await screen.findAllByRole('link', { name: 'Idea settings' })
    expect(gears).toHaveLength(1)
  })
})

describe('the menu in a publication', () => {
  it('lists its three steps in order, marks the current one, and says how to get back up', async () => {
    mockApp()
    await renderAt('/p/ada-substack/notes')
    const nav = await screen.findByRole('navigation', { name: 'Publication' })
    const steps = within(nav).getAllByRole('listitem')
    // An ordered list conveys the order; the numbers are decoration, so the names are just the names.
    expect(within(nav).getAllByRole('list')[0]!.tagName).toBe('OL')
    const text = (li: HTMLElement) => li.textContent?.replace(/\s+/g, '')
    expect(text(steps[0]!)).toBe('01Search')
    expect(text(steps[1]!)).toBe('02Read')
    expect(text(steps[2]!)).toBe('03Notes')
    expect(steps).toHaveLength(3)
    expect(within(nav).getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Search' })).not.toHaveAttribute('aria-current')
    expect(within(nav).queryByRole('link', { name: 'Publication settings' })).toBeNull()
    const header = await menu()
    expect(header.getByRole('link', { name: '← All publications' })).toHaveAttribute('href', '/')
    expect(header.queryByText(/Shared with/)).toBeNull()
  })

  it('has no Ideas step: the old address leads to the landing page, where they are listed', async () => {
    mockApp()
    const { router } = await renderAt('/p/ada-substack/ideas')
    const nav = await screen.findByRole('navigation', { name: 'Publication' })
    expect(router.currentRoute.value.name).toBe('publication')
    expect(within(nav).queryByRole('link', { name: /Ideas/ })).toBeNull()
  })

  it('links the publication’s name, in the menu and above a step’s title, to its own page', async () => {
    mockApp()
    await renderAt('/p/ada-substack/notes')
    const header = await menu()
    expect(await header.findByRole('link', { name: 'Substack' })).toHaveAttribute(
      'href',
      '/p/ada-substack',
    )
    const main = within(screen.getByRole('main'))
    expect(await main.findByRole('link', { name: 'Substack' })).toHaveAttribute(
      'href',
      '/p/ada-substack',
    )
  })

  it('opens at the publication’s own page, which is not one of the steps', async () => {
    mockApp()
    const { router } = await renderAt('/p/ada-substack')
    expect(router.currentRoute.value.name).toBe('publication')
    const nav = await screen.findByRole('navigation', { name: 'Publication' })
    expect(within(nav).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
  })
})

describe('the menu in an idea', () => {
  it('names the idea, lists four steps with counts, and leads back up to the publication', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/notes')
    const nav = await screen.findByRole('navigation', { name: 'Idea' })
    expect(within(nav).getAllByRole('listitem').length).toBeGreaterThanOrEqual(4)
    for (const name of ['Research', 'Notes', 'Refine', 'Draft']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(nav).getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(await within(nav).findByText('2 sources')).toBeInTheDocument()
    expect(within(nav).getByText('1 draft')).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Idea settings' })).toBeNull()
    const header = await menu()
    expect(header.getByRole('link', { name: '← Substack' })).toHaveAttribute(
      'href',
      '/p/ada-substack',
    )
    expect((await header.findAllByText('Why rivers meander')).length).toBeGreaterThan(0)
  })

  it('stays with the idea on the drafting page, with Draft as the current step', async () => {
    mockApp()
    await renderAt('/p/ada-substack/drafts/d1')
    const nav = await screen.findByRole('navigation', { name: 'Idea' })
    expect(await within(nav).findByRole('link', { name: 'Draft' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Research' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/research',
    )
  })

  it('keeps a step current on its sub-pages (the research tool)', async () => {
    mockApp()
    server.use(
      http.get('*/api/publications/ada-substack/ideas/i1/research', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/ideas/i1/research/find')
    const nav = await screen.findByRole('navigation', { name: 'Idea' })
    expect(within(nav).getByRole('link', { name: 'Research' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('step pages', () => {
  it('title themselves with the idea above and a number that screen readers skip', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/notes')
    const title = await screen.findByRole('heading', { level: 1, name: 'Notes' })
    expect(title.querySelector('[aria-hidden="true"]')).toHaveTextContent('02')
    expect(
      await within(screen.getByRole('main')).findByText('Why rivers meander'),
    ).toBeInTheDocument()
  })

  it('end with a suggestion for what often comes next, except where the next move is a choice', async () => {
    mockApp()
    server.use(
      http.get('*/api/publications/ada-substack/ideas/i1/research', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/ideas/i1/research')
    const next = within(await screen.findByRole('navigation', { name: 'Next step' }))
    expect(next.getByRole('link', { name: /Next: 02 Notes/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/notes',
    )
  })

  it('lead on from the publication’s Notes to its ideas, on the landing page', async () => {
    mockApp()
    await renderAt('/p/ada-substack/notes')
    const next = within(await screen.findByRole('navigation', { name: 'Next step' }))
    expect(next.getByRole('link', { name: /Next: your ideas/ })).toHaveAttribute(
      'href',
      '/p/ada-substack',
    )
  })
})

describe('the idea’s name', () => {
  it('leads to its landing page from a step, and marks that page as current there', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/notes')
    const banner = await menu()
    const link = await banner.findByRole('link', { name: 'Why rivers meander' })
    expect(link).toHaveAttribute('href', '/p/ada-substack/ideas/i1')
    expect(link).not.toHaveAttribute('aria-current')
    const title = within(screen.getByRole('main')).getByRole('link', { name: 'Why rivers meander' })
    expect(title).toHaveAttribute('href', '/p/ada-substack/ideas/i1')
  })

  it('is current on the landing page itself, and not a link in the page title there', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1')
    const banner = await menu()
    expect(await banner.findByRole('link', { name: 'Why rivers meander' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(
      within(screen.getByRole('main')).queryByRole('link', { name: 'Why rivers meander' }),
    ).toBeNull()
  })
})

describe('the menu folds away on pages read beside another window', () => {
  it('everywhere else, only on a phone', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas')
    const button = await screen.findByRole('button', { name: 'Menu' })
    expect(button).toHaveClass('md:hidden')
  })

  it('but at every width when reading a source and taking notes', async () => {
    mockApp()
    server.use(
      http.get('*/api/publications/ada-substack/ideas/i1/notes', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/ideas/i1/reading/l1')
    const button = await screen.findByRole('button', { name: 'Menu' })
    expect(button).not.toHaveClass('md:hidden')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(await screen.findByRole('navigation', { name: 'Idea' })).getByRole('link', {
        name: 'Research',
      }),
    ).toHaveAttribute('aria-current', 'page')
  })
})

describe('the old Publish step', () => {
  it('is gone from the menu, and its address leads to the idea’s drafts', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/publish')
    expect(await screen.findByRole('heading', { level: 1, name: 'Draft' })).toBeInTheDocument()
    const nav = await screen.findByRole('navigation', { name: 'Idea' })
    expect(within(nav).queryByRole('link', { name: 'Publish' })).toBeNull()
    expect(within(nav).getByRole('link', { name: 'Draft' })).toHaveAttribute('aria-current', 'page')
  })

  it('leaves the drafts list as the last step, with no next step', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/drafts')
    await screen.findByRole('heading', { level: 1, name: 'Draft' })
    expect(screen.queryByRole('link', { name: /Next:/ })).toBeNull()
  })
})

describe('the menu in a publication’s settings', () => {
  it('lists the pages as plain links, marks the current one, and leads back to the publication', async () => {
    mockApp()
    await renderAt('/p/ada-substack/settings/sharing')
    const nav = await screen.findByRole('navigation', { name: 'Publication settings' })
    await within(nav).findByRole('link', { name: 'Delete publication' }) // owners only, once the role is known
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent)
    expect(labels).toEqual([
      'Details',
      'Description',
      'Feeds',
      'Sharing',
      'Download',
      'Delete publication',
    ])
    expect(within(nav).getByRole('link', { name: 'Sharing' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Details' })).not.toHaveAttribute('aria-current')
    // Not a sequence: no numbers, and none of the publication's steps.
    expect(within(nav).queryByText(/^0\d$/)).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Publication' })).toBeNull()
    expect((await menu()).getByRole('link', { name: '← Substack' })).toHaveAttribute(
      'href',
      '/p/ada-substack',
    )
    expect(await screen.findByRole('heading', { level: 1, name: 'Sharing' })).toBeInTheDocument()
  })

  it('sends the bare settings address to Details', async () => {
    mockApp()
    const { router } = await renderAt('/p/ada-substack/settings?from=email')
    await screen.findByRole('heading', { level: 1, name: 'Details' })
    expect(router.currentRoute.value.fullPath).toBe('/p/ada-substack/settings/details?from=email')
  })

  it('leaves Delete out for a member, and sends them from its address to Details', async () => {
    mockApp()
    server.use(
      http.get('*/api/publications', () => HttpResponse.json([{ ...publication, role: 'member' }])),
    )
    const { router } = await renderAt('/p/ada-substack/settings/delete')
    await screen.findByRole('heading', { level: 1, name: 'Details' })
    expect(router.currentRoute.value.path).toBe('/p/ada-substack/settings/details')
    const nav = await screen.findByRole('navigation', { name: 'Publication settings' })
    expect(within(nav).queryByRole('link', { name: 'Delete publication' })).toBeNull()
    expect(within(nav).getAllByRole('link')).toHaveLength(5)
  })
})
