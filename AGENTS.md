# Start here

**Long-form Writing Assistant**: a web app that supports a writer's whole journey: finding ideas, researching
sources, shaping an argument and outline, critiquing drafts _without losing the author's voice_, and generating
titles/openings/social posts. Users bring their own LLM API key; the service has no server-wide LLM key.

Read in this order: this file → [TODO.md](TODO.md) (what to work on) → [docs/decisions.md](docs/decisions.md)
(why things are the way they are) → [README.md](README.md) (setup, architecture, accounts, BYOK).

## The owner's three priorities (these decide trade-offs)

1. **Good, clean interface design.** Calm and book-like, not busy. Every screen must be keyboard-usable and
   pass the axe accessibility checks; every async action needs loading, empty and error states; error messages
   say what the person can do next. Use semantic HTML and labelled controls. Check layouts at phone width.
2. **Flexibility to plug in and rely on external services.** Application code depends on **ports** (interfaces
   in `packages/core`), never on a vendor SDK. Each external service (LLM, search/news/scholarly sources,
   email, identity providers) is an adapter behind a port, with a fake for tests, and is injected, not imported.
   A new service means: implement the interface → run the shared contract suite against it
   (`@lfwa/core/testing`) → register it in `apps/api/src/server.ts`. Never hard-code a provider into a route.
3. **Robust engineering practices.** Tests with every change (see Definition of done), strict TypeScript,
   validated inputs at every boundary (Zod schemas shared via `@lfwa/core`), secrets never logged or returned,
   migrations append-only, failures that explain themselves. Prefer boring, well-tested solutions.

## Commands (Node 24+, pnpm)

