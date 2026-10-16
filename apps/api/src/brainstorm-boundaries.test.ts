import { describe, expect, it } from 'vitest'
import {
  AddNoteToolInputSchema,
  CreateIdeaToolInputSchema,
  IdeaDraftSchema,
  SuggestReadingToolInputSchema,
  UpdateIdeaToolInputSchema,
  type Idea,
} from '@wordwright/core'
import { BRAINSTORM_RULES_PROMPT, DEFAULT_BRAINSTORM_PROMPT } from '@wordwright/prompts'
import { BRAINSTORM_TOOLS, brainstormSystem, formatSnapshot } from './services/brainstorm'

/**
 * The structural boundaries of the brainstorm AI (docs/responsible-ai.md, principle 10). Unlike the prompts,
 * these are guarantees of the code, so they are tested here, in `pnpm check`, and fail when one erodes.
 * (That draft text never reaches a provider request is also tested end to end in brainstorm.test.ts.)
 */
describe('what the brainstorm AI can touch', () => {
  /**
   * Adding a tool or a field to one is a decision about what the AI may change: update this list, and read
   * docs/responsible-ai.md first. The evals harness imports the same tool list, so it will see the change too.
   */
  const ALLOWED_INPUTS = {
    add_note: ['text'],
    update_idea: ['name'],
    create_idea: ['name', 'notes'],
    suggest_reading: ['url', 'title', 'why'],
  }

  it('is four tools, none of which can name a draft or an id', () => {
    expect(BRAINSTORM_TOOLS.map((t) => t.name).sort()).toEqual(Object.keys(ALLOWED_INPUTS).sort())
    for (const tool of BRAINSTORM_TOOLS) {
      const properties = Object.keys((tool.inputSchema.properties ?? {}) as object).sort()
      expect(properties, tool.name).toEqual(
        [...ALLOWED_INPUTS[tool.name as keyof typeof ALLOWED_INPUTS]].sort(),
      )
      for (const name of properties)
        expect(name, tool.name).not.toMatch(/id$|draft|body|content|publication/i)
    }
  })

  it('never takes the idea, a draft or a publication from what the AI sends', () => {
    const planted = { ideaId: 'other', draftId: 'd-1', publicationId: 'p-2', body: 'x', id: 'y' }
    for (const [schema, input] of [
      [AddNoteToolInputSchema, { text: 'A point' }],
      [UpdateIdeaToolInputSchema, { name: 'A title' }],
      [CreateIdeaToolInputSchema, { name: 'A title', notes: '- a' }],
      [
        SuggestReadingToolInputSchema,
        { url: 'https://example.org/a', title: 'A page', why: 'It is relevant.' },
      ],
    ] as const) {
      const parsed = schema.parse({ ...input, ...planted }) as Record<string, unknown>
      for (const key of Object.keys(planted)) expect(parsed, key).not.toHaveProperty(key)
    }
  })
})

describe('what the brainstorm AI is shown', () => {
  it("has nowhere to put a draft's text: a draft is its id, title and date", () => {
    expect(Object.keys(IdeaDraftSchema.shape).sort()).toEqual(['id', 'title', 'updatedAt'])
  })

  it('lists drafts by title only, even if one were handed more', () => {
    const idea = {
      id: 'i',
      publicationId: 'p',
      name: 'Idea',
      notes: '',
      links: [],
      // A draft carrying text it should not have, as a mistake in a future change might.
      drafts: [{ id: 'd', title: 'Part 1', updatedAt: 'x', body: 'SECRET DRAFT BODY' }],
      createdAt: 'x',
      updatedAt: 'x',
    } as unknown as Idea
    const snapshot = formatSnapshot({
      idea,
      publication: { name: 'V', siteUrl: null, description: null },
    })
    expect(snapshot).toContain('- Part 1')
    expect(snapshot).not.toContain('SECRET DRAFT BODY')
  })

  it("puts the app's rules after the default prompt", () => {
    const system = brainstormSystem()
    expect(system.startsWith(DEFAULT_BRAINSTORM_PROMPT)).toBe(true)
    expect(system.endsWith(BRAINSTORM_RULES_PROMPT)).toBe(true)
  })
})
