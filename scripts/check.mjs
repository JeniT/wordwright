// `pnpm check`: every check except build and e2e, in order, stopping at the first that fails and naming it, so a
// failure can be fixed and that one step rerun instead of the whole list. CI runs it too.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * The package scripts to run. On this machine the first step formats the files; in CI it only checks them, so
 * unformatted code still fails there.
 */
export function checkSteps(env) {
  return [
    env.CI ? 'format:check' : 'format',
    'lint',
    'typecheck',
    'knip',
    'test:scripts',
    'check:docs',
    'check:licences',
    'test',
  ]
}

/** Runs each step until one exits non-zero; answers that step, or undefined when all passed. */
export function firstFailure(steps, run) {
  return steps.find((step) => run(step) !== 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failed = firstFailure(
    checkSteps(process.env),
    (step) => spawnSync('pnpm', [step], { stdio: 'inherit' }).status ?? 1,
  )
  if (failed) {
    console.log(
      `\npnpm check: failed at \`pnpm ${failed}\`. Fix it, rerun that step, then pnpm check.`,
    )
    process.exitCode = 1
  } else {
    console.log('\npnpm check: all passed')
  }
}
