# Letting people use DeepSeek instead of Claude (research)

Question: how can people who prefer DeepSeek use it with their own key (BYOK) rather than Claude, within our
ports-and-adapters design?

Retrieved **2026-10-24**. Sources are primary only: DeepSeek's API docs (`api-docs.deepseek.com`), DeepSeek's policy
pages on `cdn.deepseek.com`, DeepSeek's pages on Hugging Face, and this repo. Repo facts are cited as `file:line`.

How the pages were read: each web page was fetched through a tool that summarises it, so figures and wording are
the summary's rendering of the page, not a copy of it. Anything marked **UNVERIFIED** I could not confirm from a
primary source. **Before anything ships, the owner or a later session should re-open the pages marked "(re-read)"
and check the figures by eye.** Model names and prices have moved several times this year (see section 1).

## Short answer

- **It is feasible and cheap to start.** DeepSeek serves an Anthropic-compatible endpoint
  (`https://api.deepseek.com/anthropic`) and an OpenAI-compatible one (`https://api.deepseek.com`). Our existing
  `AnthropicProvider` already speaks the first. In principle a DeepSeek adapter is the Anthropic adapter with a different
  `baseURL`, a different model list, and a few documented differences handled (section 4).
- **The hard part is not code, it is data.** DeepSeek's privacy policy says data is stored in the People's Republic
  of China, may be used to train models, and it is unclear whether that policy covers API inputs at all. Our
  [byok.md](../byok.md) advice and the landing-page privacy text are Anthropic-specific and would be wrong for DeepSeek.
  The owner needs to decide whether to offer it, and with what warning (section 3).
- **One real design conflict:** DeepSeek's thinking mode with tools needs the model's reasoning sent back on later
  turns; our port deliberately never stores or replays reasoning. The simplest safe answer is to turn thinking off
  for our chat calls (section 2.4).
- **Recommendation:** Option B in section 5: add a `deepseek` provider as a thin adapter over DeepSeek's
  Anthropic-compatible endpoint, with thinking off, behind an explicit privacy notice, after the owner answers the open
  questions. Do not build an OpenAI-format adapter first.

## 1. The DeepSeek API

| Fact                                                                                                                                                                                                         | Source                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI-format base URL `https://api.deepseek.com`; Anthropic-format `https://api.deepseek.com/anthropic`                                                                                                     | <https://api-docs.deepseek.com/> and <https://api-docs.deepseek.com/quick_start/pricing>                                                 |
| Auth is a bearer API key (`Authorization: Bearer <key>`); the Anthropic route also accepts `x-api-key`                                                                                                       | <https://api-docs.deepseek.com/>, <https://api-docs.deepseek.com/api/deepseek-api>, <https://api-docs.deepseek.com/guides/anthropic_api> |
| `anthropic-version` header is ignored; `anthropic-beta` is ignored for `/messages`                                                                                                                           | <https://api-docs.deepseek.com/guides/anthropic_api>                                                                                     |
| Current models: **`deepseek-flash`** (served by DeepSeek-V4.1-Flash-1017) and **`deepseek-v4-pro`** (DeepSeek-V4-Pro-0813)                                                                                   | <https://api-docs.deepseek.com/quick_start/pricing>                                                                                      |
| `deepseek-v4-flash` and `deepseek-v4-flash-vision-exp` are deprecated names: still accepted, the models they named are retired, and requests are served by V4.1 Flash and billed at Flash price              | <https://api-docs.deepseek.com/>, <https://api-docs.deepseek.com/updates> (entry 2026-09-10)                                             |
| The older `deepseek-chat` and `deepseek-reasoner` names were scheduled for discontinuation on 2026-07-24; the changelog does not say whether that happened                                                   | <https://api-docs.deepseek.com/updates> (entry 2026-04-24). **Not confirmed either way.**                                                |
| Context length 1M tokens, max output 384K, both models                                                                                                                                                       | <https://api-docs.deepseek.com/quick_start/pricing> (the page lists them once for both; the summary read them as shared) (re-read)       |
| Both models: JSON output, tool calls, Responses API, Anthropic API, thinking and non-thinking (thinking is the default). Flash has vision; Pro does not                                                      | same page                                                                                                                                |
| Concurrency limit per account (not per key): 2,500 for flash, 500 for pro; over the limit gives HTTP 429                                                                                                     | <https://api-docs.deepseek.com/quick_start/rate_limit>                                                                                   |
| Anthropic-route model-name mapping: names beginning `claude-opus` go to `deepseek-v4-pro`; `claude-sonnet`, `claude-haiku` and other `claude…` names go to `deepseek-flash`; any other unknown name is a 400 | <https://api-docs.deepseek.com/guides/anthropic_api>                                                                                     |

