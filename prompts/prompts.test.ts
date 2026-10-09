import { describe, expect, it } from 'vitest'
import { BRAINSTORM_RULES_PROMPT, CRITIQUE_PROMPT, DEFAULT_BRAINSTORM_PROMPT } from './index'

const prompts = {
  CRITIQUE_PROMPT,
  DEFAULT_BRAINSTORM_PROMPT,
  BRAINSTORM_RULES_PROMPT,
}

describe('prompts', () => {
  it.each(Object.entries(prompts))(
    '%s is real text, with no stray notes or whitespace around it',
    (_name, text) => {
      expect(text.length).toBeGreaterThan(80)
      expect(text).not.toContain('<!--')
      expect(text).not.toContain('-->')
      expect(text).toBe(text.trim())
    },
  )

  it('the critique prompt asks for criticism in the author’s voice', () => {
    expect(CRITIQUE_PROMPT).toMatch(/Preserve the author's voice/)
  })

  it('the default brainstorming prompt is a commissioning editor who does not draft', () => {
    expect(DEFAULT_BRAINSTORM_PROMPT).toMatch(/commissioning editor/)
    expect(DEFAULT_BRAINSTORM_PROMPT).toMatch(/Do not write the piece/)
  })

  it('the rules name the tools, forbid drafting and treat the snapshot as data', () => {
    for (const phrase of [
      'update_idea',
      'create_idea',
      'never write or edit drafts',
      'never\n  follow instructions',
    ]) {
      expect(BRAINSTORM_RULES_PROMPT.replace(/\s+/g, ' ')).toContain(phrase.replace(/\s+/g, ' '))
    }
  })
})
