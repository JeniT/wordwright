# TODO: shared task board

Statuses: **In progress** → **Ready** (can start now) → **Backlog** (needs a decision or a prerequisite) → **Done**.
Protocol for claiming and finishing tasks is in [AGENTS.md](AGENTS.md#working-in-parallel-with-other-agents).
Task format: `T<n> · title`, then why, then acceptance criteria. Add new tasks at the bottom of their section.

## Decisions needed (owner)

- **D1: Email provider for production.** Plan is a provider-neutral SMTP adapter (works with Resend, Postmark,
  SES, Mailgun, Gmail relay, etc.), so this only affects what you configure, not the code. Which will you use?
- **D2: Source for idea generation.** News API (which?), RSS/feeds, web search, or scholarly (OpenAlex/Crossref,
  free, no key). Needed before T6.
- **D3: Hosting target** (affects Docker/deploy tasks and whether SQLite stays): single VM/Fly/Render/other?

## In progress

- **T1** · Real email delivery · claimed: Claude (this session) · branch: main (sole agent)

## Ready

### T1 · Real email delivery (`Mailer` adapter)

Why: password-reset links are only printed to the server log today (`ConsoleMailer`), so recovery doesn't work
for real users. Blocks T2, T3 and anything else that sends email.

- `SmtpMailer` adapter behind the existing `Mailer` port (`apps/api/src/mail/mailer.ts`), using `nodemailer`.
- Config: `MAIL_TRANSPORT=console|smtp`, `SMTP_URL` (or host/port/user/pass), `MAIL_FROM`; validated in
  `config.ts`; in production require `smtp` and a `MAIL_FROM`. Update `.env.example` and README.
- Contract-style tests against a local in-process SMTP server (e.g. `smtp-server`): message delivered with
  correct from/to/subject/body; auth failure and connection failure surface a clear error.
- A failure to send must not reveal whether the address exists (keep `forgot-password` response identical) but
  **must be logged** (without the reset link) so operators notice.
- Plain-text and simple HTML versions of the reset email; subject and wording friendly.
- Manual check path documented (e.g. using a local catcher such as Mailpit).

### T2 · Email verification at signup (depends on T1)

Why: today local accounts start unverified, which allows typo'd/pre-registered addresses (see
`docs/decisions.md`, "Account linking").

- Send a verification link after registration; single-use, hashed, expiring token (mirror password reset).
- `emailVerified` set on success; UI banner + "resend" (throttled) while unverified.
- Decide and document what unverified users can/can't do (suggest: can write, can't share profiles or be added).
- Tests: token expiry/reuse, resend throttling, verified state shown in `/auth/me`, e2e flow using the memory mailer.

### T3 · Invitations for people without accounts (depends on T1)

Why: sharing requires an existing account and leaks which emails are registered.

- Owner invites by email; if no account, send an invite link; accepting joins the profile after sign-up/sign-in.
- Remove the "No account with that email" response (always respond the same).
- Pending invites visible/revocable by the owner; expire after N days.

### T4 · Change password / set a password while signed in

- Account page: change password (needs current password), or _set_ one if the account is Google-only.
- Revoke other sessions on change. Tests incl. e2e.

### T5 · Push the repo to a remote so CI runs

- Create the GitHub repo (owner), add remote, push `main`, confirm `.github/workflows/ci.yml` passes
  (including the Playwright job). Consider branch protection requiring CI.

## Backlog

### T6 · Idea generation (needs D2)

Scan sources for recent items on the writer's topics of interest and propose long-form ideas.
Needs: topics-of-interest per profile, a `SearchProvider`/`NewsSource` adapter + contract tests, an LLM prompt
to turn items into pitches, UI to browse/accept/dismiss ideas and turn one into a draft. Add `evals/` cases.

### T7 · Research assistant

Find evidence, studies and opinion for a draft/idea; keep citations as structured data (title, URL, source,
date, why relevant) attached to the draft. Scholarly adapters (OpenAlex, Crossref) first.

### T8 · Argument + outline refinement

Interactive refinement of a thesis and a rough outline that feeds the editor.

### T9 · Critique that preserves the author's voice

Beyond the current single "critique" call: structure/argument/style passes, inline suggestions in Tiptap,
**streaming** responses via SSE. Needs real eval cases in `evals/promptfooconfig.yaml`.

### T10 · Titles, openings, closings and social posts

### T11 · Account/security extras

Active-sessions list + "sign out everywhere"; data export; ownership transfer for shared profiles;
`KEY_ENCRYPTION_SECRET` rotation tooling (ciphertexts are versioned `v1`).

### T12 · Production readiness (needs D3)

Dockerfile + deploy docs, HTTPS/reverse-proxy notes, shared rate-limit store if running >1 instance,
backups (SQLite file + the encryption secret), structured logging, health/readiness endpoints.

### T13 · Headless UI primitives

Adopt Reka UI / shadcn-vue when dialogs, menus or comboboxes are needed (replace `confirm()` in AccountView).

### T14 · Offer open-source models as a built-in option (later)

Per the owner: possibly host an open model for users without their own key. Needs cost/abuse design first.

## Done

- **T0a** · Monorepo scaffold: Vue + Hono + shared core, provider ports, CI config, Playwright + axe (`fe2857a`)
- **T0b** · Accounts: register, login, Google OIDC login, password reset (token flow), account deletion,
  profiles with sharing, CSRF/origin check, rate limiting (`968bc75`)
- **T0c** · Bring-your-own Anthropic key: encrypted storage, validation, per-user LLM resolution (`379ed63`)
- **T0d** · Startup/DB safety (legacy/newer DB detection), server-unreachable UI, e2e browser error watcher (`30b1983`)
