/**
 * Runs the behaviour evals against one adapter:
 *
 *   pnpm eval                      the `current` cases (must pass; a red one is a regression)
 *   pnpm eval:targets              the `targets` cases (define work in #45, #46, #49; may fail for now)
 *   pnpm eval:adapter -- --provider anthropic --model claude-haiku-5-5
 *                                  both groups, for the adapter you are accepting
 *
 * These spend the person's money and need keys, so they are not part of `pnpm check` or CI. `--provider fake`
 * is a dry run that needs no key (the rubrics are not graded). See docs/responsible-ai.md.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_GRADER, promptfooConfig, type Group } from './config'
import { defaultModel } from './factory'

const PROMPTFOO = 'promptfoo@0.124.1' // pinned: results should not change under a new grader or runner

const args = process.argv.slice(2).filter((a) => a !== '--')
const take = (flag: string) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args.splice(i, 2)[1] : undefined
}
const provider = take('--provider') ?? process.env.EVAL_PROVIDER ?? 'anthropic'
const model = take('--model') ?? process.env.EVAL_MODEL ?? defaultModel(provider)
const grader = take('--grader') ?? process.env.EVAL_GRADER ?? DEFAULT_GRADER
const which = args[0] ?? 'current'
if (!['current', 'targets', 'all'].includes(which)) {
  console.error(`Unknown group "${which}". Use current, targets or all.`)
  process.exit(2)
}

const dir = fileURLToPath(new URL('../.generated/', import.meta.url))
mkdirSync(dir, { recursive: true })

function runGroup(group: Group): number {
  const file = `${dir}${group}.json`
  writeFileSync(
    file,
    JSON.stringify(promptfooConfig(group, `${provider}:${model}`, grader), null, 2),
  )
  console.log(`\n== ${group} cases on ${provider}:${model} ==`)
  const result = spawnSync('pnpm', ['dlx', PROMPTFOO, 'eval', '-c', file, '--no-cache'], {
    stdio: 'inherit',
    // tsx lets promptfoo load the TypeScript provider, which imports the app's own code.
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import tsx`.trim(),
      // Nothing from these runs (prompts, replies) should be sent to the runner's makers or shared.
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: '1',
      PROMPTFOO_DISABLE_SHARING: '1',
      EVAL_PROVIDER: provider,
      EVAL_MODEL: model,
    },
  })
  return result.status ?? 1
}

const currentStatus = which === 'targets' ? 0 : runGroup('current')
if (which === 'current') process.exit(currentStatus)
const targetsStatus = runGroup('targets')
if (which === 'all') {
  console.log(
    '\nThe "targets" cases define work that is not built yet (#45, #46, #49), so only the "current" result decides pass or fail.',
  )
  process.exit(currentStatus)
}
process.exit(targetsStatus)
