import { CASES } from './cases'
import { DEFAULT_GRADER, matchesCase } from './config'
import { defaultModel } from './factory'

export const MAX_TRIALS = 20

export type GroupChoice = 'current' | 'targets' | 'all'

export interface RunOptions {
  which: GroupChoice
  provider: string
  model: string
  grader: string
  /** How many times each case is run. One sample says little; several give a rate. */
  trials: number
  /** Only run cases whose id contains one of these texts. Empty means all of the chosen group. */
  cases: string[]
}

/** How to talk to the person. `askSecret` must not echo what is typed. Absent when the run is not interactive. */
export interface Terminal {
  ask(question: string): Promise<string>
  askSecret(question: string): Promise<string>
}

export interface Resolved {
  options: RunOptions
  /** Extra environment for the eval process only: keys typed in are never written anywhere. */
  env: Record<string, string>
  notes: string[]
}

/**
 * Works out what to run from the command line, the environment and, when a person is at the keyboard
 * (`terminal` given), questions. A key already in the environment is used without asking; one that is
 * missing is asked for with the typing hidden, kept in memory and handed to the eval process, never
 * written to a file or printed. Without a terminal nothing is asked and a missing key is an error.
 */
export async function resolveOptions(
  argv: string[],
  env: NodeJS.ProcessEnv,
  terminal?: Terminal,
): Promise<Resolved> {
  const args = argv.filter((a) => a !== '--')
  const take = (flag: string) => {
    const i = args.indexOf(flag)
    return i >= 0 ? args.splice(i, 2)[1] : undefined
  }
  const provider = take('--provider') ?? env.EVAL_PROVIDER ?? 'anthropic'
  const model = take('--model') ?? env.EVAL_MODEL ?? defaultModel(provider)
  const grader = take('--grader') ?? env.EVAL_GRADER ?? DEFAULT_GRADER
  const trialsFlag = take('--trials')
  const caseFlag = take('--case')
  const cases = caseFlag
    ? caseFlag
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : []
  const which = (args[0] ?? 'current') as GroupChoice
  if (!['current', 'targets', 'all'].includes(which)) {
    throw new Error(`Unknown group "${which}". Use current, targets or all.`)
  }

  if (cases.length && !CASES.some((c) => matchesCase(c, cases))) {
    throw new Error(
      `No case id contains "${caseFlag}". Case ids look like "${CASES[0]!.id}"; see evals/src/cases.ts.`,
    )
  }

  const notes: string[] = []
  const childEnv: Record<string, string> = {}

  // How many times to run each case.
  let trials = 1
  if (trialsFlag !== undefined) trials = parseTrials(trialsFlag)
  else if (terminal) {
    const answer = (
      await terminal.ask(
        `How many times should each case run? One run is a rough check; more give a pass rate but cost that many times as much. [1] `,
      )
    ).trim()
    if (answer) trials = parseTrials(answer)
  }

  // The key for the model under test.
  let key: string | undefined
  if (provider !== 'fake') {
    const name = `${provider.toUpperCase()}_API_KEY`
    key = env.EVAL_API_KEY || env[name]
    if (!key && terminal) {
      key = (
        await terminal.askSecret(`${provider} API key (typing is hidden, nothing is saved): `)
      ).trim()
    }
    if (!key) {
      throw new Error(
        `No API key for ${provider}. Set EVAL_API_KEY (or ${name}) in your terminal, or run this in a terminal and type it when asked.`,
      )
    }
    childEnv.EVAL_API_KEY = key
  }

  // The key for the model that grades the rubrics. promptfoo calls it directly.
  if (grader.startsWith('anthropic:')) {
    let graderKey = env.ANTHROPIC_API_KEY || (provider === 'anthropic' ? key : undefined)
    if (!graderKey && provider !== 'fake' && terminal) {
      graderKey = (
        await terminal.askSecret(
          'Anthropic API key for the grader (typing is hidden, nothing is saved): ',
        )
      ).trim()
    }
    if (graderKey) childEnv.ANTHROPIC_API_KEY = graderKey
    else if (provider !== 'fake') {
      throw new Error(
        'No key for the grader, which is an Anthropic model. Set ANTHROPIC_API_KEY, or choose another with --grader.',
      )
    } else
      notes.push('Dry run with the fake adapter: rubrics cannot be graded without a grader key.')
  }

  return { options: { which, provider, model, grader, trials, cases }, env: childEnv, notes }
}

function parseTrials(text: string): number {
  const n = Number(text)
  if (!Number.isInteger(n) || n < 1 || n > MAX_TRIALS) {
    throw new Error(`Trials must be a whole number from 1 to ${MAX_TRIALS}, not "${text}".`)
  }
  return n
}

/** A promptfoo results file, as far as the summary needs it. */
interface ResultsFile {
  results?: { results?: { vars?: { case?: string }; success?: boolean }[] }
}

/** Per case: how many of its trials passed. Cases are listed in the order they first appear. */
export function summarise(file: ResultsFile): { id: string; passed: number; trials: number }[] {
  const rows = new Map<string, { id: string; passed: number; trials: number }>()
  for (const r of file.results?.results ?? []) {
    const id = r.vars?.case
    if (!id) continue
    const row = rows.get(id) ?? { id, passed: 0, trials: 0 }
    row.trials += 1
    if (r.success) row.passed += 1
    rows.set(id, row)
  }
  return [...rows.values()]
}
