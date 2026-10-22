import { render, screen, within } from '@testing-library/vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import AiProblemAlert from './AiProblemAlert.vue'

const show = (props: InstanceType<typeof AiProblemAlert>['$props']) =>
  render(AiProblemAlert, {
    props,
    global: {
      plugins: [createRouter({ history: createMemoryHistory(), routes: [] })],
    },
  })

describe('AiProblemAlert', () => {
  it('has one link, Add your AI key, for a missing key', () => {
    show({ message: 'ignored', keyProblem: 'missing-key' })
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('callout-danger')
    expect(alert).not.toHaveTextContent('ignored')
    expect(within(alert).getByRole('link', { name: 'Add your AI key' })).toHaveAttribute(
      'href',
      '/account/ai',
    )
  })

  it('says the provider refused a rejected key, linking to the settings', () => {
    show({ message: 'ignored', keyProblem: 'rejected-key' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your AI provider didn’t accept your key. Check it in your AI key settings.',
    )
    expect(screen.getByRole('link', { name: 'your AI key settings' })).toHaveAttribute(
      'href',
      '/account/ai',
    )
  })

  it('shows any other problem as its message, with no link', () => {
    show({ message: 'The AI provider returned an error.', keyProblem: null })
    expect(screen.getByRole('alert')).toHaveTextContent('The AI provider returned an error.')
    expect(screen.queryByRole('link')).toBeNull()
  })
})
