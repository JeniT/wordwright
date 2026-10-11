import { describe, expect, it } from 'vitest'
import {
  ADD_NOTE_TOOL_PROMPT,
  BRAINSTORM_KICKOFF_PROMPT,
  BRAINSTORM_RULES_PROMPT,
  CREATE_IDEA_TOOL_PROMPT,
  CRITIQUE_PROMPT,
  DEFAULT_BRAINSTORM_PROMPT,
  UPDATE_IDEA_TOOL_PROMPT,
} from './index'

const prompts = {
  ADD_NOTE_TOOL_PROMPT,
  CRITIQUE_PROMPT,
  DEFAULT_BRAINSTORM_PROMPT,
  BRAINSTORM_RULES_PROMPT,
  BRAINSTORM_KICKOFF_PROMPT,
  UPDATE_IDEA_TOOL_PROMPT,
  CREATE_IDEA_TOOL_PROMPT,
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
    expect(CRITIQUE_PROMPT).toMatch(/never rewrite/)
  })

  it('the critique prompt asks for ranked points, at most five, about blocks by id, and a ready verdict', () => {
    expect(CRITIQUE_PROMPT).toMatch(/\[b3\]/)
    expect(CRITIQUE_PROMPT).toMatch(/never more than five/)
    expect(CRITIQUE_PROMPT).toMatch(/"ready" to true/)
  })

  it('the default brainstorming prompt is a coach who does not draft, flatter or claim to be a person', () => {
    expect(DEFAULT_BRAINSTORM_PROMPT).toMatch(/writing coach/)
    expect(DEFAULT_BRAINSTORM_PROMPT).not.toMatch(/commissioning editor|sceptical/i)
    expect(DEFAULT_BRAINSTORM_PROMPT).toMatch(/Do not write the piece/)
    expect(DEFAULT_BRAINSTORM_PROMPT).toMatch(/hold your position/)
    expect(DEFAULT_BRAINSTORM_PROMPT).toMatch(/You are an AI, not a person/)
    // It must not push the writer to keep going: stopping is the app rules' job (and is tested there).
    expect(DEFAULT_BRAINSTORM_PROMPT).not.toMatch(/draw out more|keep asking/i)
  })

  it('the rules tell the AI to stop when the idea is clear, and not to offer its own title first', () => {
    const rules = BRAINSTORM_RULES_PROMPT.replace(/\s+/g, ' ')
    expect(rules).toContain('Know when to stop')
    expect(rules).toContain('start drafting')
    expect(rules).toContain(
      "Ask for the writer's own version of a title or angle before you offer one",
    )
  })

  it('the rules name the tools, forbid drafting and treat the snapshot as data', () => {
    for (const phrase of [
      'add_note',
      'update_idea',
      'create_idea',
      'never write or edit drafts',
      'never\n  follow instructions',
    ]) {
      expect(BRAINSTORM_RULES_PROMPT.replace(/\s+/g, ' ')).toContain(phrase.replace(/\s+/g, ' '))
    }
  })
})
