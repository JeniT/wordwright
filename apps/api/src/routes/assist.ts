import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { CritiqueRequestSchema, LLMAuthError } from '@lfwa/core'
import { CRITIQUE_PROMPT } from '@lfwa/prompts'
import type { AppEnv } from '../auth/middleware'
import type { Store } from '../db/store'
import type { LlmKeyService } from '../services/llm'
import { toLlmHttpError } from './llm'

/** Every request runs on the *requesting user's* credentials, even inside a shared profile. */
export function assistRoutes(store: Store, llmKeys: LlmKeyService) {
  return new Hono<AppEnv>().post(
    '/critique',
    zValidator('json', CritiqueRequestSchema),
    async (c) => {
      const draft = store.drafts.get(c.req.param('profileId')!, c.req.valid('json').draftId)
      if (!draft) return c.json({ error: 'Not found' }, 404)

      let llm
      try {
        llm = llmKeys.resolve(c.get('user').id)
      } catch (err) {
        return toLlmHttpError(err)
      }

      try {
        const text = await llm.complete({
          system: CRITIQUE_PROMPT,
          messages: [{ role: 'user', content: `# ${draft.title}\n\n${draft.body}` }],
          signal: c.req.raw.signal,
        })
        return c.json({ text })
      } catch (err) {
        if (err instanceof LLMAuthError) {
          throw new HTTPException(400, {
            message:
              'Your API key was rejected by the provider. Update it in your account settings.',
          })
        }
        console.error('LLM request failed:', (err as Error).name)
        throw new HTTPException(502, {
          message: 'The AI provider returned an error. Please try again.',
        })
      }
    },
  )
}
