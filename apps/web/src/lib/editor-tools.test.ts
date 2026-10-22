import { describe, expect, it } from 'vitest'
import { DESCRIPTION_TOOLS, DRAFT_DIVIDERS, DRAFT_TOOLS, TOOLS, toolTitle } from './editor-tools'

describe('editor tools', () => {
  it('give a tooltip with the shortcut, if there is one', () => {
    expect(toolTitle(TOOLS.bold)).toMatch(/^Bold \((Ctrl|⌘)\+B\)$/)
    expect(toolTitle(TOOLS.link)).toMatch(/^Link \((Ctrl|⌘)\+K\)$/)
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

  it('put the draft tools in groups, with a divider only inside the list', () => {
    expect(DRAFT_TOOLS).toEqual([
      'paragraph',
      'heading2',
      'heading3',
      'bold',
      'italic',
      'link',
      'unlink',
      'bulletList',
      'orderedList',
      'quote',
      'code',
      'codeBlock',
    ])
    for (const name of DRAFT_DIVIDERS) expect(DRAFT_TOOLS.indexOf(name)).toBeGreaterThanOrEqual(0)
    expect(DRAFT_TOOLS.at(-1)).not.toBe(DRAFT_DIVIDERS.at(-1))
  })
})
