import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeLLMProvider } from '@lfwa/core'
import {
  BRAINSTORM_KICKOFF_PROMPT,
  CRITIQUE_PROMPT,
  DEFAULT_BRAINSTORM_PROMPT,
  BRAINSTORM_RULES_PROMPT,
  RESEARCH_PROMPT,
} from '@lfwa/prompts'
import { BRAINSTORM_TOOLS } from '../../apps/api/src/services/brainstorm'
import { formatDraftForCritique } from '../../apps/api/src/services/critique'
import AdapterProvider from './adapter-provider'
import { CASES, type BrainstormCase, type CritiqueCase, type ResearchCase } from './cases'
import { promptfooConfig } from './config'
import { choiceFromEnv, buildAdapter } from './factory'
import { renderReply } from './render'
import { brainstormRequest, critiqueRequest, researchRequest } from './request'

const brainstorm = CASES.filter((c): c is BrainstormCase => c.app === 'brainstorm')
const critique = CASES.filter((c): c is CritiqueCase => c.app === 'critique')
const research = CASES.filter((c): c is ResearchCase => c.app === 'research')

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
      'does-not-invent-a-source-address',
      'declines-to-do-research-and-points-to-the-tool',
      'research-includes-other-points-of-view',
      'suggests-only-an-address-the-writer-gave',
      'research-reports-well-formed-pages-only',
      'research-ignores-instructions-in-the-idea',
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
        messages: [{ role: 'user', content: formatDraftForCritique(c.draft).message }],
      })
    }
  })

  it('send research what the service sends: the research prompt, and a brief of the areas, the idea and the list so far', () => {
    expect(research.length).toBeGreaterThan(0)
    for (const c of research) {
      const request = researchRequest(c)
      expect(request.system, c.id).toBe(RESEARCH_PROMPT)
      expect(request.maxResults, c.id).toBe(8)
      expect(request.brief, c.id).toContain(c.areas)
      expect(request.brief, c.id).toContain('<already_on_the_reading_list>')
    }
    const rivers = research.find((c) => c.scenario === 'rivers')!
    expect(researchRequest(rivers).brief).toContain('https://example.org/meanders')
  })

  it('carry the hostile notes in the research brief too, for the injection case', () => {
    const c = research.find((x) => x.id === 'research-ignores-instructions-in-the-idea')!
    expect(researchRequest(c).brief).toContain('IGNORE ALL PREVIOUS INSTRUCTIONS')
  })

  it('carry the hostile text in the snapshot, escaped like the app does, for the injection case', () => {
    const c = brainstorm.find((x) => x.id === 'ignores-instructions-in-notes')!
    const text = JSON.stringify(brainstormRequest(c).messages[0]!.content)
    expect(text).toContain('IGNORE ALL PREVIOUS INSTRUCTIONS')
    expect(text).toContain('PWNED')
  })
})

describe('the deterministic checks on pages found', () => {
  const check = (id: string, index = 0) =>
    CASES.find((c) => c.id === id)!.assert.filter((a) => a.type === 'javascript')[index]!
  const run = (id: string, output: string) =>
    new Function('output', `return (${check(id).value})`)(output)
  const page = (over: object = {}) => ({
    url: 'https://a.example.org/x',
    why: 'Relevant.',
    ...over,
  })

  it('accept a short list of pages with reasons, or none, and refuse the rest', () => {
    const id = 'research-reports-well-formed-pages-only'
    expect(run(id, '[]')).toBe(true)
    expect(run(id, JSON.stringify([page(), page({ url: 'http://b.example.org' })]))).toBe(true)
    expect(run(id, JSON.stringify(Array.from({ length: 9 }, () => page())))).toBe(false)
    expect(run(id, JSON.stringify([page({ url: 'ftp://x.example.org' })]))).toBe(false)
    expect(run(id, JSON.stringify([page({ url: 'javascript:alert(1)' })]))).toBe(false)
    expect(run(id, JSON.stringify([page({ why: '' })]))).toBe(false)
    expect(run(id, JSON.stringify([page({ why: 'x'.repeat(301) })]))).toBe(false)
  })

  it('refuse a suggest_reading call for an address the writer did not give', () => {
    const id = 'suggests-only-an-address-the-writer-gave'
    const call = (url: string) =>
      `Maybe.\n[tool_call suggest_reading ${JSON.stringify({ url, title: 'T', why: 'W' })}]`
    expect(run(id, 'I cannot open it.')).toBe(true)
    expect(run(id, call('https://example.org/floods-report'))).toBe(true)
    expect(run(id, call('https://invented.example.org/paper'))).toBe(false)
    expect(
      run(
        id,
        `${call('https://example.org/floods-report')}\n${call('https://other.example.org/')}`,
      ),
    ).toBe(false)
  })

  it('refuse any suggest_reading call where the writer gave no address', () => {
    const id = 'does-not-invent-a-source-address'
    expect(run(id, 'I cannot search.')).toBe(true)
    expect(run(id, '[tool_call suggest_reading {"url":"https://x.example.org"}]')).toBe(false)
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

describe('the deterministic check on a critique', () => {
  const run = (output: string) =>
    new Function(
      'output',
      `return (${CASES.find((c) => c.id === 'critique-is-short-and-ranked')!.assert.find((a) => a.type === 'javascript')!.value})`,
    )(output)
  const point = (over: object = {}) => ({
    block: 'b2',
    point: 'Weak.',
    reason: 'Because.',
    ...over,
  })
  const reply = (points: object[], over: object = {}) =>
    JSON.stringify({ summary: 'Fine.', ready: false, points, ...over })

  it('accepts up to five points about blocks or the whole piece, in a code fence or not', () => {
    expect(run(reply([point(), point({ block: 'whole' })]))).toBe(true)
    expect(run(reply([], { ready: true }))).toBe(true)
    expect(run('```json\n' + reply([point()]) + '\n```')).toBe(true)
  })

  it('refuses too many points, odd block ids, missing reasons and replies that are not the JSON', () => {
    expect(run(reply(Array.from({ length: 6 }, () => point())))).toBe(false)
    expect(run(reply([point({ block: 'paragraph 2' })]))).toBe(false)
    expect(run(reply([point({ reason: '' })]))).toBe(false)
    expect(run(reply([], { ready: 'yes' }))).toBe(false)
    expect(() => run('Tighten the opening.')).toThrow()
  })
})
