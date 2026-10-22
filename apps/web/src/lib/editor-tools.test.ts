import { describe, expect, it } from 'vitest'
import { DESCRIPTION_TOOLS, DRAFT_SECTIONS, DRAFT_TOOLS, TOOLS, toolTitle } from './editor-tools'

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

  it('put the draft tools in labelled sections, in order, each tool once', () => {
    expect(DRAFT_SECTIONS.map((s) => s.label)).toEqual([
      'Text style',
      'Emphasis and links',
      'Lists and quotes',
      'Code',
    ])
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
  })
})
