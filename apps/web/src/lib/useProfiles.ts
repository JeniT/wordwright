import { useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue } from 'vue'
import { useSessionStore } from '../stores/session'
import { api } from './api'

/** The signed-in user's profiles. Doesn't fire (and so doesn't log a 401) while signed out. */
export function useProfiles() {
  const session = useSessionStore()
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(),
    enabled: computed(() => !!session.user),
  })
}

/** One profile, picked from the same list so every page shows the same, up-to-date data. */
export function useProfile(id: MaybeRefOrGetter<string>) {
  const profiles = useProfiles()
  return {
    profiles,
    profile: computed(() => profiles.data.value?.find((p) => p.id === toValue(id))),
  }
}

/** "https://jeni.substack.com/about" -> "jeni.substack.com" */
export function displayHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host.replace(/^www\./, '')
  } catch {
    return siteUrl
  }
}
