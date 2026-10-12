import { fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOLD_MS } from '../lib/hold-settings'
import HoldButton, { ARMED_MS } from './HoldButton.vue'

// jsdom has no PointerEvent, so give it one that carries coordinates like a real one.
class TestPointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}
window.PointerEvent ??= TestPointerEvent as unknown as typeof PointerEvent

const setup = (props: Record<string, unknown> = {}) => {
  const onConfirm = vi.fn()
  render(HoldButton, {
    props: { verb: 'Delete', ...props, onConfirm },
    attrs: { 'aria-label': 'Delete note “Erosion”' },
    slots: { default: 'Delete' },
  })
  return { onConfirm, button: screen.getByRole('button', { name: 'Delete note “Erosion”' }) }
}
const announced = () => document.querySelector('[aria-live]')!.textContent
const press = (button: HTMLElement) =>
  fireEvent.pointerDown(button, { button: 0, clientX: 5, clientY: 5 })
const release = async (button: HTMLElement) => {
  await fireEvent.pointerUp(button)
  await fireEvent.click(button) // what the browser sends after a press
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('holding with the pointer', () => {
  it('confirms once, when the hold has lasted long enough, and shows a filling ring meanwhile', async () => {
    const { button, onConfirm } = setup()
    await press(button)
    expect(screen.getByTestId('hold-ring')).toBeInTheDocument()
    expect(announced()).toBe('Keep holding to confirm.')

    await vi.advanceTimersByTimeAsync(HOLD_MS - 1)
    expect(onConfirm).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('hold-ring')).toBeNull()
    expect(announced()).toBe('Confirmed.')

    // Letting go much later neither repeats it nor counts as a separate click.
    await vi.advanceTimersByTimeAsync(5000)
    await release(button)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(button).toHaveTextContent('Delete')
    expect(button).not.toHaveTextContent('Delete?')
  })

  it('takes a hold of 1.5 seconds, the app-wide setting', () => {
    expect(HOLD_MS).toBe(1500)
  })

  it('does not confirm when let go early: it arms instead, and says so', async () => {
    const { button, onConfirm } = setup()
    await press(button)
    await vi.advanceTimersByTimeAsync(HOLD_MS / 2)
    await release(button)
    await vi.advanceTimersByTimeAsync(HOLD_MS * 2)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByTestId('hold-ring')).toBeNull()
    expect(announced()).toBe('Press again to confirm.')
    expect(button).toHaveTextContent('Delete?') // and the click that followed did not also confirm
  })

  it('cancels when the pointer moves off the button, and follows it while on it', async () => {
    const { button, onConfirm } = setup()
    button.getBoundingClientRect = () =>
      ({ left: 0, right: 100, top: 0, bottom: 30, width: 100, height: 30 }) as DOMRect
    await press(button)
    await fireEvent.pointerMove(button, { clientX: 40, clientY: 10 })
    expect(screen.getByTestId('hold-ring')).toHaveStyle({ left: '40px', top: '10px' })
    await fireEvent.pointerMove(button, { clientX: 140, clientY: 10 })
    expect(screen.queryByTestId('hold-ring')).toBeNull()
    await vi.advanceTimersByTimeAsync(HOLD_MS * 2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('ignores other mouse buttons, and the context menu', async () => {
    const { button, onConfirm } = setup()
    await fireEvent.pointerDown(button, { button: 2 })
    expect(screen.queryByTestId('hold-ring')).toBeNull()
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    button.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    await vi.advanceTimersByTimeAsync(HOLD_MS * 2)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('takes its time from the prop', async () => {
    const { button, onConfirm } = setup({ holdMs: 200 })
    await press(button)
    await vi.advanceTimersByTimeAsync(200)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('does nothing when disabled', async () => {
    const { button, onConfirm } = setup({ disabled: true })
    await press(button)
    await vi.advanceTimersByTimeAsync(HOLD_MS * 2)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})

describe('holding with a finger', () => {
  it('draws the ring above the finger, so the finger does not cover it', async () => {
    const { button } = setup()
    await fireEvent.pointerDown(button, {
      button: 0,
      clientX: 50,
      clientY: 200,
      pointerType: 'touch',
    })
    expect(screen.getByTestId('hold-ring')).toHaveStyle({ left: '50px', top: '152px' })
  })
})

describe('holding with the keyboard', () => {
  it.each(['Enter', ' '])(
    'confirms after holding %j, once, however long the key repeats',
    async (key) => {
      const { button, onConfirm } = setup()
      await fireEvent.keyDown(button, { key })
      await fireEvent.keyDown(button, { key, repeat: true })
      expect(screen.getByTestId('hold-ring')).toBeInTheDocument()
      await vi.advanceTimersByTimeAsync(HOLD_MS)
      expect(onConfirm).toHaveBeenCalledTimes(1)
      await fireEvent.keyUp(button, { key })
      expect(onConfirm).toHaveBeenCalledTimes(1)
    },
  )

  it('arms on a quick press, confirms on the next, and does nothing when focus moves away mid-hold', async () => {
    const { button, onConfirm } = setup()
    await fireEvent.keyDown(button, { key: 'Enter' })
    await fireEvent.keyUp(button, { key: 'Enter' })
    await fireEvent.click(button) // browsers click on Enter/Space; the hold's own handling prevents it
    expect(button).toHaveTextContent('Delete?')
    expect(onConfirm).not.toHaveBeenCalled()
    await fireEvent.keyDown(button, { key: ' ' })
    await fireEvent.keyUp(button, { key: ' ' })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(button).not.toHaveTextContent('Delete?')

    await fireEvent.keyDown(button, { key: ' ' })
    await fireEvent.blur(button)
    await vi.advanceTimersByTimeAsync(HOLD_MS * 2)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(announced()).toBe('Cancelled. Nothing was changed.')
  })

  it('does not treat other keys as holding', async () => {
    const { button } = setup()
    await fireEvent.keyDown(button, { key: 'a' })
    expect(screen.queryByTestId('hold-ring')).toBeNull()
  })
})

describe('tapping twice, instead of holding', () => {
  it('a tap arms the button, saying the verb; a second tap confirms', async () => {
    const { button, onConfirm } = setup()
    await press(button)
    await release(button)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(button).toHaveTextContent('Delete?')
    expect(button).toHaveAttribute('data-armed')
    expect(announced()).toBe('Press again to confirm.')
    await press(button)
    await release(button)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(button).not.toHaveTextContent('Delete?')
    expect(button).not.toHaveAttribute('data-armed')
  })

  it('says the verb it was given', async () => {
    const { button } = setup({ verb: 'Revoke' })
    await fireEvent.click(button)
    expect(button).toHaveTextContent('Revoke?')
  })

  it('goes back if the second tap does not come, if focus moves away, or on Escape', async () => {
    const { button, onConfirm } = setup()
    await fireEvent.click(button)
    await vi.advanceTimersByTimeAsync(ARMED_MS)
    expect(button).toHaveTextContent('Delete')
    expect(button).not.toHaveTextContent('Delete?')
    expect(announced()).toBe('Cancelled. Nothing was changed.')

    await fireEvent.click(button)
    await fireEvent.blur(button)
    expect(button).not.toHaveTextContent('Delete?')

    await fireEvent.click(button)
    await fireEvent.keyDown(button, { key: 'Escape' })
    expect(button).not.toHaveTextContent('Delete?')
    await fireEvent.click(button) // arms again rather than confirming
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('does not arm when the pointer moved off the button before letting go', async () => {
    const { button } = setup()
    button.getBoundingClientRect = () =>
      ({ left: 0, right: 100, top: 0, bottom: 30, width: 100, height: 30 }) as DOMRect
    await press(button)
    await fireEvent.pointerMove(button, { clientX: 140, clientY: 10 })
    await release(button)
    expect(button).not.toHaveTextContent('Delete?')
  })

  it('does nothing when disabled', async () => {
    const { button, onConfirm } = setup({ disabled: true })
    await fireEvent.click(button)
    await fireEvent.click(button)
    expect(onConfirm).not.toHaveBeenCalled()
    expect(button).not.toHaveTextContent('Delete?')
  })

  it('says how to use it, to whoever focuses it', () => {
    const { button } = setup()
    expect(button).toHaveAccessibleDescription(/Press and hold to confirm/)
    expect(button).toHaveAccessibleDescription(/tap it once and then again/)
  })
})

describe('with reduced motion', () => {
  it('shows words instead of a ring while held', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }))
    const { button, onConfirm } = setup()
    await press(button)
    expect(screen.queryByTestId('hold-ring')).toBeNull()
    expect(button).toHaveTextContent('Keep holding…')
    await vi.advanceTimersByTimeAsync(HOLD_MS)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
