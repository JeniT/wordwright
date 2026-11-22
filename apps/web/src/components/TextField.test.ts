import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import TextField from './TextField.vue'

const field = (props: Record<string, unknown>) =>
  render(TextField, { props: { label: 'Web address', modelValue: '', ...props } })

describe('TextField', () => {
  it('has quiet help under it, described to a screen reader, and is not marked invalid', () => {
    field({ hint: 'We will look up its title.' })
    const box = screen.getByLabelText('Web address')
    expect(box).toHaveAccessibleDescription('We will look up its title.')
    expect(box).not.toHaveAttribute('aria-invalid')
    expect(screen.getByText('We will look up its title.').closest('p')).toHaveClass('text-ink-soft')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says an error as an alert with the alert icon, under the hint, which stays (#458)', () => {
    field({ hint: 'We will look up its title.', error: 'That link is already in this idea.' })
    const box = screen.getByLabelText('Web address')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('That link is already in this idea.')
    expect(alert).toHaveClass('text-danger')
    expect(alert.querySelector('svg')).not.toBeNull()
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription(
      'We will look up its title. That link is already in this idea.',
    )
    expect(screen.getByText('We will look up its title.').closest('p')).toHaveClass('text-ink-soft')
  })

  it('has an error without a hint', () => {
    field({ error: 'Enter a web address.' })
    expect(screen.getByLabelText('Web address')).toHaveAccessibleDescription('Enter a web address.')
  })

  it('marks a live check that fails with the icon, politely rather than as an alert', () => {
    field({ hint: 'That username is already taken. Try another.', invalid: true })
    const box = screen.getByLabelText('Web address')
    const hint = screen.getByText('That username is already taken. Try another.').closest('p')!
    expect(hint).toHaveAttribute('aria-live', 'polite')
    expect(hint).toHaveClass('text-danger')
    expect(hint.querySelector('svg')).not.toBeNull()
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
