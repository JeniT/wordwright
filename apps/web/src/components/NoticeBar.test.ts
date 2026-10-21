import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { mountTutorial } from '../testing/tutorial-harness'
import { useMockServer } from '../test-utils'

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
