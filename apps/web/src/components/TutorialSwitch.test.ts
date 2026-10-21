import { fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { renderAt, server, signedInAs, testUser, useMockServer } from '../test-utils'

useMockServer({ warm: ['reviews'] })

// The Tutorial switch in the account area of the menu (#314). See "Tutorial mode" in docs/design.md.

const TIP = 'Shows explanations on each page. Turn off once you know your way round.'
const BROKEN = 'Sorry, we couldn’t save that. Please reload the page to try again.'

function signedInWith(tutorialMode: boolean) {
  server.use(
    signedInAs({ ...testUser, tutorialMode }),
    http.get('*/api/publications', () => HttpResponse.json([])),
  )
}
const tutorialSwitch = () => screen.findByRole('switch', { name: 'Tutorial' })
const tip = () => document.querySelector('[data-tip]')

describe('the Tutorial switch in the menu', () => {
  it('shows whether tutorial mode is on, next to the Help link and below the name', async () => {
    signedInWith(true)
    await renderAt('/')
    const input = await tutorialSwitch()
    expect(input).toBeChecked()
    const row = input.closest('div')!
    expect(within(row).getByRole('link', { name: 'Help' })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Sign out' })).toBeNull()
    // Sign out sits in the first row, beside the settings button.
    const top = screen.getByRole('button', { name: 'Sign out' }).closest('div')!
    expect(within(top).getByRole('link', { name: 'Account settings' })).toBeInTheDocument()
  })

  it('says what it does in a tooltip and as its accessible description', async () => {
    signedInWith(true)
    await renderAt('/')
    const input = await tutorialSwitch()
    expect(input).toHaveAccessibleDescription(TIP)
    input.focus()
    expect(tip()).toHaveTextContent(TIP)
  })

  it('turns off at once and saves in the background', async () => {
    signedInWith(true)
    const puts: unknown[] = []
    server.use(
      http.put('*/api/account/tutorial', async ({ request }) => {
        puts.push(await request.json())
        return HttpResponse.json({ on: false })
      }),
    )
    await renderAt('/')
    await fireEvent.click(await tutorialSwitch())
    await waitFor(() => expect(puts).toEqual([{ on: false }]))
    expect(await tutorialSwitch()).not.toBeChecked()
  })

  it('turns on again from off', async () => {
    signedInWith(false)
    server.use(http.put('*/api/account/tutorial', () => HttpResponse.json({ on: true })))
    await renderAt('/')
    await fireEvent.click(await tutorialSwitch())
    await waitFor(async () => expect(await tutorialSwitch()).toBeChecked())
  })

  it('goes back and becomes unavailable until the page is reloaded when it could not be saved', async () => {
    signedInWith(true)
    let puts = 0
    server.use(
      http.put('*/api/account/tutorial', () => {
        puts++
        return HttpResponse.json({ error: 'nope' }, { status: 500 })
      }),
    )
    await renderAt('/')
    await fireEvent.click(await tutorialSwitch())
    const input = await tutorialSwitch()
    await waitFor(() => expect(input).toHaveAttribute('aria-disabled', 'true'))
    expect(input).toBeChecked()
    // Not `disabled`: the keyboard can still reach it, and with it the reason.
    expect(input).not.toBeDisabled()
    expect(input).toHaveAccessibleDescription(BROKEN)
    input.focus()
    expect(tip()).toHaveTextContent(BROKEN)
    expect(screen.queryByRole('alert')).toBeNull()

    await fireEvent.click(input)
    expect(input).toBeChecked()
    expect(puts).toBe(1)
  })

  it('is not in the reviewer header: a reviewer-only account has no tutorial text', async () => {
    server.use(
      signedInAs({ ...testUser, reviewerOnly: true, handle: null }),
      http.get('*/api/reviews', () => HttpResponse.json([])),
    )
    await renderAt('/reviews')
    await screen.findByRole('button', { name: 'Sign out' })
    expect(screen.queryByRole('switch', { name: 'Tutorial' })).toBeNull()
  })
})
