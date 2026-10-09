import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { CritiqueRequestSchema, type LLMProvider } from '@lfwa/core'
import type { DraftRepository } from '../db/drafts'

const CRITIC_SYSTEM = `You are a thoughtful editor. Critique the argument and structure of the draft.
Preserve the author's voice: suggest changes, do not rewrite the piece. Be specific and constructive.`

export function assistRoutes(drafts: DraftRepository, llm: LLMProvider) {
  return new Hono().post('/critique', zValidator('json', CritiqueRequestSchema), async (c) => {
    const draft = drafts.get(c.req.valid('json').draftId)
    if (!draft) return c.json({ error: 'Not found' }, 404)
    const text = await llm.complete({
      system: CRITIC_SYSTEM,
      messages: [{ role: 'user', content: `# ${draft.title}\n\n${draft.body}` }],
      signal: c.req.raw.signal,
    })
    return c.json({ text })
  })
}
