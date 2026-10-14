import { computed, ref } from 'vue'

/**
 * System, light or dark. "System" (the default) follows the device (see theme/palette-*.css); choosing light or
 * dark sets `data-theme` on <html>, which the palette file answers to, and saves it. Choosing System removes both,
 * so the person can hand control back. index.html applies a saved choice before first paint so the page never
 * flashes the wrong theme.
 */
export const THEME_KEY = 'wordwright-theme'
export type ThemeChoice = 'system' | 'light' | 'dark'

function saved(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system' // storage can be unavailable (private windows, blocked cookies); the system setting still applies
  }
}
const systemDark = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

const choice = ref<ThemeChoice>(saved())
const systemIsDark = ref(systemDark())
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    systemIsDark.value = e.matches
  })
}

export function useTheme() {
  const dark = computed(() =>
    choice.value === 'system' ? systemIsDark.value : choice.value === 'dark',
  )
  function choose(next: ThemeChoice) {
    choice.value = next
    const root = document.documentElement
    if (next === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      // Not saved; it applies until the page is closed.
    }
  }
  return { choice, dark, choose }
}
