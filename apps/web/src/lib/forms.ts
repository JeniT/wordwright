import { ref, watch, type Ref } from 'vue'

/**
 * A form field that starts from a value saved on the server and follows it when it changes (after saving, or
 * changed elsewhere), so the field never shows something stale. Give `identity` (a different idea's id) to fill only
 * when that changes: a refresh of the same thing then doesn't wipe what the person is typing.
 */
export function useSavedValue<T>(
  saved: () => T | undefined,
  initial: T,
  identity?: () => string | undefined,
): Ref<T> {
  const value = ref(initial) as Ref<T>
  let filledFor: string | undefined
  watch(
    () => [saved(), identity?.()] as const,
    ([current, id]) => {
      if (current === undefined) return
      if (identity) {
        if (id === undefined || id === filledFor) return
        filledFor = id
      }
      value.value = current
    },
    { immediate: true },
  )
  return value
}
