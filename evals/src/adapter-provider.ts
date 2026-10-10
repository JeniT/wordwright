import { CASES } from './cases'
import { buildAdapter, choiceFromEnv } from './factory'
import { brainstormRequest, critiqueRequest } from './request'
import { renderReply } from './render'
import type { LLMChatEvent } from '@lfwa/core'

/**
 * A promptfoo provider that calls our own `LLMProvider` port, so the cases test the adapter and the way the
 * app drives it, not a vendor's SDK. promptfoo gives it only the case id (`vars.case`); the rest comes from
 * `cases.ts`. promptfoo loads this file through tsx (see `run.ts`).
 */
export default class AdapterProvider {
  private readonly choice = choiceFromEnv()

  id() {
    return `adapter:${this.choice.provider}:${this.choice.model}`
  }

  async callApi(_prompt: string, context?: { vars?: Record<string, unknown> }) {
    const id = String(context?.vars?.case ?? '')
    const c = CASES.find((x) => x.id === id)
    if (!c) return { error: `No eval case called "${id}"` }
    try {
      const llm = buildAdapter(this.choice)
      if (c.app === 'critique') return { output: await llm.complete(critiqueRequest(c)) }
      const events: LLMChatEvent[] = []
      for await (const e of llm.chat(brainstormRequest(c))) events.push(e)
      return { output: renderReply(events) }
    } catch (err) {
      return { error: (err as Error).message }
    }
  }
}
