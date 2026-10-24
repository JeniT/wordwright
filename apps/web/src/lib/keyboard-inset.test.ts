import { describe, expect, it } from 'vitest'
import { keyboardInset, trackKeyboardInset, type KeyboardWindow } from './keyboard-inset'

function fakeWindow(innerHeight: number, height: number, offsetTop = 0, scale = 1) {
  const listeners: Record<string, Array<() => void>> = { resize: [], scroll: [] }
  const vv = {
    height,
    offsetTop,
    scale,
    addEventListener: (type: 'resize' | 'scroll', fn: () => void) => listeners[type]!.push(fn),
    removeEventListener: (type: 'resize' | 'scroll', fn: () => void) => {
      listeners[type] = listeners[type]!.filter((l) => l !== fn)
    },
  }
  const win: KeyboardWindow = { innerHeight, visualViewport: vv }
  const fire = (type: 'resize' | 'scroll') => listeners[type]!.forEach((l) => l())
  return { win, vv, fire, listeners }
}

describe('keyboardInset', () => {
  it('is the part of the layout viewport the visual viewport leaves out', () => {
    expect(keyboardInset(fakeWindow(800, 500).win)).toBe(300)
  })
  it('allows for the visual viewport having scrolled down', () => {
    expect(keyboardInset(fakeWindow(800, 500, 100).win)).toBe(200)
  })
  it('is zero with no keyboard, and never negative', () => {
    expect(keyboardInset(fakeWindow(800, 800).win)).toBe(0)
    expect(keyboardInset(fakeWindow(800, 790, 40).win)).toBe(0)
  })
  it('is zero while pinch-zoomed', () => {
    expect(keyboardInset(fakeWindow(800, 400, 0, 2).win)).toBe(0)
  })
  it('is zero where there is no visualViewport', () => {
    expect(keyboardInset({ innerHeight: 800 })).toBe(0)
  })
})

describe('trackKeyboardInset', () => {
  it('sets the variable now and on resize and scroll, and removes it when stopped', () => {
    const { win, vv, fire, listeners } = fakeWindow(800, 800)
    const root = document.createElement('div')
    const stop = trackKeyboardInset(win, root)
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('0px')
    vv.height = 480
    fire('resize')
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('320px')
    vv.offsetTop = 20
    fire('scroll')
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('300px')
    stop()
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('')
    expect(listeners.resize).toHaveLength(0)
    expect(listeners.scroll).toHaveLength(0)
  })
  it('leaves the variable alone where there is no visualViewport', () => {
    const root = document.createElement('div')
    trackKeyboardInset({ innerHeight: 800 }, root)()
    expect(root.style.getPropertyValue('--keyboard-inset')).toBe('')
  })
})
