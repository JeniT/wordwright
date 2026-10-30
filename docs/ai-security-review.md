# AI-specific security review (#318)

Read this when you change a fetcher, a prompt's inputs, key handling, or how AI output is shown. It records what was
checked on 2026-10-25, what was found and what stands. The general review is #317; this one covers what a general
review misses.

## Summary

No path was found by which text the AI reads can make it act: its tools only make suggestions, and nothing it
proposes is applied without a person pressing a button. Keys are encrypted, bound to the user, never returned and
never logged. One real weakness was found and fixed: the server had two copies of its "is this address public?" check,
and the one guarding feed and icon fetching was the weaker.

| #   | Finding                                                                                                                                 | Severity | Status                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------- |
| 1   | Feed and icon fetcher used a weaker public-address check than the page fetcher (6to4, Teredo, documentation ranges, `100::/64` allowed) | Low–Med  | Fixed, tested           |
| 2   | Neither check refused `fec0::/10`, `::/96` or `64:ff9b:1::/48`                                                                          | Low      | Fixed, tested           |
| 3   | Nothing pinned that comments (reviewers', the AI's own earlier points) never reach an AI call                                           | Info     | Invariant test added    |
| 4   | The two fetchers still each carry their own request, redirect and size-limit code                                                       | Info     | Follow-up: #399         |
| 5   | Key rotation tooling does not exist                                                                                                     | Known    | Already tracked in #169 |

## Prompt injection

**Inputs the AI reads** (all untrusted): idea title and notes (including quotations from other sites), saved links'
titles (read from other sites), the publication description, the draft in Critique and Rephrase, the writer's
messages, search results in Research.

- Every block of untrusted text is escaped (`escapeTags`, `escape`) so it cannot close or imitate the tag it sits in,
  and each prompt says to treat the material as data (`prompts/brainstorm-rules.md`, `research.md`, `critique.md`).
  Critique sends the draft unfenced, but it is the requester's own text and the reply is constrained (below).
- **What an injection can reach:** the tools are `suggest_note`, `update_idea`, `create_idea`, `suggest_reading` and
  `name_conversation`. The first four produce a _proposal_ that a person accepts, edits or dismisses
  (`BrainstormService.decide`); staleness is checked. `name_conversation` sets a label, validated by Zod. No tool
  reads data, fetches a page, edits a note or touches a draft. Tool input is validated against its Zod schema before
  it is stored. The AI cannot be made to exfiltrate: it has no outbound channel, and its Markdown cannot load images.
- **Critique output** is parsed as JSON, points about blocks that were not sent are dropped, and the count is capped
  (`parseCritique`). Research may only report pages, and each is fetched through `SafeReader` before the writer sees it.
- **Shared publications:** a member's notes are in the snapshot another member's AI reads. The worst an injection
  there can do is skew the wording of a reply or a proposal that the second member must still accept. Accepted.
- **Page bodies never reach the AI**; only titles do (in the snapshot, escaped). Draft text reaches it only in Critique and
  Rephrase, and only as the requester's own text.
- **Comments never reach the AI**, by design (`docs/ai-features.md`). Nothing in the AI services reads comments;
  `critique.test.ts` now fails if a comment or the AI's earlier point appears in a later Critique request; the other
  services have no code path to comments.
- Boundary evals for injection in notes, page titles, sample posts and the publication description already exist
  (`docs/evals.md`, `evals/src/cases.ts`); no behavioural change was needed.

## SSRF and resource abuse

Three places make the server fetch a user-supplied address: `SafeReader` (page titles for links, suggested reading,
research results), `HttpFeedFetcher` (feeds, feed pages, icons) and the fixed OIDC endpoints (not user-supplied).

- Both fetchers check each resolved address **inside the connection's own DNS lookup**, so rebinding after a check
  does not work; check IP-literal hosts directly (the lookup is skipped for them); follow redirects by hand, checking
  every hop; send no cookies or credentials; turn compression off so size limits are real; and cap time, bytes and
  redirects. `SafeReader` also reads only ports 80 and 443. Only `http:` and `https:` are followed.
- IPv4 written as a decimal or hex number is normalised by `URL` to dotted form before the check; IPv4-mapped IPv6 in
  either spelling is refused for private targets.
- Per-user limiters cover adding links, feed reads and site icons; a reply checks at most three suggested addresses,
  and a research run at most `MAX_RESEARCH_RESULTS`.
- Icons are identified by their bytes and limited to raster types, so a hostile server cannot make us serve script.
- **Fixed (1, 2):** there were two `isPublicAddress` implementations. Now there is one, `pages/addresses.ts`, used by
  both fetchers, with `fec0::/10`, `::/96` and `64:ff9b:1::/48` added to its list. Tests: `pages/addresses.test.ts`
  and the strict-fetcher case in `feeds/feeds.test.ts`.
- **By design:** the feed reader says "private network" when an address resolves to one, which tells a person whether
  a name resolves privately. It is a hint about DNS, not about the network's contents, and the message is the useful
  one for someone who pasted the wrong address.

## Bring your own key

- Stored with AES-256-GCM, bound to `llm-key:<user>:<provider>` so a copied ciphertext fails (tested). The hint is
  derived on request. Keys are accepted by `PUT /api/llm` and never returned (tested, including error responses).
- `LlmKeyService.resolve` has no fallback: a user with no key gets `not_configured`, never another user's or a
  server key; in a shared publication the requester's key pays (tested).
- The app has no setting for an adapter's base URL, so a key goes to the provider's own host. The Anthropic SDK does read
  `ANTHROPIC_BASE_URL` from the server's environment, so only whoever operates the server can redirect it.
- Logs: unexpected errors go through `describeError`, which never includes a message (a client error can carry request
  headers, i.e. the key). The LLM routes log only the error's name. The remaining log lines are startup messages, the
  SMTP check (its message holds no AI key) and, in development only, `ConsoleMailer`, which prints email bodies
  including reset links.
- Saving and listing are throttled so the endpoint is not a key-checking oracle.
- `KEY_ENCRYPTION_SECRET` has no rotation tooling yet: #169.

## Output handling

`renderMarkdown` (the only `v-html` of user or AI text) has `html: false`, strips images to alt text, allows only
`http(s):`, `mailto:` and `#` links, and opens external links with `noopener noreferrer` (tested with script, `onerror`,
`javascript:` and `data:`). The Content-Security-Policy from #317 is a second layer. Everywhere else the AI's text
is rendered by Vue's escaping.

## Not covered

Provider-side behaviour (what Anthropic does with prompts), and the privacy notice, which belong to #320 and #324.
