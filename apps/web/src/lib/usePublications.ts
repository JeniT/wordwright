import { useQuery } from '@tanstack/vue-query'
import { computed, type MaybeRefOrGetter, toValue, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session'
import { api } from './api'
import { queryKeys } from './queries'

/** The signed-in user's publications. Doesn't fire (and so doesn't log a 401) while signed out. */
export function usePublications() {
  const session = useSessionStore()
  return useQuery({
    queryKey: queryKeys.publications(),
    queryFn: () => api.listPublications(),
    // A reviewer-only account has no publications, and the server answers 404 to asking; an account that is not
    // approved has no app at all, and the server answers 403.
    enabled: computed(
      () => !!session.user && !session.user.reviewerOnly && session.user.approval === 'approved',
    ),
  })
}

/** One publication, picked from the same list so every page shows the same, up-to-date data. */
export function usePublication(id: MaybeRefOrGetter<string>) {
  const publications = usePublications()
  return {
    publications,
    publication: computed(() => publications.data.value?.find((p) => p.id === toValue(id))),
  }
}

/**
 * Renaming a publication changes its address (`/p/jenit-old` -> `/p/jenit-new`) and the server keeps
 * the old one as a redirect. When the page shown is for an id that isn't in the person's list, ask
 * the server where it went and move the address bar there, keeping the rest of the page as it is.
 */
export function usePublicationAddressRedirect() {
  const route = useRoute()
  const router = useRouter()
  const publications = usePublications()
  const unknownId = computed(() => {
    const id = route.params.publicationId
    const list = publications.data.value
    return typeof id === 'string' && list && !list.some((p) => p.id === id) ? id : ''
  })
  const moved = useQuery({
    queryKey: computed(() => queryKeys.publicationMoved(unknownId.value)),
    queryFn: () => api.getPublication(unknownId.value),
    enabled: computed(() => !!unknownId.value),
    retry: false, // a 404 just means it really doesn't exist; the page says so
  })
  watch(
    () => moved.data.value,
    (found) => {
      if (!found || found.id === route.params.publicationId) return
      router.replace({
        name: route.name,
        params: { ...route.params, publicationId: found.id },
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
