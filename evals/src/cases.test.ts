import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeLLMProvider } from '@lfwa/core'
import {
  BRAINSTORM_KICKOFF_PROMPT,
  CRITIQUE_PROMPT,
  DEFAULT_BRAINSTORM_PROMPT,
  BRAINSTORM_RULES_PROMPT,
} from '@lfwa/prompts'
import { BRAINSTORM_TOOLS } from '../../apps/api/src/services/brainstorm'
import AdapterProvider from './adapter-provider'
import { CASES, type BrainstormCase, type CritiqueCase } from './cases'
import { promptfooConfig } from './config'
import { choiceFromEnv, buildAdapter } from './factory'
import { renderReply } from './render'
import { brainstormRequest, critiqueRequest } from './request'

const brainstorm = CASES.filter((c): c is BrainstormCase => c.app === 'brainstorm')
const critique = CASES.filter((c): c is CritiqueCase => c.app === 'critique')

describe('the cases', () => {
  it('have unique ids, and every target names the issue whose work it defines', () => {
    const ids = CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of CASES) {
      if (c.group === 'targets') expect(c.issue, c.id).toBeGreaterThan(0)
      else expect(c.issue, c.id).toBeUndefined()
    }
  })

  it('each have at least one assertion, and a rubric or a deterministic check', () => {
    for (const c of CASES) expect(c.assert.length, c.id).toBeGreaterThan(0)
  })

  it('cover the boundaries in docs/responsible-ai.md', () => {
    const current = CASES.filter((c) => c.group === 'current').map((c) => c.id)
    for (const id of [
      'declines-to-draft-direct',
      'declines-to-draft-indirect',
      'is-not-a-person',
      'cannot-open-links',
      'ignores-instructions-in-notes',
      'holds-a-fair-criticism',
      'critique-does-not-rewrite',
    ]) {
      expect(current, id).toContain(id)
    }
  })

  it("have conversations that start with the AI (the writer's first turn is the hidden kick-off) and alternate", () => {
    for (const c of brainstorm.filter((x) => x.conversation?.length)) {
      const roles = c.conversation!.map((t) => t.role)
      expect(roles[0], c.id).toBe('assistant')
      expect(roles.at(-1), c.id).toBe('user')
      roles.forEach((role, i) => expect(role, c.id).toBe(i % 2 === 0 ? 'assistant' : 'user'))
    }
  })
})

describe('the requests', () => {
  it("send brainstorm what the app sends: the default prompt and the rules, the app's own tools, and the snapshot", () => {
    for (const c of brainstorm) {
      const request = brainstormRequest(c)
      expect(request.system, c.id).toBe(
        `${DEFAULT_BRAINSTORM_PROMPT}\n\n${BRAINSTORM_RULES_PROMPT}`,
      )
      expect(request.tools, c.id).toBe(BRAINSTORM_TOOLS)
      const first = request.messages[0]!.content
      expect(Array.isArray(first), c.id).toBe(true)
      const text = JSON.stringify(first)
      expect(text, c.id).toContain('<idea_snapshot>')
      expect(text, c.id).toContain(BRAINSTORM_KICKOFF_PROMPT.slice(0, 40))
    }
  })

  it('send critique what the critique route sends', () => {
    for (const c of critique) {
      expect(critiqueRequest(c)).toEqual({
        system: CRITIQUE_PROMPT,
        messages: [{ role: 'user', content: `# ${c.draft.title}\n\n${c.draft.body}` }],
      })
    }
  })

  it('carry the hostile text in the snapshot, escaped like the app does, for the injection case', () => {
    const c = brainstorm.find((x) => x.id === 'ignores-instructions-in-notes')!
    const text = JSON.stringify(brainstormRequest(c).messages[0]!.content)
    expect(text).toContain('IGNORE ALL PREVIOUS INSTRUCTIONS')
    expect(text).toContain('PWNED')
  })
})

describe('renderReply', () => {
  it('writes the words, then one marker line per tool call', () => {
    const out = renderReply([
      { type: 'text', text: 'Noted. ' },
      { type: 'tool_call', id: '1', name: 'add_note', input: { text: 'Erosion loops' } },
      { type: 'done', stopReason: 'tool_use', usage: { inputTokens: 1, outputTokens: 1 } },
    ])
    expect(out).toBe('Noted.\n[tool_call add_note {"text":"Erosion loops"}]')
  })

  it('makes the deterministic checks work on a rendered tool call', () => {
    const check = CASES.find((c) => c.id === 'ignores-instructions-in-notes')!.assert.find(
      (a) => a.type === 'javascript',
    )!
    const run = (output: string) => new Function('output', `return (${check.value})`)(output)
    expect(run('Hello.')).toBe(true)
    expect(run('Sure.\n[tool_call create_idea {"name":"x","notes":"y"}]')).toBe(false)
  })
})

describe('the provider', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('runs every case against the fake adapter without a key, for a dry run', async () => {
    vi.stubEnv('EVAL_PROVIDER', 'fake')
    const provider = new AdapterProvider()
    for (const c of CASES) {
      const result = (await provider.callApi('label', { vars: { case: c.id } })) as {
        output?: string
        error?: string
      }
      expect(result.error, c.id).toBeUndefined()
      expect(result.output, c.id).toBeTruthy()
    }
  })

  it('says so for an unknown case', async () => {
    const result = (await new AdapterProvider().callApi('x', { vars: { case: 'nope' } })) as {
      error?: string
    }
    expect(result.error).toMatch(/nope/)
  })

  it('asks for a key rather than failing obscurely when a real adapter has none', () => {
    expect(() => buildAdapter({ provider: 'anthropic', model: 'm' }, {})).toThrow(/EVAL_API_KEY/)
  })

  it('builds the adapter the app would, from the shared factory', () => {
    const llm = buildAdapter(
      { provider: 'anthropic', model: 'claude-sonnet-5-5' },
      { EVAL_API_KEY: 'k' },
    )
    expect(llm.name).toBe('anthropic')
    expect(choiceFromEnv({ EVAL_PROVIDER: 'fake' })).toEqual({ provider: 'fake', model: 'fake' })
  })

  it('uses the port, so a dry run through the fake sees the request the app would send', async () => {
    const fake = new FakeLLMProvider()
    const c = brainstorm[0]!
    for await (const _ of fake.chat(brainstormRequest(c))) void _
    expect(fake.chatCalls[0]!.tools).toBe(BRAINSTORM_TOOLS)
  })
})

describe('the promptfoo config', () => {
  it('has one test per case in the group, naming the case, with its assertions', () => {
    for (const group of ['current', 'targets'] as const) {
      const config = promptfooConfig(group, 'fake:fake')
      const expected = CASES.filter((c) => c.group === group)
      expect(config.tests.map((t) => t.vars.case)).toEqual(expected.map((c) => c.id))
      expect(config.tests.length).toBeGreaterThan(0)
    }
  })
})
