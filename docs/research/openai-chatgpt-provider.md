# Can people who prefer ChatGPT (OpenAI) use that instead of Claude? (research for a second LLM provider)

Question: how can we let people who prefer ChatGPT use OpenAI rather than Anthropic in Wordwright, a bring-your-own-key
writing app where only Anthropic is supported today?

Researched 24 Oct 2026 from **primary sources only**: OpenAI's developer docs, API reference, help centre, the official
`openai-node` README, and the docs of two third-party gateways for the section on them. Every claim below has its
source next to it. Several `openai.com` and `help.openai.com` pages answered 403 to our fetch tool; where a claim
rests on a search-result summary of such a page rather than the page itself, it is marked **unverified**. Pages move
fast here (the API docs moved from `platform.openai.com` to `developers.openai.com/api/docs` while I worked), and the
model names below are as the docs showed them on the retrieval date. Retrieved 2026-10-24.

## Short answer

1. **Support OpenAI through an API key, as we do for Anthropic.** It fits the existing bring-your-own-key design: a
   `LLM_PROVIDER_IDS` entry, one adapter against the **Responses API**, and one eval run. Nothing in the port forces a
   redesign, but three things need a decision first (section 4): reasoning items in tool conversations, a token budget
   that reasoning can use up, and model discovery with no "line" field.
2. **A ChatGPT Plus or Pro subscription is not an API key.** The two are billed separately (see 1.1), so a writer who
   only pays for ChatGPT will have to create an OpenAI Platform account and add credit. We should say so plainly.
3. **There is now an official route for using a ChatGPT plan in third-party apps ("Sign in with ChatGPT"), but it is
   not open to us today.** It is limited to selected commercial partners, and its plan-usage half is documented for
   open-source and locally hosted apps, with a loopback redirect URI (see 1.2). A hosted web app would have to apply
   through OpenAI's interest form. We should not copy tokens out of Codex or ChatGPT sessions: no primary source I
   found permits it.
4. **A generic "OpenAI-compatible base URL" option is possible but unwise as a first step** (section 5): it makes
   the privacy advice impossible to write and the behaviour impossible to promise.

## 1. ChatGPT subscription vs API key

### 1.1 They are separate products with separate billing

- OpenAI's own help centre has an article titled "Managing billing for ChatGPT and the API platform", which a search
  returned with a summary saying the two have separate billing systems and that a Plus subscription does not cover API
  usage. [Help article](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform).
  **Unverified**: the page itself returned 403, so I have only the search-result summary.
- The Codex authentication page says the same from the other side: signing in with an API key is "billed at standard
  API rates through your Platform account, not against included ChatGPT plan credits", and for general OpenAI API calls
  it tells you to use Platform API keys.
  [Codex authentication](https://learn.chatgpt.com/docs/auth) (the old address
  `developers.openai.com/codex/auth` redirects there with a 308).
- The API itself has its own usage tiers keyed to credit purchases: the Free tier needs an allowed geography; Build
  needs $5 in total credit purchases.
  [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits).

So the plain advice to a writer is: **a ChatGPT subscription does not give you an API key.** You create an account on
the OpenAI Platform, add credit, and create a key there.

### 1.2 "Sign in with ChatGPT" (SIWC): official, but gated

OpenAI now documents an OAuth route for using a ChatGPT plan in other apps:

