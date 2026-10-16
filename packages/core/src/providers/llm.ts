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

// ---- Conversations with tools ------------------------------------------
// `chat()` is for multi-turn conversations in which the model may ask for something to be done (a
// "tool call"). The types are ours, not any vendor's, so another provider can be added without
// touching the code that uses them.

/** One piece of a message. Reasoning ("thinking") is deliberately not represented: it is never stored or replayed. */
export type LLMContentBlock =
  | { type: 'text'; text: string }
  /** The model asking for a tool to be used. `id` pairs it with the `tool_result` that answers it. */
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  /** Our answer to a `tool_call`. Must be in the user message right after the one containing the call. */
  | { type: 'tool_result'; toolCallId: string; content: string; isError?: boolean }

export interface LLMChatMessage {
  role: 'user' | 'assistant'
  content: string | LLMContentBlock[]
}

/** A tool the model may call. `inputSchema` is a JSON Schema object; build it from Zod with `llmTool`. */
export interface LLMTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/** How hard the model should think; trades quality for speed and cost. Adapters map it, or ignore it. */
export type LLMEffort = 'low' | 'medium' | 'high'

export interface LLMChatRequest {
  /** Instructions that frame the whole conversation. */
  system?: string
  /** Starts with a user message. The model's reply continues from the last one. */
  messages: LLMChatMessage[]
  tools?: LLMTool[]
  effort?: LLMEffort
  maxTokens?: number
  signal?: AbortSignal
}

/**
 * Why the model stopped. `max_tokens` means the reply was cut short (any tool call in it is not
 * reported, since its input may be incomplete); `refusal` means the provider declined to answer.
 */
export type LLMStopReason = 'end' | 'max_tokens' | 'tool_use' | 'refusal'

export interface LLMUsage {
  inputTokens: number
  outputTokens: number
  /** Input tokens served from the provider's cache, where it reports them. */
  cachedInputTokens?: number
}

/** What `chat()` yields, in order: any number of `text` and `tool_call` events, then exactly one `done`. */
export type LLMChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'done'; stopReason: LLMStopReason; usage: LLMUsage }

/** A model the provider offers this key. `label` is the provider's own name for it. */
export interface LLMModelInfo {
  id: string
  label: string
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
  /**
   * A streamed turn of a conversation. Rejects with `LLMAuthError`, `LLMRateLimitError` or
   * `LLMProviderError` when the provider can't answer; aborting `request.signal` rejects too.
   */
  chat(request: LLMChatRequest): AsyncIterable<LLMChatEvent>
  /**
   * The models these credentials can use, newest first as the provider orders them. Costs no tokens, so it also
   * checks the key. Rejects with `LLMAuthError` or `LLMProviderError`, like the calls above.
   */
  listModels(signal?: AbortSignal): Promise<LLMModelInfo[]>
}

/**
 * The provider refused the user's credentials (revoked, mistyped, out of credit, no access to
 * the model). Adapters translate their SDK's errors into this so callers can tell the user.
 */
export class LLMAuthError extends Error {
  constructor(message = 'The provider rejected the API key') {
    super(message)
    this.name = 'LLMAuthError'
  }
}

/** The provider is limiting how fast this key may be used. Trying again shortly may work. */
export class LLMRateLimitError extends Error {
  constructor(
    message = 'The provider is limiting requests for this key',
    /** How long the provider asked us to wait, when it said. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message)
    this.name = 'LLMRateLimitError'
  }
}

/** The provider failed or couldn't be reached (an outage, a timeout, an unexpected error). */
export class LLMProviderError extends Error {
  constructor(message = 'The provider could not complete the request', options?: ErrorOptions) {
    super(message, options)
    this.name = 'LLMProviderError'
  }
}
