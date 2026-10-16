import type { Directive } from 'vue'

/**
 * `v-tip="'Edit this note'"`: says what an icon-only button does, beside it, on hover and on keyboard focus. The
 * browser's own `title` tooltip appears on hover only, so use this instead of `title` (the button keeps its
 * `aria-label`, which is its real name; the tooltip is hidden from screen readers so it isn't read twice).
 *
 * One tooltip is shared by the whole page and appended to `<body>`, positioned with `fixed`, so a menu or list that
 * scrolls or clips its children can't cut it off. It stays while the pointer moves onto it, and Escape dismisses it
 * without moving focus (WCAG 1.4.13). A press that focuses the button (a tap or click) doesn't pop it up: only a
 * hover, or focus that came by keyboard.
 */
const HIDE_DELAY_MS = 150
const GAP_PX = 2
const MARGIN_PX = 8

interface TipState {
  text: string
  /** A pointer is down on the button, so the focus that follows is a click's, not the keyboard's. */
  pressed: boolean
  cleanup: () => void
}

const states = new WeakMap<HTMLElement, TipState>()
let tipEl: HTMLElement | null = null
let owner: HTMLElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | undefined

function place(target: HTMLElement, tip: HTMLElement) {
  const anchor = target.getBoundingClientRect()
  const { width, height } = tip.getBoundingClientRect()
  const room = document.documentElement.clientWidth - width - MARGIN_PX
  const left = Math.max(MARGIN_PX, Math.min(anchor.left + anchor.width / 2 - width / 2, room))
  const below = anchor.bottom + GAP_PX
  const fitsBelow = below + height <= window.innerHeight - MARGIN_PX
  tip.style.left = `${left}px`
  tip.style.top = `${fitsBelow ? below : Math.max(MARGIN_PX, anchor.top - GAP_PX - height)}px`
}

function hide() {
  clearTimeout(hideTimer)
  tipEl?.remove()
  tipEl = null
  owner = null
  document.removeEventListener('keydown', onEscape, true)
  window.removeEventListener('scroll', hide, true)
  window.removeEventListener('resize', hide)
}

function hideSoon() {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(hide, HIDE_DELAY_MS)
}

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') hide()
}

function show(target: HTMLElement) {
  const state = states.get(target)
  if (!state?.text) return
  hide()
  const tip = document.createElement('div')
  tip.dataset.tip = ''
  tip.setAttribute('aria-hidden', 'true')
  tip.className =
    'fixed z-50 max-w-64 rounded-ctl border border-line-strong bg-surface px-2 py-1 text-xs text-ink'
  tip.textContent = state.text
  // Moving from the button onto the tooltip keeps it open; leaving it closes it.
  tip.addEventListener('pointerenter', () => clearTimeout(hideTimer))
  tip.addEventListener('pointerleave', hideSoon)
  document.body.append(tip)
  place(target, tip)
  tipEl = tip
  owner = target
  document.addEventListener('keydown', onEscape, true)
  // The tooltip is placed once, beside the button as it was; if the page moves under it, it goes rather than float.
  window.addEventListener('scroll', hide, true)
  window.addEventListener('resize', hide)
}

export const vTip: Directive<HTMLElement, string | undefined> = {
  mounted(el, binding) {
    const state: TipState = { text: binding.value ?? '', pressed: false, cleanup: () => {} }
    states.set(el, state)
    const onEnter = () => show(el)
    const onPress = () => {
      state.pressed = true
      // The focus event of this press comes straight after; once that has passed it is the keyboard's again.
      setTimeout(() => (state.pressed = false), 0)
    }
    const onFocus = () => {
      if (!state.pressed) show(el)
    }
    const onBlur = () => {
      if (owner === el) hide()
    }
    el.addEventListener('pointerenter', onEnter)
    el.addEventListener('pointerleave', hideSoon)
    el.addEventListener('pointerdown', onPress)
    el.addEventListener('focus', onFocus)
    el.addEventListener('blur', onBlur)
    state.cleanup = () => {
      el.removeEventListener('pointerenter', onEnter)
      el.removeEventListener('pointerleave', hideSoon)
      el.removeEventListener('pointerdown', onPress)
      el.removeEventListener('focus', onFocus)
      el.removeEventListener('blur', onBlur)
    }
  },
  updated(el, binding) {
    const state = states.get(el)
    if (!state) return
    state.text = binding.value ?? ''
    if (owner === el && tipEl) {
      tipEl.textContent = binding.value ?? ''
      place(el, tipEl)
    }
  },
  unmounted(el) {
    states.get(el)?.cleanup()
    states.delete(el)
    if (owner === el) hide()
  },
}
