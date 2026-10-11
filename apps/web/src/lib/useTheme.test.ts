import { beforeEach, describe, expect, it } from 'vitest'
import { THEME_KEY, useTheme } from './useTheme'

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('starts light when nothing is saved and the system does not say dark', () => {
    expect(useTheme().dark.value).toBe(false)
  })

  it('switches, saves the choice, and marks the page so the palette can answer to it', () => {
    const theme = useTheme()
    theme.toggle()
    expect(theme.dark.value).toBe(true)
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    theme.toggle()
    expect(theme.dark.value).toBe(false)
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
  })
})
