import { ref } from 'vue'

/**
 * The "This is a quotation" tick on a note taken from a reading item. Words pasted into an empty box (or over all of
 * what's there) are almost always someone else's, and a quotation stored as the writer's own is the one mistake this
 * form must not make easily. Typing never ticks the box, nor does pasting into the middle of the writer's own words.
 */
export function useQuoteTick() {
  const isQuote = ref(false)
  /** The box was ticked by a paste, not by the writer: said out loud, so it can be undone. */
  const tickedByPaste = ref(false)
  function onPaste(event: ClipboardEvent) {
    const box = event.target as HTMLTextAreaElement
    const pasted = event.clipboardData?.getData('text') ?? ''
    const replacesAll =
      !box.value.trim() || (box.selectionStart === 0 && box.selectionEnd === box.value.length)
    if (!pasted.trim() || !replacesAll || isQuote.value) return
    isQuote.value = true
    tickedByPaste.value = true
  }
  function reset() {
    isQuote.value = false
    tickedByPaste.value = false
  }
  return { isQuote, tickedByPaste, onPaste, reset }
}
