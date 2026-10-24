# Bring your own LLM key

Read this when you change how a person's AI key is stored, checked or used, how models are chosen, or add an LLM provider.

There is deliberately **no server-wide LLM key**: each user saves their own Anthropic API key under
_Account → AI assistant_, so usage is billed to them. Keys are checked with a 1-token call before
being saved, encrypted with AES-256-GCM (bound to the user, so a copied ciphertext won't decrypt for
anyone else), shown back only with its middle left out, as `sk-ant-api03-AbC...1234` (cut where Anthropic's console cuts it, plus the last four; worked out when asked, not stored), and deleted with the account. Requests in a shared publication
run on the _requester's_ key.

- `KEY_ENCRYPTION_SECRET` (32+ chars, required in production) encrypts the keys. **Back it up**: if it's
  lost, every stored key is unreadable and users must re-enter theirs. Ciphertexts carry a `v1` prefix
  so rotation can be added later; there is no rotation tooling yet.
- `FAKE_LLM=true` swaps in a canned fake that accepts any key (development and e2e only; refused in
  production).
- To add a provider: extend `LLM_PROVIDER_IDS` and `DEFAULT_LLM_MODEL` in `packages/core/src/domain.ts`, add an
  adapter implementing `LLMProvider` (translating credential failures to `LLMAuthError`), and a case
  in `apps/api/src/llm-factory.ts`.
- **Models are discovered, not listed here.** `GET /api/llm/models` asks the provider which models the saved key can
  use (throttled; 409 without a key): the newest in each model line, plus the one already saved if it is still
  supported (deprecated and retired models are left out). `PUT /api/llm` checks a new key the same way and refuses a `model` that isn't in
  the list; leave `model` out to keep the current one (a first key gets `DEFAULT_LLM_MODEL` if offered, else the
  first model the provider lists).

## Advice for people using their own key

The writer's text goes to their own AI provider, so their provider settings matter. The app should say this where
people add their key (the landing page and _Account → AI assistant_). Draft text, to be adapted for the app, with
Anthropic specifics checked against the provider's current pages before it ships:

> **Protect what you write.** Your writing is sent to Anthropic using your key. A few things to check:
>
> - **Use an API key from the Anthropic Console, not a Claude chat subscription.** API use is under Anthropic's
>   commercial terms, which at the time of writing say Anthropic does not train its models on customer content; the
>   consumer Claude apps have a separate training setting that you control under your account's privacy settings.
>   Check [Anthropic's Privacy Center](https://privacy.claude.com) for the current wording.
> - **Know how long it is kept.** Anthropic's published policy is that API inputs and outputs are deleted within a
>   set period (it has been described as 7 to 30 days, so check the
>   [data retention page](https://platform.claude.com/docs/en/build-with-claude/api-and-data-retention)). Shorter,
>   "zero data retention" arrangements exist but need an agreement with Anthropic and are mainly for organisations.
> - **Make a key just for this app**, in its own Console workspace if you can, with a spending limit set, so you can
>   revoke it without disturbing anything else.
> - **Revoke the key** in the Console if you stop using the service, or lose a device.
> - **Don't put anything in that you couldn't send a trusted contractor**: other people's private details, or
>   material you are under a duty to keep confidential.
>
> If you use a different provider, look for the same three things: whether API data is used for training, how long it
> is kept, and whether you can set a spending limit.

_Shipped (#47)._ The app's text is in `ProviderPrivacyAdvice.vue` (landing page and Account → AI assistant) and
`SharedThreadNotice.vue` (brainstorm page, shown whenever the publication has other members). Checked on 2026-10-16:
Anthropic's [commercial retention page](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
says API inputs and outputs are deleted within 30 days by default (longer for Usage Policy flags or by agreement), and
its API data-retention page says retained data is never used for training without permission. The earlier "7 to 30
days" wording was dropped. Recheck both pages if either text is changed. The review panel also says reviewers see
only a frozen copy and their own comments, and that the AI never receives comments.
