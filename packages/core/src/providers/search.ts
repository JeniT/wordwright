export interface SearchResult {
  title: string
  url: string
  snippet: string
  source: string
  publishedAt?: string
}

/**
 * Port for web / news / scholarly search. Add one adapter per service
 * (Crossref, OpenAlex, a news API, ...) and register it by name.
 */
export interface SearchProvider {
  readonly name: string
  search(query: string, options?: { limit?: number; signal?: AbortSignal }): Promise<SearchResult[]>
}

export class FakeSearchProvider implements SearchProvider {
  readonly name = 'fake'

  constructor(private readonly results: SearchResult[] = []) {}

  async search(query: string, options?: { limit?: number }): Promise<SearchResult[]> {
    const matching = this.results.filter((r) =>
      `${r.title} ${r.snippet}`.toLowerCase().includes(query.toLowerCase()),
    )
    return matching.slice(0, options?.limit ?? 10)
  }
}
