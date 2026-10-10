/** One page a research call found, taken from the search results (never from the model's memory). */
export interface ResearchFinding {
  /** An address that appeared in the search results. */
  url: string
  /** The page's title as the search results gave it. */
  title: string
  /** The model's one-line reason this page is worth reading. The model's claim, not a fact: unverified. */
  why: string
}

export interface ResearchRequest {
  /** What the researcher is asked to be, and the rules it follows (the app's own prompt). */
  system: string
  /** What to look for: the idea, the writer's focus and what is already on their reading list. */
  brief: string
  /** The most pages to return. */
  maxResults: number
  signal?: AbortSignal
}

/**
 * Port for a model that can search the web and report what it found. Unlike `LLMProvider.chat`, whose
 * addresses can only come from the model's memory, every address returned here must have appeared in a
 * search result, which adapters enforce. It still needs checking: a result can be dead, or not what it says.
 * Failures are the `LLMAuthError` / `LLMRateLimitError` / `LLMProviderError` of `./llm`; finding nothing is `[]`.
 */
export interface ResearchProvider {
  readonly name: string
  find(request: ResearchRequest): Promise<ResearchFinding[]>
}

/**
 * Deterministic stand-in for tests, development and e2e runs. Pass the findings to return (or a function of
 * the request); by default it finds three pages: one fine, one with no readable title, one that doesn't
 * exist, so the checks that follow can be tried without a real search.
 */
export class FakeResearchProvider implements ResearchProvider {
  readonly name = 'fake'
  readonly requests: ResearchRequest[] = []

  constructor(
    private readonly findings:
      | ResearchFinding[]
      | ((
          request: ResearchRequest,
        ) => ResearchFinding[] | Promise<ResearchFinding[]>) = defaultFindings,
  ) {}

  async find(request: ResearchRequest): Promise<ResearchFinding[]> {
    this.requests.push(request)
    request.signal?.throwIfAborted()
    const found = typeof this.findings === 'function' ? await this.findings(request) : this.findings
    return found.slice(0, request.maxResults)
  }
}

const defaultFindings: ResearchFinding[] = [
  {
    url: 'https://research.example.org/meander-study',
    title: 'A field study of river meanders',
    why: 'Measures how quickly bends migrate, which bears on your claim.',
  },
  {
    url: 'https://research.example.org/untitled',
    title: 'Notes on channel migration',
    why: 'Looks at the same question from an engineering viewpoint.',
  },
  {
    url: 'https://nonexistent.example.org/old-report',
    title: 'A report that has moved',
    why: 'Said to cover the history of the topic.',
  },
]
