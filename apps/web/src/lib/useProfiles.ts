import { useQuery } from '@tanstack/vue-query'
import { computed } from 'vue'
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