- **What it is.** Two separable things: identity sign-in, and optional "ChatGPT plan usage", where an eligible user
  authorises an app to spend their plan on AI requests.
  [Quickstart](https://developers.openai.com/siwc/quickstart),
  [partner page](https://learn.chatgpt.com/docs/sign-in-with-chatgpt).
- **Who may offer it.** "Sign in with ChatGPT is currently available to selected commercial partners through a limited
  trial", while "ChatGPT plan usage is available to all open-source partners and selected private clients."
  [Quickstart](https://developers.openai.com/siwc/quickstart). The client-ID page says it is "currently offered to a
  select group of commercial partners" and points to an interest form.
  [Request a client ID](https://developers.openai.com/siwc/request-client-id.md).
- **Who may use it.** The developer quickstart says eligible Plus and Pro subscribers.
  [Quickstart](https://developers.openai.com/siwc/quickstart). A search summary of the help centre said Go, Plus and
  Pro for commercial apps ([help article](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)).
  **Unverified**: that page returned 403 and the two sources differ.
- **Aimed at local apps.** The plan-usage docs target "open-source and locally hosted apps"; "for paid or remotely
  hosted apps" they say to complete an interest form and do not say whether such apps may use it.
  [Overview](https://developers.openai.com/siwc/token-sharing-open-source). The sign-in flow requires an HTTP loopback
  `redirect_uri` on `127.0.0.1` (not `localhost`), the client is a public client with no secret, and each "host"
  needs its own opaque `ext_agent_host_id`.
  [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). A hosted
  multi-user server is not what that describes; the self-hosted VM page covers one user's single VM and does not say
  whether multi-user hosted services are allowed.
  [Self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms.md).
- **What it gives.** Scopes `offline_access resource.invoke chatgpt.tokens.use.direct`; the grant "does not grant
  access to their ChatGPT conversations or other account context", nor to the user's API key. The app must check the
  granted scopes include `chatgpt.tokens.use.direct`.
  [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
  [Quickstart](https://developers.openai.com/siwc/quickstart). The user sees usage against their plan, can set a
  weekly cap per app and can disconnect the app in ChatGPT settings.
  [Partner page](https://learn.chatgpt.com/docs/sign-in-with-chatgpt).
- **Technical limits in the preview.** Requests must use `store: false` and `stream: true`; `temperature`, `top_p`,
  `max_output_tokens`, `metadata` and `user` (among others) are not accepted; system-role messages are rejected (use
  `instructions`); function and custom tools work; web search is "subject to model and account/workspace policy";
  file search, Code Interpreter, hosted MCP and image generation do not; the page does not cover structured outputs
  or rate limits. [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md).
  Only the public Responses API at `api.openai.com/v1` is supported: "Don't point requests at ChatGPT `backend-api`
  endpoints." Usage-limit failures arrive as `response.failed` with codes such as
  `subscription_sharing_usage_limit_exceeded`.
  [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md).

### 1.3 What is and is not permitted

| Action                                                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A writer pastes an **OpenAI Platform API key** into Wordwright                                            | Normal API use. The docs expect it: send it as a Bearer token. [Text guide](https://developers.openai.com/api/docs/guides/text)                                                                                                                                                                                                                                                                                       |
| A writer connects Wordwright through **Sign in with ChatGPT**                                             | Only for apps OpenAI has onboarded. Not available to us unless OpenAI accepts an application; open question for the owner. [Quickstart](https://developers.openai.com/siwc/quickstart)                                                                                                                                                                                                                                |
| Wordwright takes a writer's **Codex `auth.json` or ChatGPT session tokens** and uses them from our server | I found no primary source that permits it. Codex says to "Treat `~/.codex/auth.json` like a password" and describes sharing it only as a headless fallback for the person's own machines. [Codex authentication](https://learn.chatgpt.com/docs/auth). Treat as **not permitted**.                                                                                                                                    |
| Calling ChatGPT's private `backend-api` endpoints                                                         | The plan-usage docs say not to. [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md)                                                                                                                                                                                                                                                                          |
| What OpenAI's consumer **Terms of Use** say about automated access and sharing credentials                | A search summary of the consumer terms says they list automatic or programmatic extraction of data or output, and sharing login details or letting others use an account, among prohibited conduct. **Unverified**: `openai.com/policies/*` returned 403 to us. [Search result for the terms](https://openai.com/en-GB/policies/row-terms-of-use/). Read the terms directly, or ask a lawyer, before relying on this. |

I am not a lawyer. The safe reading is: the API key is permitted, SIWC is permitted only through OpenAI's programme,
and nothing else that uses a person's ChatGPT login from our server should be built.

## 2. Which OpenAI API to target

**Target the Responses API.**

- OpenAI's migration guide: "Responses is recommended for all new projects." Chat Completions "remains supported" and
  no end date is given. [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses). The
  official Node SDK calls Responses "the primary API" and Chat Completions "supported indefinitely".
  [openai-node README](https://github.com/openai/openai-node/blob/master/README.md).
- Chat Completions cannot use OpenAI's hosted tools, and the migration guide says that from GPT-5.4 on, tool calling
  with `reasoning_effort` other than `none` isn't supported there. The Responses web-search tool is also Responses-only
  (Chat Completions has only search-specific models).
  [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses),
  [Web search](https://developers.openai.com/api/docs/guides/tools-web-search). We need both tools and reasoning, so
  Chat Completions would be a dead end.

| Need                                | Anthropic today                                                                                                                            | OpenAI Responses API                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-shot text (`complete`/`stream`) | `messages.create` / `messages.stream`                                                                                                      | `responses.create` with `input` and `instructions`; text via `output_text` or the `output` array. [Text guide](https://developers.openai.com/api/docs/guides/text)                                                                                                                                                                                                                                                          |
| Streaming                           | `content_block_delta`                                                                                                                      | `stream: true` gives typed events; `response.output_text.delta` carries text, `response.completed` ends it, `error` reports errors. [Streaming](https://developers.openai.com/api/docs/guides/streaming-responses)                                                                                                                                                                                                          |
| Tools                               | `tools[].input_schema`, `tool_use` blocks                                                                                                  | `tools[]` of `{type: "function", name, description, parameters, strict}`; calls arrive as `function_call` items with `call_id` and `arguments` as a **JSON string**; results go back as `function_call_output` with the same `call_id`; `parallel_tool_calls` and `tool_choice` exist. [Function calling](https://developers.openai.com/api/docs/guides/function-calling)                                                   |
| Strict schemas                      | none                                                                                                                                       | With `strict: true` every property must be in `required` and objects need `additionalProperties: false`; Responses tries strict and falls back to non-strict if the schema doesn't fit. [Function calling](https://developers.openai.com/api/docs/guides/function-calling)                                                                                                                                                  |
| Structured output                   | not used: the critique, Rephrase and research replies are JSON asked for in the prompt and parsed (`prompts/critique.md`, `ANSWER_FORMAT`) | `text.format` with `{type: "json_schema", name, schema, strict: true}`; a refusal can arrive as a `refusal` content item instead of conforming output; `status: "incomplete"` with `max_output_tokens` may truncate it. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). **Not needed for v1**, since the prompt-asked JSON works for Anthropic and our parsers already tolerate it. |
| Web search                          | `web_search_20250305` server tool; results carry url and title                                                                             | `{ "type": "web_search" }` in `tools`; answer text carries `url_citation` annotations (url, title); `include: ["web_search_call.action.sources"]` returns every URL consulted; domain `filters` available; docs require citations to be visible and clickable in user-facing UI. [Web search](https://developers.openai.com/api/docs/guides/tools-web-search)                                                               |
| Reasoning                           | `output_config.effort`                                                                                                                     | `reasoning.effort`; accepted values depend on the model (`none` is rejected by GPT-6 Astra; GPT-6.1 Sol rejects `none` and `minimal` and defaults to `medium`). [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)                                                                                                                                                                                        |
| Prompt caching                      | reads `cache_read_input_tokens`                                                                                                            | Automatic for supported models; hits reported at `usage.input_tokens_details.cached_tokens`; no code needed. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)                                                                                                                                                                                                                                 |
| Server-side state                   | none (we resend history)                                                                                                                   | `previous_response_id` and Conversations exist and are **stored by default**; we should not use them (section 3). [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses)                                                                                                                                                                                                                |

### Model listing and "newest in each line"

- `GET /v1/models` returns `{object: "list", data: [...]}` where each model has `id`, `created` (Unix seconds),
  `object`, `owned_by` and an optional `shutdown_date`. The reference documents no filtering, pagination or ordering.
  [List models](https://developers.openai.com/api/reference/resources/models/methods/list).
- **There is no display name and no "line" field.** Our Anthropic adapter picks the newest per `line` and the Anthropic
  docs it follows say not to guess a line from an id. For OpenAI we have only the id string, `created` and
  `shutdown_date`. So the adapter needs its own rule. The honest options are an **allowlist of families kept in the
  adapter** (matched on id, intersected with what the key can list, dropping any with a `shutdown_date`), or a short
  curated list. Either breaks the "models are discovered, not listed here" rule in `docs/byok.md` in part; that
  needs an owner decision.
- That the listing also contains non-chat models (embeddings, audio, image) is likely but I did not see it stated in
  the reference page: **unverified**, so the allowlist must exclude anything it does not recognise.
- The current models page shows three families with these ids: `gpt-6-astra` (flagship, $10/$50 per million tokens),
  `gpt-6.1-sol` ("near-Astra performance for complex work at a lower cost", $2/$10) and `gpt-6-luna` (smallest, $0.1/$0.5),
  and says to start with Astra if unsure and to use Sol to balance intelligence and cost. It says nothing about aliases
  or snapshots or how to find the latest. [Models](https://developers.openai.com/api/docs/models). The rate-limits
  page also names a "Terra" model that the models page does not list, which I could not reconcile.
  [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits). A sensible default is Sol (our Anthropic
  default is a mid-tier model), but that is a judgement for the owner.

### Key validation

- **Listing models costs no tokens and rejects bad keys**, the same as our Anthropic flow, so
  `listModels` can keep doing double duty. A bad key is a 401: "Incorrect API key provided", revoked key, key from a
  different org or project, or "the key lacks permission for the endpoint".
  [Error codes](https://developers.openai.com/api/docs/guides/error-codes).
- That last case matters: a key restricted to some endpoints might pass `GET /v1/models` and still fail on
  `/v1/responses`. Whether restricted keys behave that way for `/models` I could not verify (the API-keys guide URL I
  tried returned 404). **Unverified.** The cheap remedy is to test the first real call and give the Auth message
  "this key may not be allowed to use the Responses API".
- I could not verify the shape of OpenAI keys (prefix) from a primary page. Our key hint ("start and end with the
  middle left out", cut where the provider's console cuts it) needs the real format. **Unverified.**

### Errors and rate limits

- 401 → bad credentials; 403 → "Country, region, or territory not supported"; 429 has two causes; 500 and 503
  (`server_is_overloaded`) are retryable; bodies carry `error.type`, `error.code`, `error.param` and a message.
  [Error codes](https://developers.openai.com/api/docs/guides/error-codes).
- **The two 429s.** Billing or quota ones (`credit_balance_exhausted`, `organization_spend_limit_exceeded`,
  `project_spend_limit_exceeded`, `organization_usage_limit_exceeded`) won't be fixed by retrying: "add credits or raise
  the limit". Genuine rate limits (`rate_limit_error`, and `slow_down` when traffic ramps too fast) should follow
  `Retry-After`. [Error codes](https://developers.openai.com/api/docs/guides/error-codes),
  [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits).
- Our port says `LLMAuthError` covers "out of credit", so the billing 429s must map to `LLMAuthError` (with a message
  that says add credit or raise the spend limit), while other 429s become `LLMRateLimitError` with `retryAfterSeconds`.
  A plain "401/403 → auth, 429 → rate limit" copy of the Anthropic translator would get this wrong.
- The Node SDK throws `AuthenticationError` (401), `RateLimitError` (429), `PermissionDeniedError` (403) and so on, all
  subclasses of `APIError`; it retries connection errors, 408, 409, 429 and 5xx twice by default and times out after ten
  minutes. [openai-node README](https://github.com/openai/openai-node/blob/master/README.md). Decide `maxRetries`
  deliberately, as a retried 429 can stall a request for a person who is waiting.

## 3. What happens to the writer's text (for the "Protect what you write" advice)

All from [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data) unless noted.

- **Training.** "OpenAI does not use API data to train or improve its models by default"; sharing for training needs an
  explicit opt-in. (Consumer ChatGPT has separate settings; this page is about the API.)
- **Retention for abuse monitoring.** Logs are "retained for up to 30 days, unless longer retention is required by
  law". That is about the same as Anthropic's 30 days (`docs/byok.md`).
- **Application state, the trap.** For `/v1/responses`, response data is kept for at least 30 days by default, or when
  `store` is `true`. The page does not state the default for `store`. The migration guide says Responses are "stored by
  default", and Chat Completions are stored by default for new accounts.
  [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses). **Our adapter must
  send `store: false` on every call** so the writer's draft is not kept as application state on top of the log
  retention. Tests should assert it. (Statelessness has a cost: see section 4, reasoning items.)
- **Zero Data Retention (ZDR) and Modified Abuse Monitoring.** Both need prior approval from OpenAI (sales contact),
  so, as with Anthropic, they are for organisations, not individual writers. Under ZDR, `store` is always treated as
  `false`. `/v1/responses` and `/v1/chat/completions` are eligible "with limitations"; `/v1/conversations`, `/v1/files`
  and `/v1/vector_stores` are not eligible. We use none of those. Prompt caching is compatible with ZDR
  ([Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)).
- **Data residency** is a per-project setting needing eligibility via sales: not for individuals.
- **Key hygiene.** OpenAI's safety guide says to revoke and replace a key promptly if it may be exposed, in the Security
  settings. [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices). That guide
  also asks apps to send a stable, hashed `safety_identifier` per end user. That sends OpenAI an identifier derived from
  the writer's account: if we adopt it, hash a per-user value that is not their email, and say so in the privacy copy
  (open question).
- **Web search** is a hosted tool run by OpenAI with its own per-call charges
  ([Web search](https://developers.openai.com/api/docs/guides/tools-web-search)); whether it is covered by the
  retention controls above I did not find stated. **Unverified.** Research sends the writer's idea and notes to it, so
  the answer matters for the advice.

Draft parallel to the Anthropic text in `docs/byok.md`, to adapt (do not ship until the 403 pages are read directly):

> **Protect what you write.** Your writing is sent to OpenAI using your key. A few things to check:
>
> - **Use an API key from the OpenAI Platform, not your ChatGPT subscription.** They are separate accounts and
>   billing. OpenAI says it does not use API data to train its models unless you opt in. ChatGPT has its own settings.
> - **Know how long it is kept.** OpenAI keeps API logs for up to 30 days for abuse monitoring. Wordwright asks
>   OpenAI not to store responses. Shorter "zero data retention" needs an agreement with OpenAI and is mainly for
>   organisations.
> - **Make a key just for this app**, in its own project if you can, with a spending limit set, so you can revoke
>   it without disturbing anything else. (Project and spend-limit controls exist: see the 429 codes above.)
> - **Revoke the key** if you stop using the service, or lose a device.
> - **Don't put anything in that you couldn't send a trusted contractor.**

## 4. Gaps between our `LLMProvider` port and OpenAI

The port (`packages/core/src/providers/llm.ts`) is mostly vendor-neutral by design. Mapping:

| Port element                                                       | OpenAI mapping                                                                                                                                                                                                                                                                                                                                                                                | Gap?                                                                     |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `system`                                                           | `instructions` (applies only to this request)                                                                                                                                                                                                                                                                                                                                                 | None. We resend it each time.                                            |
| `messages` of strings, text blocks                                 | `input` items with roles `user` / `assistant`                                                                                                                                                                                                                                                                                                                                                 | None                                                                     |
| `tool_call` block (`id`, `name`, `input`)                          | `function_call` item (`call_id`, `name`, `arguments` JSON string)                                                                                                                                                                                                                                                                                                                             | Map `id` ↔ `call_id`; stringify.                                         |
| `tool_result` block (`toolCallId`, `content`, `isError`)           | `function_call_output` (`call_id`, `output`)                                                                                                                                                                                                                                                                                                                                                  | No `is_error` flag; fold into text.                                      |
| Anthropic quirks in the adapter (results first; no empty text)     | not needed                                                                                                                                                                                                                                                                                                                                                                                    | None                                                                     |
| `LLMTool.inputSchema` from Zod                                     | `parameters`; choose `strict` on purpose                                                                                                                                                                                                                                                                                                                                                      | Decision                                                                 |
| `maxTokens` (2048 / 8192 defaults)                                 | `max_output_tokens`, which "caps all generated tokens: reasoning, visible output, and formatting"; the docs advise reserving "at least 25,000 tokens for reasoning and outputs" to start. [Reasoning](https://developers.openai.com/api/docs/guides/reasoning)                                                                                                                                | **Yes: see below.**                                                      |
| `effort: low / medium / high`                                      | `reasoning.effort`, valid values per model                                                                                                                                                                                                                                                                                                                                                    | Map; do not send `none`/`minimal`.                                       |
| `LLMStopReason`: `end`, `max_tokens`, `tool_use`, `refusal`        | Responses has no stop reason of that kind in what I read: infer `max_tokens` from `status: "incomplete"` with `max_output_tokens`, `tool_use` from `function_call` items in the output, `refusal` from a `refusal` content item. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Reasoning](https://developers.openai.com/api/docs/guides/reasoning) | Inference; confirm on the reference.                                     |
| `LLMUsage.cachedInputTokens`                                       | `usage.input_tokens_details.cached_tokens`                                                                                                                                                                                                                                                                                                                                                    | None. Top-level token field names to be confirmed on the reference page. |
| `listModels` → `{id, label, latest}`                               | `id`; no label; no line                                                                                                                                                                                                                                                                                                                                                                       | **Yes: see section 2.**                                                  |
| Errors → `LLMAuthError` / `LLMRateLimitError` / `LLMProviderError` | see section 2                                                                                                                                                                                                                                                                                                                                                                                 | Billing 429 is an auth error.                                            |
| `ResearchProvider.find` (only addresses that appeared in results)  | collect `url_citation` annotations (url and title) from the answer, and optionally the `sources` list                                                                                                                                                                                                                                                                                         | See below.                                                               |

**Gaps that need a decision:**

1. **Reasoning items in tool conversations.** The port says reasoning "is deliberately not represented: it is never
   stored or replayed" (`LLMContentBlock`). OpenAI says "reasoning items returned alongside tool calls must be passed
   back with the tool call outputs", and with `store: false` they come back as opaque `encrypted_content` to be
   replayed. [Function calling](https://developers.openai.com/api/docs/guides/function-calling),
   [Reasoning](https://developers.openai.com/api/docs/guides/reasoning). Our brainstorm loop calls `chat()` again with
   the tool results, so the adapter has to receive those items back. Options: (a) add an opaque, provider-owned
   `providerState` field on `tool_call` blocks that only the OpenAI adapter reads (the stored message would hold
   encrypted blobs; fits `store: false`); (b) use `previous_response_id` and `store: true`, which contradicts the
   privacy advice; (c) run tool-using chat with reasoning off where the model allows (`gpt-6-luna` offers `none`
   per the [models page](https://developers.openai.com/api/docs/models), Sol and Astra don't). I recommend (a), but
   it touches the stored-message schema and `docs/ai-features.md`, so it is the biggest piece of work. This is my
   reading of the docs, not something I tested.
2. **Token budget.** Reasoning tokens count against `max_output_tokens`, and a response can end `incomplete` with
   nothing visible while you still pay for it ([Reasoning](https://developers.openai.com/api/docs/guides/reasoning)).
   Our 2048 default for `complete()` would often return an empty critique. The adapter should raise its limit, set a
   low reasoning effort for the rationed, short-answer features (critique, Rephrase), and treat "incomplete and empty"
   as `max_tokens`.
3. **Switching provider mid-thread.** Brainstorm stores tool calls and replays them on later turns (`services/brainstorm.ts`),
   and the thread records `provider` and `model`. A thread begun on Anthropic would replay `toolu_…` ids and
   provider-specific state into OpenAI. Whether OpenAI accepts arbitrary `call_id` strings I did not verify
   (**unverified**). Simplest rule: replay only blocks the current provider made, or start a fresh turn state when the
   provider changes.
4. **Research parity.** The Anthropic researcher keeps only addresses the search returned, with the result's own title.
   For OpenAI, `url_citation` annotations give url and title, but a `sources` list "often" holds more URLs than are cited
   ([Web search](https://developers.openai.com/api/docs/guides/tools-web-search)); I did not see whether sources carry
   titles (**unverified**), so use citations for titles. The docs also say to show citations clearly and clickably, which
   our review page already does. I found no equivalent of Anthropic's `pause_turn` continuation; test that long searches
   finish in one call.
5. **Plan usage would need a different credential.** SIWC gives OAuth access and refresh tokens, not a key; the
   stored credential, the "key hint", `LlmKeyService.save` ("check the key by listing models") and the UI field all
   assume a pasted key, and the preview forbids `max_output_tokens` and requires `stream: true`. Only relevant if the
   owner pursues the programme (section 6).
6. **Eval grader.** `evals/src/config.ts` grades with an Anthropic model and `options.ts` asks for an Anthropic key
   for the grader, so `pnpm eval:adapter -- --provider openai` still needs an Anthropic key unless `--grader` points
   elsewhere. Say so in the issue, or allow an OpenAI grader.

**Prompts.** `prompts/*.md` have no vendor names and little model-specific syntax; the only structured parts are a few
XML-ish tags and the JSON-reply instructions in `critique.md`, `options.md` and `research.md`. They should work as written, but
`docs/responsible-ai.md` and `docs/evals.md` make behaviour a thing we check, not assume, and a different model family
may differ in exactly the behaviours the evals test: declining to draft when asked indirectly, not flattering,
ending a brainstorm, keeping critique to a few points, not following instructions inside notes. Per the repo rule,
**run `pnpm eval:adapter -- --provider openai --model <id>` with several trials, paste the summary in the issue and let
the owner judge**; do not edit prompts to suit OpenAI without telling the owner (a prompt change is a product change).
Also check that the critique and Rephrase replies parse every time (a model that wraps JSON in prose or fences should
fail loudly in the evals, not in production).

## 5. Other routes

- **OpenAI-compatible endpoints and gateways.** Ollama documents compatibility for Chat Completions, Responses
  (stateless only, from v0.13.3), embeddings and models, and lists gaps: no `tool_choice` on chat completions,
  image URLs only as base64, and the cloud API does "not support stateful Responses, built-in web search via
  `/v1/responses`". [Ollama](https://docs.ollama.com/api/openai-compatibility). OpenRouter exposes
  `POST /api/v1/chat/completions`, ignores parameters a model doesn't support, normalises finish reasons, can fall back
  to other providers when rate-limited, and its overview page says nothing about data policy.
  [OpenRouter](https://openrouter.ai/docs/api-reference/overview).
- **Why not a free-form base URL (yet).** The Node README documents no general `baseURL` option beyond the mTLS
  endpoints ([openai-node](https://github.com/openai/openai-node/blob/master/README.md); this is what that page
  shows, not proof the option is absent). More important to us:
  - We cannot write the "Protect what you write" advice (training, retention, spend limit) for an unknown host, and
    the repo's own rule is to say these three things per provider.
  - A server that calls any URL a user types is an **SSRF risk** (internal addresses, cloud metadata) that needs an
    allowlist or a block on private ranges; that is our engineering judgement, not from a source above.
  - Gateways differ on tools, structured output, web search and state, so the contract suite and evals would prove
    little about "an OpenAI-compatible endpoint" in general.
  - It would let us offer a local or EU-hosted model to people who want that, which is a real benefit; treat it as a
    later, separate provider (`openai-compatible`) with a fixed list of known hosts or a clear "advanced, you take
    responsibility" screen.
- **Azure OpenAI and other clouds** are not covered here; I did not research them.

## 6. Recommendation and steps

**Recommended approach:** add `openai` as a second provider using a **Platform API key**, targeting the **Responses API
with `store: false`**, as a normal adapter behind the existing port. Tell people plainly that ChatGPT subscriptions are
separate. Apply to OpenAI's Sign in with ChatGPT programme later if the owner wants subscription users to avoid a second
bill, and defer any generic base URL.

Steps, following "To add a provider" in `docs/byok.md` and `docs/agents/conventions-api.md`:

1. **Decide the three open design points** (reasoning items, token budget and effort mapping, model allowlist) with the
   owner, and file an issue with its rung (the provider does not change any feature's rung) and a note that prompts are
   not changing.
2. **`packages/core/src/domain.ts`**: add `'openai'` to `LLM_PROVIDER_IDS` and `DEFAULT_LLM_MODEL` (candidate:
   `gpt-6.1-sol`; owner to confirm). Check every `Record<LLMProviderId, …>` and the `'anthropic'` literals in
   `LlmKeyService.settings` (it defaults to Anthropic), `AI_PROVIDER_LABEL` in `apps/web/src/lib/ai.ts`, and the evals
   factory.
3. **Adapter `packages/core/src/providers/openai.ts`** (+ `openai-errors.ts`): `OpenAIProvider implements LLMProvider`
   using the `openai` SDK (a new dependency; explain it in the commit). Always send `store: false`; send `instructions`;
   no sampling parameters; map streaming events to `LLMChatEvent`; map `incomplete` / `refusal` / function calls to stop
   reasons; carry reasoning items per decision 1; `listModels` with the allowlist and `shutdown_date` filter; translate
   errors as in section 2 (billing 429 → `LLMAuthError`, 403 region message, `Retry-After`), with messages that never
   include what was sent.
4. **Research adapter** `OpenAIResearchProvider implements ResearchProvider` using the `web_search` tool, keeping only
   cited addresses with their citation titles.
5. **Fake and contract tests.** Reuse `FakeLLMProvider`; run the shared contract suite (`@wordwright/core/testing`)
   against the adapter with a stubbed client; add tests for `store: false` on every call, error mapping, the incomplete
   and empty case, tool-call round trips with reasoning items, and `listModels` filtering.
6. **`apps/api/src/llm-factory.ts`**: add the `'openai'` case to both `realLlmFactory` and `realResearchFactory`.
   `apps/api/src/server.ts` needs no change if it only passes the factories.
7. **UI copy** (`docs/style-guide.md` and `CONTEXT.md` first): provider choice in `LlmSettingsSection.vue` (the label
   "Anthropic API key" and the `sk-ant-…` placeholder become per provider), `HelpApiKeyView.vue` (OpenAI Platform steps and
   the "ChatGPT subscription is not an API key" note), `HelpPrivacyView.vue`, `HomeView.vue`, `HelpView.vue` blurbs and
   `ProviderPrivacyAdvice.vue` (provider-specific text from section 3, after reading the 403 pages directly). Check the key
   hint (`elide`) against real key shapes. Check at phone width and with axe.
8. **Docs:** update `docs/byok.md` (replace "their own Anthropic API key", add the OpenAI "Protect what you write" text,
   note the model allowlist), and add a line in `docs/ai-features.md` if the model list or effort mapping is user-visible.
9. **Evals:** run `pnpm eval:adapter -- --provider openai --model <id>` with several trials (and with a grader choice
   decided, see gap 6), paste the summary in the issue, and have the owner judge. Add an eval case if a new failure
   shows up. Then `pnpm check` and `pnpm test:e2e` with `FAKE_LLM=true`.
10. **Account migration:** `PUT /api/llm` already takes `provider`; confirm the stored-credential context binds the
    provider (`context(userId, provider)`) so a key cannot be decrypted as another provider's, and extend
    account-deletion tests if the schema changes.

### Open questions for the owner

1. Is a **second bill** acceptable for ChatGPT subscribers, or should we apply to the Sign in with ChatGPT programme
   (interest form; the documented flow is for local apps, so a hosted service may be refused or need special terms)?
2. **Default model and allowlist.** Sol as default? An adapter-held allowlist of families instead of pure discovery?
3. **Tool conversations and reasoning.** Opaque stored `providerState` (my recommendation), or reasoning off for
   brainstorm on OpenAI?
4. **Should a writer be able to switch provider mid-thread**, and if so what happens to earlier tool calls?
5. **`safety_identifier`**: send a hashed per-user id as OpenAI recommends, or not?
6. **Eval grader:** keep the Anthropic grader (needs an Anthropic key for OpenAI trials) or add an OpenAI one?
7. **Web search retention:** acceptable to ship Research on OpenAI before OpenAI's retention for the search tool is
   confirmed in writing?
8. **A generic base URL or a local-model option** later, as a separate provider?

## Verification gaps (worth a quick manual check)

- `openai.com/policies/*` (terms of use, business terms, usage policies) and several `help.openai.com` pages returned 403. The claims about consumer terms (automated extraction, sharing credentials), "separate billing", and the plans
  eligible for SIWC rest on search-result summaries and are marked **unverified**.
- Whether restricted API keys can call `GET /v1/models`; the shape and prefix of OpenAI keys (the API-keys guide URL
  returned 404).
- That `GET /v1/models` includes non-chat models, and whether the order is stable.
- The default value of `store` on the Responses API (the data-controls page does not state it; the migration guide
  says Responses are stored by default).
- Response and usage field names beyond those quoted (top-level `input_tokens` and `output_tokens`, the `incomplete`
  reasons other than `max_output_tokens`).
- Whether `call_id` values from another provider are accepted on replay.
- Retention and ZDR coverage of the hosted web-search tool; whether search `sources` include titles.
- Model names and prices are as the docs showed them on 2026-10-24 and clearly change quickly; "Terra" appears on one
  page only.
- Several fetches were summarised by a small model; quotes marked as such should be re-read on the page before they
  go into user-facing text.

## Sources

- Sign in with ChatGPT: [Quickstart](https://developers.openai.com/siwc/quickstart), [Request a client ID](https://developers.openai.com/siwc/request-client-id.md), [Plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source), [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference.md), [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations.md), [Self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms.md), [Partner page](https://learn.chatgpt.com/docs/sign-in-with-chatgpt), [page index](https://developers.openai.com/siwc/llms.txt)
- Codex and billing: [Codex authentication](https://learn.chatgpt.com/docs/auth), [Managing billing for ChatGPT and the API platform](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform) (403; summary only), [Using your ChatGPT plan in other apps and sites](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites) (403; summary only)
- Terms: [OpenAI Terms of Use (RoW)](https://openai.com/en-GB/policies/row-terms-of-use/) (403; summary only)
- API guides: [Migrate to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Text](https://developers.openai.com/api/docs/guides/text), [Function calling](https://developers.openai.com/api/docs/guides/function-calling), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [Web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Reasoning](https://developers.openai.com/api/docs/guides/reasoning), [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [Models](https://developers.openai.com/api/docs/models), [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits), [Error codes](https://developers.openai.com/api/docs/guides/error-codes), [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)
- Data: [Data controls in the OpenAI platform](https://developers.openai.com/api/docs/guides/your-data)
- Reference and SDK: [List models](https://developers.openai.com/api/reference/resources/models/methods/list), [openai-node README](https://github.com/openai/openai-node/blob/master/README.md)
- Gateways: [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [OpenRouter API overview](https://openrouter.ai/docs/api-reference/overview)
