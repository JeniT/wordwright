import { nextTick, ref } from 'vue'

type Target = HTMLElement | null | undefined

/**
 * Editing something in place, with the focus where a keyboard or screen reader user needs it: into the first field
 * when the form opens, and back on the button that opened it when it closes (otherwise focus falls to the page).
 *
 * `editing` holds what is being edited (a note's id; any constant for a single thing), or null. Set the form's
 * fields first, then `await start(key)`. `field` and `trigger` find the element to focus once the DOM has updated.
 */
export function useInlineEdit<K extends string>(where: {
  /** The field to focus when editing `key` opens. */
  field: (key: K) => Target
  /** The button that opened editing `key`, to give focus back to. */
  trigger: (key: K) => Target
}) {
  const editing = ref<K | null>(null)

  async function start(key: K) {
    editing.value = key
    await nextTick()
    where.field(key)?.focus()
  }

  async function stop() {
    const key = editing.value
    editing.value = null
    if (key === null) return
    await nextTick()
    where.trigger(key)?.focus()
  }

  return { editing, start, stop }
}
