# Landing: CI on `main` is the final gate, not a retest after every rebase (#220)

With several sessions landing close together, each rebase onto a moved `main` used to mean a full rerun of
`pnpm check`, `pnpm build` and `pnpm test:e2e`, so one session could run the whole suite three or four times for no
reason. Now `scripts/rebase-overlap.mjs` (run after `git fetch`, before `git rebase`) says whether what came in touches
anything the branch changed, or a shared spot (the list is `SHARED_SPOTS` in the script). No overlap: a rebase can't change what the branch's tests exercise, so run `pnpm typecheck` and
the changed packages' tests, then push. Overlap, or any conflict: the full rerun, as before.

The cost is accepted: an occasional brief red `main`, because two changes can interact without sharing a file. That is
caught by the CI run on `main` and by the rule that the next session checks CI first and fixes a red before starting.
Rejected: a landing lock (orders the reruns, doesn't remove them) and GitHub's merge queue (not assumed to be available on a private
personal-account repo; not checked). A staging branch tested in CI before `main` moves is filed as #221 for if red `main`s become frequent.
