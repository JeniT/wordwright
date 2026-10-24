# Wordwright

A web app to support the writer's journey: idea generation, research, argument and outline refinement,
critique that preserves your voice, and supplementary material (titles, openings, social posts).

Currently implemented: accounts and login (email + password, optional Google), password recovery,
account deletion, multiple publications per user with sharing, drafts (Markdown-backed rich text editor)
and an LLM-powered critique. The rest is built on the same provider architecture.

> **Contributing or picking this up in a new session?** Start with [AGENTS.md](AGENTS.md), then
> the [GitHub issues](https://github.com/JeniT/wordwright/issues). Design rationale is in [docs/adr/](docs/adr/README.md).

> The repository is on GitHub (private): `JeniT/wordwright`. CI runs the full check plus the browser tests on every push.

## Stack

| Concern         | Choice                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| Monorepo        | pnpm workspaces, TypeScript (strict)                                                                 |
| `apps/web`      | Vue 3, Vite, Pinia, Vue Router, TanStack Query, Tiptap, Tailwind CSS v4                              |
| `apps/api`      | Hono on Node, Zod validation, SQLite (`node:sqlite`)                                                 |
| `packages/core` | Domain schemas (Zod) and provider interfaces + adapters, shared by web and api                       |
| Tests           | Vitest, Testing Library, MSW, Playwright (+ axe), Promptfoo (`evals/`, see `docs/responsible-ai.md`) |

## Design

The look is the **Ember** design system: a side menu, IBM Plex Sans throughout, warm stone neutrals with one
burnt-orange accent, clearly outlined controls, and a light and dark mode (it follows your system; the button at
the foot of the side menu overrides it). Colours are chosen by _role_ in one palette file, never in components, so
the design is easy to edit or swap:

- [docs/design/](docs/design/README.md): the principles, colour roles, components, and how to apply the design to a change
- [`apps/web/src/theme/`](apps/web/src/theme): `palette-ember.css` (the colours, light and dark) and `theme.css` (fonts, components)
- [docs/adr/visual-design-and-navigation/visual-design-ember.md](docs/adr/visual-design-and-navigation/visual-design-ember.md): why Ember, and the other options we looked at
  (screens and write-ups in [docs/design-concepts/](docs/design-concepts/README.md))

Contrast is tested (`palette.test.ts`) and axe runs in the e2e suite; fonts are self-hosted (SIL OFL), so no
request goes to a font service.

## Navigation

The side menu **follows you**: what it lists depends on where you are (home → publication → idea), and every numbered step is a link, never locked. The levels, what each lists, and the rules for a new page are in [docs/design/navigation.md](docs/design/navigation.md). Front doors: `/` Home; `/p/<id>` a publication's landing page; `/p/<id>/ideas/<idea>` → Note; `/p/<id>/settings` → `/settings/details` (members: `/description`); `/account` → `/account/details`.

## Getting started

Requires Node 24+ and pnpm.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # optional; defaults use the fake LLM
pnpm dev                                  # web on :5173, API on :8787
```

The API reads real environment variables. `pnpm dev` loads `.env` from the repository root and from `apps/api` (the second wins; a variable already set in your shell beats both), and says so on start-up if one of them is missing, which is fine. Restart `pnpm dev` after editing it. Anything else (`pnpm --filter @wordwright/api start`) reads only the real environment: load a file with `node --env-file=.env` or your shell.
To use Claude: `LLM_PROVIDER=anthropic ANTHROPIC_API_KEY=... pnpm dev`.

## Troubleshooting

- **"… was created by a newer version of this app"**: your database is from before the schema was reset (#174).
  Delete it (and its `-wal`/`-shm` files). The default file is now `apps/api/data/wordwright.sqlite`; the old
  `lfwa.sqlite` is no longer used and can go.
- **"Cannot start: … is from an early development version"**: your `apps/api/data/wordwright.sqlite` predates
  schema versioning. If you don't need it, move or delete it (and its `-wal`/`-shm` files) and restart.
- **Console full of `http proxy error … ECONNREFUSED`**: the API isn't running. Look at the `apps/api`
  lines at the top of the `pnpm dev` output for the reason; the web app shows "We can't reach the
  server" until it's back.

## Scripts

| Command         | What it does                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`    | Format check, lint, typecheck, unit/component/API tests (what CI runs first)                                                                                                                                                      |
| `pnpm test`     | Vitest in every package                                                                                                                                                                                                           |
| `pnpm test:e2e` | Playwright against the web app + API (real SQLite file, fake LLM); fails on any uncaught exception, `console.error`, failed request or 5xx in the browser (`pnpm --filter @wordwright/web exec playwright install chromium` once) |
| `pnpm build`    | Typecheck and production-build everything                                                                                                                                                                                         |

## Architecture: pluggable external services

Application code depends on **ports** in `packages/core/src/providers`, never on a vendor SDK:

- `LLMProvider` — `complete()` and `stream()` for single prompts, and `chat()` for conversations in which the model may
  call tools (streamed `text` / `tool_call` / `done` events; no sampling options), and `listModels()`, the models the
  key can use (it spends no tokens, so it also checks the key). Adapters: `AnthropicProvider`,
  `FakeLLMProvider` (scriptable). The contract suite can also be run against the real service:
  `ANTHROPIC_API_KEY=... pnpm --filter @wordwright/core test`.
- `SearchProvider` — for news, web and scholarly sources (Crossref, OpenAlex, ...). Only a fake exists so far.

**Prompts** (the instructions given to the AI) are not in code: they are Markdown files in [`prompts/`](prompts/README.md).

To add a service: implement the interface, run the shared contract suite from
`@wordwright/core/testing` against it (see `packages/core/src/providers.test.ts`), then register it where
`apps/api/src/server.ts` builds `Providers`. `createApp()` takes its dependencies as arguments, so
tests inject fakes and nothing hits the network.

## Accounts, AI keys and features

- [docs/accounts.md](docs/accounts.md): accounts and sign-in, publications and sharing, ideas, drafts, deletion, and email.
- [docs/byok.md](docs/byok.md): each user's own LLM key, and how to add a provider.
- [docs/ai-features.md](docs/ai-features.md): the brainstorm (Refine), Research, Critique and Rephrase, with their APIs and limits.

## Notes and next steps

- **Deploying:** production is two containers on one machine (the API and Caddy); the files and steps are in
  [docs/deploy.md](docs/deploy.md). `GET /health` says the process is up and `GET /ready` that the database is open and
  migrated.
- **Storage:** stores in `apps/api/src/db` use `node:sqlite` with versioned migrations
  (`PRAGMA user_version`). Swap in Postgres or add an ORM (e.g. Drizzle) when you need to.
- **UI components:** Tailwind plus our own component classes ([docs/design/](docs/design/README.md)); add headless primitives
  (Reka UI / shadcn-vue) when you need dialogs, menus and comboboxes, styled with the same roles.
- **Not yet built:** idea scanning, outlining, streaming critique, social posts (#164).
