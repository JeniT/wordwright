import { AnthropicProvider, FakeLLMProvider, type LLMFactory } from '@lfwa/core'

/** Builds a real client from a user's own credentials. */
export const realLlmFactory: LLMFactory = ({ provider, apiKey, model }) => {
  switch (provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey, model })
  }
}

/** For local development and e2e tests: no network, accepts any key. */
export const fakeLlmFactory: LLMFactory = () => new FakeLLMProvider()
