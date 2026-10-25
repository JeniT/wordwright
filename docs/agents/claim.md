# Claiming a task

Read this when you are about to start work on an issue, or are deciding what to pick up.

**GitHub Issues is the board.** Every task and owner decision is an issue, labelled `ready` (can start now),
`backlog` (needs a decision or prerequisite), `decision` (the owner's to make), `in-progress` (claimed) or
`inbox` (a raw report waiting for triage: see [triage.md](triage.md)).
Pick from `gh issue list --label ready`; closed issues are Done. `TODO.md` is only a frozen history.
Implement an `inbox` issue only after it has been triaged.

## Every change goes through a worktree

Local `main` is shared by every session, and a commit left on it is invisible to everyone else until some other
session pushes it by accident. So claims, docs and code all go through a worktree on an issue branch.

## Check CI before you start

CI takes minutes, and waiting for it holds up the next piece of work. After landing, move on; the next start
(or the next landing) is where CI is checked. Run `gh run list --branch main --workflow CI --limit 5` (`--workflow CI` leaves out Dependabot's runs) before you claim anything.

- **The latest finished run is red:** fixing it comes first. Read why with `gh run view <run id> --log-failed`.
  If your own earlier push broke it, fix it now. If it is someone else's, tell the owner, and file the fix as an
  issue and claim it straight away so two agents don't fix the same thing.
- **Runs are still in progress:** start anyway, and look again at landing step 3 ([landing.md](landing.md)),
  because a red can arrive while you work.
- **Push on a green `main`.** The one exception is a push that is itself the fix.

## Claim

Claiming is creating the task's branch on GitHub, which is atomic: only one agent can.

1. `git fetch origin`, then `gh issue view 7` to check it is open, not `in-progress`, and its prerequisites are closed.
2. `gh api repos/JeniT/wordwright/git/refs -f ref=refs/heads/issue-7 -f sha=$(git rev-parse origin/main)`.
   If it fails with "Reference already exists", someone else has the task: pick another.
3. `gh issue edit 7 --add-label in-progress --remove-label ready` and
   `gh issue comment 7 --body "claimed: <agent/session> · branch: issue-7"`.
4. `git fetch origin`, then `git worktree add .worktrees/issue-7 -b issue-7 origin/issue-7` and `pnpm install`
   once in it. You keep working in that worktree. No commit is needed to claim.

## While you work

- **Likely conflict spots:** `packages/core/src/domain.ts`, `apps/api/src/app.ts`, `server.ts`, and the
  `MIGRATIONS` array. Keep changes to those files small and additive. If two branches add a migration, the
  second to merge renumbers theirs (appends after the other) and reruns the tests.
- **Outside your task:** file an issue (`gh issue create`, label `ready` or `backlog` and a `--milestone`, your best
  guess; the owner can move it), or just `inbox` if it needs talking through.
- **The owner's call:** a service to choose, a product trade-off, anything costing money. File an issue labelled
  `decision` and work on something else.
- **Stash:** commit a WIP commit; the stash stack is shared across worktrees.

When the work is done, see [definition-of-done.md](definition-of-done.md) and [landing.md](landing.md).
