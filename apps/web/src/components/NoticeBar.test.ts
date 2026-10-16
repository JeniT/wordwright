import { fireEvent, screen, waitFor } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { mountTutorial } from '../testing/tutorial-harness'
import { server, useMockServer } from '../test-utils'

useMockServer()

/** The server as it is once the person has seen these kinds of page, with the offer answered or not. */
function tutorialIs(seen: string[], answered = false) {
  const updates: unknown[] = []
  let state = { on: true, seen, answered }
  server.use(
    http.get('*/api/account/tutorial', () => HttpResponse.json(state)),
    http.post('*/api/account/tutorial/seen', async ({ request }) => {
      const { kind } = (await request.json()) as { kind: string }
      if (!state.seen.includes(kind)) state = { ...state, seen: [...state.seen, kind] }
      return HttpResponse.json(state)
    }),
    http.put('*/api/account/tutorial', async ({ request }) => {
      const update = (await request.json()) as { on?: boolean; answered?: boolean }
      updates.push(update)
      state = { ...state, ...update }
      return HttpResponse.json(state)
    }),
  )
  // Not enumerable, so a test can compare `updates` with a plain array.
  return Object.defineProperty(updates, 'seen', {
    value: () => state.seen,
    enumerable: false,
  }) as unknown[] & {
    seen: () => string[]
  }
}
const offer = () => screen.queryByRole('region', { name: 'Tutorial mode' })

describe('the warn notice: email confirmation', () => {
  it('asks for the address to be confirmed, with a way to resend the link', async () => {
    await mountTutorial({ emailVerified: false, tutorialMode: false })
    const notice = screen.getByRole('region', { name: 'Email confirmation' })
    expect(notice).toHaveTextContent('Please confirm your email address')
    expect(notice).toHaveClass('notice-warn')
    expect(screen.getByRole('button', { name: 'Resend' })).toBeVisible()
  })

  it('is not shown once the address is confirmed', async () => {
    await mountTutorial({ emailVerified: true, tutorialMode: false })
    expect(screen.queryByRole('region', { name: 'Email confirmation' })).toBeNull()
  })

  it('stays on a quiet page, where info notices are held back', async () => {
    tutorialIs(['explained', 'quiet'])
    await mountTutorial({ emailVerified: false, path: '/quiet' })
    expect(screen.getByRole('region', { name: 'Email confirmation' })).toBeVisible()
  })

  it('comes before the info notice', async () => {
    tutorialIs(['explained', 'quiet'])
    await mountTutorial({ emailVerified: false, path: '/plain' })
    await screen.findByRole('region', { name: 'Tutorial mode' })
    const regions = screen.getAllByRole('region')
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Email confirmation',
      'Tutorial mode',
    ])
  })
})

describe('the info notice: the offer to turn tutorial mode off', () => {
  it('is shown on the next page after the last kind of page is seen, not on that page', async () => {
    const server = tutorialIs([])
    const { router } = await mountTutorial({ path: '/quiet' })
    await waitFor(() => expect(server.seen()).toEqual(['quiet']))
    // Everything with tutorial text is /explained and /quiet; /quiet has just been seen, /explained is not yet.
    await router.push('/plain')
    expect(offer()).toBeNull()
    await router.push('/explained')
    await waitFor(() => expect(server.seen()).toEqual(['quiet', 'explained']))
    expect(offer()).toBeNull() // the page that completed the set doesn't get the offer
    await router.push('/plain')
    const notice = await screen.findByRole('region', { name: 'Tutorial mode' })
    expect(notice).toHaveClass('notice-info')
    expect(notice).toHaveTextContent('Turn off tutorial mode')
  })

  it('is not shown before every page with tutorial text has been seen', async () => {
    tutorialIs(['explained'])
    const { router } = await mountTutorial({ path: '/explained' })
    await router.push('/plain')
    await new Promise((r) => setTimeout(r, 50))
    expect(offer()).toBeNull()
  })

  it('is not shown while tutorial mode is off', async () => {
    tutorialIs(['explained', 'quiet'])
    const { router } = await mountTutorial({ tutorialMode: false, path: '/explained' })
    await router.push('/plain')
    await new Promise((r) => setTimeout(r, 50))
    expect(offer()).toBeNull()
  })

  it('is not shown once it has been answered', async () => {
    tutorialIs(['explained', 'quiet'], true)
    const { router } = await mountTutorial({ path: '/explained' })
    await router.push('/plain')
    await new Promise((r) => setTimeout(r, 50))
    expect(offer()).toBeNull()
  })

  it('is held back on a quiet page, and shown when they leave it', async () => {
    tutorialIs(['explained', 'quiet'])
    const { router } = await mountTutorial({ path: '/plain' })
    await screen.findByRole('region', { name: 'Tutorial mode' })
    await router.push('/quiet')
    await waitFor(() => expect(offer()).toBeNull())
    await router.push('/plain')
    await screen.findByRole('region', { name: 'Tutorial mode' })
  })

  it('turns tutorial mode off, remembers the answer and goes away', async () => {
    const updates = tutorialIs(['explained', 'quiet'])
    await mountTutorial({ path: '/plain' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Turn off tutorial mode' }))
    await waitFor(() => expect(offer()).toBeNull())
    expect(updates).toEqual([{ on: false, answered: true }])
  })

  it('keeps tutorial mode on, remembers the answer and goes away', async () => {
    const updates = tutorialIs(['explained', 'quiet'])
    await mountTutorial({ path: '/plain' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Keep it on' }))
    await waitFor(() => expect(offer()).toBeNull())
    expect(updates).toEqual([{ answered: true }])
  })

  it('says what went wrong when the answer could not be saved, and stays', async () => {
    tutorialIs(['explained', 'quiet'])
    server.use(
      http.put('*/api/account/tutorial', () =>
        HttpResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 }),
      ),
    )
    await mountTutorial({ path: '/plain' })
    await fireEvent.click(await screen.findByRole('button', { name: 'Keep it on' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
    expect(offer()).not.toBeNull()
  })
})
