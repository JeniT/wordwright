import type { User } from '@wordwright/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ApiError, api } from '../lib/api'

/** Who is signed in. The cookie is the source of truth; this just mirrors `/auth/me`. */
export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  const loaded = ref(false)
  /** Set when we couldn't find out (server down, network error), as opposed to "signed out". */
  const error = ref<string | null>(null)

  async function load() {
    if (loaded.value) return
    try {
      user.value = await api.me()
      error.value = null
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        user.value = null
        error.value = null
      } else {
        console.error('Could not check sign-in status:', err)
        error.value = "We can't reach the server right now."
        return // not loaded: the next navigation tries again
      }
    }
    loaded.value = true
  }

  function set(next: User | null) {
    user.value = next
    loaded.value = true
    error.value = null
  }

  return { user, loaded, error, load, set }
})
