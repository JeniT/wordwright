import { useSettingsStore } from '../stores/settings'
import { createApi } from './api'

export function useApi() {
  const settings = useSettingsStore()
  return createApi({ getToken: () => settings.apiToken })
}
