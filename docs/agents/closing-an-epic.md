# Closing out an epic: what wordwright adds

The checklist is the `close-epic` skill of the agent-workflow plugin. Run wordwright's additions with the step they
belong to:

- **Browser suite** (step 2): `pnpm test:e2e`, the whole suite, whatever the epic touched. This is the one routine
  place it runs outside CI ([When to run e2e](testing.md#when-to-run-e2e)).
- **Looking at the screens** (step 3): `pnpm dev` with `FAKE_LLM=true`, signed in and signed out, with an empty
  account and one with ideas, notes and drafts. Each screen passes its axe test ([design](../design/README.md)).
- **Review** (step 6): against the conventions for what the epic changed
  ([conventions-web.md](conventions-web.md), [conventions-api.md](conventions-api.md)), and its UI words against the
  [style guide](../style-guide.md). An epic with an AI feature is also checked against
  [responsible-ai.md](../responsible-ai.md): each feature names its rung, and its boundary evals exist.
- **Coverage** (step 7): `pnpm coverage` ([testing.md](testing.md)); read each changed file's report in its package's
  `coverage/`.
- **Dependencies** (step 9): a dependency the epic added has its row in [dependencies.md](../dependencies.md).
- **Docs** (step 10): there is no roadmap file; closing the epic marks it done. `CONTEXT.md` has every term the epic
  introduced, and the help pages under `/help` describe what people can now do.

Mutation testing and a bundle budget are not part of wordwright's close-out.
