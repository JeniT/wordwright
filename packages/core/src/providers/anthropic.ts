import Anthropic from '@anthropic-ai/sdk'
import { translate } from './anthropic-errors'
import {
  type LLMChatEvent,
  type LLMChatMessage,
  type LLMChatRequest,
  type LLMProvider,
  type LLMRequest,
  type LLMStopReason,
} from './llm'

/** Room for a reply that includes a long proposed rewrite; a reply that still hits it ends as `max_tokens`. */
const DEFAULT_CHAT_MAX_TOKENS = 8192

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

  async *chat(request: LLMChatRequest): AsyncIterable<LLMChatEvent> {
    try {
      request.signal?.throwIfAborted()
      // No sampling options (temperature and friends): current Claude models reject non-default values.
      // Thinking is left to the model's default; `effort` is how callers trade depth for speed.
      const stream = this.client.messages.stream(
        {
          model: this.model,
          max_tokens: request.maxTokens ?? DEFAULT_CHAT_MAX_TOKENS,
          system: request.system,
          messages: toAnthropicMessages(request.messages),
          ...(request.tools?.length && {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
            })),
          }),
          ...(request.effort && { output_config: { effort: request.effort } }),
        },
        { signal: request.signal },
      )
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', text: event.delta.text }
        }
      }
      const message = await stream.finalMessage()
      const stopReason = toStopReason(message.stop_reason)
      // A reply cut off at the token limit may hold a half-written tool call: report none.
      if (stopReason === 'tool_use') {
        for (const block of message.content) {
          if (block.type === 'tool_use') {
            yield { type: 'tool_call', id: block.id, name: block.name, input: block.input }
          }
        }
      }
      yield {
        type: 'done',
        stopReason,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          ...(message.usage.cache_read_input_tokens != null && {
            cachedInputTokens: message.usage.cache_read_input_tokens,
          }),
        },
      }
    } catch (err) {
      throw translate(err)
    }
  }
}

function toStopReason(reason: Anthropic.StopReason | null): LLMStopReason {
  switch (reason) {
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens'
    case 'tool_use':
      return 'tool_use'
    case 'refusal':
      return 'refusal'
    default:
      return 'end'
  }
}

/** Anthropic wants each `tool_result` ahead of any other content in its message, so put them first. */
function toAnthropicMessages(messages: LLMChatMessage[]): Anthropic.MessageParam[] {
  return messages.map(({ role, content }) => {
    if (typeof content === 'string') return { role, content }
    const blocks: Anthropic.ContentBlockParam[] = content
      .filter((b) => b.type !== 'text' || b.text !== '') // empty text blocks are rejected
      .map((b): Anthropic.ContentBlockParam => {
        switch (b.type) {
          case 'text':
            return { type: 'text', text: b.text }
          case 'tool_call':
            return { type: 'tool_use', id: b.id, name: b.name, input: b.input }
          case 'tool_result':
            return {
              type: 'tool_result',
              tool_use_id: b.toolCallId,
              content: b.content,
              is_error: b.isError,
            }
        }
      })
    blocks.sort((a, b) => Number(b.type === 'tool_result') - Number(a.type === 'tool_result'))
    return { role, content: blocks }
  })
}
