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

- **Model:** a user has any number of _profiles_; ideas and drafts belong to a profile (a draft may develop an idea). Profiles are shared by
  adding members (`owner` or `editor`). Registering does not create a profile: the landing page invites the new user to create (and set up) their own.
- **Profiles are publishing venues** (a Substack, a blog): each has a name, an optional website, and an
  optional picture (a coloured monogram is drawn when there isn't one). The home page lists them;
  `/profiles/new` creates one; `/p/<id>` is the profile's page; `/p/<id>/settings` edits it, shares it
  and deletes it. Still to come: reader personas and idea sources (see `TODO.md`).
- **Ideas** (`/p/<id>/ideas/new`, `/p/<id>/ideas/<idea>`): something to write about, which doesn't need an
  external source. An idea has a name ("What's your core idea?"), free-form notes, links to related work (web
  addresses, up to 50), and one or more drafts: one for a single post, several (kept in the order they were
  added) for a linked set of posts. Anyone a profile is shared with can work on its ideas. Deleting an idea
  deletes its links and drafts. The **Brainstorm** button is a placeholder until the conversation is built. API:
  `/api/profiles/:id/ideas` (list, create), `/:idea` (get, patch, delete), `/:idea/links`, `/:idea/drafts`.
  Drafts started on their own from the profile page still work and are listed separately.
- **Handles and profile ids:** every user has a unique `handle` (letters and digits only), shown to people as their
  _username_. They choose it when they sign up, and the form checks it against everyone else's as they
  type (`GET /api/auth/handle-available`; the server checks again on submit). Sign-ups through an external
  identity provider have no form to choose it on, so they get one derived from their name, e.g. `jenit`. A profile's id is `<creator's handle>-<slug of its name>`, such as
  `jenit-substack`; if that's taken by the same person a number is added (`jenit-substack-2`). Renaming a
  profile renames its id too; the old id permanently redirects to the new one, so shared links keep working. Two people can each have a
  `substack` because their handles differ.
- **Sign-up and first steps:** the form asks "What should we call you?" (`autocomplete="given-name"`, so
  browsers fill in a first name rather than a full one), a username, an email and a password. The landing
  page shows step-by-step instructions for getting an Anthropic API key, with a field to paste it into, until
  a key is saved (new users have to do this before the AI features work); a new user with no profile is also
  prompted to create one.
- **Profile pictures:** PNG, JPEG, WebP or GIF, up to 1 MB, stored in the database and served from
  `/api/profiles/:id/image` to members only. The type is decided by the file's bytes (not what the browser
  claims); SVG is refused because it can carry script. Each person can own up to 25 profiles.
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
- **Changing your email** (Account page) needs the password. We email a link to the _new_ address and switch
  only when it's opened (24 hours, newest request wins), so a typo can't lock anyone out. The new address
  counts as confirmed, the old one gets a "your email was changed" notice, and confirmation links, reset links
  and invitations addressed to the old address stop working. Changing or resetting the password cancels a
  pending change. Accounts with no password (Google-only) add one first. The notice to the old address has a
  **"this wasn't me"** link (7 days, while the account still has the address it moved to): on a button press it
  restores the old address, signs out every device and emails a password-reset link there.
- **Login with Google:** OpenID Connect code flow with PKCE, state and nonce, ID-token signature
  verified with `jose`. Set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and register
  `${PUBLIC_URL}/api/auth/oauth/google/callback` as the redirect URI. Other OIDC providers are a few
  lines of config (`OidcProvider`); others implement `IdentityProvider`.
- **Sharing is by invitation.** An owner (with a confirmed address) enters an email; we send a link valid
  for 7 days that works whether or not the person has an account yet. The invitee signs in or signs up with
  _that_ address and clicks Join. Nobody is ever added without accepting, the owner's reply is identical
  whether or not the address has an account or is already in (so it can't be used to look people up), and
  accepting from the emailed link also confirms the invitee's address. Owners see pending invitations and can
  resend or revoke them; each person can send 20 a day since every one emails a stranger, and any one address
  receives at most 5 a day from everyone together.
- **Declining and blocking invitations:** every invitation email links to a page where the invitee (signed in or
  not) can decline and, optionally, stop invitations from that sender or from everyone. The sender is never
  told: a declined invitation just stops being pending, and later invitations from a blocked sender (or any
  invitation to an address that blocks everyone) are dropped with the same reply as always. Confirmed accounts
  see and lift their blocks under "Who can invite you" on the Account page; blocks follow the person if they
  change their email.
- **Email confirmation:** new local accounts are _unconfirmed_; signup emails a link (valid 24 hours, newest
  link only, harmless to open twice). Unconfirmed people can write and use AI features, but **can't invite
  others**. A banner offers "Resend" (3 per hour). Confirmation also happens when someone signs in with
  Google, resets their password via the emailed link, or accepts an invitation sent to that address, since
  each proves ownership of it.
- **Abandoned signups are cleaned up.** Every 6 hours the server deletes accounts that never confirmed their
  email, are older than `UNCONFIRMED_ACCOUNT_TTL_DAYS` (default 14; 0 turns it off) and show no sign of use:
  no drafts or ideas, no saved API key, nobody else in their profiles. That frees addresses taken by typos. The signup
  email says so. The same pass removes expired sessions, used/expired links and old invitations. It logs
  counts only, never who.
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
