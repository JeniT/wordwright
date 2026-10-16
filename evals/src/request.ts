import type {
  LLMChatMessage,
  LLMChatRequest,
  LLMContentBlock,
  LLMRequest,
  ResearchRequest,
} from '@wordwright/core'
import {
  BRAINSTORM_KICKOFF_PROMPT,
  CRITIQUE_PROMPT,
  OPTIONS_PROMPT,
  RESEARCH_PROMPT,
} from '@wordwright/prompts'
import {
  BRAINSTORM_TOOLS,
  brainstormSystem,
  formatSnapshot,
} from '../../apps/api/src/services/brainstorm'
import { formatDraftForCritique } from '../../apps/api/src/services/critique'
import { formatRephraseMessage } from '../../apps/api/src/services/rephrase'
import { formatResearchBrief } from '../../apps/api/src/services/research'
import { MAX_RESEARCH_RESULTS } from '@wordwright/core'
import type { BrainstormCase, CritiqueCase, RephraseCase, ResearchCase } from './cases'
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
    system: brainstormSystem(),
    messages: [{ role: 'user', content: first }, ...rest],
    tools: BRAINSTORM_TOOLS,
    effort: 'medium',
  }
}

/**
 * The critique route sends the publication's description (if it has one), the title and the draft as numbered blocks, with
 * the critique prompt as the system prompt.
 */
export function critiqueRequest(c: CritiqueCase): LLMRequest {
  return {
    system: CRITIQUE_PROMPT,
    messages: [
      {
        role: 'user',
        content: formatDraftForCritique(
          c.draft,
          c.scenario ? SCENARIOS[c.scenario].publication.description : null,
        ).message,
      },
    ],
  }
}

/** Research sends the research prompt and the brief the service builds from the areas, the idea and the list so far. */
export function researchRequest(c: ResearchCase): ResearchRequest {
  return {
    system: RESEARCH_PROMPT,
    brief: formatResearchBrief(
      SCENARIOS[c.scenario].idea,
      c.areas,
      SCENARIOS[c.scenario].publication.description,
    ),
    maxResults: MAX_RESEARCH_RESULTS,
  }
}

/** Rephrase sends the options prompt and the message the route builds from the draft, the wording, the Aim and earlier rounds. */
export function rephraseRequest(c: RephraseCase): LLMRequest {
  return {
    system: OPTIONS_PROMPT,
    messages: [
      {
        role: 'user',
        content: formatRephraseMessage(
          { kind: c.kind, wording: c.wording, aim: c.aim, earlier: c.earlier ?? [] },
          c.draft,
          c.scenario ? SCENARIOS[c.scenario].publication.description : null,
        ),
      },
    ],
  }
}
