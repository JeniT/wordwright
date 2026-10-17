import { ref } from 'vue'
import type { SiteIconPreview } from '@wordwright/core'
import { api } from './api'

/**
 * The icon a website would give a publication, looked up when the person leaves the website field (#224) so they see
 * it before saving. Only a look: saving fetches the icon again on the server. It is a courtesy, so a failure or an
 * address with no icon is simply no icon, never an error message. An answer for an address that has since changed is
 * dropped, so a slow reply can't show the wrong site's icon.
 */
export function useSiteIconPreview() {
  const icon = ref<SiteIconPreview | null>(null)
  let looked = ''
  let latest = 0

  /** Call with the field's current text (on blur). `savedAddress` is skipped: that icon is already shown as saved. */
  async function look(address: string, savedAddress?: string | null) {
    const wanted = address.trim()
    if (wanted === looked) return
    looked = wanted
    const mine = ++latest
    if (!wanted || wanted === savedAddress) {
      icon.value = null
      return
    }
    const found = await api.previewSiteIcon(wanted).catch(() => null)
    if (mine === latest) icon.value = found?.iconUrl ? found : null
  }
  return { icon, look }
}
