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

Then run `pnpm check`, `pnpm build` and `pnpm test:e2e` **once** when you are done. A failure in a full run means
rerunning **only the files that failed** (as above). If a test passes alone but timed out in the full run, the
machine was busy: note it, and look at the test only if it fails alone too. Locally the runners take only a few cores
each (`maxWorkers` in `apps/web/vite.config.ts`, `workers` in `apps/web/playwright.config.ts`); leave those as they are.

## e2e in several worktrees at once

This is fine. Each worktree gets its own web and API ports (hashed from its path; CI uses fixed ones) and its own
database, and servers are never reused, so sessions don't test each other's code. A second run in the _same_
worktree while one is going stops at once with "already used": wait for the first. If a port is taken by something
unrelated, pick others with `E2E_WEB_PORT` and `E2E_API_PORT`. Leave other sessions' processes running.

`pnpm test:e2e` fails on any uncaught exception, `console.error`, failed request or 5xx.

## Editing files on this machine

This machine is macOS, so `sed` is BSD `sed`, not GNU. `sed -i 's/a/b/' file` fails (BSD wants a backup suffix after
`-i`, so it reads the script as the suffix: "undefined label", "illegal option"), and GNU-only features such as `\+`,
`\b` and `\n` in replacements behave differently. It is not a permissions problem. For edits, use the Edit tool; for a
repeated change across files, use `perl -pi -e 's/a/b/' <files>`. To read part of a file, use the Read tool with
`offset` and `limit`.
