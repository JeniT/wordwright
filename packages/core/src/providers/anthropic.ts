import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider, LLMRequest } from './llm'

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
  }

  async *stream(request: LLMRequest): AsyncIterable<string> {
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
  }
}
