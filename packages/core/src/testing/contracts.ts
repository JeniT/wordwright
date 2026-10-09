import { describe, expect, it } from 'vitest'
import type { LLMProvider } from '../providers/llm'
import type { SearchProvider } from '../providers/search'

/**
 * Behaviour every LLMProvider must satisfy. Run it against the fake in CI and,
 * optionally, against real adapters with credentials.
 */
export function llmProviderContract(name: string, create: () => LLMProvider) {
  describe(`LLMProvider contract: ${name}`, () => {
    const request = { messages: [{ role: 'user' as const, content: 'Say hello' }] }

    it('has a name', () => {
      expect(create().name).not.toBe('')
    })

    it('completes with non-empty text', async () => {
      expect((await create().complete(request)).length).toBeGreaterThan(0)
    })

    it('streams chunks that concatenate to a non-empty string', async () => {
      let text = ''
      for await (const chunk of create().stream(request)) text += chunk
      expect(text.length).toBeGreaterThan(0)
    })

    it('rejects when the signal is already aborted', async () => {
      const controller = new AbortController()
      controller.abort()
      await expect(create().complete({ ...request, signal: controller.signal })).rejects.toThrow()
    })
  })
}

export function searchProviderContract(name: string, create: () => SearchProvider) {
  describe(`SearchProvider contract: ${name}`, () => {
    it('returns an array respecting the limit', async () => {
      const results = await create().search('anything', { limit: 1 })
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeLessThanOrEqual(1)
    })
  })
}
