import { fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, withDirectives } from 'vue'
import { vTip } from './tip'

// A bare icon button with the directive, the way a page uses it.
const Probe = defineComponent({
  props: { text: { type: String, default: 'Edit' } },
  setup: (props) => () =>
    withDirectives(h('button', { type: 'button', 'aria-label': props.text }, 'x'), [
      [vTip, props.text],
    ]),
})
const button = () => screen.getByRole('button', { name: /./ })
const tip = () => document.querySelector('[data-tip]')

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('v-tip', () => {
  it('shows the words beside the button when it is hovered, and hides them when the pointer leaves', async () => {
    render(Probe, { props: { text: 'Edit this note' } })
    expect(tip()).toBeNull()
    await fireEvent.pointerEnter(button())
    expect(tip()).toHaveTextContent('Edit this note')
    await fireEvent.pointerLeave(button())
    vi.runAllTimers()
    expect(tip()).toBeNull()
  })

  it('also shows them when the button gets keyboard focus, and hides them on blur', async () => {
    render(Probe)
    button().focus()
    expect(tip()).toHaveTextContent('Edit')
    button().blur()
    expect(tip()).toBeNull()
  })

  it('does not pop up when a press (a tap or click) is what focused the button', async () => {
    render(Probe)
    await fireEvent.pointerDown(button())
    button().focus()
    expect(tip()).toBeNull()
  })

  it('goes away on Escape without moving focus', async () => {
    render(Probe)
    button().focus()
    expect(tip()).not.toBeNull()
    await fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(tip()).toBeNull()
    expect(button()).toHaveFocus()
  })

  it('stays while the pointer moves onto the tooltip itself', async () => {
    render(Probe)
    await fireEvent.pointerEnter(button())
    await fireEvent.pointerLeave(button())
    await fireEvent.pointerEnter(tip()!)
    vi.runAllTimers()
    expect(tip()).not.toBeNull()
    await fireEvent.pointerLeave(tip()!)
    vi.runAllTimers()
    expect(tip()).toBeNull()
  })

  it('is not read out: the button’s own name is the accessible one', async () => {
    render(Probe)
    button().focus()
    expect(tip()).toHaveAttribute('aria-hidden', 'true')
    expect(button()).not.toHaveAttribute('title')
  })

  it('goes with the button when it is removed while the tooltip is showing', async () => {
    const { unmount } = render(Probe)
    button().focus()
    unmount()
    expect(tip()).toBeNull()
  })
})
