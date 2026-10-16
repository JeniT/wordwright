/**
 * Runs the behaviour evals, a rough spot-check of how a model behaves with the app's prompts:
 *
 *   pnpm eval                      the `current` cases (behaviour the prompts already ask for)
 *   pnpm eval:targets              the `targets` cases (they define planned work and may fail for now; none at present)
 *   pnpm eval:adapter -- --provider anthropic --model claude-haiku-5-5
 *                                  both groups, for the adapter you are looking at
 *   --case a,b                     only cases whose id contains one of these texts (e.g. --case rephrase-offers,critique-says)
 *   --trials N                     run each case N times (otherwise you are asked); --grader <promptfoo id>
 *
 * In a terminal it asks for the API key (typing hidden, nothing saved) unless EVAL_API_KEY is set, and for how
 * many trials. These spend that key's money, so they are not part of `pnpm check` or CI. They are a smoke test,
 * not proof: a case is one nondeterministic sample graded by another model. `--provider fake` is a dry run that
 * needs no key (rubrics are not graded). See docs/responsible-ai.md.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CASES } from './cases'
import { matchesCase, promptfooConfig, type Group } from './config'
import { resolveOptions, summarise } from './options'
import { realTerminal } from './terminal'

const PROMPTFOO = 'promptfoo@0.124.1' // pinned: results should not change under a new grader or runner

let resolved
try {
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
  resolved = await resolveOptions(
    process.argv.slice(2),
    process.env,
    interactive ? realTerminal() : undefined,
  )
} catch (err) {
  console.error((err as Error).message)
  process.exit(2)
}
const { options, env: keys, notes } = resolved
for (const note of notes) console.log(note)

const dir = fileURLToPath(new URL('../.generated/', import.meta.url))
mkdirSync(dir, { recursive: true })

function runGroup(group: Group): number {
  // A --case filter may match nothing in this group; skip it rather than pay for an empty run.
  if (!CASES.some((c) => c.group === group && matchesCase(c, options.cases))) return 0
  const file = `${dir}${group}.json`
  const results = `${dir}${group}-results.json`
  const label = `${options.provider}:${options.model}`
  writeFileSync(
    file,
    JSON.stringify(promptfooConfig(group, label, options.grader, options.cases), null, 2),
  )
  console.log(
    `\n== ${group} cases on ${label}, ${options.trials} trial${options.trials === 1 ? '' : 's'} each ==`,
  )
  const result = spawnSync(
    'pnpm',
    [
      'dlx',
      PROMPTFOO,
      'eval',
      '-c',
      file,
      '--no-cache',
      '--repeat',
      String(options.trials),
      '-o',
      results,
    ],
    {
      stdio: 'inherit',
      // promptfoo loads the TypeScript provider itself (it brings its own tsx). Adding ours with NODE_OPTIONS
      // makes two copies clash, and the run fails with "Expected id".
      env: {
        ...process.env,
        ...keys,
        // Nothing from these runs (prompts, replies) should be sent to the runner's makers or shared.
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: '1',
        PROMPTFOO_DISABLE_SHARING: '1',
        EVAL_PROVIDER: options.provider,
        EVAL_MODEL: options.model,
      },
    },
  )
  try {
    const rows = summarise(JSON.parse(readFileSync(results, 'utf8')))
    console.log(`\nPassed, per case (${group}):`)
    for (const r of rows) console.log(`  ${String(r.passed).padStart(2)}/${r.trials}  ${r.id}`)
  } catch {
    // No results file (the run failed to start): promptfoo has already said why.
  }
  return result.status ?? 1
}

const currentStatus = options.which === 'targets' ? 0 : runGroup('current')
if (options.which === 'current') process.exit(currentStatus)
const targetsStatus = runGroup('targets')
if (options.which === 'all') {
  console.log(
    '\nThe "targets" cases define work that is not built yet, so they are expected to fail for now. A failure in "current" is a reason to look, not proof: rerun with more trials first.',
  )
  process.exit(currentStatus)
}
process.exit(targetsStatus)
