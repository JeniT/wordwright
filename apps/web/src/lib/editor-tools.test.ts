import { describe, expect, it } from 'vitest'
import { DESCRIPTION_TOOLS, DRAFT_TOOLS, TOOLS, toolTitle } from './editor-tools'

describe('editor tools', () => {
  it('give a tooltip with the shortcut, if there is one', () => {
    expect(toolTitle(TOOLS.bold)).toMatch(/^Bold \((Ctrl|⌘)\+B\)$/)
    expect(toolTitle(TOOLS.link)).toBe('Link')
  })

  it('offer only tools that exist, each once, and run everything but the link', () => {
    for (const list of [DESCRIPTION_TOOLS, DRAFT_TOOLS]) {
      expect(new Set(list).size).toBe(list.length)
      for (const name of list) expect(TOOLS[name], name).toBeDefined()
    }
    for (const [name, tool] of Object.entries(TOOLS)) {
      expect(!!tool.run, name).toBe(name !== 'link')
    }
  })
})
