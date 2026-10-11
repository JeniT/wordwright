import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { CritiqueRequestSchema, LLMAuthError } from '@lfwa/core'
import { CRITIQUE_PROMPT } from '@lfwa/prompts'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { LlmKeyService } from '../services/llm'
import { formatDraftForCritique, parseCritique } from '../services/critique'
import { validateJson } from '../validate'
import { toLlmHttpError } from './llm'

/** Every request runs on the *requesting user's* credentials, even inside a shared profile. */
export function assistRoutes(store: Store, llmKeys: LlmKeyService) {
  return new Hono<AppEnv>().post('/critique', validateJson(CritiqueRequestSchema), async (c) => {
    const draft = store.drafts.get(c.req.param('profileId')!, c.req.valid('json').draftId)
    if (!draft) return c.json({ error: 'Not found' }, 404)

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
      return c.json(store.critiques.add(draft.id, critique))
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
