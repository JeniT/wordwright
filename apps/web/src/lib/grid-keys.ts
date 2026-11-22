import { onBeforeUnmount, onMounted, toValue, type MaybeRefOrGetter } from 'vue'

/**
 * The keyboard model of a list of records with controls in each row, as an ARIA grid with a roving tabindex (#459).
 * The grid is one Tab stop: Tab goes into it at the control last used (the first one, the first time) and the next
 * Tab leaves it. Inside it:
 *
 * - **Left / Right** move between a row's controls, in the order they are on the page (no wrapping);
 * - **Up / Down** move to the same place in the row above or below (or its last control, if it has fewer);
 * - **Home / End** go to the first or last control in the row; **Ctrl+Home / Ctrl+End** to the first or last row.
 *
 * The grid stays out of the way of anything that needs the keys itself:
 *
 * - a text box (a tag being typed, an edit form's field), so the cursor still moves;
 * - anything inside `[data-grid-own]` (an open "…" panel, an inline edit form, an open tag editor), whose controls keep
 *   their own Tab order and keys until it closes;
 * - a key named in the control's `data-grid-keys` ("vertical" = Up and Down), such as a row's reorder handle, where Up
 *   and Down move the row.
 *
 * The rows are the `[role="row"]` elements in `root` (which is the `role="grid"` element); a control is anything
 * focusable in a row, outside those regions, that isn't disabled or inert.
 */
const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex], [contenteditable]:not([contenteditable="false"])'

const ownsKeys = (el: Element) =>
  !!el.closest('[data-grid-own]') ||
  (el instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
      el.type,
    )) ||
  el instanceof HTMLTextAreaElement ||
  el instanceof HTMLSelectElement ||
  (el instanceof HTMLElement && el.isContentEditable)

function usable(el: HTMLElement) {
  if (el.closest('[data-grid-own], [inert], [hidden]')) return false
  if ((el as HTMLButtonElement).disabled) return false
  // Something focusable only from code (tabindex -1 of its own, not one the grid set) is not a stop.
  if (el.getAttribute('tabindex') === '-1' && !el.hasAttribute('data-grid-roving')) return false
  return true
}

export function useGridKeys(gridEl: MaybeRefOrGetter<HTMLElement | undefined | null>) {
  const root = {
    get value() {
      return toValue(gridEl)
    },
  }
  /** The control that holds the grid's one Tab stop. */
  let active: HTMLElement | null = null
  /** Where it was, so a replacement can be found near it if it goes (its row is deleted, a form takes its place). */
  let place = { row: 0, col: 0 }

  const rows = () => [...(root.value?.querySelectorAll<HTMLElement>('[role="row"]') ?? [])]
  const controls = (row: HTMLElement) =>
    [...row.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (el) => el.closest('[role="row"]') === row && usable(el),
    )

  function locate(el: HTMLElement) {
    const all = rows()
    const row = el.closest<HTMLElement>('[role="row"]')
    const r = row ? all.indexOf(row) : -1
    return r < 0 ? null : { row: r, col: controls(row!).indexOf(el) }
  }

  /** Gives every control tabindex -1 except the active one (finding a new one near the old place if it has gone). */
  function sync() {
    const grid = root.value
    if (!grid) return
    const all = rows()
    if (!active || !grid.contains(active) || !usable(active)) {
      active = null
      const near = [...all.slice(place.row), ...all.slice(0, place.row).reverse()]
      for (const row of near) {
        const cs = controls(row)
        if (cs.length) {
          active = cs[Math.min(place.col, cs.length - 1)]!
          break
        }
      }
    }
    for (const row of all)
      for (const el of controls(row)) {
        const want = el === active ? '0' : '-1'
        el.setAttribute('data-grid-roving', '')
        if (el.getAttribute('tabindex') !== want) el.setAttribute('tabindex', want)
      }
  }

  function makeActive(el: HTMLElement) {
    active = el
    const at = locate(el)
    if (at) place = at
    sync()
  }

  function focus(el: HTMLElement | undefined) {
    if (!el) return
    makeActive(el)
    el.focus()
  }

  function onFocusin(event: FocusEvent) {
    const el = event.target as HTMLElement
    if (el.closest('[role="row"]') && usable(el)) makeActive(el)
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.altKey || event.metaKey) return
    const el = event.target as HTMLElement
    if (!el.closest('[role="row"]') || ownsKeys(el)) return
    const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
    if (vertical && el.closest('[data-grid-keys]')?.getAttribute('data-grid-keys') === 'vertical')
      return
    const at = locate(el)
    if (!at || at.col < 0) return
    const all = rows()
    const here = controls(all[at.row]!)
    const go = (target: HTMLElement | undefined) => {
      event.preventDefault()
      event.stopPropagation() // a control's own arrow handling (the "…" button opens on ArrowDown) waits for Enter
      focus(target)
    }
    /** The nearest row above or below with a control, at the same place or its last control. */
    const step = (by: -1 | 1) => {
      for (let r = at.row + by; r >= 0 && r < all.length; r += by) {
        const cs = controls(all[r]!)
        if (cs.length) return cs[Math.min(at.col, cs.length - 1)]
      }
      return undefined
    }
    const ends = (last: boolean) => {
      const ordered = last ? [...all].reverse() : all
      for (const row of ordered) {
        const cs = controls(row)
        if (cs.length) return last ? cs[cs.length - 1] : cs[0]
      }
      return undefined
    }
    switch (event.key) {
      case 'ArrowRight':
        if (event.ctrlKey) return
        return go(here[at.col + 1] ?? el)
      case 'ArrowLeft':
        if (event.ctrlKey) return
        return go(here[at.col - 1] ?? el)
      case 'ArrowDown':
        return go(step(1) ?? el)
      case 'ArrowUp':
        return go(step(-1) ?? el)
      case 'Home':
        return go(event.ctrlKey ? ends(false) : here[0])
      case 'End':
        return go(event.ctrlKey ? ends(true) : here[here.length - 1])
    }
  }

  let observer: MutationObserver | undefined
  let mounted: HTMLElement | null = null
  onMounted(() => {
    const grid = root.value
    if (!grid) return
    mounted = grid
    grid.addEventListener('keydown', onKeydown, true) // before a control's own handler
    grid.addEventListener('focusin', onFocusin)
    // Rows come and go, a menu opens, a form replaces a row's controls: keep exactly one Tab stop.
    observer = new MutationObserver(sync)
    observer.observe(grid, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'inert', 'hidden', 'data-grid-own'],
    })
    sync()
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    mounted?.removeEventListener('keydown', onKeydown, true)
    mounted?.removeEventListener('focusin', onFocusin)
  })
  return { sync }
}
