# Definition of done: what wordwright adds

The definition of done is the agent-workflow plugin's (its `land` skill links it); every item there applies. These are
wordwright's additions to it.

- **Tests** (item 1): unit and API tests for logic, component tests for each UI state, contract tests for adapters, and
  an e2e test for a new user-facing flow. Which e2e to run: [When to run e2e](testing.md#when-to-run-e2e) (none, one
  screen's spec, or the whole suite for the app's shell).
- **Checks** (item 2): `pnpm check` and `pnpm build`. UI changes follow [design](../design/README.md).
- **Docs** (item 3): the matching doc ([README](../../README.md), [accounts](../accounts.md), [byok](../byok.md) or
  [ai-features](../ai-features.md)), `.env.example`, and `docs/adr/` for non-obvious choices
  ([adr/README.md](../adr/README.md)). **The help area too:** a change to what people can do, or how, updates the
  matching help page under `/help`, or adds one if the feature has steps or explanation that don't fit on the page (see
  _Where explanatory text goes_ in [design](../design/explanatory-text.md#where-explanatory-text-goes)).
- **AI features:** a feature that calls an LLM adds boundary evals, and an invariant test where a boundary is
  structural ([responsible-ai.md](../responsible-ai.md), [evals.md](../evals.md)). A change to anything in `prompts/`
  changes the product's behaviour: say so in the commit and ask the owner to review it.
