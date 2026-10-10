import Anthropic from '@anthropic-ai/sdk'
import { translate } from './anthropic-errors'
import type { ResearchFinding, ResearchProvider, ResearchRequest } from './research'

/** How many times a long search may be resumed after the provider pauses it. */
const MAX_CONTINUATIONS = 3

/** Added to the app's own instructions: how to answer, so that the reply can be read by code. */
const ANSWER_FORMAT = `Search the web for pages worth reading, then answer with a JSON array and nothing else. Each element is {"url": "...", "why": "..."}: "url" must be exactly an address that appeared in your search results, and "why" is one short sentence on why the page is worth reading for this idea. If you find nothing worth reading, answer [].`

export interface AnthropicResearchOptions {
  apiKey: string
  model?: string
  client?: Anthropic
}

/**
 * Research with Anthropic's web search tool. The model searches; this adapter then keeps only the pages
 * whose address appeared in a search result, with the title the result gave, so an address the model
 * remembered (or made up) never gets through.
 */
export class AnthropicResearchProvider implements ResearchProvider {
  readonly name = 'anthropic'
  private readonly client: Anthropic
  private readonly model: string

  constructor(options: AnthropicResearchOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
    this.model = options.model ?? 'claude-sonnet-5-5'
  }

  async find(request: ResearchRequest): Promise<ResearchFinding[]> {
    try {
      request.signal?.throwIfAborted()
      const results = new Map<string, string>() // address -> title, as the search gave them
      let text = ''
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: request.brief }]
      for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
        const message = await this.client.messages.create(
          {
            model: this.model,
            max_tokens: 4096,
            system: `${request.system}\n\n${ANSWER_FORMAT}`,
            messages,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
          },
          { signal: request.signal },
        )
        for (const block of message.content) {
          if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
            for (const r of block.content) results.set(addressKey(r.url), r.title)
          }
        }
        // The answer is the text after the last search; earlier text is the model thinking aloud.
        text = message.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
        if (message.stop_reason !== 'pause_turn') break
        messages.push({
          role: 'assistant',
          content: message.content as Anthropic.ContentBlockParam[],
        })
      }
      return keepSearched(text, results, request.maxResults)
    } catch (err) {
      throw translate(err)
    }
  }
}

/** Addresses from a search and from the model's answer are compared without the fragment and a trailing slash. */
const addressKey = (url: string) => url.trim().replace(/#.*$/, '').replace(/\/+$/, '')

/**
 * Reads the model's JSON answer and keeps what is safe to use: only addresses that were in the search results
 * (titled by the result, not by the model), each once, with a non-empty reason, up to `max`.
 */
export function keepSearched(
  answer: string,
  results: Map<string, string>,
  max: number,
): ResearchFinding[] {
  const start = answer.indexOf('[')
  const end = answer.lastIndexOf(']')
  if (start < 0 || end < start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(answer.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  const found: ResearchFinding[] = []
  for (const item of parsed) {
    if (found.length >= max) break
    if (typeof item !== 'object' || item === null) continue
    const { url, why } = item as { url?: unknown; why?: unknown }
    if (typeof url !== 'string' || typeof why !== 'string' || !why.trim()) continue
    const key = addressKey(url)
    const title = results.get(key)
    if (title === undefined || seen.has(key)) continue
    seen.add(key)
    found.push({ url: url.trim(), title, why: why.trim() })
  }
  return found
}
