import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const KEY = 'lfwa.apiToken'

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** Per-device UI settings. Writing data lives on the server, not here. */
export const useSettingsStore = defineStore('settings', () => {
  const apiToken = ref(read())
  watch(apiToken, (value) => {
    try {
      localStorage.setItem(KEY, value)
    } catch {
      // Storage unavailable (private mode etc.); the token just won't persist.
    }
  })
  return { apiToken }
})
