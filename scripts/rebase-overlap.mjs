// Decides whether a rebase onto origin/main needs the full suite rerun.
// Run it after `git fetch origin` and BEFORE `git rebase origin/main`: once rebased, the merge-base is
// origin/main itself and "what came in" can no longer be seen.
// Exit 0: nothing incoming touches what this branch changed. Exit 1: overlap (printed); rerun everything.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Files where two unrelated-looking changes still interact (shared schemas, wiring, migrations, dependencies).
export const SHARED_SPOTS = [
  'packages/core/src/domain.ts',
  'apps/api/src/app.ts',
  'apps/api/src/server.ts',
  'apps/api/src/db/database.ts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
]

export function findOverlap(mine, incoming) {
  const mineSet = new Set(mine)
  return [...new Set(incoming)]
    .filter((file) => mineSet.has(file) || SHARED_SPOTS.includes(file))
    .sort()
}

function changedFiles(...range) {
  return execFileSync('git', ['diff', '--name-only', ...range], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
    encoding: 'utf8',
  }).trim()
  const overlap = findOverlap(changedFiles(base, 'HEAD'), changedFiles(base, 'origin/main'))
  if (overlap.length === 0) {
    console.log('no overlap: rerun pnpm check for the packages you changed, then push')
  } else {
    console.log(
      `overlap: ${overlap.join(', ')}\nrerun pnpm check, pnpm build and pnpm test:e2e after rebasing`,
    )
    process.exitCode = 1
  }
}
