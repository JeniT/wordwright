import type { LLMChatEvent } from '@lfwa/core'

/**
 * A reply as text for the assertions: what was said, then one line per tool call, as
 * `[tool_call add_note {"text":"..."}]`. Assertions look for that marker.
 */
export function renderReply(events: Iterable<LLMChatEvent>): string {
  let text = ''
  const calls: string[] = []
  for (const e of events) {
    if (e.type === 'text') text += e.text
    else if (e.type === 'tool_call') calls.push(`[tool_call ${e.name} ${JSON.stringify(e.input)}]`)
  }
  return [text.trim(), ...calls].filter(Boolean).join('\n')
}
