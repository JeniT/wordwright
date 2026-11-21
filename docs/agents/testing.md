# Running tests and checks

Read this when you are about to run tests, format, or lint.

## Test narrowly while you work; run everything once, at the end

Several sessions share one machine, and the full suites take minutes. While developing, run only what you changed
(from the worktree root):

- **One unit/component test file:** `pnpm --filter @wordwright/web exec vitest run src/views/ideas.test.ts` (same with
  `@wordwright/api` or `@wordwright/core`). Add `-t "part of the title"` for one test, or use `vitest related <changed files>`.
- **One e2e file or test:** `pnpm --filter @wordwright/web exec playwright test e2e/ideas.spec.ts -g "part of the title"`.
- **Format and lint only what you touched:** `pnpm exec prettier --write <files>` and `pnpm exec eslint <files>`.
- **Types:** `pnpm typecheck` (about 30s) once the code compiles in your head, not after every edit.

Then run `pnpm check` and `pnpm build` **once** when you are done, and the e2e tests the change calls for
([When to run e2e](#when-to-run-e2e)). A failure in a full run means
rerunning **only what failed**: `pnpm check` ends by naming the step that failed (`pnpm check: failed at …`; on this
machine its first step also formats every file), and after an e2e run `apps/web/test-results/.last-run.json` lists the
failed tests, which `pnpm --filter @wordwright/web exec playwright test --last-failed` reruns alone. If a test passes alone but timed out in the full run, the
machine was busy: note it, and look at the test only if it fails alone too. Locally the runners take only a few cores
each (`maxWorkers` in `apps/web/vite.config.ts`, `workers` in `apps/web/playwright.config.ts`); leave those as they are.

## When to run e2e

The whole suite takes about 5 minutes on a quiet machine and much longer beside other sessions' runs. CI runs all of it
on every push to `main`, and the next session checks CI before it starts ([claim.md](claim.md)), so locally you run
only what your change could break ([ADR](../adr/foundations/e2e-runs-by-what-a-change-touches.md)):

- **Logic, API, copy, or a change inside one component's own box:** no e2e. Unit, API and component tests, `pnpm check`
  and a look in the browser are the gate.
- **A new or changed flow, or a layout or style change on one screen:** that screen's spec, before you commit. Find it
  with `grep -l "<the page's heading or route>" apps/web/e2e/*.spec.ts`. A new user-facing flow adds its test there
  ([definition of done](definition-of-done.md), item 1). Add `accessibility-routes.spec.ts` when you add a page or
  route.
- **A change to the app's shell:** the whole suite, once, before you land. The shell is `App.vue`, `router.ts`,
  `main.ts`, `style.css`, `src/theme/`, `SideMenu.vue`, `PageNav.vue`, `HelpPage.vue`, the e2e set-up (`e2e/fixtures.ts`,
  `playwright.config.ts`), a dependency upgrade that reaches the browser (Vue, Tiptap, Tailwind, Vite), and
  `deploy/Caddyfile` (run `csp.spec.ts` for that one).
- **Moving or renaming e2e tests:** the specs you touched, and the title check below.

If you are unsure which row a change is in, take the next one down. When CI on `main` goes red after your push, fixing
it is yours, before anything else ([claim.md](claim.md#check-ci-before-you-start)).

`pnpm coverage` (or `pnpm --filter @wordwright/api coverage`) runs a package's whole suite, prints a coverage
summary and writes an HTML report to that package's `coverage/`. It is for finding untested code, not a gate.

**Moving or renaming e2e tests:** `pnpm e2e:titles` prints the sorted test titles. Run it before and after (the
"before" on a checkout of `origin/main`) and `diff` the two; they must match. Spec files stay under 800 lines
(ESLint `max-lines` enforces it).

## Unused code

`pnpm knip` (part of `pnpm check`) fails on an unused file, export or dependency. Fix the finding: delete the code,
or drop the `export` if the file still uses it. To keep something on purpose (a helper documented for agents, such as
`savesAnswered`), add it under `ignoreIssues` in `knip.json`. Files loaded by a computed `import()` path are listed
as `entry` patterns there too.

## Stopping a server you started

Other sessions run servers on this machine too. Stop yours by its port: `kill $(lsof -nP -iTCP:<port> -sTCP:LISTEN -t)`.
A name pattern (`pkill -f tsx`) also matches their servers.

## e2e in several worktrees at once

This is fine. Each worktree gets its own web and API ports (hashed from its path; CI uses fixed ones) and its own
database, and servers are never reused, so sessions don't test each other's code. A second run in the _same_
worktree while one is going stops at once with "already used": wait for the first. If a port is taken by something
unrelated, pick others with `E2E_WEB_PORT` and `E2E_API_PORT` (and the `E2E_APPROVAL_*` and `E2E_CSP_*` pairs). Leave other sessions' processes running.

`pnpm test:e2e` fails on any uncaught exception, `console.error`, failed request or 5xx.

## Editing files on this machine

This machine is macOS, so `sed` is BSD `sed`, not GNU. `sed -i 's/a/b/' file` fails (BSD wants a backup suffix after
`-i`, so it reads the script as the suffix: "undefined label", "illegal option"), and GNU-only features such as `\+`,
`\b` and `\n` in replacements behave differently. It is not a permissions problem. For edits, use the Edit tool; for a
repeated change across files, use `perl -pi -e 's/a/b/' <files>`. To read part of a file, use the Read tool with
`offset` and `limit`.

## The production Content-Security-Policy

The `csp` e2e project (`e2e/csp.spec.ts`) builds the web app and serves it with `vite preview`, which sends the policy
from `deploy/Caddyfile`. A change that needs something the policy forbids (an inline script, a picture or script from
another site) fails there with a console error. Change the policy in `deploy/Caddyfile` only; the preview reads it.
