/** The parts of `window` that `trackKeyboardInset` reads (so a test can fake them). */
export interface KeyboardWindow {
  innerHeight: number
  visualViewport?: {
    height: number
    offsetTop: number
    scale: number
    addEventListener(type: 'resize' | 'scroll', listener: () => void): void
    removeEventListener(type: 'resize' | 'scroll', listener: () => void): void
  } | null
}

/**
 * How far the on-screen keyboard covers the bottom of the page, in pixels: the layout viewport less what the visual
 * viewport shows. Zero with no keyboard, with no `visualViewport`, or while the page is pinch-zoomed (where the
 * difference is the zoom, not a keyboard).
 */
export function keyboardInset(win: KeyboardWindow): number {
  const vv = win.visualViewport
  if (!vv || Math.abs(vv.scale - 1) > 0.01) return 0
  return Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop))
}

/**
 * Keeps `--keyboard-inset` on the root element at the keyboard's height, so something pinned to the bottom of the
 * screen (`bottom: var(--keyboard-inset)`) rides just above the keyboard. Returns the function that stops it.
 * Where there is no `visualViewport` nothing is set, and the variable's fallback of 0 puts it at the screen's bottom.
 */
export function trackKeyboardInset(
  win: KeyboardWindow = window,
  root: HTMLElement = document.documentElement,
): () => void {
  const vv = win.visualViewport
  if (!vv) return () => {}
  const update = () => root.style.setProperty('--keyboard-inset', `${keyboardInset(win)}px`)
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()
  return () => {
    vv.removeEventListener('resize', update)
    vv.removeEventListener('scroll', update)
    root.style.removeProperty('--keyboard-inset')
  }
}
