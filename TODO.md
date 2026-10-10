# Tasks live in GitHub Issues

Open tasks and owner decisions are issues in [JeniT/writing-assistant](https://github.com/JeniT/writing-assistant/issues).
This file is only the history of what was finished before the move (T5b), so it no longer needs updating.
Protocol for claiming and finishing tasks is in [AGENTS.md](AGENTS.md#working-in-parallel-with-other-agents).

| Look for                | Command                             |
| ----------------------- | ----------------------------------- |
| Tasks you can start now | `gh issue list --label ready`       |
| Tasks being worked on   | `gh issue list --label in-progress` |
| Needs a prerequisite    | `gh issue list --label backlog`     |
| Decisions for the owner | `gh issue list --label decision`    |

Issue titles keep the old `T<n>` ids so commits and `docs/` references still make sense; new tasks are just `#<n>`.

## Done before the move to GitHub Issues

- **T5b** · Task tracking moved to GitHub Issues (see above and [AGENTS.md](AGENTS.md#working-in-parallel-with-other-agents)):
  open tasks and owner decisions became issues #1–#22, claiming a task is now an atomic branch creation, and this
  file is a frozen history.

- **T25** · Refactor, no behaviour change: requesting, confirming and undoing an email change moved out of
  `AccountService` (530 → 374 lines) into `EmailChangeService` (`services/email-change.ts`: `request` / `confirm` /
  `undo`), wired in `createApp`. Routes, error codes and tests are unchanged apart from one import. (`da1831d`)

- **T26** · Shared button styles, no behaviour change: `btn` plus `btn-primary` / `btn-outline` / `btn-neutral` /
  `btn-danger` / `btn-sm` in `style.css` replace the copied class strings in 18 components and views, so the focus ring
  is defined once. Left alone on purpose: the full-width sign-in buttons (different text size), the source-list
  arrows, and `ConfirmDialog`. Follow-up if wanted: fold those into the same set. (`1a8741f`)

- **T27** · Refactor, no behaviour change: `BrainstormService` passes one `ReplyContext` to `reply`, `saveReply` and
  `saveStopped`, and builds the "is waiting for a reply" 409 once; the idea routes' `param` / `find` helpers are typed
  with Hono's `Context`, so the `!` assertions are gone. (`41a827a`)

- **T24** · Refactor, no behaviour change: `createApp` builds limiters through one helper with named durations,
  `profileRoutes` takes an options object, `imageResponse` serves profile pictures and source icons with one set
  of security headers, `AccountService` has `expiresIn` / `isUniqueViolation` and one background-mail path,
  and `TokenStore` shares its one-time-link row mapping. (`4a53595`)

- **T20b4** · The brainstorm page (`/p/:profile/ideas/:idea/brainstorm`): the shared thread with names and models,
  the editor's words streaming in (read over `fetch`, with Stop), Markdown rendered safely (`markdown-it`, HTML and
  images off), suggestion cards with a line diff of the notes and Accept / Dismiss / Apply anyway, Try again,
  "someone is waiting", Start again with confirmation, a message refused before it starts goes back in the box; the
  idea page's Brainstorm button is now a link that starts the conversation at once; `FAKE_LLM` has a scripted editor.
  (`3840a28`)
- **T20b2** · Brainstorming API: a shared thread per idea (`idea_messages`, `idea_proposals`); the service builds the
  system prompt (the person's prompt + the app's rules), the idea snapshot (title, notes, related links, venue,
  draft titles only; sent again only when the idea changes) and replays the thread in a provider-neutral format;
  streams a reply over server-sent events; the AI can only propose (`update_idea`, `create_idea`), proposals are
  accepted (with a stale-text check) or dismissed by any member, and answered to the AI on its next turn; one reply
  in flight per idea, 30 messages per 10 minutes per person, 3-minute reply timeout, Stop keeps what was said, Try
  again after a failure, Start again wipes the thread. Reader (audience) descriptions arrive with T16. (`6532148`)
- **T20b3** · Brainstorming prompt on the account page: each person can edit, save and reset their own version of the
  default commissioning-editor prompt (`prompts/brainstorm-default.md`); a version identical to the default isn't
  stored, so improvements to the default reach everyone who hasn't changed theirs; `BrainstormPromptService.effective()`
  is what the brainstorm service (T20b2) will send. (`f096b0a`)
- **T20b1** · LLM port with tools and streaming: `chat()` on `LLMProvider` (Anthropic adapter, scriptable fake,
  contract tests incl. an opt-in live run), rate-limit/provider error classes, `llmTool` (Zod to JSON Schema); and a
  top-level `prompts/` folder of editable Markdown prompts (critique, default brainstorming, brainstorming rules)
  shared with the evals. (`d07e385`)
- **T22** · Related-work links: titles fetched from the page (address shown when there is none), links can be
  edited, duplicates refused (the typed address is kept with the error shown under the field), and text that isn't a
  plausible, existing web address is rejected. Page lookup is a `PageInfoFetcher` port with an SSRF-safe HTTP
  adapter, fake and contract suite. (`408579c`)
- **T20** · Ideas, first step: each profile has ideas with a name, notes, links to related work and one or more
  drafts (a single post or an ordered, linked set); idea list on the profile page; deletion with confirmation;
  Brainstorm button present but disabled. Existing drafts stay standalone. (`f954432`)
- **T19b** · Feed details for idea sources: feeds are read when added (`FeedFetcher` port, fake, contract suite, SSRF-safe
  HTTP adapter); title, description and icon shown; members (not just owners) edit; drag-and-drop reordering (`938463b`)
- **T19** · Idea sources per profile: ordered list of RSS feed addresses (add, remove, reorder)
  on the profile settings page (`938463b`)
- **T20c** · Every draft belongs to an idea: existing drafts wrapped in ideas by a migration, drafts created only
  through an idea, standalone draft list and "New draft" removed. Also fixed profile rename failing for
  profiles that have ideas. (`5dccc68`)

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
- **T3f** · "This wasn't me" link in the email-change notice: restores the old address, signs out all devices,
  emails a reset link (7-day link, button-confirmed) (`14e3422`)
- **T3d** · Declining and blocking invitations: decline from the email, block a sender or everyone (silent for
  the sender), manage blocks on the Account page, 5-a-day cap per address (`fb3c7cb`)
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
