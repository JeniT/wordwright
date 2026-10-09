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
4. [TODO.md](TODO.md) updated (task moved to Done with the commit hash; follow-up work added as new tasks).
5. **Committed** with a message that says what and why. Commit after each feature; for large ones, commit at
   each green checkpoint. Don't leave work uncommitted at the end of a session.

## Working in parallel with other agents

- **Claim before starting:** in `TODO.md` move the task to _In progress_, add `claimed: <agent/session> · branch: <name>`,
  and commit that alone (`git commit -m "claim T7"`). Only take tasks whose dependencies are Done.
- **Isolate:** `git worktree add ../lfwa-T7 -b T7` and work there, run `pnpm install` once in it.
- **Merge:** rebase on `main`, rerun `pnpm check` + e2e, then fast-forward `main`. Don't force-push `main`.
- **Likely conflict spots:** `packages/core/src/domain.ts`, `apps/api/src/app.ts`, `server.ts`, and the
  `MIGRATIONS` array. If two branches add a migration, the second to merge **renumbers** theirs (append after
  the other) and reruns the tests. Keep changes to those files small and additive.
- If you find a bug or gap outside your task, add it to `TODO.md` rather than widening the task.
- If a decision belongs to the owner (a service to choose, a product trade-off, anything costing money),
  put it under **Decisions needed** in `TODO.md` and work on something else.
