# The model is chosen from what the provider offers the key (#206)

The hard-coded `LLM_MODELS` list (three models, our own "balanced / cheapest" labels) is gone. `LLMProvider.listModels()`
asks the provider, so a new model appears without a code change and the labels are the provider's own. We kept a curated
list for a while on the grounds that we had run the evals against those models; but the evals are best-efforts smoke
tests and nobody runs them for every model, so the list gave a false sense of testing and a release's delay. A new model
is still the person's choice and their money, so nothing is chosen for them except the default (`DEFAULT_LLM_MODEL`,
used while it is offered).

- Listing costs no tokens, so it also replaces the one-token `complete()` call that used to check a new key. The same
  call checks a chosen model against the live list on save; a model-only change uses the stored key. Failures read like
  the old ones: a rejected key is 400, an unreachable provider 502.
- The list needs a key, so the choice appears only once one is saved (a first key sends no model; the server uses the
  default if offered, else the first listed). A saved model the provider no longer offers stays selected with a note,
  rather than being silently swapped.
- `GET /api/llm/models` is throttled (30 a minute) because each call goes to the person's own provider account. The page
  fetches the list once and keeps it for five minutes.
- Adapters must implement `listModels()` and pass the new case in the contract suite. The Anthropic adapter keeps only
  ids starting `claude-`.
- **Only current models are offered (#218).** With a real key the list was every model Anthropic had ever shipped. The
  adapter now leaves out deprecated and retired models (a retired one fails when called, a deprecated one is closed to new
  adopters) and marks the newest model in each `line` as `latest`; a model with no line counts as latest, since the
  provider says not to guess a line from an id. The service offers the latest ones plus the model the person already
  uses, if it is still supported, so nobody is forced off an older model that works while new people aren't steered to
  it. A saved model that is deprecated or retired drops out, and the page says it is no longer offered.
