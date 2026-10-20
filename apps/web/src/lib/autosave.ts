import { getCurrentScope, onScopeDispose, ref, watch } from 'vue'

/**
 * - `idle`: nothing typed that isn't saved, and nothing saved this visit
 * - `unsaved`: words typed that the server doesn't have yet (waiting for a pause, or for a retry)
 * - `saving`: a save is on its way
 * - `saved`: the server has what is on the page
 * - `failed`: gave up retrying; the words are still on the page
 * - `halted`: the server refused the save for good (someone else changed the draft); nothing is sent until reload
 */
export type AutosaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed' | 'halted'

/**
 * Saves what a person is typing a moment after they stop, so there is no Save button to forget. Words typed are never
 * thrown away: a failed save is retried a few times with a growing wait, then reported (`failed`) while the words stay
 * on the page, and typing again or `retry()` starts over. A refusal that `halts` (the draft was saved from elsewhere) is
 * not retried and not overwritten: autosave stops until the page is reloaded.
 *
 * `flush()` is for anything that must see the latest saved words first (a critique, adding a note): it saves now and
 * rejects with the reason if it can't (the retries carry on behind it). It also runs when the tab is hidden, and the browser asks before the page is
 * closed while words are unsaved.
 */
export function useAutosave(options: {
  /** Changes whenever the words may have changed; the save is scheduled from it. */
  watch: () => unknown
  /** True while the page has words the server doesn't. */
  dirty: () => boolean
  /** Sends the words; rejects if it didn't work. */
  save: () => Promise<unknown>
  /** True for an error that retrying can't fix. */
  halts?: (err: unknown) => boolean
  /** How long after the last change to save; retries wait twice, four times, … as long. */
  delay?: number
  /** How many times a failed save is tried again on its own. */
  retries?: number
}) {
  const delay = options.delay ?? 2000
  const retries = options.retries ?? 3
  const state = ref<AutosaveState>('idle')
  const error = ref<unknown>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let attempts = 0
  let halted = false
  let inflight: Promise<unknown> | null = null

  function clear() {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  function schedule(wait: number, background: () => void) {
    clear()
    timer = setTimeout(() => {
      timer = undefined
      background()
    }, wait)
  }

  /** One save of whatever is on the page, after any save already running; nothing if the server has it. */
  async function saveOnce() {
    while (inflight) await inflight.catch(() => undefined)
    if (halted) throw error.value
    if (!options.dirty()) return
    state.value = 'saving'
    const sent = options.save()
    inflight = sent
    try {
      await sent
      error.value = null
      attempts = 0
      if (options.dirty()) {
        // More was typed while it was on its way.
        state.value = 'unsaved'
        schedule(delay, background)
      } else {
        state.value = 'saved'
      }
    } catch (err) {
      error.value = err
      if (options.halts?.(err)) {
        halted = true
        state.value = 'halted'
      } else {
        // Only a save that won't be tried again is reported: one that will is just "not saved yet".
        state.value = attempts < retries ? 'unsaved' : 'failed'
      }
      throw err
    } finally {
      inflight = null
    }
  }

  /** A failed save is tried again after a growing wait, until the tries run out. */
  function retryLater() {
    if (halted || attempts >= retries) return
    attempts += 1
    state.value = 'unsaved'
    schedule(delay * 2 ** attempts, background)
  }

  async function background() {
    try {
      await saveOnce()
    } catch {
      retryLater()
    }
  }

  async function flush() {
    clear()
    try {
      await saveOnce()
    } catch (err) {
      retryLater() // the caller is told, and the words keep being tried
      throw err
    }
  }

  /** "Try again": one more go now. If it fails it shows as `failed` again; it doesn't throw. */
  async function retry() {
    attempts = retries // one go, so that if it fails again it says so rather than starting the waits over
    await flush().catch(() => undefined)
  }

  watch(options.watch, () => {
    if (halted) return
    if (options.dirty()) {
      attempts = 0
      state.value = 'unsaved'
      schedule(delay, background)
    } else {
      clear()
      if (state.value === 'unsaved') state.value = 'idle'
    }
  })

  function onHidden() {
    if (document.visibilityState === 'hidden') void flush().catch(() => undefined)
  }
  function onPageHide() {
    void flush().catch(() => undefined)
  }
  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!options.dirty()) return
    void flush().catch(() => undefined)
    event.preventDefault()
    event.returnValue = ''
  }
  document.addEventListener('visibilitychange', onHidden)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('beforeunload', onBeforeUnload)
  if (getCurrentScope()) {
    onScopeDispose(() => {
      clear()
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    })
  }

  return { state, error, flush, retry }
}
