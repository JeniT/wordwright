# Claiming a task: what wordwright adds

The steps are the `claim` skill of the agent-workflow plugin (`pnpm exec aw claim <n>` from the main checkout, then
reading what the issue sits in). This file holds only what is wordwright's own. Implement an `inbox` issue only once it
has been triaged ([triage.md](triage.md)); `TODO.md` is only a frozen history.

## Check CI before you start

CI runs on every push to `main` and takes minutes; waiting for it holds up the next piece of work. So after landing,
move on: the next start (or the next landing) is where CI is checked. Before you claim anything, run
`gh run list --branch main --workflow CI --limit 5` (`--workflow CI` leaves out Dependabot's runs).

- **The latest finished run is red:** fixing it comes first. Read why with
  `gh run view <run id> --log-failed | grep -E "FAIL|×"` (the raw log is mostly DOM dump). If your own earlier push
  broke it, fix it now. If it is someone else's, tell the owner, and file the fix as an issue and claim it straight away
  so two agents don't fix the same thing.
- **Runs are still in progress:** start anyway, and look again before you push ([landing.md](landing.md)), because a red
  can arrive while you work.
- **Push on a green `main`.** The one exception is a push that is itself the fix.

## While you work

- **Likely conflict spots:** `packages/core/src/domain.ts`, `apps/api/src/app.ts`, `server.ts`, and the `MIGRATIONS`
  array. Keep changes to those small and additive. If two branches add a migration, the second to merge renumbers
  theirs (appends after the other) and reruns the tests. The shared files are also the `sharedSpots` in
  `agent-workflow.config.json`.
- **No epics yet** (#465): until wordwright has them, an issue you file is placed by its milestone alone.
