import type { User } from '@lfwa/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { ApiError, api } from '../lib/api'

/** Who is signed in. The cookie is the source of truth; this just mirrors `/auth/me`. */
export const useSessionStore = defineStore('session', () => {
  const user = ref<User | null>(null)
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    try {
      user.value = await api.me()
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err
      user.value = null
    }
    loaded.value = true
  }

  function set(next: User | null) {
    user.value = next
    loaded.value = true
  }

  return { user, loaded, load, set }
})
