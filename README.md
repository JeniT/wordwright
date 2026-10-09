# Long-form Writing Assistant

A web app to support the writer's journey: idea generation, research, argument and outline refinement,
critique that preserves your voice, and supplementary material (titles, openings, social posts).

Currently implemented: accounts and login (email + password, optional Google), password recovery,
account deletion, multiple profiles per user with sharing, drafts (Markdown-backed rich text editor)
and an LLM-powered critique. The rest is built on the same provider architecture.

> **Contributing or picking this up in a new session?** Start with [AGENTS.md](AGENTS.md), then
> [TODO.md](TODO.md). Design rationale is in [docs/decisions.md](docs/decisions.md).

> The repository is on GitHub (private): `JeniT/writing-assistant`. CI runs the full check plus the browser tests on every push.

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

## Troubleshooting

- **"Cannot start: … is from an early development version"**: your `apps/api/data/lfwa.sqlite` predates
  schema versioning. If you don't need it, move or delete it (and its `-wal`/`-shm` files) and restart.
- **Console full of `http proxy error … ECONNREFUSED`**: the API isn't running. Look at the `apps/api`
  lines at the top of the `pnpm dev` output for the reason; the web app shows "We can't reach the
  server" until it's back.

## Scripts

| Command         | What it does                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`    | Format check, lint, typecheck, unit/component/API tests (what CI runs first)                                                                                                                                                |
| `pnpm test`     | Vitest in every package                                                                                                                                                                                                     |
| `pnpm test:e2e` | Playwright against the web app + API (real SQLite file, fake LLM); fails on any uncaught exception, `console.error`, failed request or 5xx in the browser (`pnpm --filter @lfwa/web exec playwright install chromium` once) |
| `pnpm build`    | Typecheck and production-build everything                                                                                                                                                                                   |

## Architecture: pluggable external services

Application code depends on **ports** in `packages/core/src/providers`, never on a vendor SDK:

- `LLMProvider` — `complete()` and `stream()`. Adapters: `AnthropicProvider`, `FakeLLMProvider`.
- `SearchProvider` — for news, web and scholarly sources (Crossref, OpenAlex, ...). Only a fake exists so far.

To add a service: implement the interface, run the shared contract suite from
`@lfwa/core/testing` against it (see `packages/core/src/providers.test.ts`), then register it where
`apps/api/src/server.ts` builds `Providers`. `createApp()` takes its dependencies as arguments, so
tests inject fakes and nothing hits the network.

## Accounts and sign-in

- **Model:** a user has any number of _profiles_; drafts belong to a profile. Profiles are shared by
  adding members (`owner` or `editor`). Registering creates a default personal profile.
- **Sessions:** random token in an `HttpOnly`, `SameSite=Lax` cookie; only its SHA-256 is stored
  server-side. 30-day expiry. Cross-origin writes are rejected by an `Origin` check.
- **Passwords:** scrypt (`node:crypto`), 10-128 characters. Reset links are single-use, expire after
  an hour, and signing in elsewhere is revoked when a password changes. Responses never reveal whether
  an address has an account (except at registration, which has to say so), and that includes
  inviting someone to a profile.
- **Changing your password** (Account page) needs the current one, signs out every _other_ device, cancels any
  reset link already out, and emails a "your password was changed" notice with a link to reset if it wasn't
  you. Google-only accounts can **add** a password: instead of typing one on the page, they're emailed a link
  (the reset flow), so a hijacked session alone can't add a password and keep access.
- **Login with Google:** OpenID Connect code flow with PKCE, state and nonce, ID-token signature
  verified with `jose`. Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and register
  `${PUBLIC_URL}/api/auth/oauth/google/callback` as the redirect URI. Other OIDC providers are a few
  lines of config (`OidcProvider`); others implement `IdentityProvider`.
- **Sharing is by invitation.** An owner (with a confirmed address) enters an email; we send a link valid
  for 7 days that works whether or not the person has an account yet. The invitee signs in or signs up with
  _that_ address and clicks Join. Nobody is ever added without accepting, the owner's reply is identical
  whether or not the address has an account or is already in (so it can't be used to look people up), and
  accepting from the emailed link also confirms the invitee's address. Owners see pending invitations and can
  resend or revoke them; each person can send 20 a day since every one emails a stranger.
- **Email confirmation:** new local accounts are _unconfirmed_; signup emails a link (valid 24 hours, newest
  link only, harmless to open twice). Unconfirmed people can write and use AI features, but **can't invite
  others**. A banner offers "Resend" (3 per hour). Confirmation also happens when someone signs in with
  Google, resets their password via the emailed link, or accepts an invitation sent to that address, since
  each proves ownership of it.
- **Deleting an account** removes the user, credentials, sessions and memberships, and every profile
  (with its drafts) where they are the only member. In shared profiles they are removed and, if they
  were the owner, the longest-standing member becomes owner; drafts they wrote there stay.
- **Email:** see below.

## Email

Emails (password reset, address confirmation, invitations) go through the `Mailer` port, chosen by `MAIL_TRANSPORT`:

| Transport           | Use                                 | Setup                                                                                                    |
| ------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `console` (default) | local development                   | none: the email, link included, is printed in the `apps/api` output                                      |
| `file`              | e2e tests, or reading mail as files | `MAIL_OUTBOX_DIR` (each email becomes a JSON file)                                                       |
| `smtp`              | production                          | `SMTP_URL` + `MAIL_FROM`; works with any provider that offers SMTP (Resend, Postmark, SES, Mailgun, ...) |

To see real-looking mail locally without sending anything, run a catcher such as
[Mailpit](https://mailpit.axllent.org/) and set `MAIL_TRANSPORT=smtp SMTP_URL=smtp://localhost:1025`.
Production refuses to start unless it's `smtp` with a `MAIL_FROM`. At startup the API checks it can reach
the SMTP server and logs a warning if not. Emails are sent _after_ the response, so the forgot-password
answer is the same, and just as fast, whether or not the address has an account; delivery failures are
logged (user id and error code only, never the link).

## Bring your own LLM key

There is deliberately **no server-wide LLM key**: each user saves their own Anthropic API key under
_Account → AI assistant_, so usage is billed to them. Keys are checked with a 1-token call before
being saved, encrypted with AES-256-GCM (bound to the user, so a copied ciphertext won't decrypt for
anyone else), shown back only as `…1234`, and deleted with the account. Requests in a shared profile
run on the _requester's_ key.

- `KEY_ENCRYPTION_SECRET` (32+ chars, required in production) encrypts the keys. **Back it up**: if it's
  lost, every stored key is unreadable and users must re-enter theirs. Ciphertexts carry a `v1` prefix
  so rotation can be added later; there is no rotation tooling yet.
- `FAKE_LLM=true` swaps in a canned fake that accepts any key (development and e2e only; refused in
  production).
- To add a provider: extend `LLM_PROVIDER_IDS` / `LLM_MODELS` in `packages/core/src/domain.ts`, add an
  adapter implementing `LLMProvider` (translating credential failures to `LLMAuthError`), and a case
  in `apps/api/src/llm-factory.ts`.

## Notes and next steps

- **Storage:** stores in `apps/api/src/db` use `node:sqlite` with versioned migrations
  (`PRAGMA user_version`). Swap in Postgres or add an ORM (e.g. Drizzle) when you need to.
- **UI components:** Tailwind only for now; add headless primitives (Reka UI / shadcn-vue) when you need
  dialogs, menus and comboboxes.
- **Not yet built:** idea scanning, research, outlining, streaming critique, title/social generation.
