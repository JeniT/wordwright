# Landing: merging to `main`

Read this when your work is committed and you are ready to merge it.

The local `main` checkout is shared by every session, so it may hold other sessions' unpushed commits. Publish
your own branch, never `main`. Run these as **separate commands**, reading each result before the next.

1. `git fetch origin`, then `node scripts/rebase-overlap.mjs` (it must run _before_ the rebase, while it can still
   see what is coming in; it exits 1 when there is overlap, which is an answer, not a failure: note it and carry on),
   then `git rebase origin/main` in your worktree. Resolve conflicts, keeping the other session's changes.
2. Decide what to rerun, using the script's answer from step 1. CI on `main` is the final gate, so a clean rebase
   doesn't earn a full rerun:
   - The rebase said the branch was already up to date: nothing has changed since your last green run, so skip this.
   - The script said `overlap` (it also counts changes to shared files such as `domain.ts` and the
     lockfile; the list is `SHARED_SPOTS` in the script), or the rebase conflicted: rerun `pnpm check`,
     `pnpm build` and `pnpm test:e2e` on the rebased branch.
   - Otherwise (`no overlap`, no conflicts): run `pnpm typecheck` and the tests of the packages you changed (as in
     [testing.md](testing.md)), then push.

   A rare red `main` from two changes that interact without sharing a file is accepted; see step 3 and
   _Check CI before you start_ in [claim.md](claim.md).

3. `git log origin/main..HEAD` must list only your commits. If anything else is there, stop and sort it out.
   Then check CI (`gh run list --branch main --limit 3`): the latest finished run must be green, unless your
   push is the fix.
4. `git push origin HEAD:main`, with `Closes #7` in your last commit message so the issue closes. It is a plain
   fast-forward; if it is rejected, go back to step 1. Then `gh issue edit 7 --remove-label in-progress` and
   `git push origin --delete issue-7`.
5. **Bring the main checkout up to date (required).** In the main directory run `git fetch origin`, then
   `git merge --ff-only origin/main`, and confirm your commits are in `git log`. If the fast-forward is refused,
   local `main` has another session's unpushed commits: run `git merge origin/main` instead (it keeps their commits
   as they are), resolve conflicts keeping both sides (for a clash in the `MIGRATIONS` array, the
   already-published migration stays first and the unpublished one is appended after it), rerun `pnpm check`,
   `pnpm build` and `pnpm test:e2e`, and commit the merge. **Leave that merge unpushed**: those commits belong
   to the other session. Don't wait for the CI run your push started: the next task begins by checking it.

The remote is `origin` (private GitHub repo `JeniT/wordwright`). Push only your own work to `main`.

## Guardrails

Each of these protects another session's work. The positive target is beside it.

- Publish with `git push origin HEAD:main`. `git push origin main` publishes whatever is on local `main`,
  including other sessions' unfinished commits.
- Run merge, rebase and push commands bare, one at a time. A pipe (`git merge … | tail && git push …`) hides the
  merge's exit code, so the push runs even though the merge failed.
- Rebase onto, and merge from, `origin/main`, never local `main`.
- To get past a rejected push, rebase. Never force-push `main` or use `--force` / `--force-with-lease`.
- Keep step 3: a push that succeeds can still contain commits you didn't write.
- Keep step 5 even when the fast-forward fails; merge instead. A stale main directory misleads every other agent.
- To make the main checkout match `origin/main`, use `git merge`. `git rebase`, `git reset --hard` and
  `git checkout .` there destroy or rewrite another session's unpushed commits and break their worktrees.

## Clean up when the task is merged

From the main checkout, run `git worktree remove .worktrees/issue-7` and `git branch -d issue-7`, so finished
worktrees (each with its own `node_modules`) don't pile up. Remove only your own; other sessions' worktrees may
still be in use. If the task isn't merged, leave the worktree and say why in a comment on the issue.
