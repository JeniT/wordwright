import { computed, ref } from 'vue'

/**
 * Light or dark. With no saved choice the app follows the system (see theme/palette-*.css);
 * choosing sets `data-theme` on <html>, which the palette file answers to. index.html applies a saved choice
 * before first paint so the page never flashes the wrong theme.
 */
export const THEME_KEY = 'wordwright-theme'
type Choice = 'light' | 'dark'

function saved(): Choice | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null // storage can be unavailable (private windows, blocked cookies); the system setting still applies
  }
}
const systemDark = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches

const choice = ref<Choice | null>(saved())
const systemIsDark = ref(systemDark())
if (typeof matchMedia === 'function') {
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    systemIsDark.value = e.matches
  })
}

export function useTheme() {
  const dark = computed(() => (choice.value ? choice.value === 'dark' : systemIsDark.value))
  function toggle() {
    choice.value = dark.value ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', choice.value)
    try {
      localStorage.setItem(THEME_KEY, choice.value)
    } catch {
      // Not saved; it applies until the page is closed.
    }
  }
  return { dark, toggle }
}
