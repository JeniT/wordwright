# Research is its own tool, and the AI adds to the articles only what a person ticks (T38)

The research assistant's job is to put things in the articles, not to write notes (this replaces the
reading-list part of T7). **Assistance-ladder rung:** none of 3–5. It points at pages for the writer to read and
originates no text they could publish; the closest rungs are 1–2. Evidence is one of the things
[responsible-ai.md](../../responsible-ai.md) says to protect, so the writer chooses the areas to look into (they write
them first), the AI only suggests, and a person decides on every page. The design was settled with the owner after
a first version built research into the brainstorm conversation was set aside.

- **Separate from brainstorming, one prompt.** A **Research** button on the idea page opens
  `/p/:publication/ideas/:idea/research`, which lists the idea's earlier research and takes a new request: one text box,
  _the areas to research_, however early the idea is (it may have no notes yet). The app writes the rest of the
  prompt (`prompts/research.md`). There is no dialogue, and any number of requests can be made for one idea, on
  different topics. Each is saved as a **run** (`idea_research`, with its pages in `idea_research_items`), shared with
  the publication's members, and can be deleted (pages already added stay in the articles).
- **A range of perspectives, unlabelled.** The prompt tells the researcher to look for sources that support the
  direction the writer seems to be taking _and_ ones that challenge or complicate it, best effort. It must not say
  which is which: a label could change how the writer reads the source, and they might not take a page seriously that
  they expect to disagree with. The eval `research-includes-other-points-of-view` checks both parts.
- **Review before anything is added: one click each.** A run is a list; each page has **Add** and **Ignore**, and
  nothing joins the articles otherwise. (There are no checkboxes or bulk buttons: the owner preferred deciding
  page by page.) A decided page collapses to its title with a green tick (added) or a red cross (ignored) and a
  **Reconsider** button, which puts it back to undecided and expands it again. Reconsidering an _added_ page also
  **removes it from the articles** (the research item remembers the list item it made, `idea_research_items.link_id`;
  if the writer already removed it there is nothing more to do). Notes taken from the item stay, as when any item is
  removed, but lose their link to it. A page that can't be added can still be ignored. Adding refuses, with the reason,
  a page that doesn't exist, is already listed, or would overflow the list. Added items are marked `research`
  ("Found by research").
- **The AI's reason is kept.** Each page has a reason from the researcher, shown as "Why the AI suggests it
  (unchecked)". When a page is added, the reason is stored with the reading-list item (`idea_links.why`) and shown there
  with the same label, so it can't pass for the writer's own note. Revisit after testing: the owner wants to see how
  this works in use.
- **Search is a port.** `ResearchProvider.find()` takes the app's instructions and a brief and returns
  `{url, title, why}`. The Anthropic adapter (`AnthropicResearchProvider`) uses the provider's web search tool and
  keeps only addresses that appeared in a search result, titled as the result titled them, so an address from the
  model's memory can never come back; the contract suite tests that for every adapter, with `FakeResearchProvider` for
  tests, development and e2e. No route imports a vendor SDK. Web search must be switched on for the writer's Anthropic
  account; if it isn't, the error says so.
- **Every address is checked on the server** (`ReadingChecker`): a plausible http(s) address (the rule for a typed
  link), not already on the list (however `http`/`www.`/`#fragment`/trailing slash differ), not a repeat; then the
  SSRF-safe page fetcher that titles typed links looks at it. The page shows its real title beside the search's, any
  author the page names, and flags `no-title` (allowed, with a warning, listed under the search's title),
  `not-found` and `not-public` (can't be added: the checkbox is disabled and the API refuses). The result is stored
  and not repeated on add (another request to someone's server); the list of articles is looked at again then, in case the
  writer added the page themselves or it filled up.
- **The coach may add only what the writer gave it.** The coach keeps a fourth tool, `suggest_reading` (a proposal, accepted
  or dismissed like its others), but the server discards any address the writer did not write in that conversation
  (`addressesWrittenBy`), so the coach's memory can never reach the list. If asked to research or find sources it
  declines and points to the Research tool (prompt-level; eval `declines-to-do-research-and-points-to-the-tool`). An
  accepted suggestion is marked `brainstorm`.
- **Cost, not caps.** There is no limit on how much research an idea can have. A light throttle of 10 searches an hour
  per person remains because each search spends the writer's own money and makes the server look at several sites; a
  failed search stores nothing.
- **What leaves the system.** To the writer's own provider (which does the searching): the areas, the idea's title and
  notes, and the addresses already in the articles (so they aren't repeated). Never a draft's text (tested). The
  page says so beside the form.
- **Migration.** `idea_proposals` was rebuilt to allow the new tool and hold the address check (a CHECK can't be
  widened in place; nothing refers to the table); new tables `idea_research` and `idea_research_items`; `idea_links`
  gained `why`.
- **Prompts changed (for the owner to review):** `prompts/research.md` and `prompts/tool-suggest-reading.md` (new),
  `prompts/brainstorm-rules.md` (fourth tool; only addresses the writer gave; point to Research).
- **Not done:** re-fetching on add; the friction before citing an unread AI-found page is T34, unchanged; a
  publication-level articles (T37); idea generation (T6) can reuse the item list with its own origin.
