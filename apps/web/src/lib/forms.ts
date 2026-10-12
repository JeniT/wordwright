import { ref, watch, type Ref } from 'vue'

/**
 * A form field that starts from a value saved on the server and follows it when it changes (after saving, or
 * changed elsewhere), so the field never shows something stale. The first answer never overwrites what the person
 * has already typed or chosen while it was on its way (on a slow connection that is easily done); later changes
 * always show. Give `identity` (a different idea's id) to fill once per thing: a refresh of the same thing then
 * doesn't wipe what is being typed either.
 */
export function useSavedValue<T>(
  saved: () => T | undefined,
  initial: T,
  identity?: () => string | undefined,
): Ref<T> {
  const value = ref(initial) as Ref<T>
  let filledFor: string | undefined
  /** What the field held when nothing had been typed: the initial value, or what was last filled in. */
  let untouched: T = initial
  /** False until the first answer for this thing has been dealt with. */
  let arrived = false
  let started = false
  watch(
    () => [saved(), identity?.()] as const,
    ([current, id]) => {
      if (current === undefined) return
      if (identity) {
        if (id === undefined || id === filledFor) return
        filledFor = id
        arrived = false
        // Moving to another thing starts afresh: what was typed for the last one is not an early edit of this one.
        if (started) untouched = value.value
        started = true
      }
      const edited = value.value !== untouched
      if (!arrived && edited) {
        arrived = true
        untouched = current // a later change, once they have saved, is shown
        return
      }
      arrived = true
      value.value = current
      untouched = current
    },
    { immediate: true },
  )
  return value
}
