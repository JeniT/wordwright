import type {
  LLMChatEvent,
  LLMChatRequest,
  LLMModelInfo,
  LLMProvider,
  LLMRequest,
  LLMStopReason,
  LLMUsage,
} from './llm'

/** What the fake's `chat()` should say next. Throw from the function to simulate a failure. */
export interface FakeChatReply {
  text?: string
  /** Tool calls the model "makes" after its text. Ignored if `stopReason` is `max_tokens`, as in real life. */
  toolCalls?: { name: string; input: unknown }[]
  /** Defaults to `tool_use` when there are tool calls, else `end`. */
  stopReason?: LLMStopReason
  usage?: Partial<LLMUsage>
}

export type FakeChatResponder = (
  request: LLMChatRequest,
  /** 1 for the first `chat()` call, then 2, ... */
  callNumber: number,
) => FakeChatReply | Promise<FakeChatReply>

/** What the fake offers by default: three models, as a real account might see. */
export const FAKE_LLM_MODELS: LLMModelInfo[] = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
]

/** Deterministic provider for tests, local development and e2e runs. */
export class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake'
  readonly calls: LLMRequest[] = []
  readonly chatCalls: LLMChatRequest[] = []
  private toolCallCount = 0

  constructor(
    private readonly respond: (request: LLMRequest) => string = defaultResponse,
    private readonly respondChat: FakeChatResponder = defaultChatReply,
    private readonly models: LLMModelInfo[] | (() => LLMModelInfo[]) = FAKE_LLM_MODELS,
  ) {}

  async listModels(signal?: AbortSignal): Promise<LLMModelInfo[]> {
    signal?.throwIfAborted()
    return typeof this.models === 'function' ? this.models() : this.models
  }

  async complete(request: LLMRequest): Promise<string> {
    this.calls.push(request)
    request.signal?.throwIfAborted()
    return this.respond(request)
  }

  async *stream(request: LLMRequest): AsyncIterable<string> {
    const text = await this.complete(request)
    for (const word of text.match(/\S+\s*/g) ?? []) {
      request.signal?.throwIfAborted()
      yield word
    }
  }

  async *chat(request: LLMChatRequest): AsyncIterable<LLMChatEvent> {
    this.chatCalls.push(request)
    request.signal?.throwIfAborted()
    const reply = await this.respondChat(request, this.chatCalls.length)
    const text = reply.text ?? ''
    for (const word of text.match(/\S+\s*/g) ?? []) {
      request.signal?.throwIfAborted()
      yield { type: 'text', text: word }
    }
    const stopReason = reply.stopReason ?? (reply.toolCalls?.length ? 'tool_use' : 'end')
    if (stopReason !== 'max_tokens') {
      for (const call of reply.toolCalls ?? []) {
        request.signal?.throwIfAborted()
        yield { type: 'tool_call', id: `fake-call-${++this.toolCallCount}`, ...call }
      }
    }
    yield {
      type: 'done',
      stopReason,
      usage: {
        inputTokens: Math.ceil(JSON.stringify([request.system, request.messages]).length / 4),
        outputTokens: Math.ceil(text.length / 4),
        ...reply.usage,
      },
    }
  }
}

function defaultResponse(request: LLMRequest): string {
  const last = request.messages.at(-1)?.content ?? ''
  return `Fake response to: ${last.slice(0, 80)}`
}

function defaultChatReply(request: LLMChatRequest): FakeChatReply {
  const last = request.messages.at(-1)?.content ?? ''
  const text =
    typeof last === 'string'
      ? last
      : last.map((block) => (block.type === 'text' ? block.text : '')).join('')
  return { text: `Fake reply to: ${text.slice(0, 80)}` }
}
