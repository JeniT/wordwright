import { useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { api } from './api'

/** The signed-in user's profiles. Doesn't fire (and so doesn't log a 401) while signed out. */
export function useProfiles() {
  const session = useSessionStore()
  return useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.listProfiles(),
    // A reviewer-only account has no profiles, and the server answers 404 to asking.
    enabled: computed(() => !!session.user && !session.user.reviewerOnly),
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

/**
 * Renaming a profile changes its address (`/p/jenit-old` -> `/p/jenit-new`) and the server keeps
 * the old one as a redirect. When the page shown is for an id that isn't in the person's list, ask
 * the server where it went and move the address bar there, keeping the rest of the page as it is.
 */
export function useProfileAddressRedirect() {
  const route = useRoute()
  const router = useRouter()
  const profiles = useProfiles()
  const unknownId = computed(() => {
    const id = route.params.profileId
    const list = profiles.data.value
    return typeof id === 'string' && list && !list.some((p) => p.id === id) ? id : ''
  })
  const moved = useQuery({
    queryKey: ['profile-moved', unknownId],
    queryFn: () => api.getProfile(unknownId.value),
    enabled: computed(() => !!unknownId.value),
    retry: false, // a 404 just means it really doesn't exist; the page says so
  })
  watch(
    () => moved.data.value,
    (found) => {
      if (!found || found.id === route.params.profileId) return
      router.replace({
        name: route.name,
        params: { ...route.params, profileId: found.id },
        query: route.query,
        hash: route.hash,
      })
    },
  )
}

/** "https://jeni.substack.com/about" -> "jeni.substack.com" */
export function displayHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host.replace(/^www\./, '')
  } catch {
    return siteUrl
  }
}
