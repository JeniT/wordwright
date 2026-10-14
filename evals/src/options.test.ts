import { describe, expect, it } from 'vitest'
import { promptfooConfig } from './config'
import { resolveOptions, summarise, type Terminal } from './options'

/** A terminal that records what it was asked and answers from a script. */
function terminal(answers: string[]) {
  const asked: { question: string; secret: boolean }[] = []
  const next = (question: string, secret: boolean) => {
    asked.push({ question, secret })
    return Promise.resolve(answers.shift() ?? '')
  }
  const t: Terminal = {
    ask: (q) => next(q, false),
    askSecret: (q) => next(q, true),
  }
  return { t, asked }
}

describe('resolveOptions', () => {
  it('asks for the key (hidden) and the number of trials, and passes the key on in memory only', async () => {
    const { t, asked } = terminal(['3', 'sk-typed-key'])
    const r = await resolveOptions([], {}, t)
    expect(r.options).toMatchObject({ which: 'current', provider: 'anthropic', trials: 3 })
    expect(r.env).toEqual({ EVAL_API_KEY: 'sk-typed-key', ANTHROPIC_API_KEY: 'sk-typed-key' })
    expect(asked.map((a) => a.secret)).toEqual([false, true]) // only the key is hidden
    // The key is never part of a question or a note, which could be printed.
    expect(JSON.stringify([asked, r.notes])).not.toContain('sk-typed-key')
  })

  it('does not ask for what it already has: a key in the environment, and --trials', async () => {
    const { t, asked } = terminal([])
    const r = await resolveOptions(['--trials', '5'], { EVAL_API_KEY: 'k' }, t)
    expect(asked).toEqual([])
    expect(r.options.trials).toBe(5)
    expect(r.env.EVAL_API_KEY).toBe('k')
  })

  it('narrows the run to the cases named with --case, and rejects a name that matches none', async () => {
    const env = { EVAL_API_KEY: 'k', ANTHROPIC_API_KEY: 'k' }
    const r = await resolveOptions(
      ['--trials', '1', '--case', 'rephrase-offers, critique-says'],
      env,
    )
    expect(r.options.cases).toEqual(['rephrase-offers', 'critique-says'])
    expect((await resolveOptions(['--trials', '1'], env)).options.cases).toEqual([])
    await expect(resolveOptions(['--trials', '1', '--case', 'no-such-case'], env)).rejects.toThrow(
      /No case id contains/,
    )
    const config = promptfooConfig('current', 'x', undefined, ['rephrase-offers'])
    expect(config.tests.map((t) => t.vars.case)).toEqual(['rephrase-offers-different-approaches'])
  })

  it('defaults to one trial when the answer is empty', async () => {
    const { t } = terminal(['', 'k'])
    expect((await resolveOptions([], {}, t)).options.trials).toBe(1)
  })

  it('never asks when there is no terminal, and says what is missing', async () => {
    await expect(resolveOptions([], {}, undefined)).rejects.toThrow(/EVAL_API_KEY/)
    const r = await resolveOptions([], { EVAL_API_KEY: 'k' }, undefined)
    expect(r.options.trials).toBe(1)
  })

  it('refuses trials outside 1 to 20, since each one costs money', async () => {
    for (const bad of ['0', '21', 'many', '2.5']) {
      await expect(resolveOptions(['--trials', bad], { EVAL_API_KEY: 'k' })).rejects.toThrow(
        /Trials/,
      )
    }
  })

  it('uses the one key for the grader too when the model under test is Anthropic', async () => {
    const { t, asked } = terminal(['', 'the-key'])
    const r = await resolveOptions([], {}, t)
    expect(asked.filter((a) => a.secret)).toHaveLength(1)
    expect(r.env.ANTHROPIC_API_KEY).toBe(r.env.EVAL_API_KEY)
  })

  it('needs no key for a fake dry run, and says rubrics are not graded', async () => {
    const r = await resolveOptions(['--provider', 'fake', '--trials', '1'], {}, undefined)
    expect(r.env).toEqual({})
    expect(r.notes.join(' ')).toMatch(/rubrics/)
  })

  it('rejects an unknown group', async () => {
    await expect(resolveOptions(['nope'], { EVAL_API_KEY: 'k' })).rejects.toThrow(/Unknown group/)
  })
})

describe('summarise', () => {
  it('counts passes per case across trials, in first-seen order', () => {
    const row = (id: string, success: boolean) => ({ vars: { case: id }, success })
    expect(
      summarise({
        results: {
          results: [
            row('a', true),
            row('b', false),
            row('a', false),
            row('b', false),
            row('a', true),
          ],
        },
      }),
    ).toEqual([
      { id: 'a', passed: 2, trials: 3 },
      { id: 'b', passed: 0, trials: 2 },
    ])
  })

  it('copes with a file that has no results', () => {
    expect(summarise({})).toEqual([])
  })
})
