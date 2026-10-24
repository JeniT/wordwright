# The model is chosen from what the provider offers the key (#206)

The hard-coded `LLM_MODELS` list (three models, our own "balanced / cheapest" labels) is gone. `LLMProvider.listModels()`
asks the provider, so a new model appears without a code change and the labels are the provider's own. We kept a curated
list for a while on the grounds that we had run the evals against those models; but the evals are best-efforts smoke
tests and nobody runs them for every model, so the list gave a false sense of testing and a release's delay. A new model
is still the person's choice and their money, so nothing is chosen for them except the default (`DEFAULT_LLM_MODEL`,
used while it is offered).

- Listing costs no tokens, so it also replaces the one-token `complete()` call that used to check a new key, and checks
  a chosen model against the live list on save.
- The list needs a key, so the choice appears only once one is saved. A saved model the provider no longer offers stays
  selected with a note, rather than being silently swapped.
- **Only current models are offered (#218).** With a real key the list was every model Anthropic had ever shipped. The
  adapter leaves out deprecated and retired models and marks the newest model in each `line` as `latest`; the service
  offers the latest ones plus the model the person already uses, if it is still supported, so nobody is forced off an
  older model that works while new people aren't steered to it.
- Adapters must implement `listModels()` and pass its case in the contract suite.