|                 |                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install`  | install                                                                                        |
| `pnpm dev`      | web on :5173, API on :8787 (set `FAKE_LLM=true` to avoid real LLM calls)                       |
| `pnpm check`    | format check + lint + typecheck + unit/component/API tests. **Must pass before every commit.** |
| `pnpm test:e2e` | Playwright; fails on any uncaught exception, `console.error`, failed request or 5xx            |
| `pnpm build`    | typecheck + production build                                                                   |
| `pnpm format`   | fix formatting                                                                                 |

## Layout

- `packages/core`: Zod schemas, provider ports + adapters + fakes, contract test suites. Shared by web and api.
- `prompts/`: the instructions given to the AI, as plain Markdown files (`@lfwa/prompts`). **Edit prompts there**, never
  inline in code; see `prompts/README.md`.
- `apps/api`: Hono API. `routes/` (HTTP only) → `services/` (business rules) → `db/` (SQLite stores).
  `createApp(deps)` takes every dependency as an argument; tests inject fakes and never touch the network.
- `apps/web`: Vue 3 + Vite + Pinia + TanStack Query + Tiptap + Tailwind v4. `lib/api.ts` is the only place that
  calls the API, and it validates responses with the shared schemas.

## Conventions

- **Add code in the existing style.** Look at a neighbouring file first. Comments explain _why_, not _what_.
- **Schemas first.** New API shapes go in `packages/core/src/domain.ts` and are used by both sides.
- **Database:** append a new entry to `MIGRATIONS` in `apps/api/src/db/database.ts`; never edit an applied one.
  Deleting a user must still remove everything that belongs only to them (use `ON DELETE CASCADE`, and extend the
  account-deletion tests).
- **Security defaults:** cookies `HttpOnly` + `SameSite=Lax`; tokens stored hashed; no account enumeration
  (except where the product must, e.g. registration); throttle anything that can be guessed or costs money;
  never log request bodies, keys, tokens or reset links in production code paths.
- **Per-user spending:** AI calls use the _requesting_ user's own key (`LlmKeyService.resolve`). Never add a
  fallback to a shared key.
- **UI text:** plain, friendly English; no jargon in error messages.
- Don't add dependencies casually; prefer the platform and what's already installed. Explain any new one in the commit.

## Definition of done (every task)

1. Behaviour covered by tests at the right level: unit/API tests for logic, component tests for UI states
   (loading / empty / error), contract tests for adapters, and an e2e test for any new user-facing flow.
2. `pnpm check`, `pnpm build` and `pnpm test:e2e` all pass. No new console errors.
3. Docs updated where behaviour changed (README section, `.env.example`, `docs/decisions.md` for non-obvious choices).
4. [TODO.md](TODO.md) updated (task moved to Done with the commit hash; follow-up work added as new tasks),
   and the main checkout's copy brought up to date with `origin/main` (see _Landing_, step 5).
5. **Committed** with a message that says what and why. Commit after each feature; for large ones, commit at
   each green checkpoint. Don't leave work uncommitted at the end of a session.

## Working in parallel with other agents

- **The main checkout's `TODO.md` is the board agents read.** Anyone choosing a task opens `TODO.md` in the
  main directory, so it must always match `origin/main`; a stale one gets finished tasks claimed again. Landing
  work from a worktree does not update it by itself, which is why step 5 below is required, not optional.
- **Never commit directly on local `main`.** It is shared, and a commit left on it is invisible to everyone else
  until some other session pushes it by accident. Every change, claims and docs included, goes through a worktree.
- **Check CI before starting a task, instead of waiting for it after a push.** CI takes minutes, and waiting for it
  holds up the next piece of work. So after landing, move on, and let the next start (or the next landing) be where
  CI is checked: run `gh run list --branch main --limit 5` before you claim anything.
  - **The latest finished run is red:** fixing it comes first. Read why with `gh run view <run id> --log-failed`.
    If your own earlier push broke it, fix it now. If it is someone else's, tell the owner, and record the fix as a
    task in `TODO.md` (a claim, pushed straight away) so two agents don't fix the same thing.
  - **Runs are still in progress:** don't wait. Start, and look again at landing step 3, because a red can arrive
    while you work.
  - **Don't push on top of a red `main`** unless your push is the fix.
- **Claim before starting:** `git fetch origin`, then `git worktree add .worktrees/T7 -b T7 origin/main` and
  `pnpm install` once in it. In that worktree, in `TODO.md`, move the task to _In progress_, add
  `claimed: <agent/session> · branch: <name>`, commit that alone (`git commit -m "claim T7"`), check
  `git log origin/main..HEAD` lists only that commit, and `git push origin HEAD:main` straight away. Then
  bring the main checkout up to date (step 5 below) so other agents see the claim. Only take tasks whose
  dependencies are Done. You keep working in that same worktree.
- **Landing (merging to `main`):** the local `main` checkout is shared by every session, so it may hold other
  sessions' unpushed commits. Never publish it; publish your own branch. Run these as **separate commands**, reading
  each result before the next:
  1. `git fetch origin`, then `git rebase origin/main` in your worktree (not `main`, which may be ahead with
     someone else's unpushed work). Resolve conflicts, keeping the other session's entries (usually in `TODO.md`).
  2. Rerun `pnpm check`, `pnpm build` and `pnpm test:e2e` on the rebased branch.
  3. `git log origin/main..HEAD` must list only your commits. If anything else is there, stop and sort it out.
     Then check CI as above (`gh run list --branch main --limit 3`): the latest finished run must not be red,
     unless your push is the fix.
  4. `git push origin HEAD:main`. It is a plain fast-forward; if it is rejected, go back to step 1.
  5. **Bring the main checkout up to date (required).** In the main directory run `git fetch origin`, then
     `git merge --ff-only origin/main`, and confirm its `TODO.md` shows your task as Done (or In progress, for a
     claim). If the fast-forward is refused, local `main` has another session's unpushed commits: run
     `git merge origin/main` instead (it keeps their commits as they are), resolve conflicts keeping both sides
     (`TODO.md` entries; for a clash in the `MIGRATIONS` array, the already-published migration stays first and
     the unpublished one is appended after it), rerun `pnpm check`, `pnpm build` and `pnpm test:e2e`, and commit
     the merge. **Don't push that merge**: those commits belong to the other session. Don't wait for the CI run
     your push started: the next task begins by checking it (see _Check CI before starting a task_).

  The remote is `origin` (private GitHub repo `JeniT/writing-assistant`). Only push your own work to `main`, never
  another session's in-progress branch.

- **Don't, when landing:**
  - Don't run `git push origin main`. It publishes whatever is on local `main`, including other sessions'
    unfinished or unreviewed commits.
  - Don't chain landing steps with `&&` after a pipe (`git merge … | tail && git push …`). The pipe hides the
    merge's exit code, so the push runs even though the merge failed. Don't pipe merge/rebase/push output at all.
  - Don't rebase onto, or merge from, local `main` when `origin/main` is what you mean.
  - Don't force-push `main`, or use `--force` / `--force-with-lease` to get past a rejected push; rebase instead.
  - Don't `git stash` (the stack is shared across worktrees); commit a WIP commit instead.
  - Don't skip step 3: a push that succeeds can still contain commits you didn't write.
  - Don't skip step 5 because the fast-forward failed. A stale `TODO.md` in the main directory misleads every
    other agent; merge instead.
  - Don't `git rebase`, `git reset --hard` or `git checkout .` the main checkout to make it match `origin/main`.
    That destroys or rewrites another session's unpushed commits and breaks their worktrees.
- **Clean up when the task is merged:** from the main checkout, run `git worktree remove .worktrees/T7` and
  `git branch -d T7`, so finished worktrees (each with its own `node_modules`) don't pile up. Remove only your own;
  other sessions' worktrees may still be in use. If the task isn't merged, leave the worktree and say why in `TODO.md`.
- **Likely conflict spots:** `packages/core/src/domain.ts`, `apps/api/src/app.ts`, `server.ts`, and the
  `MIGRATIONS` array. If two branches add a migration, the second to merge **renumbers** theirs (append after
  the other) and reruns the tests. Keep changes to those files small and additive.
- If you find a bug or gap outside your task, add it to `TODO.md` rather than widening the task.
- If a decision belongs to the owner (a service to choose, a product trade-off, anything costing money),
  put it under **Decisions needed** in `TODO.md` and work on something else.
