import { fireEvent, render, screen, within } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { DRAFT_SECTIONS, DRAFT_TOOLS } from '../lib/editor-tools'
import EditorToolbar from './EditorToolbar.vue'

/** The draft's toolbar, laid out `width` pixels wide (jsdom does no layout, so the width is stood in for). */
async function showAt(width: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)
  render(EditorToolbar, {
    props: {
      editor: undefined,
      tools: DRAFT_TOOLS,
      sections: DRAFT_SECTIONS,
      markdownToggle: true,
      actions: true,
    },
  })
  await nextTick() // the width is measured once mounted
  return screen.getByRole('toolbar', { name: 'Formatting' })
}

/** The names of the buttons on the bar itself, before More is opened. */
const onTheBar = (toolbar: HTMLElement) =>
  within(toolbar)
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label'))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('the draft toolbar on a narrow screen', () => {
  it('keeps Bold, Italic and the link buttons on the bar at phone width, and the rest in More', async () => {
    const toolbar = await showAt(358) // a 390px phone, less the page's gutters
    expect(onTheBar(toolbar)).toEqual([
      'Bold',
      'Italic',
      'Link',
      'Remove link',
      'More formatting',
      'Comment',
      'Rephrase',
      'Edit as Markdown',
    ])
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'More formatting' }))
    const more = within(toolbar).getByRole('group', { name: 'More formatting' })
    expect(within(more).getAllByRole('button')[0]).toHaveAccessibleName('Paragraph')
  })

  it('leaves no room for the rule of a group that is all in More', async () => {
    // Four buttons, More and the right-hand three fit in 330px only if no rule is set aside for the hidden groups.
    expect(onTheBar(await showAt(330)).slice(0, 5)).toEqual([
      'Bold',
      'Italic',
      'Link',
      'Remove link',
      'More formatting',
    ])
  })

  it('sets aside room for the rule before a group that is partly on the bar', async () => {
    // At 380px a fifth button fits along with the one rule before it, and no more.
    const shown = onTheBar(await showAt(380))
    expect(shown.slice(0, 6)).toEqual([
      'Bold',
      'Italic',
      'Link',
      'Remove link',
      'Paragraph',
      'More formatting',
    ])
  })
})
