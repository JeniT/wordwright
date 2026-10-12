import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { useSavedValue } from './forms'

describe('useSavedValue', () => {
  it('starts from the initial value, then takes the saved one when it arrives', async () => {
    const saved = ref<string | undefined>(undefined)
    const value = useSavedValue(() => saved.value, 'default')
    expect(value.value).toBe('default')
    saved.value = 'from the server'
    await nextTick()
    expect(value.value).toBe('from the server')
  })

  it('follows the saved value when it changes', async () => {
    const saved = ref<string | undefined>('one')
    const value = useSavedValue(() => saved.value, '')
    saved.value = 'two'
    await nextTick()
    expect(value.value).toBe('two')
  })

  it('with an identity, fills once per thing, so a refresh does not wipe typing', async () => {
    const saved = ref<string | undefined>('Idea A')
    const id = ref<string | undefined>('a')
    const value = useSavedValue(
      () => saved.value,
      '',
      () => id.value,
    )
    expect(value.value).toBe('Idea A')
    value.value = 'half-typed'
    saved.value = 'Idea A (refetched)'
    await nextTick()
    expect(value.value).toBe('half-typed')
    id.value = 'b'
    saved.value = 'Idea B'
    await nextTick()
    expect(value.value).toBe('Idea B')
  })
})
