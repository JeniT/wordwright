# Start here

**Wordwright**: a web app that supports a writer's whole journey: finding ideas, researching
sources, shaping an argument and outline, critiquing drafts _without losing the author's voice_, and generating
titles/openings/social posts. Users bring their own LLM API key; the service has no server-wide LLM key.

## The owner's four priorities (these decide trade-offs)

1. **Good, clean interface design.** Calm and book-like, not busy. Every screen is keyboard-usable and passes the
   axe checks; every async action has loading, empty and error states; error messages say what the person can do
   next. Semantic HTML, labelled controls, checked at phone width. The look is the **Ember** design system: follow it.
2. **Flexibility to plug in and rely on external services.** Application code depends on **ports** (interfaces in
   `packages/core`), never on a vendor SDK; each service is an adapter with a fake, injected not imported.
3. **Robust engineering practices.** Tests with every change, strict TypeScript, Zod-validated inputs at every
   boundary, secrets never logged or returned, append-only migrations, failures that explain themselves. Prefer
   boring, well-tested solutions.
4. **Augment the writer; never substitute for them.** The AI helps people think and judge their own writing. It
   does not write what they publish, add AI-generated text to the information environment, encourage dependence on
   it, or keep people using it for its own sake. The goal is **finished, published writing**; anything that can be
   re-run forever is limited. Every AI feature names its rung on the assistance ladder.

## Read before you act

| When you are…                                                           | Read                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Choosing what to work on, or starting an issue                          | [docs/agents/claim.md](docs/agents/claim.md)                           |
| Changing anything people see                                            | [docs/design/](docs/design/README.md)                                  |
| Writing or changing any UI words                                        | [docs/style-guide.md](docs/style-guide.md), [CONTEXT.md](CONTEXT.md)   |
| Calling an LLM, or editing a prompt                                     | [docs/responsible-ai.md](docs/responsible-ai.md), `prompts/README.md`  |
| Adding an LLM adapter, boundary evals or invariant tests                | [docs/evals.md](docs/evals.md)                                         |
| Changing `apps/web`                                                     | [docs/agents/conventions-web.md](docs/agents/conventions-web.md)       |
| Changing `apps/api`, `packages/core`, the database, or adding a service | [docs/agents/conventions-api.md](docs/agents/conventions-api.md)       |
| Running tests, formatting or editing files                              | [docs/agents/testing.md](docs/agents/testing.md)                       |
| About to commit                                                         | [docs/agents/definition-of-done.md](docs/agents/definition-of-done.md) |
| Ready to merge                                                          | [docs/agents/landing.md](docs/agents/landing.md)                       |
| Triaging an `inbox` issue, or filing one                                | [docs/agents/triage.md](docs/agents/triage.md)                         |
| Running a content crit                                                  | [docs/agents/content-crit.md](docs/agents/content-crit.md)             |
| Asking why something is the way it is                                   | [docs/adr/](docs/adr/README.md)                                        |
| Setting up; learning the architecture                                   | [README.md](README.md)                                                 |
| Changing sign-in, accounts, publications, sharing, ideas or drafts      | [docs/accounts.md](docs/accounts.md)                                   |
| Changing key handling or adding an LLM provider                         | [docs/byok.md](docs/byok.md)                                           |
| Changing brainstorm, Research, Critique or Rephrase                     | [docs/ai-features.md](docs/ai-features.md)                             |
| Deploying or operating a server                                         | [docs/deploy.md](docs/deploy.md)                                       |

Any other doc: [docs/README.md](docs/README.md) says when to open each one.
Issues are on [GitHub](https://github.com/JeniT/wordwright/issues): `gh issue list --label ready`.
`docs/design-concepts/` is an archive of options considered; read it only when asked.

## Commands (Node 24+, pnpm)

|                 |                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------- |
| `pnpm dev`      | web on :5173, API on :8787 (set `FAKE_LLM=true` to avoid real LLM calls)                      |
| `pnpm check`    | every check except build and e2e (see the `check` script). **Must pass before every commit.** |
| `pnpm test:e2e` | Playwright; fails on any uncaught exception, `console.error`, failed request or 5xx           |
| `pnpm build`    | production build (`pnpm check` has already typechecked)                                       |
| `pnpm eval`     | rough smoke test of the AI's behaviour; asks for a key (hidden) and trials; costs money       |

## Gotchas nothing else records

- Work in a worktree (`.worktrees/issue-N`); local `main` is shared by every session and receives only a fast-forward
  from `origin/main`.
- Edit with the Edit tool, or `perl -pi -e` across files: this is macOS and BSD `sed -i` fails.
- Keys go into the app's own field. A key typed into a chat with an agent is leaked.
- Prompts live in `prompts/` as Markdown; a change there changes the product's behaviour, so say so in the commit
  and ask the owner to review it.
