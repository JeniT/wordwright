import { ref } from 'vue'

/**
 * The drafting page's side panel (notes, articles, comments, reviews) as seen from the phone's top bar. The page owns
 * the drawer; the bar's panel tab only needs to know whether there is a panel, whether it is open, and to ask to toggle it.
 */
export const sidePanel = {
  /** A page with a side panel is showing. */
  available: ref(false),
  open: ref(false),
  toggle: () => (sidePanel.open.value = !sidePanel.open.value),
}
