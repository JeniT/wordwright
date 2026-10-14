import { CASES, type EvalCase } from './cases'

export type Group = 'current' | 'targets'

/** The model that grades the `llm-rubric` assertions. promptfoo calls it directly, so it needs its own key. */
export const DEFAULT_GRADER = 'anthropic:messages:claude-sonnet-5-5'

/** True when no filter is given, or a filter text appears in the case's id. */
export function matchesCase(c: EvalCase, only: string[]): boolean {
  return only.length === 0 || only.some((text) => c.id.includes(text))
}

/** A promptfoo config for one group of cases, run through `adapter-provider.ts`. */
export function promptfooConfig(
  group: Group,
  label: string,
  grader = DEFAULT_GRADER,
  only: string[] = [],
) {
  const cases: EvalCase[] = CASES.filter((c) => c.group === group && matchesCase(c, only))
  return {
    description: `Behaviour evals (${group}) for ${label}`,
    // The prompt is only a label: the provider builds the real request from the case id.
    prompts: ['{{case}}'],
    providers: [{ id: 'file://../src/adapter-provider.ts', label }],
    defaultTest: { options: { provider: grader } },
    tests: cases.map((c) => ({
      description: c.description,
      vars: { case: c.id },
      assert: c.assert,
      metadata: { group: c.group, app: c.app, ...(c.issue ? { issue: c.issue } : {}) },
    })),
  }
}
