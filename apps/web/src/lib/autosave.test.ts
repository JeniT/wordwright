import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useAutosave } from './autosave'

const scopes: Array<{ stop: () => void }> = []

/** A fake draft: `text` is what is typed, `saved` what the "server" has. */
function setup(options: { fail?: () => boolean; halt?: () => boolean } = {}) {
  const text = ref('')
  const saved = ref('')
  const save = vi.fn(async () => {
    if (options.halt?.()) throw new Error('conflict')
    if (options.fail?.()) throw new Error('offline')
    saved.value = text.value
  })
  const scope = effectScope()
  scopes.push(scope)
  const autosave = scope.run(() =>
    useAutosave({
      watch: () => text.value,
      dirty: () => text.value !== saved.value,
      save,
      halts: (err) => err instanceof Error && err.message === 'conflict',
    }),
  )!
  return { text, saved, save, autosave, scope }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
})

describe('useAutosave', () => {
  it('waits for a pause in typing, then saves once', async () => {
    const { text, save, autosave } = setup()
    text.value = 'a'
    await nextTick()
    expect(autosave.state.value).toBe('unsaved')
    await vi.advanceTimersByTimeAsync(1500)
    text.value = 'ab' // typing again restarts the wait
    await nextTick()
    await vi.advanceTimersByTimeAsync(1500)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600)
    expect(save).toHaveBeenCalledTimes(1)
    expect(autosave.state.value).toBe('saved')
  })

  it('does nothing when the change puts things back as they were', async () => {
    const { text, save, autosave } = setup()
    text.value = 'a'
    await nextTick()
    text.value = ''
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
    expect(autosave.state.value).toBe('idle')
  })

  it('flush saves at once and does not save again when the timer would have fired', async () => {
    const { text, save, autosave } = setup()
    text.value = 'a'
    await nextTick()
    await autosave.flush()
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush does not save when nothing has changed', async () => {
    const { save, autosave } = setup()
    await autosave.flush()
    expect(save).not.toHaveBeenCalled()
  })

  it('flush waits for a save already on its way, then saves what was typed since', async () => {
    const { text, save, autosave } = setup()
    text.value = 'a'
    await nextTick()
    await vi.advanceTimersByTimeAsync(2100) // save #1 starts and finishes
    text.value = 'ab'
    await nextTick()
    await autosave.flush()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('retries a failed save with a growing wait, keeping the state as not saved yet', async () => {
    let failing = true
    const { text, save, autosave } = setup({ fail: () => failing })
    text.value = 'a'
    await nextTick()
    await vi.advanceTimersByTimeAsync(2100)
    expect(save).toHaveBeenCalledTimes(1)
    expect(autosave.state.value).toBe('unsaved')
    await vi.advanceTimersByTimeAsync(2100) // first wait is the base delay
    expect(save).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).toHaveBeenCalledTimes(2)
    failing = false
    await vi.advanceTimersByTimeAsync(9000)
    expect(save).toHaveBeenCalledTimes(3)
    expect(autosave.state.value).toBe('saved')
  })

  it('gives up after a few tries and says it failed; Try again and typing both start it again', async () => {
    let failing = true
    const { text, save, autosave } = setup({ fail: () => failing })
    text.value = 'a'
    await nextTick()
    await vi.advanceTimersByTimeAsync(60_000)
    const tries = save.mock.calls.length
    expect(tries).toBe(4)
    expect(autosave.state.value).toBe('failed')
    expect(autosave.error.value).toBeInstanceOf(Error)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(save).toHaveBeenCalledTimes(tries) // quiet once it has given up

    failing = false
    await autosave.retry()
    expect(autosave.state.value).toBe('saved')
    expect(autosave.error.value).toBeNull()

    failing = true
    text.value = 'ab'
    await nextTick()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(autosave.state.value).toBe('failed')
    failing = false
    text.value = 'abc' // typing again starts over
    await nextTick()
    await vi.advanceTimersByTimeAsync(2100)
    expect(autosave.state.value).toBe('saved')
  })

  it('flush rejects with the reason when the save fails, and the retries carry on behind it', async () => {
    const { text, save, autosave } = setup({ fail: () => true })
    text.value = 'a'
    await nextTick()
    await expect(autosave.flush()).rejects.toThrow('offline')
    expect(autosave.state.value).toBe('unsaved')
    await vi.advanceTimersByTimeAsync(60_000)
    expect(save).toHaveBeenCalledTimes(4)
    expect(autosave.state.value).toBe('failed')
  })

  it('stops for good on a conflict: nothing is retried, typing does not save, and flush rejects', async () => {
    const { text, save, autosave } = setup({ halt: () => true })
    text.value = 'a'
    await nextTick()
    await vi.advanceTimersByTimeAsync(2100)
    expect(autosave.state.value).toBe('halted')
    text.value = 'ab'
    await nextTick()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(save).toHaveBeenCalledTimes(1)
    await expect(autosave.flush()).rejects.toThrow('conflict')
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('saves when the tab is hidden', async () => {
    const { text, save } = setup()
    text.value = 'a'
    await nextTick()
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(save).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  it('asks the browser to confirm leaving only while words are not saved', async () => {
    const { text, autosave } = setup({ fail: () => true })
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    text.value = 'a'
    await nextTick()
    expect(leave()).toBe(true)
    await autosave.flush().catch(() => undefined)
    expect(leave()).toBe(true) // not saved
  })

  it('stops listening when its scope ends', async () => {
    const { text, save, scope } = setup()
    text.value = 'a'
    await nextTick()
    scope.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
