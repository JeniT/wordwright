/**
 * Scrolling to show something at the top. Used to put a comment's paragraph and the comment side by side: the
 * draft scrolls with the page, the comments scroll inside their own area.
 */

/** Breathing room between the top edge and what is scrolled to (the side area sticks 1rem from the top). */
const GAP = 16

/** Smooth, unless the person has asked for less motion. */
const behavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/** Scrolls the page so `el` is at the top of the window (as far as the page allows). */
export function scrollPageToTop(el: Element) {
  const top = el.getBoundingClientRect().top + window.scrollY - GAP
  window.scrollTo({ top: Math.max(0, top), behavior: behavior() })
}

/**
 * Scrolls `area` (a scrolling box of its own, found by `scrollAreaOf`) so `el` is at its top. `Element.scrollIntoView`
 * would scroll the page as well, which is what the paragraph is for.
 */
export function scrollAreaToTop(el: Element, area: Element | null) {
  if (!area) return
  const top = area.scrollTop + el.getBoundingClientRect().top - area.getBoundingClientRect().top
  area.scrollTo?.({ top: Math.max(0, top), behavior: behavior() })
}

/** The area beside the draft that scrolls on its own (marked `data-side-scroll`). */
export const scrollAreaOf = (el: Element) => el.closest('[data-side-scroll]')
