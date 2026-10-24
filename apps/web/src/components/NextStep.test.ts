import { screen, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer()

const publication = (role: 'owner' | 'member' = 'owner') => ({
  id: 'p1',
  name: 'Substack',
  siteUrl: null,
  imageUrl: null,
  siteIconUrl: null,
  description: 'About it',
  role,
  members: [{ userId: 'u1', name: 'Ada', handle: 'ada', email: 'ada@example.com', role }],
})
const idea = {
  id: 'i1',
  publicationId: 'p1',
  name: 'Why rivers meander',
  notes: '',
  links: [],
  drafts: [],
  pendingSuggestions: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
}

function signedIn(role: 'owner' | 'member' = 'owner') {
  server.use(
    signedInAs(testUser),
    http.get('*/api/publications', () => HttpResponse.json([publication(role)])),
    http.get('*/api/publications/p1', () => HttpResponse.json(publication(role))),
    http.get('*/api/publications/p1/ideas/i1', () => HttpResponse.json(idea)),
  )
}

/** The links at the foot of a page: its previous and next page in the sequence. */
async function pager() {
  const main = await screen.findByRole('main')
  const nav = await within(main).findByRole('navigation', { name: 'Previous and next' })
  const previous = within(nav).queryByRole('link', { name: /Previous/ })
  const next = within(nav).queryByRole('link', { name: /Next/ })
  return {
    previous: previous && {
      text: previous.textContent?.trim(),
      href: previous.getAttribute('href'),
    },
    next: next && { text: next.textContent?.trim(), href: next.getAttribute('href') },
  }
}

describe('previous and next links', () => {
  describe('a publication’s steps', () => {
    it('the first step has only Next', async () => {
      signedIn()
      await renderAt('/p/p1/scan')
      expect(await pager()).toEqual({
        previous: null,
        next: { text: 'Next: 02 Read →', href: '/p/p1/read' },
      })
    })

    it('a middle step has both', async () => {
      signedIn()
      await renderAt('/p/p1/read')
      expect(await pager()).toEqual({
        previous: { text: '← Previous: 01 Scan', href: '/p/p1/scan' },
        next: { text: 'Next: 03 Note →', href: '/p/p1/notes' },
      })
    })

    it('the last step has only Previous', async () => {
      signedIn()
      await renderAt('/p/p1/notes')
      expect(await pager()).toEqual({
        previous: { text: '← Previous: 02 Read', href: '/p/p1/read' },
        next: null,
      })
    })
  })

  describe('an idea’s steps', () => {
    it('the first step has only Next', async () => {
      signedIn()
      await renderAt('/p/p1/ideas/i1/research')
      expect((await pager()).previous).toBeNull()
      expect((await pager()).next?.text).toBe('Next: 02 Read →')
    })

    it('a middle step has both', async () => {
      signedIn()
      await renderAt('/p/p1/ideas/i1/notes')
      const { previous, next } = await pager()
      expect(previous?.text).toBe('← Previous: 02 Read')
      expect(next?.text).toBe('Next: 04 Refine →')
    })

    it('the last step has only Previous', async () => {
      signedIn()
      await renderAt('/p/p1/ideas/i1/drafts')
      const { previous, next } = await pager()
      expect(previous?.text).toBe('← Previous: 04 Refine')
      expect(next).toBeNull()
    })
  })

  describe('account settings', () => {
    it('the first page has only Next', async () => {
      signedIn()
      await renderAt('/account/details')
      const { previous, next } = await pager()
      expect(previous).toBeNull()
      expect(next).toEqual({ text: 'Next: Your AI →', href: '/account/ai' })
    })

    it('a middle page has both', async () => {
      signedIn()
      await renderAt('/account/display')
      const { previous, next } = await pager()
      expect(previous?.text).toBe('← Previous: Your AI')
      expect(next?.text).toBe('Next: Sign-in and security →')
    })

    it('the last page has only Previous', async () => {
      signedIn()
      await renderAt('/account/delete')
      const { previous, next } = await pager()
      expect(previous?.text).toBe('← Previous: Download your writing')
      expect(next).toBeNull()
    })
  })

  describe('publication settings', () => {
    it('an owner’s first page has only Next', async () => {
      signedIn()
      await renderAt('/p/p1/settings/details')
      const { previous, next } = await pager()
      expect(previous).toBeNull()
      expect(next?.text).toBe('Next: Description →')
    })

    it('a middle page has both', async () => {
      signedIn()
      await renderAt('/p/p1/settings/sharing')
      const { previous, next } = await pager()
      expect(previous?.text).toBe('← Previous: Feeds')
      expect(next?.text).toBe('Next: Download →')
    })

    it('an owner’s last page has only Previous', async () => {
      signedIn()
      await renderAt('/p/p1/settings/delete')
      const { previous, next } = await pager()
      expect(previous?.text).toBe('← Previous: Download')
      expect(next).toBeNull()
    })

    it('skips the pages a member cannot see: Description is their first', async () => {
      signedIn('member')
      await renderAt('/p/p1/settings/description')
      const { previous, next } = await pager()
      expect(previous).toBeNull()
      expect(next?.text).toBe('Next: Feeds →')
    })

    it('a member’s last page is Download', async () => {
      signedIn('member')
      await renderAt('/p/p1/settings/download')
      const { previous, next } = await pager()
      expect(previous?.text).toBe('← Previous: Sharing')
      expect(next).toBeNull()
    })
  })
})
