import type { LLMChatMessage, LLMChatRequest, LLMContentBlock, LLMRequest } from '@lfwa/core'
import {
  BRAINSTORM_KICKOFF_PROMPT,
  CRITIQUE_PROMPT,
  DEFAULT_BRAINSTORM_PROMPT,
} from '@lfwa/prompts'
import {
  BRAINSTORM_TOOLS,
  brainstormSystem,
  formatSnapshot,
} from '../../apps/api/src/services/brainstorm'
import type { BrainstormCase, CritiqueCase } from './cases'
import { SCENARIOS } from './scenarios'

/**
 * The request the app would send for this case. It is built from the app's own pieces (the prompt files, the
 * tool list and `formatSnapshot`, imported rather than copied) so that what is tested is what is sent.
 */
export function brainstormRequest(c: BrainstormCase): LLMChatRequest {
  const first: LLMContentBlock[] = [
    { type: 'text', text: formatSnapshot(SCENARIOS[c.scenario]) },
    { type: 'text', text: BRAINSTORM_KICKOFF_PROMPT },
  ]
  const rest: LLMChatMessage[] = (c.conversation ?? []).map((t) => ({
    role: t.role,
    content: t.text,
  }))
  return {
    system: brainstormSystem(DEFAULT_BRAINSTORM_PROMPT),
    messages: [{ role: 'user', content: first }, ...rest],
    tools: BRAINSTORM_TOOLS,
    effort: 'medium',
  }
}

/** The critique route sends the draft as `# title` and the body, with the critique prompt as the system prompt. */
export function critiqueRequest(c: CritiqueCase): LLMRequest {
  return {
    system: CRITIQUE_PROMPT,
    messages: [{ role: 'user', content: `# ${c.draft.title}\n\n${c.draft.body}` }],
  }
}
