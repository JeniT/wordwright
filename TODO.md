# TODO: shared task board

Statuses: **In progress** → **Ready** (can start now) → **Backlog** (needs a decision or a prerequisite) → **Done**.
Protocol for claiming and finishing tasks is in [AGENTS.md](AGENTS.md#working-in-parallel-with-other-agents).
Task format: `T<n> · title`, then why, then acceptance criteria. Add new tasks at the bottom of their section.

## Decisions needed (owner)

- **D1: Email provider for production.** The SMTP adapter is built and works with any provider, so this only
  affects what you configure (`SMTP_URL`, `MAIL_FROM`). Which will you use? Needed before deploying.
- **D2: Source for idea generation.** News API (which?), RSS/feeds, web search, or scholarly (OpenAlex/Crossref,
  free, no key). Needed before T6.
- **D3: Hosting target** (affects Docker/deploy tasks and whether SQLite stays): single VM/Fly/Render/other?

## In progress

- **T15** · Venue profiles: readable ids, user handles, image, site link, list/create/profile pages ·
  claimed: Claude (T15 session) · branch: T15 (worktree `.worktrees/T15`)

## Ready

### T3b · Purge never-confirmed accounts

Why: unconfirmed signups (typos, abandoned) accumulate and keep addresses "taken". Delete accounts that are
unconfirmed, have no drafts, and are older than N days (scheduled job); announce in the signup email. Needs T12's
job runner or a simple interval in the server.

### T3c · Change email address

Re-verify the new address before switching; invalidate outstanding links for the old one (tokens already bind the
address they were sent to).

### T3d · Declining and blocking invitations

Let an invitee decline from the email/page, and block further invitations from a sender or entirely (spam
protection beyond the per-sender cap). Consider a per-recipient cap too, so many owners can't pile on one address.

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
- **T1** · Real email delivery: provider-neutral SMTP adapter, `console` (zero-setup default) / `file` / `smtp`
  transports, HTML+text templates, background sending with logged failures, startup SMTP check, e2e password
  recovery test (`15d87c0`)
- **T4** · Change password while signed in (current password required, other devices signed out, notice
  email) and add a password to Google-only accounts via an emailed link (`TBD`)
- **T3** · Invitations: owners invite by email (account or not), 7-day hashed links bound to the address,
  pending list with resend/revoke, uniform responses (no account lookup), per-person send cap, safe
  post-login redirect (`083b5d8`)
- **T2** · Email verification at signup: hashed 24h single-newest links, confirm page, banner + throttled resend,
  sharing gated on confirmed addresses on both sides (`7ce3483`)
- **T0d** · Startup/DB safety (legacy/newer DB detection), server-unreachable UI, e2e browser error watcher (`30b1983`)
