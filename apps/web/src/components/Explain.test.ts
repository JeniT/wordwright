import { screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { mountTutorial } from '../testing/tutorial-harness'
import { useMockServer } from '../test-utils'

useMockServer()

describe('Explain', () => {
  it('is an info icon with the text as its description while tutorial mode is off', async () => {
    await mountTutorial({ tutorialMode: false })
    const icon = screen.getByRole('button', { name: 'About this page' })
    expect(icon).toHaveAccessibleDescription('Why this page.')
  })

  it('writes the same text out on the page, with no icon, while tutorial mode is on', async () => {
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
      await mountTutorial({ tutorialMode: true, path: '/lone' })
      expect(screen.getByText('What this page is for.')).toBeVisible()
    })
  })
})
