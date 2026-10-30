import { describe, expect, it, vi } from 'vitest'
import {
  DESCRIPTION_TOOLS,
  DRAFT_SECTIONS,
  DRAFT_TOOLS,
  openLinkOnModClick,
  TOOLS,
  toolTitle,
} from './editor-tools'

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

describe('a Ctrl or ⌘ click on a link in the editor', () => {
  const clickOn = (target: Element, keys: MouseEventInit = {}) => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...keys })
    Object.defineProperty(event, 'target', { value: target })
    return event
  }
  const link = () => {
    const a = document.createElement('a')
    a.href = 'https://example.com/river'
    a.innerHTML = '<strong>river</strong>'
    return a
  }

  it('opens the link in a new tab, from the link or anything inside it', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    for (const keys of [{ ctrlKey: true }, { metaKey: true }]) {
      const event = clickOn(link().firstElementChild!, keys)
      expect(openLinkOnModClick(event)).toBe(true)
      expect(event.defaultPrevented).toBe(true)
    }
    expect(open).toHaveBeenCalledTimes(2)
    expect(open).toHaveBeenCalledWith('https://example.com/river', '_blank', 'noopener')
    open.mockRestore()
  })

  it('leaves a plain click, or a click away from a link, to the editor', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const plain = clickOn(link())
    expect(openLinkOnModClick(plain)).toBe(false)
    expect(plain.defaultPrevented).toBe(false)
    expect(openLinkOnModClick(clickOn(document.createElement('p'), { ctrlKey: true }))).toBe(false)
    expect(open).not.toHaveBeenCalled()
    open.mockRestore()
  })
})
