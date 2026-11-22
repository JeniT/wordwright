import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/vue'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { mountTutorial } from '../testing/tutorial-harness'
import { server, testUser, useMockServer } from '../test-utils'

useMockServer()

describe('the notice bar: email confirmation', () => {
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
    await mountTutorial({ emailVerified: false, path: '/quiet' })
    expect(screen.getByRole('region', { name: 'Email confirmation' })).toBeVisible()
  })
})

describe('the email notice after the first time (#457)', () => {
  const notice = () => screen.getByRole('region', { name: 'Email confirmation' })

  it('is the whole notice on the first page, and one line on the next', async () => {
    const { router } = await mountTutorial({ emailVerified: false, tutorialMode: false })
    expect(notice()).toHaveTextContent(`We sent a link to ${testUser.email}`)
    expect(notice()).not.toHaveAttribute('data-compact')
    await router.push('/plain')
    await waitFor(() => expect(notice()).toHaveAttribute('data-compact'))
    expect(notice()).toHaveClass('notice-warn')
    expect(within(notice()).getByText('Please confirm your email.')).toBeVisible()
    expect(within(notice()).getByRole('button', { name: 'Resend' })).toBeVisible()
  })

  it('is one line on a later visit, and opens to show the address', async () => {
    await mountTutorial({ emailVerified: false, tutorialMode: false })
    cleanup() // the visit ends
    await mountTutorial({ emailVerified: false, tutorialMode: false })
    expect(notice()).toHaveAttribute('data-compact')
    const summary = within(notice()).getByText('Please confirm your email.')
    const details = summary.closest('details')!
    expect(details.open).toBe(false)
    await fireEvent.click(summary)
    expect(details.open).toBe(true)
    expect(details).toHaveTextContent(`We sent a link to ${testUser.email}`)
  })

  it('is the whole notice the first time for each person on this browser', async () => {
    await mountTutorial({ emailVerified: false, tutorialMode: false })
    localStorage.setItem('wordwright:email-notice-seen:someone-else', '1')
    cleanup()
    localStorage.removeItem(`wordwright:email-notice-seen:${testUser.id}`)
    await mountTutorial({ emailVerified: false, tutorialMode: false })
    expect(notice()).not.toHaveAttribute('data-compact')
  })

  it('resends from the one line, and says so', async () => {
    server.use(http.post('*/api/auth/resend-verification', () => HttpResponse.json({ ok: true })))
    localStorage.setItem(`wordwright:email-notice-seen:${testUser.id}`, '1')
    await mountTutorial({ emailVerified: false, tutorialMode: false })
    await fireEvent.click(within(notice()).getByRole('button', { name: 'Resend' }))
    expect(await within(notice()).findByRole('status')).toHaveTextContent('Sent. Check your inbox.')
  })

  it('says why a resend from the one line failed', async () => {
    server.use(
      http.post('*/api/auth/resend-verification', () =>
        HttpResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 }),
      ),
    )
    localStorage.setItem(`wordwright:email-notice-seen:${testUser.id}`, '1')
    await mountTutorial({ emailVerified: false, tutorialMode: false })
    await fireEvent.click(within(notice()).getByRole('button', { name: 'Resend' }))
    expect(await within(notice()).findByRole('alert')).toHaveTextContent('Too many attempts')
    expect(within(notice()).getByRole('button', { name: 'Resend' })).toBeVisible() // to try again
  })

  it('is the whole notice each visit where the browser keeps nothing', async () => {
    const blocked = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    try {
      await mountTutorial({ emailVerified: false, tutorialMode: false })
      expect(notice()).not.toHaveAttribute('data-compact')
    } finally {
      blocked.mockRestore()
    }
  })
})
