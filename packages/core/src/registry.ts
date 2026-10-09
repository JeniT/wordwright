import type { LLMProvider } from './providers/llm'
import type { SearchProvider } from './providers/search'

/** The set of external services the application is wired up with. */
export interface Providers {
  llm: LLMProvider
  search: SearchProvider[]
}
