export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMRequest {
  /** Instructions that frame the task (e.g. "you are a critical editor"). */
  system?: string
  messages: LLMMessage[]
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * Port for any text-generation service. Implementations live in adapters
 * (see ./anthropic.ts, ./fake-llm.ts); application code depends only on this.
 */
export interface LLMProvider {
  readonly name: string
  complete(request: LLMRequest): Promise<string>
  /** Yields text chunks as they are generated. Concatenated, they equal `complete()`. */
  stream(request: LLMRequest): AsyncIterable<string>
}
