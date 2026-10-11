import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
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
import { validateJson } from '../validate'
import { toLlmHttpError } from './llm'

/** Every request runs on the *requesting user's* credentials, even inside a shared profile. */
export function assistRoutes(store: Store, llmKeys: LlmKeyService) {
  return new Hono<AppEnv>().post('/critique', validateJson(CritiqueRequestSchema), async (c) => {
    const draft = store.drafts.get(c.req.param('profileId')!, c.req.valid('json').draftId)
    if (!draft) return c.json({ error: 'Not found' }, 404)

    // Rationed: the looks are spent on the draft whoever asks, and the limit is the one the person asking has chosen.
    const userId = c.get('user').id
    const allowed = critiqueAllowance(store, userId)
    if (store.critiques.count(draft.id) >= allowed) {
      throw new HTTPException(409, {
        message: `This draft has had its ${allowed} ${allowed === 1 ? 'look' : 'looks'}. The next step is to publish it. You can change how many looks a draft gets in your account settings.`,
      })
    }

    let llm
    try {
      llm = llmKeys.resolve(c.get('user').id)
    } catch (err) {
      return toLlmHttpError(err)
    }

    try {
      const { message, blocks } = formatDraftForCritique(draft)
      const reply = await llm.complete({
        system: CRITIQUE_PROMPT,
        messages: [{ role: 'user', content: message }],
        signal: c.req.raw.signal,
      })
      const critique = parseCritique(reply, blocks)
      if (!critique) {
        throw new HTTPException(502, {
          message: 'The AI sent back something we could not read. Please try again.',
        })
      }
      store.critiques.add(draft.id, critique)
      return c.json(critiqueState(store, draft.id, userId))
    } catch (err) {
      if (err instanceof LLMAuthError) {
        throw new HTTPException(400, {
          message: 'Your API key was rejected by the provider. Update it in your account settings.',
        })
      }
      console.error('LLM request failed:', (err as Error).name)
      throw new HTTPException(502, {
        message: 'The AI provider returned an error. Please try again.',
      })
    }
  })
}
