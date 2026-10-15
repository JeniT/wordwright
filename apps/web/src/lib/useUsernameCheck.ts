import { UsernameInputSchema } from '@wordwright/core'
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { api } from './api'

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'unknown'

/**
 * Checks a username as the person types: its format straight away, and whether anyone has it once
 * they pause. `current` is the username they already have, if any, which is theirs to keep.
 */
export function useUsernameCheck(handle: Ref<string>, current?: Ref<string | undefined>) {
  const availability = ref<Availability>('idle')
  const typed = computed(() => handle.value.trim().toLowerCase())
  const isCurrent = computed(() => !!current?.value && typed.value === current.value)
  const formatProblem = computed(() => {
    if (!handle.value.trim()) return undefined
    const parsed = UsernameInputSchema.safeParse(handle.value)
    return parsed.success ? undefined : parsed.error.issues[0]?.message
  })

  let timer: ReturnType<typeof setTimeout> | undefined
  let latest = 0
  watch(handle, (value) => {
    clearTimeout(timer)
    const check = ++latest
    if (!value.trim() || formatProblem.value || isCurrent.value) {
      availability.value = 'idle'
      return
    }
    availability.value = 'checking'
    timer = setTimeout(async () => {
      try {
        const { available } = await api.handleAvailable(value)
        // Ignore answers to anything but the latest text.
        if (check === latest) availability.value = available ? 'available' : 'taken'
      } catch {
        // The server checks again on submit, so a failed check must not block signing up.
        if (check === latest) availability.value = 'unknown'
      }
    }, 400)
  })
  onBeforeUnmount(() => clearTimeout(timer))

  const hint = computed(() => {
    if (formatProblem.value) return formatProblem.value
    if (isCurrent.value) return 'That is your current username.'
    if (availability.value === 'taken') return 'That username is already taken. Try another.'
    if (availability.value === 'available') return `“${typed.value}” is available.`
    if (availability.value === 'checking') return 'Checking…'
    return 'Letters and numbers only. It starts the address of each publication you create.'
  })
  const invalid = computed(() => !!formatProblem.value || availability.value === 'taken')
  return { hint, invalid, isCurrent, typed }
}
