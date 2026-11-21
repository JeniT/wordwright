# Landing: what wordwright adds

The steps and guardrails are the `land` skill of the agent-workflow plugin: `pnpm exec aw rebase-overlap` before the
rebase, `git push origin HEAD:main`, then `pnpm exec aw land <n>` from the main checkout. This file holds only what is
wordwright's own.

- **What to rerun after the rebase** is what `aw rebase-overlap` advises (its shared spots and advice are in
  `agent-workflow.config.json`). After a rebase that brought changes in, `pnpm check` runs bare before the push: the
  pre-push hook refuses content it has not passed on. With overlap, add `pnpm build` and the e2e specs the change and
  what came in touch ([When to run e2e](testing.md#when-to-run-e2e)); the whole suite only for the app's shell. A rare
  red `main` from two changes that interact without sharing a file is accepted
  ([ADR](../adr/foundations/landing-ci-on-main-is-the-final-gate-not.md)).
- **Before the push,** check CI: `gh run list --branch main --workflow CI --limit 3`. The latest finished run must be
  green, unless your push is the fix ([claim.md](claim.md#check-ci-before-you-start)). Don't wait for the run your push
  starts: the next task begins by checking it.
- **Merging into the main checkout by hand** (the fast-forward was refused): for a clash in the `MIGRATIONS` array, the
  already-published migration stays first and the unpublished one is appended after it. Then rerun `pnpm check`,
  `pnpm build` and the e2e specs of any screen the conflict was in.
- **Skipping the hook:** `AW_SKIP_STAMP=1`, only when the owner has said so.
- The remote is `origin`, the private repo `JeniT/wordwright`.
