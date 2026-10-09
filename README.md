# Long-form Writing Assistant

A web app to support the writer's journey: idea generation, research, argument and outline refinement,
critique that preserves your voice, and supplementary material (titles, openings, social posts).

Currently implemented: drafts (create/list/edit/save in a Markdown-backed rich text editor) and an
LLM-powered critique. The rest is built on the same provider architecture.

## Stack

| Concern         | Choice                                                                         |
| --------------- | ------------------------------------------------------------------------------ |
| Monorepo        | pnpm workspaces, TypeScript (strict)                                           |
| `apps/web`      | Vue 3, Vite, Pinia, Vue Router, TanStack Query, Tiptap, Tailwind CSS v4        |
| `apps/api`      | Hono on Node, Zod validation, SQLite (`node:sqlite`)                           |
| `packages/core` | Domain schemas (Zod) and provider interfaces + adapters, shared by web and api |
| Tests           | Vitest, Testing Library, MSW, Playwright (+ axe), Promptfoo (`evals/`)         |

## Getting started

Requires Node 24+ and pnpm.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # optional; defaults use the fake LLM
pnpm dev                                  # web on :5173, API on :8787
```

The API reads real environment variables; load `.env` with e.g. `node --env-file=.env` or your shell.
To use Claude: `LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... pnpm dev`.

## Scripts

| Command         | What it does                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`    | Format check, lint, typecheck, unit/component/API tests (what CI runs first)                                               |
| `pnpm test`     | Vitest in every package                                                                                                    |
| `pnpm test:e2e` | Playwright against the web app + API with fake providers (`pnpm --filter @lfwa/web exec playwright install chromium` once) |
| `pnpm build`    | Typecheck and production-build everything                                                                                  |

## Architecture: pluggable external services

Application code depends on **ports** in `packages/core/src/providers`, never on a vendor SDK:

- `LLMProvider` — `complete()` and `stream()`. Adapters: `AnthropicProvider`, `FakeLLMProvider`.
- `SearchProvider` — for news, web and scholarly sources (Crossref, OpenAlex, ...). Only a fake exists so far.

To add a service: implement the interface, run the shared contract suite from
`@lfwa/core/testing` against it (see `packages/core/src/providers.test.ts`), then register it where
`apps/api/src/server.ts` builds `Providers`. `createApp()` takes its dependencies as arguments, so
tests inject fakes and nothing hits the network.

## Notes and next steps

- **Auth:** set `API_TOKEN` to require a bearer token on `/api`. The web app reads it from settings
  (stored per device); there is no login UI yet. Do this before deploying anywhere public.
- **Storage:** `DraftRepository` is a port with a SQLite implementation. Swap in Postgres or add an ORM
  (e.g. Drizzle) when you need migrations or versioned history.
- **UI components:** Tailwind only for now; add headless primitives (Reka UI / shadcn-vue) when you need
  dialogs, menus and comboboxes.
- **Not yet built:** idea scanning, research, outlining, streaming critique, title/social generation.
