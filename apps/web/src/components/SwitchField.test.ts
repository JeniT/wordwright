import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import SwitchField from './SwitchField.vue'

describe('SwitchField', () => {
  it('is full size by default', () => {
    render(SwitchField, { props: { modelValue: false, label: 'Show read items' } })
    expect(screen.getByText('Show read items').closest('label')).not.toHaveClass('switch-compact')
  })

  it('has a compact size that keeps its visible label and its accessible name', async () => {
    const { emitted } = render(SwitchField, {
      props: { modelValue: false, label: 'Read', name: 'Read: A paper', compact: true },
    })
    const box = screen.getByRole('switch', { name: 'Read: A paper' })
    expect(box.closest('label')).toHaveClass('switch', 'switch-compact')
    expect(screen.getByText('Read')).toBeVisible()
    await fireEvent.click(box)
    expect(emitted()['update:modelValue']).toEqual([[true]])
  })
})
