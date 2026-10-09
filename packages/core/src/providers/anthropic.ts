import Anthropic from '@anthropic-ai/sdk'
import { LLMAuthError, type LLMProvider, type LLMRequest } from './llm'

export interface AnthropicProviderOptions {
  apiKey: string
  model?: string
  client?: Anthropic
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  private readonly client: Anthropic
  private readonly model: string

  constructor(options: AnthropicProviderOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey })
    this.model = options.model ?? 'claude-sonnet-5-5'
  }

  async complete(request: LLMRequest): Promise<string> {
    try {
      const message = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: request.maxTokens ?? 2048,
          system: request.system,
          messages: request.messages,
        },
        { signal: request.signal },
      )
      return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
    } catch (err) {
      throw translate(err)
    }
  }

  async *stream(request: LLMRequest): AsyncIterable<string> {
    try {
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens ?? 2048,
          system: request.system,
          messages: request.messages,
        },
        { signal: request.signal },
      )
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text
        }
      }
    } catch (err) {
      throw translate(err)
    }
  }
}

/** 401/403 mean the credentials (not our request) are the problem. */
function translate(err: unknown): unknown {
  if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
    return new LLMAuthError('Anthropic rejected the API key')
  }
  return err
}
