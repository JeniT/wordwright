/**
 * A small label to carry under the pointer, in place of a picture of the whole thing being dragged. Chrome on
 * macOS was slow to finish a drag that used a large drag image (the dropped row stayed faded until the mouse
 * moved), and a label says what is being moved without covering what it is moved past. The browser needs the
 * element in the document, painted, when it copies it; it is removed straight after, and by `removeDragLabel`
 * when the drag ends. Only one drag happens at a time, so one label is kept.
 */
let label: HTMLElement | null = null

export function removeDragLabel() {
  label?.remove()
  label = null
}

/** Makes the label for `setDragImage`. */
export function dragLabel(text: string): HTMLElement {
  removeDragLabel()
  const mine = document.createElement('div')
  label = mine
  mine.textContent = text
  mine.setAttribute('aria-hidden', 'true')
  mine.className =
    'max-w-xs truncate rounded-ctl border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow'
  mine.style.cssText = 'position:fixed;top:-1000px;left:0;pointer-events:none'
  document.body.appendChild(mine)
  setTimeout(() => {
    mine.remove()
    if (label === mine) label = null
  }, 0)
  return mine
}
