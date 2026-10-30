# Conventions for the API, core and database

Read this when you add or change code in `apps/api`, `packages/core` or `prompts/`.

- **Layout.** `apps/api`: Hono API. `routes/` (HTTP only) → `services/` (business rules) → `db/` (SQLite stores).
  `createApp(deps)` takes every dependency as an argument; tests inject fakes and never touch the network.
  `packages/core`: Zod schemas, provider ports + adapters + fakes, contract test suites, shared by web and api.
  `prompts/`: the instructions given to the AI, as plain Markdown (`@wordwright/prompts`); edit prompts there, never
  inline in code, and see `prompts/README.md`.
- **Schemas first.** New API shapes go in `packages/core/src/domain.ts` and are used by both sides.
- **Database:** append a new entry to `MIGRATIONS` in `apps/api/src/db/database.ts`; applied entries stay as they are (the
  pre-launch fold into one schema, [#308](../adr/go-live-and-operations/migrations-collapsed-into-one-schema-before-launch.md), was the single exception).
  Deleting a user must still remove everything that belongs only to them (use `ON DELETE CASCADE`, and extend the
  account-deletion tests).
- **API errors:** services and routes throw `fail(status, message)` (or `notFound()`) from `apps/api/src/errors.ts`;
  `app.ts` turns it into `{ error }`. Only routes know Hono; services take plain arguments. Read path parameters with `param(c, 'id')`
  (`routes/params.ts`), not `c.req.param('id')!`.
- **External services:** application code depends on **ports** in `packages/core`, never on a vendor SDK. A new
  service means: implement the interface → run the shared contract suite against it (`@wordwright/core/testing`) →
  register it in `apps/api/src/server.ts`. For an LLM, also run the behaviour evals against it
  (`pnpm eval:adapter -- --provider <id> --model <model>`, which asks for a key; a smoke test, not proof) and paste
  the summary in the issue for the owner. Route code asks for a port; the provider is chosen where it is registered.
- **Security defaults:** cookies `HttpOnly` + `SameSite=Lax`; tokens stored hashed; no account enumeration
  (except where the product must, e.g. registration); throttle anything that can be guessed or costs money;
  request bodies, keys, tokens and reset links stay out of logs in production code paths.
- **Per-user spending:** AI calls use the _requesting_ user's own key (`LlmKeyService.resolve`). There is no
  fallback to a shared key.
- **New dependencies:** prefer the platform and what's already installed. Explain any new one in the commit, and keep [dependencies.md](../dependencies.md) (licences, versions) true.
- **LLM features** also need [responsible-ai.md](../responsible-ai.md) before you design or change them.
