/**
 * Every top-level JSON object in a model's reply, in order, as parsed values. The reply is untrusted text: a model
 * may wrap its answer in a code fence, add a sentence before or after it, or give an answer and then correct it
 * ("Wait, that format is wrong. Here it is again: {...}"). Braces inside strings are not counted, and anything
 * between braces that does not parse is skipped. Returns [] when there is no object at all.
 */
export function jsonObjectsIn(reply: string): unknown[] {
  const found: unknown[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < reply.length; i++) {
    const ch = reply[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
    } else if (ch === '"' && depth > 0) {
      inString = true
    } else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}' && depth > 0) {
      depth--
      if (depth === 0) {
        try {
          found.push(JSON.parse(reply.slice(start, i + 1)))
        } catch {
          // Not JSON after all (braces in prose): skip it.
        }
      }
    }
  }
  return found
}
