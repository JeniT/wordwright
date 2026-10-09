import type { LLMConfig } from './domain'
import type { LLMProvider } from './providers/llm'
import type { SearchProvider } from './providers/search'

/** Builds an LLM client from a user's own credentials. */
export type LLMFactory = (config: LLMConfig) => LLMProvider

/**
 * The external services the application is wired up with. LLMs are not here: they are
 * created per request from the signed-in user's own API key (see `LLMFactory`).
 */
export interface Providers {
  search: SearchProvider[]
}
