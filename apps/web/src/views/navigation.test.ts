import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

// The side menu follows you: what it lists depends on where you are. See docs/design.md.

const profile = {
  id: 'ada-substack',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  role: 'owner',
  members: [
    { userId: 'u1', name: 'Ada', email: 'ada@example.com', role: 'owner' },
    { userId: 'u2', name: 'Bo', email: 'bo@example.com', role: 'editor' },
  ],
}
const idea = {
  id: 'i1',
  profileId: 'ada-substack',
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
  profileId: 'ada-substack',
  ideaId: 'i1',
  title: 'Part 1',
  body: 'Erosion loops.\n\nBends migrate.',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}

function mockApp() {
  server.use(
    signedInAs(testUser),
    http.get('*/api/profiles', () => HttpResponse.json([profile])),
    http.get('*/api/profiles/ada-substack/ideas', () =>
      HttpResponse.json([
        { id: 'i1', name: idea.name, draftCount: 1, updatedAt: idea.updatedAt },
        { id: 'i2', name: 'Tides', draftCount: 0, updatedAt: idea.updatedAt },
      ]),
    ),
    http.get('*/api/profiles/ada-substack/ideas/i1', () => HttpResponse.json(idea)),
    http.get('*/api/profiles/ada-substack/drafts/d1', () => HttpResponse.json(draft)),
  )
}

const menu = async () => within(await screen.findByRole('banner'))

describe('the menu at home', () => {
  it('lists the profiles page and the account settings', async () => {
    mockApp()
    await renderAt('/')
    const nav = within(await screen.findByRole('navigation', { name: 'Main' }))
    expect(nav.getByRole('link', { name: 'Profiles' })).toHaveAttribute('href', '/')
    expect(nav.getByRole('link', { name: 'Account settings' })).toHaveAttribute('href', '/account')
  })
})

describe('the menu in a profile', () => {
  it('lists its four steps in order, marks the current one, and says how to get back up', async () => {
    mockApp()
    await renderAt('/p/ada-substack/notes')
    const nav = await screen.findByRole('navigation', { name: 'Profile' })
    const steps = within(nav).getAllByRole('listitem')
    // An ordered list conveys the order; the numbers are decoration, so the names are just the names.
    expect(within(nav).getAllByRole('list')[0]!.tagName).toBe('OL')
    const text = (li: HTMLElement) => li.textContent?.replace(/\s+/g, '')
    expect(text(steps[0]!)).toBe('01Search')
    expect(text(steps[1]!)).toBe('02Read')
    expect(text(steps[2]!)).toBe('03Notes')
    expect(text(steps[3]!)).toMatch(/^04Ideas/)
    expect(within(nav).getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Search' })).not.toHaveAttribute('aria-current')
    expect(await within(nav).findByRole('link', { name: 'Profile settings' })).toHaveAttribute(
      'href',
      '/p/ada-substack/settings',
    )
    const header = await menu()
    expect(header.getByRole('link', { name: '← All profiles' })).toHaveAttribute('href', '/')
    expect(header.getByText('Shared with 1 person')).toBeInTheDocument()
  })

  it('counts the ideas under the Ideas step', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas')
    expect(
      await within(await screen.findByRole('navigation', { name: 'Profile' })).findByText(
        '2 ideas',
      ),
    ).toBeInTheDocument()
  })

  it('opens at the profile’s own page, which is not one of the steps', async () => {
    mockApp()
    const { router } = await renderAt('/p/ada-substack')
    expect(router.currentRoute.value.name).toBe('profile')
    const nav = await screen.findByRole('navigation', { name: 'Profile' })
    expect(within(nav).queryByRole('link', { current: 'page' })).not.toBeInTheDocument()
  })
})

describe('the menu in an idea', () => {
  it('names the idea, lists five steps with counts, and leads back up to the profile', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/notes')
    const nav = await screen.findByRole('navigation', { name: 'Idea' })
    expect(within(nav).getAllByRole('listitem').length).toBeGreaterThanOrEqual(5)
    for (const name of ['Research', 'Notes', 'Refine', 'Draft', 'Publish']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(nav).getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page')
    expect(await within(nav).findByText('2 sources')).toBeInTheDocument()
    expect(within(nav).getByText('1 draft')).toBeInTheDocument()
    expect(await within(nav).findByRole('link', { name: 'Idea settings' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/settings',
    )
    const header = await menu()
    expect(header.getByRole('link', { name: '← Substack' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas',
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
      http.get('*/api/profiles/ada-substack/ideas/i1/research', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/ideas/i1/research/find')
    const nav = await screen.findByRole('navigation', { name: 'Idea' })
    expect(within(nav).getByRole('link', { name: 'Research' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('opens at the Notes step', async () => {
    mockApp()
    const { router } = await renderAt('/p/ada-substack/ideas/i1')
    expect(router.currentRoute.value.name).toBe('idea-notes')
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
      http.get('*/api/profiles/ada-substack/ideas/i1/research', () => HttpResponse.json([])),
    )
    await renderAt('/p/ada-substack/ideas/i1/research')
    const next = within(await screen.findByRole('navigation', { name: 'Next step' }))
    expect(next.getByRole('link', { name: /Next: 02 Notes/ })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/notes',
    )
  })

  it('have no "next" on the Ideas step, where you choose', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas')
    await screen.findByRole('heading', { level: 1, name: 'Ideas' })
    expect(screen.queryByRole('navigation', { name: 'Next step' })).toBeNull()
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
    server.use(http.get('*/api/profiles/ada-substack/ideas/i1/notes', () => HttpResponse.json([])))
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

describe('the Publish step', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('copies a draft as Markdown, title first, ready to paste where it is published', async () => {
    mockApp()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await renderAt('/p/ada-substack/ideas/i1/publish')
    await fireEvent.click(await screen.findByRole('button', { name: 'Copy Markdown' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('# Part 1\n\nErosion loops.\n\nBends migrate.\n'),
    )
    expect(await screen.findByText(/Copied\. Paste it where you publish/)).toBeInTheDocument()
  })

  it('shows the Markdown to select when the clipboard is out of reach', async () => {
    mockApp()
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    await renderAt('/p/ada-substack/ideas/i1/publish')
    await fireEvent.click(await screen.findByRole('button', { name: 'Copy Markdown' }))
    expect(await screen.findByText(/couldn't reach your clipboard/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Markdown of “Part 1”/)).toHaveValue(
      '# Part 1\n\nErosion loops.\n\nBends migrate.\n',
    )
  })

  it('shows and hides the Markdown on request, and says when there is nothing to publish', async () => {
    mockApp()
    await renderAt('/p/ada-substack/ideas/i1/publish')
    const show = await screen.findByRole('button', { name: 'Show Markdown' })
    await fireEvent.click(show)
    expect(screen.getByLabelText(/Markdown of “Part 1”/)).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Hide Markdown' }))
    expect(screen.queryByLabelText(/Markdown of “Part 1”/)).toBeNull()
  })

  it('points to the Draft step when there is no draft yet', async () => {
    mockApp()
    server.use(
      http.get('*/api/profiles/ada-substack/ideas/i1', () =>
        HttpResponse.json({ ...idea, drafts: [] }),
      ),
    )
    await renderAt('/p/ada-substack/ideas/i1/publish')
    expect(await screen.findByText(/nothing to publish yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a draft.' })).toHaveAttribute(
      'href',
      '/p/ada-substack/ideas/i1/drafts',
    )
  })
})
