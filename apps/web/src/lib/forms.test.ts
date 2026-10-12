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

  it('does not overwrite what was typed while the saved value was on its way', async () => {
    const saved = ref<string | undefined>(undefined)
    const value = useSavedValue(() => saved.value, 'default')
    value.value = 'typed early'
    saved.value = 'from the server'
    await nextTick()
    expect(value.value).toBe('typed early')
    // once that is saved, the answer that comes back is shown
    saved.value = 'typed early (saved)'
    await nextTick()
    expect(value.value).toBe('typed early (saved)')
  })

  it('with an identity, does not overwrite early typing for that thing either', async () => {
    const saved = ref<string | undefined>(undefined)
    const id = ref<string | undefined>('a')
    const value = useSavedValue(
      () => saved.value,
      '',
      () => id.value,
    )
    value.value = 'my name'
    saved.value = 'Idea A'
    await nextTick()
    expect(value.value).toBe('my name')
    id.value = 'b'
    saved.value = 'Idea B'
    await nextTick()
    expect(value.value).toBe('Idea B') // a different thing starts afresh
  })
})
