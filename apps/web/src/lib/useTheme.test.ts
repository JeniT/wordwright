import { beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY, useTheme } from './useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    useTheme().choose('system')
    localStorage.clear()
  })

  it('follows the system when nothing is chosen', () => {
    const theme = useTheme()
    expect(theme.choice.value).toBe('system')
    expect(theme.dark.value).toBe(false)
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('saves a choice and marks the page so the palette can answer to it', () => {
    const theme = useTheme()
    theme.choose('dark')
    expect(theme.choice.value).toBe('dark')
    expect(theme.dark.value).toBe(true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    theme.choose('light')
    expect(theme.dark.value).toBe(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('goes back to following the system by forgetting the saved choice', () => {
    const theme = useTheme()
    theme.choose('dark')
    theme.choose('system')
    expect(theme.choice.value).toBe('system')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('still applies the choice when storage is unavailable', () => {
    const theme = useTheme()
    const broken = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    theme.choose('dark')
    broken.mockRestore()
    expect(theme.dark.value).toBe(true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })
})
