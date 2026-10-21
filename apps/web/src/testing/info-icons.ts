import { expect } from 'vitest'

/**
 * The names of info icons (`InfoTip`) that are alone in their block: nothing else visible beside them, so they sit on
 * a line of their own, away from what they explain. An icon belongs right after a button or on a heading's or
 * field's label row (see `Explain`).
 */
export function loneInfoIcons(container: Element): string[] {
  const icons = [
    ...container.querySelectorAll<HTMLButtonElement>('button[aria-describedby]'),
  ].filter((button) =>
    container.querySelector(`[id="${button.getAttribute('aria-describedby')}"][role="tooltip"]`),
  )
  return icons
    .filter((button) => {
      const tip = button.parentElement! // the InfoTip's own wrapper: the button and its bubble
      const block = tip.parentElement!
      const others = [...block.childNodes].filter((node) => node !== tip)
      return !others.some(
        (node) => (node.textContent ?? '').trim() !== '' || node instanceof HTMLElement,
      )
    })
    .map((button) => button.getAttribute('aria-label') ?? '(unnamed)')
}

/** Fails if a page leaves an info icon on a line of its own. Call it with tutorial mode off. */
export function expectNoLoneInfoIcons(container: Element) {
  expect(loneInfoIcons(container), 'info icons alone on a line').toEqual([])
}
