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

### T19 · Idea sources per profile (RSS feeds, ordered)

claimed: claude-session-1 · branch: T19

First step only: managing the list. Scanning/fetching feeds comes later (T6).

### T3f · Undo an email change from the old address

claimed: claude-session-2 · branch: T3f

The "your email was changed" notice has no way back: if someone who knew the password redirected the account,
the owner can't recover it. Add a time-limited "this wasn't me" link to the notice that restores the old address
and signs everything out (needs a decision on how long it should stay valid).

### T20c · Every draft belongs to an idea

claimed: claude-session-3 · branch: T20c

Wrap each existing standalone draft in an idea, require an idea to create a draft, and retire the profile
page's standalone draft list and "New draft". Reordering the drafts in a linked set is split out as T20e.

## Ready

### T5b · Move task tracking to GitHub Issues (optional)

Why: claiming a task is atomic there, so parallel agents can't take the same one, and `TODO.md` can shrink to a
summary. Also consider PRs with required CI (branch protection on private repos needs a paid GitHub plan).

### T3e · Reminder before an unconfirmed account is deleted

Email a warning a few days before the cleanup (needs a "reminded at" marker on the user), so a late confirmer
isn't surprised. Low priority: the signup email already states the rule.

### T3d · Declining and blocking invitations

Let an invitee decline from the email/page, and block further invitations from a sender or entirely (spam
protection beyond the per-sender cap). Consider a per-recipient cap too, so many owners can't pile on one address.

### T16 · Audiences / reader personas per profile

Why: part of the venue-profile spec that T15 didn't build. Each profile has a set of target readers.

- Table + store + routes under `/api/profiles/:id/audiences` (name, short description; members read, owner edits).
- Schemas in `packages/core/src/domain.ts`; section on the profile page with empty/loading/error states.
- Cascade on profile deletion; tests incl. account deletion and an e2e flow.

### T17 · Use `validateJson` on every route (readable 400 messages)

Why: `zValidator`'s default 400 body is a zod object, which the UI shows as "[object Object]" (fixed for the
profile routes only; see `docs/decisions.md`). Switch `auth`, `account`, `drafts`, `llm`, `assist` routes, check
schema messages read well for people (e.g. `PasswordSchema`), and add an e2e check on the register form.

### T18 · Let people choose or change their handle

Why: people now choose their username at sign-up, but can't change it, and sign-ups through Google still get a
generated one (`jenit`) with no chance to pick. Add an account setting (reusing `GET /api/auth/handle-available`,
`UsernameInputSchema`), perhaps prompting Google sign-ups once, and a rule for what happens to existing profile ids (they stay; only new ones use it).
Consider a reserved-words list and a rate limit.

### T20b · Brainstorm conversation for an idea

Why: the button on the idea page is a placeholder. Needs the conversation design (owner to describe how
brainstorming should work), a stored message thread per idea, and calls on the requesting user's own key.

### T20e · Reorder the drafts in a linked set

Why: an idea's drafts are shown in the order they were added, which is the reading order for a linked set of
posts; people need to change it.

### T20d · Pictures: downscale on upload, and a storage port

Why: split out of the original T20. Downscale profile pictures on upload; move pictures behind a storage port
if/when D3 picks object storage.

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

### T19 · Idea sources per profile (needs D2)

The set of sources scanned for articles that could spark ideas for a profile. Depends on the `SearchProvider` /
news-source decision in D2 and is the input to T6.

## Done

- **T20** · Ideas, first step: each profile has ideas with a name, notes, links to related work and one or more
  drafts (a single post or an ordered, linked set); idea list on the profile page; deletion with confirmation;
  Brainstorm button present but disabled. Existing drafts stay standalone. (`f954432`)

- **T0a** · Monorepo scaffold: Vue + Hono + shared core, provider ports, CI config, Playwright + axe (`fe2857a`)
- **T0b** · Accounts: register, login, Google OIDC login, password reset (token flow), account deletion,
  profiles with sharing, CSRF/origin check, rate limiting (`968bc75`)
- **T0c** · Bring-your-own Anthropic key: encrypted storage, validation, per-user LLM resolution (`379ed63`)
- **T1** · Real email delivery: provider-neutral SMTP adapter, `console` (zero-setup default) / `file` / `smtp`
  transports, HTML+text templates, background sending with logged failures, startup SMTP check, e2e password
  recovery test (`15d87c0`)
- **T3b** · Cleanup of unused, unconfirmed accounts (14 days, configurable) plus expired sessions/links/invitations,
  via an in-process 6-hourly job sharing the account-deletion code (`6ba8af2`)
- **T3c** · Change email address: password check, link to the new address, old address notified and its links
  retired, pending change cancelled by a password change/reset (`52b6d7b`)
- **T5** · Repo pushed to a private GitHub repository (`JeniT/writing-assistant`); CI (checks + browser tests)
  passes on a clean Linux runner; actions updated off Node 20 and runner pinned to `ubuntu-24.04`
- **Onboarding** · Chosen usernames with live availability check; "What should we call you?" with first-name
  autofill; no profile created at sign-up (the landing page prompts for one); API-key instructions and field on
  the landing page until a key is saved
- **T15** · Venue profiles: user handles and readable ids (`jenit-substack`), website link, picture with
  monogram fallback, profile list on the home page, create page, profile page, settings page (sharing and deletion
  moved here from Account), id migration for existing data. Audiences, sources and ideas are T16/T19/T20.
- **T21** · Renaming a profile renames its readable id; old ids permanently redirect (301/308 from the API for
  members, address bar updated in the web app); retired ids are never reused
- **T4** · Change password while signed in (current password required, other devices signed out, notice
  email) and add a password to Google-only accounts via an emailed link (`ecff6ed`)
- **T3** · Invitations: owners invite by email (account or not), 7-day hashed links bound to the address,
  pending list with resend/revoke, uniform responses (no account lookup), per-person send cap, safe
  post-login redirect (`083b5d8`)
- **T2** · Email verification at signup: hashed 24h single-newest links, confirm page, banner + throttled resend,
  sharing gated on confirmed addresses on both sides (`7ce3483`)
- **T0d** · Startup/DB safety (legacy/newer DB detection), server-unreachable UI, e2e browser error watcher (`30b1983`)
