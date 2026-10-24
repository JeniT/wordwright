# Definition of done

Read this before you commit, and when you plan a task's tests and docs.

1. Behaviour covered by tests at the right level: unit/API tests for logic, component tests for UI states
   (loading / empty / error), contract tests for adapters, and an e2e test for any new user-facing flow.
2. `pnpm check`, `pnpm build` and `pnpm test:e2e` all pass. No new console errors. UI changes follow
   [design](../design/README.md) and have been looked at in light **and** dark mode and at phone width (390px).
3. Docs updated where behaviour changed (the matching doc: [README](../../README.md), [accounts](../accounts.md), [byok](../byok.md) or [ai-features](../ai-features.md); `.env.example`, `docs/adr/` for non-obvious choices (see [adr/README.md](../adr/README.md))).
   **The help area too:** a change to what people can do, or how, updates the matching help page under `/help`, or adds
   one if the feature has steps or explanation that don't fit on the page (see _Where explanatory text goes_ in
   [design](../design/explanatory-text.md#where-explanatory-text-goes)). A feature that calls an LLM also adds boundary evals, and an
   invariant test where a boundary is structural (see [responsible-ai.md](../responsible-ai.md)). A change to anything
   in `prompts/` is a change to the product's behaviour: say so in the commit and ask the owner to review it.
4. The task's issue closed by the landing commit (`Closes #7` in its message) and its `in-progress` label removed;
   follow-up work filed as new issues; the main checkout brought up to date with `origin/main`
   (see [landing.md](landing.md)).
5. **Committed** with a message that says what and why. Commit after each feature; for large ones, commit at
   each green checkpoint. End the session with everything committed.
