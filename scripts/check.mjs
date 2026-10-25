// `pnpm check`: every check except build and e2e, in order, stopping at the first that fails and naming it, so a
// failure can be fixed and that one step rerun instead of the whole list. CI runs it too.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

/**
 * A warning when this Node's major version differs from .nvmrc's, which CI and production run: checks can pass here
 * and fail there (b66081d). Undefined when they match.
 */
export function nodeMismatch(running, nvmrc) {
  const wanted = nvmrc.trim()
  const major = (v) => v.replace(/^v/, '').split('.')[0]
  if (major(running) === major(wanted)) return undefined
  return `Warning: Node ${major(running)} here, but CI and production use ${wanted} (.nvmrc), so a check can pass here and fail there.`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const warning = nodeMismatch(
    process.version,
    readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8'),
  )
  if (warning) console.log(`${warning}\n`)
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
  // Again at the end, where it is read with the verdict.
  if (warning) console.log(warning)
}
