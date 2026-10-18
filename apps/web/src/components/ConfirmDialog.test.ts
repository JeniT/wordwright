import { render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import ConfirmDialog from './ConfirmDialog.vue'

const props = { open: true, title: 'Sure?', confirmLabel: 'Yes' }

describe('ConfirmDialog', () => {
  it('can be confirmed unless it says otherwise', () => {
    render(ConfirmDialog, { props })
    expect(screen.getByRole('button', { name: 'Yes' })).toBeEnabled()
  })

  it('keeps the confirm button off until a choice has been made', () => {
    render(ConfirmDialog, { props: { ...props, canConfirm: false } })
    expect(screen.getByRole('button', { name: 'Yes' })).toBeDisabled()
  })
})
