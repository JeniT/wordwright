import { fireEvent, render, screen } from '@testing-library/vue'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import InfoTip from './InfoTip.vue'

function show() {
  return render(InfoTip, { props: { label: 'About this' }, slots: { default: 'Why we ask.' } })
}
const icon = () => screen.getByRole('button', { name: 'About this' })
const tip = () => document.querySelector('[role=tooltip]') as HTMLElement
const root = () => icon().parentElement as HTMLElement
const dismissed = () => root().hasAttribute('data-dismissed')
const escape = () => fireEvent.keyDown(document.body, { key: 'Escape' })

describe('InfoTip', () => {
  it('names the icon and describes it with the tip text', () => {
    show()
    expect(icon()).toHaveAccessibleDescription('Why we ask.')
  })

  it('Escape hides the tip and leaves focus on the icon; the next focus shows it again', async () => {
    show()
    icon().focus()
    expect(dismissed()).toBe(false)

    await escape()
    expect(dismissed()).toBe(true)
    expect(icon()).toHaveFocus()

    icon().blur()
    icon().focus()
    await nextTick()
    expect(dismissed()).toBe(false)
  })

  it('Escape hides it for a pointer on the tip, and hovering again shows it', async () => {
    show()
    await fireEvent.mouseEnter(root())
    expect(dismissed()).toBe(false)
    await escape()
    expect(dismissed()).toBe(true)
    await fireEvent.mouseLeave(root())
    await fireEvent.mouseEnter(root())
    expect(dismissed()).toBe(false)
  })

  it('can be hovered: the tip is inside the hover area and not click-through', () => {
    show()
    expect(tip().className).not.toContain('pointer-events-none')
    expect(root()).toHaveClass('group')
    expect(root()).toContainElement(tip())
  })

  it('ignores Escape when neither hovered nor focused', async () => {
    show()
    await escape()
    expect(dismissed()).toBe(false)
  })

  describe('where it opens', () => {
    const rect = (left: number, top: number, width = 28, height = 28) =>
      ({ left, top, right: left + width, bottom: top + height, width, height }) as DOMRect
    /** The icon sits in a clipping box, as the side panel is, with these edges. */
    function inBox(box: DOMRect, at: DOMRect) {
      const panel = document.createElement('div')
      panel.style.overflowY = 'auto'
      document.body.append(panel)
      vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(box)
      render(InfoTip, {
        props: { label: 'About this' },
        slots: { default: 'Why we ask.' },
        container: panel,
      })
      vi.spyOn(root(), 'getBoundingClientRect').mockReturnValue(at)
    }

    it('opens rightwards and downwards from an icon near the left of a narrow panel', async () => {
      inBox(rect(0, 0, 352, 600), rect(120, 40))
      await fireEvent.mouseEnter(root())
      expect(tip()).toHaveClass('left-0', 'top-full')
    })

    it('opens leftwards from an icon near the right edge', async () => {
      inBox(rect(0, 0, 352, 600), rect(320, 40))
      await fireEvent.mouseEnter(root())
      expect(tip()).toHaveClass('right-0')
    })

    it('opens upwards from an icon near the bottom', async () => {
      inBox(rect(0, 0, 352, 300), rect(20, 270))
      await fireEvent.mouseEnter(root())
      expect(tip()).toHaveClass('bottom-full')
    })
  })
})
