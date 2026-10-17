import { ref, watch } from 'vue'

const KEY = 'wordwright:draft-markdown-mode'

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true'
  } catch {
    return false // storage can be blocked; the normal editor is the default anyway
  }
}

/**
 * Whether the draft is being edited as Markdown rather than in the rich-text editor. A view preference, not account
 * data: it lives in this browser only, and the page works the same without it.
 */
export function useMarkdownMode() {
  const on = ref(read())
  watch(on, (value) => {
    try {
      localStorage.setItem(KEY, String(value))
    } catch {
      // not remembered; nothing else depends on it
    }
  })
  return on
}
