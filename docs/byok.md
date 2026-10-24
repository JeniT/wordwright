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
