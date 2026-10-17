import { fireEvent, render, screen } from '@testing-library/vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTheme } from '../lib/useTheme'
import ThemeChoice from './ThemeChoice.vue'

describe('ThemeChoice', () => {
  beforeEach(() => {
    useTheme().choose('system')
    localStorage.clear()
  })

  it('is a group named Appearance with System, Light and Dark, System chosen to begin with', () => {
    render(ThemeChoice)
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Light mode' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Dark mode' })).not.toBeChecked()
  })

  it('applies a choice and lets you go back to the system', async () => {
    render(ThemeChoice)
    await fireEvent.click(screen.getByRole('radio', { name: 'Dark mode' }))
    expect(screen.getByRole('radio', { name: 'Dark mode' })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await fireEvent.click(screen.getByRole('radio', { name: 'System' }))
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })
})
