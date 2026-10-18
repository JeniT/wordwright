import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'
import { dismissedATip } from './tip'

const FOCUSABLE =
  'a[href], button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled)'

/**
 * What every modal dialog does for the keyboard: focus moves in when it opens (to `initialFocus`), Tab stays inside it,
 * Escape asks to close it (unless `canEscape` says it is busy), and focus goes back to what opened it when it closes.
 * It is hand-rolled rather than <dialog>.showModal(), which jsdom (our component tests) lacks.
 */
export function useModal(options: {
  open: () => boolean
  dialog: Ref<HTMLElement | null>
  onEscape: () => void
  initialFocus: () => HTMLElement | null | undefined
  canEscape?: () => boolean
}) {
  let opener: Element | null = null

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && !dismissedATip.has(event) && (options.canEscape?.() ?? true)) {
      event.stopPropagation()
      options.onEscape()
    } else if (event.key === 'Tab') {
      const items = Array.from(options.dialog.value?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
  }

  // Immediate, so a dialog that is already open when it is created is set up too.
  watch(
    options.open,
    async (open) => {
      if (open) {
        opener = document.activeElement
        document.addEventListener('keydown', onKeydown)
        await nextTick()
        options.initialFocus()?.focus()
      } else {
        document.removeEventListener('keydown', onKeydown)
        if (opener instanceof HTMLElement) opener.focus()
        opener = null
      }
    },
    { immediate: true },
  )
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
}
