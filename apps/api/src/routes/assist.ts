import { Hono } from 'hono'
import { CritiqueRequestSchema, LLMAuthError } from '@lfwa/core'
import { CRITIQUE_PROMPT } from '@lfwa/prompts'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { LlmKeyService } from '../services/llm'
import {
  critiqueAllowance,
  critiqueState,
  formatDraftForCritique,
  parseCritique,
} from '../services/critique'
import { requireEditor } from '../services/draft-editor'
import { validateJson } from '../validate'
import { usableVenueDescription } from '../services/venue-context'
import { toLlmHttpError } from './llm'
import { fail } from '../errors'
import { param } from './params'

/** Every request runs on the *requesting user's* credentials, even inside a shared profile. */
export function assistRoutes(store: Store, llmKeys: LlmKeyService) {
  return new Hono<AppEnv>().post('/critique', validateJson(CritiqueRequestSchema), async (c) => {
    const draft = store.drafts.get(param(c, 'profileId'), c.req.valid('json').draftId)
    if (!draft) return c.json({ error: 'Not found' }, 404)
    // Before anything is counted or sent: only the editor spends their key and a look on the draft.
    requireEditor(draft, c.get('user').id)

    // Rationed: the looks are spent on the draft whoever asks, and the limit is the one the person asking has chosen.
    const userId = c.get('user').id
    const allowed = critiqueAllowance(store, userId)
    if (store.critiques.count(draft.id) >= allowed) {
      throw fail(
        409,
        `This draft has had its ${allowed} ${allowed === 1 ? 'look' : 'looks'}. The next step is to publish it. You can change how many looks a draft gets in your account settings.`,
      )
    }

    let llm
    try {
      llm = llmKeys.resolve(c.get('user').id)
    } catch (err) {
      return toLlmHttpError(err)
    }

    try {
      const venue = usableVenueDescription(store.profiles.get(param(c, 'profileId'), userId))
      const { message, blocks } = formatDraftForCritique(draft, venue)
      const reply = await llm.complete({
        system: CRITIQUE_PROMPT,
        messages: [{ role: 'user', content: message }],
        signal: c.req.raw.signal,
      })
      const critique = parseCritique(reply, blocks)
      if (!critique) {
        throw fail(502, 'The AI sent back something we could not read. Please try again.')
      }
      store.critiques.add(draft.id, critique)
      return c.json(critiqueState(store, draft.id, userId))
    } catch (err) {
      if (err instanceof LLMAuthError) {
        throw fail(
          400,
          'Your API key was rejected by the provider. Update it in your account settings.',
        )
      }
      console.error('LLM request failed:', (err as Error).name)
      throw fail(502, 'The AI provider returned an error. Please try again.')
    }
  })
}
