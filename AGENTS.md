# Start here

**Wordwright**: a web app that supports a writer's whole journey: finding ideas, researching
sources, shaping an argument and outline, critiquing drafts _without losing the author's voice_, and generating
titles/openings/social posts. Users bring their own LLM API key; the service has no server-wide LLM key.

Read in this order: this file → [GitHub Issues](https://github.com/JeniT/writing-assistant/issues) (what to work on; `gh issue list --label ready`) → [docs/decisions.md](docs/decisions.md)
(why things are the way they are) → [docs/responsible-ai.md](docs/responsible-ai.md) (how AI may and may not be used here) → [README.md](README.md) (setup, architecture, accounts, BYOK). **Before changing anything people see, read [docs/design.md](docs/design.md).**

## The owner's four priorities (these decide trade-offs)

1. **Good, clean interface design.** Calm and book-like, not busy. Every screen must be keyboard-usable and
   pass the axe accessibility checks; every async action needs loading, empty and error states; error messages
   say what the person can do next. Use semantic HTML and labelled controls. Check layouts at phone width.
   The look is the **Ember** design system ([docs/design.md](docs/design.md)): follow it, don't improvise.
2. **Flexibility to plug in and rely on external services.** Application code depends on **ports** (interfaces
   in `packages/core`), never on a vendor SDK. Each external service (LLM, search/news/scholarly sources,
   email, identity providers) is an adapter behind a port, with a fake for tests, and is injected, not imported.
   A new service means: implement the interface → run the shared contract suite against it
   (`@lfwa/core/testing`) → register it in `apps/api/src/server.ts`. For an LLM, also run the behaviour evals
   against it (`pnpm eval:adapter -- --provider <id> --model <model>`, which asks for a key; a smoke test, not proof)
   and paste the summary in the issue for the owner. Never type a key into a chat with an agent.
   Never hard-code a provider into a route.
3. **Robust engineering practices.** Tests with every change (see Definition of done), strict TypeScript,
   validated inputs at every boundary (Zod schemas shared via `@lfwa/core`), secrets never logged or returned,
   migrations append-only, failures that explain themselves. Prefer boring, well-tested solutions.
4. **Augment the writer; never substitute for them.** The AI helps people think and judge their own writing. It
   does not write what they publish, and the service must not add AI-generated text to the information environment,
   encourage dependence on it, or keep people using it for its own sake. The goal is **finished, published writing**,
   so no engagement design, and anything that can be re-run forever (critique, "more options") is capped. Every
   AI feature names its rung on the assistance ladder. Read [docs/responsible-ai.md](docs/responsible-ai.md) before
   designing or changing anything that calls an LLM or edits a prompt.

## Commands (Node 24+, pnpm)

|                 |                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm install`  | install                                                                                        |
| `pnpm dev`      | web on :5173, API on :8787 (set `FAKE_LLM=true` to avoid real LLM calls)                       |
| `pnpm check`    | format check + lint + typecheck + unit/component/API tests. **Must pass before every commit.** |
| `pnpm test:e2e` | Playwright; fails on any uncaught exception, `console.error`, failed request or 5xx            |
| `pnpm build`    | typecheck + production build                                                                   |
| `pnpm format`   | fix formatting                                                                                 |
| `pnpm eval`     | rough smoke test of the AI's behaviour; asks for a key (hidden) and trials; costs money        |

**Running `pnpm test:e2e` in several worktrees at once is fine.** Each worktree gets its own web and API ports
(hashed from its path; CI uses fixed ones) and its own database, and servers are never reused, so sessions don't
test each other's code. A second run in the _same_ worktree while one is going stops at once with "already used":
wait for the first. If a port is taken by something unrelated, pick others with `E2E_WEB_PORT` and `E2E_API_PORT`.
Don't kill another session's processes.

## Layout

- `packages/core`: Zod schemas, provider ports + adapters + fakes, contract test suites. Shared by web and api.
- `prompts/`: the instructions given to the AI, as plain Markdown files (`@lfwa/prompts`). **Edit prompts there**, never
  inline in code; see `prompts/README.md`.
- `apps/api`: Hono API. `routes/` (HTTP only) → `services/` (business rules) → `db/` (SQLite stores).
  `createApp(deps)` takes every dependency as an argument; tests inject fakes and never touch the network.
- `apps/web`: Vue 3 + Vite + Pinia + TanStack Query + Tiptap + Tailwind v4. `lib/api.ts` is the only place that
  calls the API, and it validates responses with the shared schemas. `src/theme/` is the design: the colour
  palette (`palette-ember.css`, the only place a colour is chosen) and the components built on it (`theme.css`).
- `docs/design.md`: the design system and how to apply it. `docs/design-concepts/`: the options we considered
  (an archive; the decision and reasons are in `docs/decisions.md`).

## Conventions

- **Add code in the existing style.** Look at a neighbouring file first. Comments explain _why_, not _what_.
- **Schemas first.** New API shapes go in `packages/core/src/domain.ts` and are used by both sides.
- **Database:** append a new entry to `MIGRATIONS` in `apps/api/src/db/database.ts`; never edit an applied one.
  Deleting a user must still remove everything that belongs only to them (use `ON DELETE CASCADE`, and extend the
  account-deletion tests).
- **Security defaults:** cookies `HttpOnly` + `SameSite=Lax`; tokens stored hashed; no account enumeration
  (except where the product must, e.g. registration); throttle anything that can be guessed or costs money;
  never log request bodies, keys, tokens or reset links in production code paths.
- **Per-user spending:** AI calls use the _requesting_ user's own key (`LlmKeyService.resolve`). Never add a
  fallback to a shared key.
- **UI text:** plain, friendly English; no jargon in error messages.
- **Styling (full rules in [docs/design.md](docs/design.md)):**
  - Use **roles, never raw colours**: `bg-surface`, `text-ink-soft`, `border-line-strong`, `text-danger`,
    `bg-accent-wash` ... Tailwind's default palette is switched off, so `bg-stone-100` or `text-red-700` simply
    does nothing. Never write a hex value or a `dark:` variant in a component; dark mode lives in the palette file.
  - Use the **component classes** (`btn btn-primary|outline|neutral|danger|quiet`, `field`, `panel`, `card`, `chip`,
    `callout`) instead of long utility strings, and `rounded-ctl` / `rounded-panel` instead of `rounded`.
    No shadows or gradients. One sans typeface, in the editor and chat too.
  - The **highlighter** (`chip-ai`, `bg-mark`) is only for what the AI suggested. Errors use `danger` (raspberry),
    with words and an icon, never colour alone.
  - Other websites' icons and logos go through `ProfileImage kind="source"` (a light plate, never bare).
  - Need a role, component or rule that doesn't exist? Add it to `theme/` (and the palette test) and update
    `docs/design.md`; don't style one screen differently.
- **Navigation (see [docs/design.md](docs/design.md#navigation-the-menu-follows-you)):** the side menu follows you
  (home → profile → idea). A new page declares `meta: { level, step }` on its route, titles itself with `StepHeading`,
  and ends with `NextStep` where a next step makes sense. Numbered steps are always links, never locked; a step that
  calls the AI waits for a button (visiting spends nothing); pages read beside another window set `compact: true`.
  Don't add a second `aside` (the drafting notes own the `complementary` landmark).
- **Reorderable lists:** use `ReorderableList` (drag grip, arrow buttons, focus and announcements) for any list
  whose order people can change, so they all look and behave alike.
- Don't add dependencies casually; prefer the platform and what's already installed. Explain any new one in the commit.

## Definition of done (every task)

1. Behaviour covered by tests at the right level: unit/API tests for logic, component tests for UI states
   (loading / empty / error), contract tests for adapters, and an e2e test for any new user-facing flow.
2. `pnpm check`, `pnpm build` and `pnpm test:e2e` all pass. No new console errors. UI changes follow
   [docs/design.md](docs/design.md) and have been looked at in light **and** dark mode and at phone width (390px).
3. Docs updated where behaviour changed (README section, `.env.example`, `docs/decisions.md` for non-obvious choices).
   A feature that calls an LLM also adds boundary evals, and an invariant test where a boundary is structural
   (see [docs/responsible-ai.md](docs/responsible-ai.md)). A change to anything in `prompts/` is a change to the
   product's behaviour: say so in the commit and ask the owner to review it.
4. The task's issue closed by the landing commit (`Closes #7` in its message) and its `in-progress` label removed;
   follow-up work filed as new issues; the main checkout brought up to date with `origin/main` (see _Landing_, step 5).
5. **Committed** with a message that says what and why. Commit after each feature; for large ones, commit at
   each green checkpoint. Don't leave work uncommitted at the end of a session.

## Triage: turning the owner's ideas, features and bugs into tasks

The owner drops raw thoughts into the issue list as they come, without having to shape them. An agent then talks
each one through with them and produces the real task and decision issues.

**Filing (the owner, or an agent on their behalf).** Open an issue with the label `inbox` plus one type label:
`idea` (a rough thought), `enhancement` (a feature) or `bug`. A title and a sentence or two is enough; for a bug,
what happened and what was expected. `inbox` means "not yet triaged": **agents never implement an `inbox` issue
directly**, and `gh issue list --label inbox` is the queue.

**Triage conversation.** When the owner asks to triage (a specific issue, or "what's in the inbox?"), an agent:

1. Reads the issue, plus what already exists: `docs/decisions.md`, open issues
   (`gh issue list --state all --search "<keywords>"`) and the code it touches. Say so if it duplicates or overlaps
   something; don't file a second copy.
2. **Talks it through with the owner before filing anything.** Ask a few questions at a time, only ones whose answers
   change the outcome. Offer a recommendation and the options you'd drop, rather than a survey. For a bug, try to
   reproduce it first and say what you found. For an idea or feature, test it against the four priorities above
   and name the cost (scope, new dependency, spending, migration). If it calls an LLM, also state its rung on the
   assistance ladder, what the writer does first, what text leaves the system, what is capped, and which boundary
   evals it needs (see [docs/responsible-ai.md](docs/responsible-ai.md)); without those it is not `ready`.
3. Agrees the outcome with the owner, which is one or more of:
   - **Task issues** for work that is clear: a "why", then acceptance criteria that include the tests and docs the
     Definition of done requires, small enough for one agent in one go. Label `ready`, or `backlog` if it waits on
     a prerequisite (name it: `Needs #12`). Add `bug` or `enhancement` too. A big feature becomes an ordered set of
     tasks, each its own issue, plus a design note in `docs/` if the reasoning needs a home.
   - **Decision issues** (label `decision`) for what the owner must choose: the question, the options with
     trade-offs, your recommendation, and which tasks it blocks.
   - **Nothing**: "won't do" or "already covered", with the reason. Label `wontfix` or `duplicate`.
4. Files them, then tidies the original: comment with links to everything it produced (`Triaged into #31, #32;
decision #33`), remove `inbox`, and close it. If the owner wants to keep it as the umbrella for several tasks,
   leave it open without `inbox` and list the tasks in a comment.
5. A confirmed `bug` that breaks something people already rely on (data loss, security, sign-in, a red `main`) is
   `ready` straight away and mentioned to the owner as urgent; other bugs queue like any task.

Triage produces issues, not code. If the owner then says "go ahead", claim the task as usual (see below).

## Working in parallel with other agents

- **GitHub Issues is the board.** Every task and owner decision is an issue, labelled `ready` (can start now),
  `backlog` (needs a decision or prerequisite), `decision` (the owner's to make), `in-progress` (claimed) or
  `inbox` (a raw report waiting for triage: see above).
  Pick from `gh issue list --label ready`; closed issues are Done. `TODO.md` is only a frozen history.
- **Never commit directly on local `main`.** It is shared, and a commit left on it is invisible to everyone else
  until some other session pushes it by accident. Every change, claims and docs included, goes through a worktree.
- **Check CI before starting a task, instead of waiting for it after a push.** CI takes minutes, and waiting for it
  holds up the next piece of work. So after landing, move on, and let the next start (or the next landing) be where
  CI is checked: run `gh run list --branch main --limit 5` before you claim anything.
  - **The latest finished run is red:** fixing it comes first. Read why with `gh run view <run id> --log-failed`.
    If your own earlier push broke it, fix it now. If it is someone else's, tell the owner, and file the fix as an
    issue and claim it straight away (see _Claim before starting_) so two agents don't fix the same thing.
  - **Runs are still in progress:** don't wait. Start, and look again at landing step 3, because a red can arrive
    while you work.
  - **Don't push on top of a red `main`** unless your push is the fix.
- **Claim before starting:** claiming is creating the task's branch on GitHub, which is atomic: only one agent can.
  1. `git fetch origin`, then `gh issue view 7` to check it is open, not `in-progress`, and its prerequisites are closed.
  2. `gh api repos/JeniT/writing-assistant/git/refs -f ref=refs/heads/issue-7 -f sha=$(git rev-parse origin/main)`.
     If it fails with "Reference already exists", someone else has the task: pick another.
  3. `gh issue edit 7 --add-label in-progress --remove-label ready` and
     `gh issue comment 7 --body "claimed: <agent/session> · branch: issue-7"`.
  4. `git fetch origin`, then `git worktree add .worktrees/issue-7 -b issue-7 origin/issue-7` and `pnpm install`
     once in it. You keep working in that worktree. No commit is needed to claim.
- **Landing (merging to `main`):** the local `main` checkout is shared by every session, so it may hold other
  sessions' unpushed commits. Never publish it; publish your own branch. Run these as **separate commands**, reading
  each result before the next:
  1. `git fetch origin`, then `git rebase origin/main` in your worktree (not `main`, which may be ahead with
     someone else's unpushed work). Resolve conflicts, keeping the other session's changes.
  2. Rerun `pnpm check`, `pnpm build` and `pnpm test:e2e` on the rebased branch.
  3. `git log origin/main..HEAD` must list only your commits. If anything else is there, stop and sort it out.
     Then check CI as above (`gh run list --branch main --limit 3`): the latest finished run must not be red,
     unless your push is the fix.
  4. `git push origin HEAD:main`, with `Closes #7` in your last commit message so the issue closes. It is a plain
     fast-forward; if it is rejected, go back to step 1. Then `gh issue edit 7 --remove-label in-progress` and
     `git push origin --delete issue-7`.
  5. **Bring the main checkout up to date (required).** In the main directory run `git fetch origin`, then
     `git merge --ff-only origin/main`, and confirm your commits are in `git log`. If the fast-forward is refused, local `main` has another session's unpushed commits: run
     `git merge origin/main` instead (it keeps their commits as they are), resolve conflicts keeping both sides
     (for a clash in the `MIGRATIONS` array, the already-published migration stays first and
     the unpublished one is appended after it), rerun `pnpm check`, `pnpm build` and `pnpm test:e2e`, and commit
     the merge. **Don't push that merge**: those commits belong to the other session. Don't wait for the CI run
     your push started: the next task begins by checking it (see _Check CI before starting a task_).

  The remote is `origin` (private GitHub repo `JeniT/writing-assistant`). Only push your own work to `main`, never
  another session's in-progress branch.

- **Don't, when landing:**
  - Don't run `git push origin main`. It publishes whatever is on local `main`, including other sessions'
    unfinished or unreviewed commits.
  - Don't chain landing steps with `&&` after a pipe (`git merge … | tail && git push …`). The pipe hides the
    merge's exit code, so the push runs even though the merge failed. Don't pipe merge/rebase/push output at all.
  - Don't rebase onto, or merge from, local `main` when `origin/main` is what you mean.
  - Don't force-push `main`, or use `--force` / `--force-with-lease` to get past a rejected push; rebase instead.
  - Don't `git stash` (the stack is shared across worktrees); commit a WIP commit instead.
  - Don't skip step 3: a push that succeeds can still contain commits you didn't write.
  - Don't skip step 5 because the fast-forward failed. A stale main directory misleads every other agent;
    merge instead.
  - Don't `git rebase`, `git reset --hard` or `git checkout .` the main checkout to make it match `origin/main`.
    That destroys or rewrites another session's unpushed commits and breaks their worktrees.
- **Clean up when the task is merged:** from the main checkout, run `git worktree remove .worktrees/issue-7` and
  `git branch -d issue-7`, so finished worktrees (each with its own `node_modules`) don't pile up. Remove only your own;
  other sessions' worktrees may still be in use. If the task isn't merged, leave the worktree and say why in a comment on the issue.
- **Likely conflict spots:** `packages/core/src/domain.ts`, `apps/api/src/app.ts`, `server.ts`, and the
  `MIGRATIONS` array. If two branches add a migration, the second to merge **renumbers** theirs (append after
  the other) and reruns the tests. Keep changes to those files small and additive.
- If you find a bug or gap outside your task, file an issue (`gh issue create`, label `ready` or `backlog`, or `inbox` if it needs talking through) rather than
  widening the task.
- If a decision belongs to the owner (a service to choose, a product trade-off, anything costing money),
  file an issue labelled `decision` and work on something else.
