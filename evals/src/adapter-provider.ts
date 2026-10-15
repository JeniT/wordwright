import { CASES } from './cases'
import { buildAdapter, buildResearch, choiceFromEnv } from './factory'
import { brainstormRequest, critiqueRequest, rephraseRequest, researchRequest } from './request'
import { renderReply } from './render'
import type { LLMChatEvent } from '@wordwright/core'

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
      if (c.app === 'research') {
        const found = await buildResearch(this.choice).find(researchRequest(c))
        return { output: JSON.stringify(found) }
      }
      const llm = buildAdapter(this.choice)
      if (c.app === 'critique') return { output: await llm.complete(critiqueRequest(c)) }
      if (c.app === 'rephrase') return { output: await llm.complete(rephraseRequest(c)) }
      const events: LLMChatEvent[] = []
      for await (const e of llm.chat(brainstormRequest(c))) events.push(e)
      return { output: renderReply(events) }
    } catch (err) {
      return { error: (err as Error).message }
    }
  }
}