**Pricing** (USD per 1M tokens; "off-peak / peak"; peak is 01:00-04:00 and 06:00-10:00 UTC Monday-Friday excluding
Chinese public holidays, off-peak is half of peak): <https://api-docs.deepseek.com/quick_start/pricing> (re-read).

| Model           | Input, cache hit | Input, cache miss | Output      |
| --------------- | ---------------- | ----------------- | ----------- |
| deepseek-flash  | 0.003 / 0.006    | 0.15 / 0.3        | 0.6 / 1.2   |
| deepseek-v4-pro | 0.022 / 0.044    | 0.66 / 1.32       | 1.98 / 3.96 |

Peak/off-peak pricing took effect 2026-08-16 and prices were cut on 2026-09-10 (<https://api-docs.deepseek.com/updates>).
Pricing is volatile, so we should not hard-code any figure in the app. We already avoid this: the model list comes from
the provider (section 2.7).

**Balance.** Calls fail with 402 when the balance is empty (section 2.6). The key is prepaid (an account balance, with
"granted" and "topped up" parts, in CNY or USD): <https://api-docs.deepseek.com/api/get-user-balance>. There is no
documented per-key spending limit, which matters because [byok.md](../byok.md) tells people to "set a spending limit".
**UNVERIFIED** whether the platform offers one; the prepaid balance is a natural cap.

## 2. Capability gaps against our LLM port

Our port is `LLMProvider` in `packages/core/src/providers/llm.ts:87-102`: `complete`, `stream`, `chat` (streamed events
`text`, `tool_call`, `done` with a stop reason and usage), and `listModels`. Errors are `LLMAuthError`,
`LLMRateLimitError`, `LLMProviderError` (`llm.ts:108-133`).

### 2.1 Tool calling: supported, with one loss

- Tools are supported on both routes. OpenAI format: `tools` of `type: "function"` with `parameters` JSON Schema, results
  as `role: "tool"` messages with `tool_call_id`; tool-call `arguments` is a JSON string "the model may not always
  generate validly" (<https://api-docs.deepseek.com/api/create-chat-completion>, <https://api-docs.deepseek.com/guides/tool_calls>).
  We already validate tool input with Zod (`llm-tools.ts:4-5` comment), so this is covered, but the adapter should treat
  unparseable arguments as a failed call, not a crash.
- Anthropic route: `tools` with `name`, `description`, `input_schema` are fully supported; `tool_choice` `none/auto/any/tool`
  supported; `disable_parallel_tool_use` ignored (<https://api-docs.deepseek.com/guides/anthropic_api>).
- **Loss:** on the Anthropic route, `tool_result.is_error` is **ignored** (same page). Our `LLMContentBlock` has
  `isError` (`llm.ts:25`) and `AnthropicProvider` sends it (`anthropic.ts:187`). Consequence: the model will not be told a
  tool result was an error unless the result text says so. Fix: when `isError`, the DeepSeek adapter prefixes the content
  (for example "Error: ...").
- OpenAI route: `tool_choice` `required` or a named function returns 400 in thinking mode
  (<https://api-docs.deepseek.com/api/create-chat-completion>). We don't force tool choice today (`anthropic.ts` sends none).
- Tool names: letters, digits, underscores, dashes, up to 128 characters (same page). Ours (`suggest_note`, `update_idea`,
  ...) fit.
- Strict function schemas exist only in a beta at `https://api.deepseek.com/beta`, with restrictions
  (<https://api-docs.deepseek.com/guides/tool_calls>). We don't need it; we validate.
- Parallel tool calls: not documented on the tool-calls guide; the Anthropic route says `disable_parallel_tool_use` is
  ignored. **UNVERIFIED** whether the model emits several calls per turn. Our brainstorm code handles several calls
  per reply (`apps/api/src/services/brainstorm.ts` collects `calls`), so this is safe either way.

### 2.2 Structured / JSON output

- OpenAI route: `response_format: {"type": "json_object"}` yields valid JSON, not schema conformance; the prompt must
  contain the word "json" and an example, or "it may generate whitespace until it hits the token limit"; the API "may
  occasionally return empty content" (<https://api-docs.deepseek.com/guides/json_mode>, create-chat-completion page).
- The Anthropic route lists no equivalent field (<https://api-docs.deepseek.com/guides/anthropic_api>); **UNVERIFIED** whether
  `output_config.format` or any JSON mode works there. Only `effort` is listed as supported in `output_config`.
- **How we use JSON today:** the critique and Rephrase prompts ask for JSON in plain text and the code parses it
  (`apps/api/src/llm-factory.ts:103-140` shows the shapes the fakes return; the real parsing is in the critique and
  rephrase services). We do not use a provider JSON mode, so nothing in the port needs one. Prompts that say "JSON" are
  already compatible with the "include the word json" rule. We should keep parse-and-validate with a clear failure state
  and not depend on `json_object` mode.
- The empty-content caveat means the "an empty reply" state must be handled as an error with a "try again" message. The
  brainstorm service already treats "no text and no calls" as a failure (`brainstorm.ts:494`).

### 2.3 Streaming

Supported on both routes. OpenAI route: server-sent events ending with `data: [DONE]`; `stream_options.include_usage`
puts usage on the last content chunk (<https://api-docs.deepseek.com/api/create-chat-completion>). Anthropic route:
`stream` fully supported. **Keep-alive:** non-streaming requests receive empty lines and streaming requests receive
`: keep-alive` SSE comments while waiting, "parsers must handle these", and the server closes the connection if
inference has not started after 10 minutes (<https://api-docs.deepseek.com/quick_start/rate_limit>). The Anthropic SDK is a
standards-based SSE reader and should ignore comments, but **UNVERIFIED**; the contract suite and a live trial will show.

### 2.4 Reasoning output (`reasoning_content`) - the main design conflict

- Thinking is **on by default** with effort `high` (<https://api-docs.deepseek.com/guides/thinking_mode>). The chain of
  thought comes back as `reasoning_content` (OpenAI route; `delta.reasoning_content` when streaming) next to `content`.
- **With `tools` present, all earlier `reasoning_content` must be sent back on every later request** (including turns with
  no tool call), "omitting it returns a 400 error" (same page).
- Our port says the opposite on purpose: "Reasoning ('thinking') is deliberately not represented: it is never stored or
  replayed" (`llm.ts:19`), and the brainstorm history table stores "our own neutral format (text and tool calls, never
  the model's reasoning), so it replays on any provider" (`apps/api/src/db/database.ts:339-341`). Brainstorm is a
  tool-using multi-turn chat, so it would hit the 400 if thinking were on.
- On the Anthropic route `thinking` blocks are supported and `redacted_thinking` is not (guides/anthropic_api page). Whether
  omitting earlier thinking blocks also gives a 400 there is **UNVERIFIED** (the page doesn't say).
- Choices, in order of preference:
  1. **Turn thinking off** for every call from the adapter: Anthropic route `reasoning: {effort: "none"}` per the thinking
     page (it also says `thinking` is supported there; the exact field for "disabled" on the Anthropic route should be
     checked by a live call: **UNVERIFIED**), OpenAI route `thinking: {type: "disabled"}`. Needs no port change. Cost: less
     careful critique. Also gives lower cost and latency.
  2. Add an opaque `providerState` to assistant content blocks that the adapter fills and replays. This is a port and
     schema change, a database migration, and conflicts with the "neutral format, replays on any provider" rule
     (history started on one provider and continued on another would have meaningless state).
  3. Keep thinking on only for calls without tools (`complete`, `stream`: critique, Rephrase). The doc says earlier
     reasoning is ignored when there are no tools, so this is safe. A reasonable later refinement.
- `effort` mapping: our `LLMEffort` is `low | medium | high` (`llm.ts:40`). DeepSeek accepts `low`, `high`, `max` and maps
  `medium` and `high` to `high`, `minimal` to `low` (thinking-mode page). The Anthropic route supports `output_config.effort`
  (anthropic_api page), so the existing line `anthropic.ts:121` would work unchanged, but it is moot with thinking off.
- Sampling: `temperature`/`top_p` have no effect in thinking mode; in non-thinking mode `temperature` (0-2) applies. We
  send none (`anthropic.ts:106`), so defaults apply (OpenAI route default is 1 per the create-chat-completion page).

### 2.5 Prompt caching

Automatic and on by default, no code changes (<https://api-docs.deepseek.com/guides/kv_cache>). Reported as
`prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` (and `prompt_tokens_details.cached_tokens`) on the OpenAI route.
`cache_control` is **ignored** everywhere on the Anthropic route. We send no `cache_control` today
(`anthropic.ts`), so nothing to remove. For `LLMUsage.cachedInputTokens` (`llm.ts:62-63`), the Anthropic route's usage
shape for cache hits is **UNVERIFIED** (the Anthropic adapter reads `cache_read_input_tokens`, `anthropic.ts:146`);
leaving it undefined is allowed ("where it reports them"). Retention: "usually within a few hours to a few days", no fixed
time; no minimum prefix stated; cache visibility between users not described (kv_cache page). `user_id` is "used to
isolate KVCache for users on your business side for privacy management" and "for content safety handling"
(<https://api-docs.deepseek.com/quick_start/rate_limit>). Do not put personal information in it (same page), so if we
send one it must be an opaque id, not an email or name. Whether to send one at all is an open question.

### 2.6 Errors and rate limits

From <https://api-docs.deepseek.com/quick_start/error_codes>: 400 invalid format, 401 authentication fails (wrong key),
**402 insufficient balance**, 422 invalid parameters, 429 rate limit reached (also concurrency/QPS), 500 server error,
503 server overloaded. The page gives no error-body shape (the Anthropic route presumably returns Anthropic-shaped errors;
**UNVERIFIED**). The rate-limit page documents **no rate-limit response headers**, so no `retry-after` is promised
(<https://api-docs.deepseek.com/quick_start/rate_limit>). The OpenAI create-chat-completion page also lists finish reasons
`stop`, `length`, `content_filter`, `tool_calls`, `insufficient_system_resource`, `aborted`.

Mapping onto our errors (`anthropic-errors.ts:8-27` is the template):

| DeepSeek                              | Our error                                     | Note                                                                                                                                   |
| ------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 401                                   | `LLMAuthError`                                | already handled by 401/403                                                                                                             |
| 402                                   | `LLMAuthError` (its doc says "out of credit") | `llm.ts:104-107` already lists "out of credit"; add 402 to the status check. The message should say "balance" so the person adds funds |
| 429                                   | `LLMRateLimitError`, no `retryAfterSeconds`   | `retry-after` may be absent                                                                                                            |
| 500, 503, others                      | `LLMProviderError`                            |                                                                                                                                        |
| finish `content_filter`               | `done` with `stopReason: 'refusal'`           | a mapping we'd choose; the doc doesn't define it further                                                                               |
| finish `length`                       | `max_tokens`                                  | like `anthropic.ts:159`                                                                                                                |
| finish `insufficient_system_resource` | `LLMProviderError`                            | the server ran out of capacity; retryable                                                                                              |

The error message text in `anthropic-errors.ts` hard-codes "Anthropic"; the DeepSeek adapter needs its own wording
("DeepSeek rejected the API key"), still without echoing request content.

### 2.7 Key validation and model discovery

- `GET /models` lists models; its schema documents `id`, `owned_by`, `name`, `context_window`, `max_output_tokens`,
  `input_modalities`, `effort`, `api_capabilities` (<https://api-docs.deepseek.com/api/list-models>). The page lists **no
  authentication header** for it, and **no deprecation or "latest" field**. So whether an invalid key gets a 401 from
  `/models` is **UNVERIFIED** and must be tested live before we rely on it (our `save` uses `listModels` as the key check,
  `apps/api/src/services/llm.ts:99-109`, and a 200 for any key would silently accept bad keys).
- Our `LLMModelInfo.latest` (`llm.ts:77-81`) needs a lines/dates signal. DeepSeek's list gives none. The model ids
  `deepseek-flash` and `deepseek-v4-pro` are stable aliases to dated versions, so the adapter can mark every returned id as
  `latest: true`. The deprecated aliases (`deepseek-v4-flash...`) should be dropped by id; does `/models` even return them?
  **UNVERIFIED.**
- A fallback key check that spends tokens: `GET /user/balance` (<https://api-docs.deepseek.com/api/get-user-balance>) needs a
  key and returns `is_available` and balances. The doc doesn't say how the balance route authenticates (**UNVERIFIED**),
  but it is the natural free check and would let us say "your balance is empty" before saving. A 1-token completion works
  too, at a trivial cost, and is what [byok.md](../byok.md) describes for the older design.
- Key format: **UNVERIFIED.** The docs I read show no key prefix. I believe DeepSeek keys begin `sk-`, but I could not
  confirm it from a primary source. Do not write a prefix check or placeholder (like our `sk-ant-...`) until someone looks
  at a real key in the platform's API keys page. Validate by calling, not by shape.

### 2.8 Web search for the Research feature

Our researcher (`AnthropicResearchProvider`) uses Anthropic's server-side tool `web_search_20250305`
(`packages/core/src/providers/anthropic-research.ts:45`). DeepSeek's Anthropic route lists `server_tool_use` and
`web_search_tool_result` as supported _content blocks_ (anthropic_api page) but its tool list documents only function tools.
Whether the web-search tool can be _declared_ on that route is **UNVERIFIED**. DeepSeek separately sells a Search API
(`POST https://api.deepseek.com/v1/tools/search`) and Fetch API at $0.75 per 1,000 successful requests, with server-side tool
calls "currently free" through DeepSeek Harness, Claude Code or Codex until 2026-11-01 (<https://api-docs.deepseek.com/guides/search>
(re-read)). That page says nothing about how queries are stored or shared.

Options: (a) research stays unavailable on DeepSeek (button disabled with a plain reason); (b) a
`DeepSeekResearchProvider` that calls the Search API and then asks the model to choose (a second adapter, new code, the
`keepSearched` safety filter still applies); (c) later. Recommended: (a) first. Research is separable
(`ResearchFactory` is its own port, `packages/core/src/registry.ts:10`); the factory today `switch`es on provider
(`apps/api/src/llm-factory.ts:18-24`), and returning "unsupported" for `deepseek` needs a small port tweak
(a `supports` flag or an `UnsupportedResearchProvider` that throws a clear error), because TypeScript's exhaustive
`switch` would otherwise fail to compile.

## 3. Data, privacy and jurisdiction

All from DeepSeek's own policies on `cdn.deepseek.com` (re-read the originals; the fetch summarised them).

**Privacy Policy** (last updated 2026-02-10): <https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html>

- DeepSeek collects, processes and stores personal data in the **People's Republic of China**; data may also sit on
  servers elsewhere, with safeguards "where required".
- Personal data **including inputs may be used to develop and train machine-learning models**; there is an opt-out for
  EEA/UK users and the policy describes a related right for all users (the summary was not precise on the mechanism:
  re-read).
- Retention: for as long as the account exists and longer for legal obligations, legitimate interests or claims.
  **No fixed retention period for inputs/outputs is given.**
- Data may be shared with service providers (including "third-party search APIs that receive your search keywords"),
  corporate group entities, and law enforcement/authorities under legal process.
- **Scope is unclear for us.** The policy covers DeepSeek's apps, websites and software; it says data collected from end
  users of downstream applications built on its open platform is not covered, and those developers are the controllers.
  It "does not explicitly address" direct API input handling (the summary's wording). Which policy governs a BYOK user's
  API calls is **UNVERIFIED** and needs a human (or DeepSeek) to answer.

**Open Platform Terms of Service** (released 2026-04-22, effective 2026-04-29):
<https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html>

- Customers keep rights in their inputs; DeepSeek assigns to them whatever rights it has in outputs; outputs may be used for
  many purposes including training other models.
- The terms I read **do not say DeepSeek will or will not train on API inputs**, and give no retention period or storage
  location; they defer to the Privacy Policy for personal data (section 5.5 as read) and reserve records for suspected
  violations (7.2). This is the opposite of Anthropic's explicit statement that API data is not used for training
  (cited in [byok.md](../byok.md)). **We cannot truthfully tell writers that DeepSeek does not train on their writing.**
- Governed by the laws of mainland China; disputes in a court where Hangzhou DeepSeek Artificial Intelligence Co., Ltd. has
  its registered office.
- Keep the API key confidential and "do not expose it in browser or other client-side code"; the customer is responsible for
  loss from a leaked key. **Our design holds the key server-side, encrypted (AES-256-GCM, bound to the user),
  write-only to the browser** ([byok.md](../byok.md)), which is consistent.
- Brand rule: customers may not use DeepSeek's names or logos without permission, or imply a partnership beyond a
  standard API-provider relationship. **Whether naming "DeepSeek" in our settings screen to say which provider a key is
  for counts as permitted use is UNVERIFIED** and is an open question (section 6). The style guide already names the
  provider "where the provider matters" (`docs/style-guide.md:40`), which is a descriptive use, not a logo.
- Customers must tell end users that outputs are AI-generated and may contain errors, and are responsible for their own
  users' data. Both of those are already in our approach ([responsible-ai.md](../responsible-ai.md) principle 8).

**What this means for our principles.** [responsible-ai.md](../responsible-ai.md) and [byok.md](../byok.md) are built on three
checks that the writer can make of a provider: whether API data is used for training, how long it is kept, and whether a
spending limit can be set. For DeepSeek, the first is "possibly yes, unclear for API", the second "no stated period", the
third "prepaid balance only" (unverified). In a publication with several members, one member's key is used for another's
requests (`Requests in a shared publication run on the requester's key`, byok.md), so a member could send a colleague's
draft text to a provider the colleague did not choose. The existing `SharedThreadNotice.vue` is the place to say which
provider was used. This needs a decision (section 6).

### Other hosts for DeepSeek's open weights

- DeepSeek publishes weights on Hugging Face. For DeepSeek-V4.1-Flash the repository says "This repository and the model
  weights are licensed under the MIT License", the weights are downloadable (safetensors), the model is about 763B
  parameters on the Hub listing with a 1M-token context, it recommends vLLM or SGLang for self-hosting, and it names
  **Novita** as one inference provider ("+3" more not named in what I read)
  (<https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash>; list at <https://huggingface.co/deepseek-ai>). I did not find
  a license shown on the organisation page, only on the model page.
- So an open-weights model served by someone else, or by us or the writer, avoids DeepSeek the company's servers and policy.
  It brings that host's own data terms instead. **I have not read any third-party host's terms**, so I make no claim
  about them. The model is very large, so self-hosting is a serious infrastructure job, not a casual option.
- Practically this means the adapter should allow a configurable **base URL** and model id. Many hosts expose the
  OpenAI-format API; the Anthropic-format route is DeepSeek's own and a third-party host may not offer it
  (**UNVERIFIED**). A base-URL field is a larger product and security change (server-side requests to user-chosen addresses
  need the same SSRF care as our feed reader), so it is separate from this work.

## 4. How it maps onto this codebase

### 4.1 Port changes: few, none required

- `LLMProvider` itself needs **no change**. The reasoning-not-represented rule holds if thinking is off (2.4).
- Optional port tweaks, each a separate decision:
  - `LLM_PROVIDER_IDS` and `DEFAULT_LLM_MODEL` get a `deepseek` entry (`packages/core/src/domain.ts:1619,1627`; the
    steps are in [byok.md](../byok.md)). The default model would be `deepseek-flash` "if offered".
  - Research on providers that cannot search (2.8): a way to say "unsupported" instead of an exhaustive `switch` that throws.
  - The user-facing copy that hard-codes Anthropic: `apps/api/src/services/llm.ts:43-44` (`settings()` returns
    `provider: 'anthropic'` when no key is stored, so a person who prefers DeepSeek still starts on Anthropic: the screen
    needs a provider choice before saving), `:189-192` ("Add your Anthropic API key..."), and
    `apps/api/src/services/research.ts:257` ("...Web search must be switched on for your Anthropic account"). These become
    provider-neutral or provider-named.
  - `LlmSettingsInput` already carries `provider` (`services/llm.ts:99-105`); the settings form hard-codes
    `provider: 'anthropic'` (built output of `LlmSettingsSection.vue`; the source at `apps/web/src/components/LlmSettingsSection.vue`).
- The database stores `provider` as plain `TEXT` in the credentials and message tables (`database.ts:350,406`), so **no
  migration** is needed for a new provider id. (`llm_credentials.provider` is `TEXT NOT NULL` with no `CHECK`, `database.ts:107-114`.)
- The AES key is "bound to the user" (`services/llm.ts:117` uses `context(userId, input.provider)`), so a stored key stays tied
  to its provider.

### 4.2 The adapter (Option B: Anthropic-route)

A `DeepSeekProvider` (name `deepseek`) in `packages/core/src/providers/deepseek.ts`:

- Wraps the existing Anthropic SDK client with `baseURL: 'https://api.deepseek.com/anthropic'`. Reuse as much of
  `AnthropicProvider` as is sensible by sharing the message-conversion helpers rather than subclassing the vendor adapter.
  Keep "no vendor SDK in app code" intact: only the adapter file imports it.
- Differences to handle: thinking off (2.4); `isError` text prefix (2.1); 402 to `LLMAuthError` with a balance message (2.6);
  `listModels` from `GET /models` marking all returned current ids as `latest` and dropping the deprecated aliases (2.7);
  `cachedInputTokens` left unset unless a live call shows the usage field (2.5); `max_tokens` is allowed up to 393,216
  (create-chat-completion page), far above our 8,192 default, so no change.
- **Alternative, Option C:** an OpenAI-format adapter using `fetch` against `https://api.deepseek.com/chat/completions`
  (no SDK). More code (SSE parsing, tool-call assembly, reasoning handling, `[DONE]`), but it covers third-party hosts that
  speak the OpenAI format and uses the interface DeepSeek documents most fully (JSON mode, strict tools, `user_id`, the
  documented `/models` and `/user/balance`).
- **Fake:** `FakeLLMProvider` already exists and `llm-factory.ts:fakeLlmFactory` ignores the provider. `FAKE_LLM=true` needs
  no change, but `evals/src/factory.ts:45,61` passes `provider: 'anthropic'` to the fake: harmless. A `deepseek` fake would
  only be needed to test the error translation, which is done with an injected client as `anthropic.test.ts` does
  (it passes a `client` option, `anthropic.ts:19`). Same pattern: inject a client or `fetch`.
- **Contract suite:** register the adapter with `llmProviderContract('deepseek', ...)` the way the Anthropic tests do
  (`packages/core/src/testing/contracts.ts:13`), with a stubbed client. The contract checks name, complete, stream, abort,
  `listModels` (at least one model, unique ids) and chat (one `done`, declared tools only, tool-result replay)
  (`contracts.ts:17-141`).
- Register in `apps/api/src/llm-factory.ts` (`case 'deepseek'`, `llm-factory.ts:10-16`).
- Dependencies: none new on Option B (the Anthropic SDK is installed); Option C needs none either (platform `fetch`).

### 4.3 Key-format validation

Do not validate by prefix (2.7). Keep the existing approach: call `listModels` and treat `LLMAuthError` as "key rejected"
(`services/llm.ts:174-183`). Check first, by a live call with a real and a bad key, that `/models` rejects bad keys; if it
doesn't, add `GET /user/balance` to the adapter's `listModels` (as the key check) or fall back to a 1-token completion.
The key hint (`elide`, `services/llm.ts:58-60, 203-214`) cuts after the third hyphen, which fits Anthropic's `sk-ant-api03-`
shape; for a key with one hyphen it falls to `…` plus the last four (the "oddly formed" branch), which is acceptable.
Add a test with a DeepSeek-shaped key once the shape is known.

### 4.4 Settings UI wording

Follow `docs/style-guide.md` ("Your AI" in general; the provider name only where it matters: billing, privacy, getting a key,
line 40). Suggested copy, to be checked against the style guide by whoever builds it:

- Field label: "DeepSeek API key" (was "Anthropic API key"); a provider choice (a select or two radio buttons) comes first, labelled
  "Which AI do you use?"
- Billing line: "Your AI uses your own DeepSeek key, so DeepSeek bills you, not us."
- Privacy link text stays "Privacy advice", but its content changes by provider (below).
- Key-refused message stays as in the style guide line 205: "Your AI provider didn't accept your key. Check it in your AI
  key settings."
- A 402 needs its own: "DeepSeek says your balance is empty. Add funds, then try again."
- Research disabled message (if Option a): "Research isn't available with DeepSeek yet." (plain reason, with the next step: no
  action exists, so say so).
- Placeholder: none until the key shape is confirmed (the current `sk-ant-...` must not appear for DeepSeek).
- The help pages `HelpApiKeyView.vue`, `HelpPrivacyView.vue`, `HelpView.vue` and `ProviderPrivacyAdvice.vue`, `HomeView.vue`
  all name Anthropic; each needs a DeepSeek variant (where to get a key: `platform.deepseek.com` is where I believe keys are made,
  **UNVERIFIED** from the pages I read, which say only "the DeepSeek platform").
- **Privacy advice for DeepSeek must not copy the Anthropic text.** It needs to say, plainly: your writing is sent to
  servers in China; DeepSeek's policy says inputs may be used to train its models and it gives no retention period; the
  policy's coverage of API use is unclear; use a key made just for this app; and do not send anything confidential.
  Wording to be written by the owner after answering the questions in section 6. [byok.md](../byok.md) says text with
  Anthropic specifics must be "checked against the provider's current pages before it ships": the same applies here.

### 4.5 Prompts that may behave differently (owner reviews any prompt change)

No prompt file needs to change to make it _run_. What needs checking is how a different model follows them. The files:
`prompts/brainstorm-default.md`, `brainstorm-kickoff.md`, `brainstorm-rules.md`, `critique.md`, `options.md`, `research.md`, and
`tool-*.md` (listed in `prompts/README.md`). Risks, as questions to test rather than facts:

- **Tool use discipline.** The rules (`brainstorm-rules.md`) say every change is a suggestion and tools never change a draft.
  The structural boundaries are enforced in code (`brainstorm-boundaries.test.ts`), so a misbehaving model cannot cross them,
  but it could call tools too often or not stop.
- **Rungs and "that's enough".** The responsible-ai tests (declines to draft, does not claim to be human, holds a fair
  criticism, ends instead of asking another question, short warm reply in distress) are the behaviours most likely to differ.
- **JSON-only replies** for critique and Rephrase (prompts say what shape to return): DeepSeek's JSON mode needs the word
  "json" in the prompt (satisfied if the prompt says so); with thinking off, models sometimes wrap JSON in prose, which the
  parsers must tolerate (they already look for the array/object, as `keepSearched` does for research).
- **Injection resistance** in notes, page titles and descriptions.
- Any change we do make to a prompt for DeepSeek is a change to product behaviour for everyone unless it's provider-specific.
  **Recommendation: no provider-specific prompts.** If a model can't follow the shared prompts, it doesn't ship.

### 4.6 Evals and invariant tests (per [evals.md](../evals.md))

- Contract suite passes (4.2).
- `pnpm eval:adapter -- --provider deepseek --model deepseek-flash` runs the behaviour evals against it, asks for the key
  (hidden), and the summary goes in the issue for the owner (`docs/agents/conventions-api.md`, "External services"). The key
  is `EVAL_API_KEY` or `DEEPSEEK_API_KEY` by the convention in `evals/src/factory.ts:46`. Note a **real key and cost** are needed from
  a human: an agent must not be given one in chat (AGENTS.md, "Keys go into the app's own field").
- **The grader.** `evals/src/options.ts:105-117` defaults the grading model to an Anthropic one (`anthropic:...`) and asks
  for an Anthropic key; running a DeepSeek eval still needs an Anthropic key for grading unless a grader is chosen with
  `--grader`. The grader reads the writer-like text the model produced, so no extra data leaves beyond what the evals send.
- The structural invariant tests are provider-independent and need no change; the "exactly five tools" test stays as is.
- Add: adapter unit tests for error translation (401, 402, 429 with no `retry-after`, 500, 503, abort), `isError`
  prefixing, thinking-off request shape (the request body contains the disabling field and no sampling options), `listModels`
  filtering, and the empty-content case.
- Add a settings e2e and component tests for the provider choice, the 402 message and the privacy text.

## 5. Options and recommendation

| Option                                                                                                     | Effort          | Pros                                                                                                                  | Cons                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Don't add it.** Say why in the help.                                                                  | None            | Avoids sending writing to servers in China and to a provider whose API terms are unclear                              | Excludes people who prefer DeepSeek or can't afford Claude; "flexibility" priority unmet                                                               |
| **B. `deepseek` provider over the Anthropic-compatible route**, thinking off, research off, privacy notice | Small to medium | Reuses the Anthropic code and test pattern; minimal new risk; keeps the neutral message format                        | Depends on DeepSeek keeping the compatibility layer; documented gaps (`is_error`, `cache_control`, no JSON mode field); `/models` key check unverified |
| **C. OpenAI-format adapter** (no SDK), possibly with a configurable base URL                               | Medium to large | Most fully documented route; works with other hosts of open weights; documented `/models`, `/user/balance`, `user_id` | More code to get right (SSE, tool-call assembly, reasoning); a configurable base URL is an SSRF concern                                                |
| **D. Open weights through another host or self-hosting**                                                   | Large           | Avoids DeepSeek the company's servers                                                                                 | The host's terms are unknown to me; heavy infrastructure; base-URL support needed                                                                      |

**Recommendation: Option B**, in this order: (1) the owner answers section 6; (2) write the DeepSeek privacy advice; (3) a
live check of `/models` with a bad key, the thinking-off field on the Anthropic route, and the usage shape (a one-hour spike with a real
key typed by the owner into a scratch run, not into chat); (4) the adapter, contract tests and error tests; (5) provider
choice in settings, help pages and e2e; (6) `eval:adapter` run and summary for the owner; (7) research stays unavailable for DeepSeek.
If the live spike shows the Anthropic route misbehaves (streaming keep-alives, bad key accepted by `/models`, tool use
differences), switch to Option C, since the port and the rest of the work are the same.

## 6. Open questions for the owner

1. **Do we offer a provider whose policy says inputs may train its models and that stores data in China?** If yes, what must the
   screen say, and does the owner want an explicit "I understand" step before the first save? (Writers' drafts are the
   product's most sensitive content.)
2. **Shared publications.** A member's request runs on the _requester's_ key. Should members see which provider will receive
   their text before anything is sent, and should a publication be able to forbid providers (or require one)? Today
   nothing says.
3. **May we name DeepSeek in the interface** (key label, help pages)? The Open Platform terms restrict use of its names and
   logos and implied partnership. I read it as not covering plain descriptive naming, but I'm not a lawyer.
4. **Research (web search):** unavailable on DeepSeek at first, or build the Search API route? (Search is billed at $0.75 per
   1,000 requests after the free period ends on 2026-11-01, and its privacy terms are unstated.)
5. **Thinking off for chat:** is the loss of reasoning acceptable for critique quality? An alternative is thinking on for the
   single-shot calls only (2.4, choice 3).
6. **Third-party hosts / base URL:** wanted now, later, or never? It changes the security work.
7. **Does the Privacy Policy cover API use?** Someone should ask DeepSeek (the API overview page gives `api-service@deepseek.com`
   for support, <https://api-docs.deepseek.com/api/deepseek-api>) and record the answer here.
8. **Spending limits:** if no per-key limit exists, byok.md's advice ("set a spending limit") changes to "top up only what you
   expect to use".
9. **Evals:** who runs `eval:adapter` with a real key, and which grader do they use (the default needs an Anthropic key)?

## What I could not verify (summary)

- Key prefix and the page where keys are created.
- Whether `/models` and `/user/balance` authenticate and reject bad keys, and whether `/models` lists deprecated aliases.
- The exact Anthropic-route field that disables thinking, and whether omitting past thinking blocks gives a 400 there.
- Usage field names for cache hits on the Anthropic route; Anthropic-route error body shape.
- Whether the web-search tool can be declared on the Anthropic route.
- Parallel tool calls; streaming keep-alives with the Anthropic SDK.
- Whether the Privacy Policy governs API input, and DeepSeek's retention period for API data.
- Per-key spending limits; whether the legacy `deepseek-chat`/`deepseek-reasoner` names are still accepted.
- Any third-party host's terms (not read).
