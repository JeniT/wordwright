import type { LLMProvider, LLMRequest } from './llm'

/** Deterministic provider for tests, local development and e2e runs. */
export class FakeLLMProvider implements LLMProvider {
  readonly name = 'fake'
  readonly calls: LLMRequest[] = []

  constructor(private readonly respond: (request: LLMRequest) => string = defaultResponse) {}

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
}

function defaultResponse(request: LLMRequest): string {
  const last = request.messages.at(-1)?.content ?? ''
  return `Fake response to: ${last.slice(0, 80)}`
}
