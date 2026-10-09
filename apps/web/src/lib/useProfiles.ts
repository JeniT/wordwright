import { useQuery } from '@tanstack/vue-query'
import { api } from './api'

export const useProfiles = () =>
  useQuery({ queryKey: ['profiles'], queryFn: () => api.listProfiles() })
