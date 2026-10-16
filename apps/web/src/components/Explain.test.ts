import { screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { mountTutorial } from '../testing/tutorial-harness'
import { server, useMockServer } from '../test-utils'
import Explain from './Explain.vue'

useMockServer()

function seenRequests() {
  const kinds: string[] = []
  server.use(
    http.get('*/api/account/tutorial', () =>
      HttpResponse.json({ on: true, seen: [], answered: false }),
    ),
    http.post('*/api/account/tutorial/seen', async ({ request }) => {
      const { kind } = (await request.json()) as { kind: string }
      kinds.push(kind)
      return HttpResponse.json({ on: true, seen: [...kinds], answered: false })
    }),
  )
  return kinds
}

describe('Explain', () => {
  it('is an info icon with the text as its description while tutorial mode is off', async () => {
    await mountTutorial({ tutorialMode: false })
    const icon = screen.getByRole('button', { name: 'About this page' })
    expect(icon).toHaveAccessibleDescription('Why this page.')
  })

  it('writes the same text out on the page, with no icon, while tutorial mode is on', async () => {
    seenRequests()
    await mountTutorial({ tutorialMode: true })
    expect(screen.getByText('Why this page.')).toBeVisible()
    expect(screen.getByText('What the button does.')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'About this page' })).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  describe('tutorial-only', () => {
    it('says nothing while tutorial mode is off, and not even an icon', async () => {
      await mountTutorial({ tutorialMode: false, path: '/lone' })
      expect(screen.queryByText('What this page is for.')).toBeNull()
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('is written on the page while tutorial mode is on', async () => {
      seenRequests()
      await mountTutorial({ tutorialMode: true, path: '/lone' })
      expect(screen.getByText('What this page is for.')).toBeVisible()
    })
  })

  describe('remembering which kinds of page have been seen', () => {
    it('records the page’s kind once, however many explanations it has', async () => {
      const kinds = seenRequests()
      await mountTutorial({ path: '/explained' })
      await waitFor(() => expect(kinds).toEqual(['explained']))
    })

    it('records nothing while tutorial mode is off', async () => {
      const kinds = seenRequests()
      await mountTutorial({ tutorialMode: false })
      await new Promise((r) => setTimeout(r, 50))
      expect(kinds).toEqual([])
    })

    it('records nothing on a page that has not opted in', async () => {
      const kinds = seenRequests()
      await mountTutorial({ path: '/plain' })
      await screen.findByText('Text on a plain page.')
      await new Promise((r) => setTimeout(r, 50))
      expect(kinds).toEqual([])
    })

    it('does not tell the server again about a kind it already knows', async () => {
      const kinds: string[] = []
      server.use(
        http.get('*/api/account/tutorial', () =>
          HttpResponse.json({ on: true, seen: ['explained'], answered: false }),
        ),
        http.post('*/api/account/tutorial/seen', async () => {
          kinds.push('posted')
          return HttpResponse.json({ on: true, seen: ['explained'], answered: false })
        }),
      )
      await mountTutorial({ path: '/explained' })
      await screen.findByText('Why this page.')
      await new Promise((r) => setTimeout(r, 50))
      expect(kinds).toEqual([])
    })
  })
})
