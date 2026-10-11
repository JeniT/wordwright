import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollAreaOf, scrollAreaToTop, scrollPageToTop } from './scroll'

/** An element that says where it is (jsdom has no layout). */
const at = (top: number, extra: object = {}) =>
  ({ getBoundingClientRect: () => ({ top }), ...extra }) as unknown as HTMLElement

afterEach(() => vi.unstubAllGlobals())

describe('scrollPageToTop', () => {
  it('scrolls the page so the element is a little below the top edge', () => {
    vi.stubGlobal('scrollY', 1000)
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    scrollPageToTop(at(600)) // 600px below the top of the window, which is already 1000px down the page
    expect(scrollTo).toHaveBeenCalledWith({ top: 1584, behavior: 'smooth' })
  })

  it('does not scroll above the top of the page', () => {
    vi.stubGlobal('scrollY', 0)
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    scrollPageToTop(at(5))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('jumps rather than glides when the person has asked for less motion', () => {
    vi.stubGlobal('scrollY', 0)
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }))
    scrollPageToTop(at(500))
    expect(scrollTo).toHaveBeenCalledWith({ top: 484, behavior: 'auto' })
  })
})

describe('scrollAreaToTop', () => {
  it('scrolls the area, not the page, so the element is at the top of the area', () => {
    const pageScroll = vi.fn()
    vi.stubGlobal('scrollTo', pageScroll)
    const scrollTo = vi.fn()
    const area = at(20, { scrollTop: 300, scrollTo })
    scrollAreaToTop(at(220), area) // 200px below the area's top edge, which is scrolled 300px
    expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: 'smooth' })
    expect(pageScroll).not.toHaveBeenCalled()
  })

  it('does nothing when there is no scrolling area', () => {
    expect(() => scrollAreaToTop(at(10), null)).not.toThrow()
  })
})

describe('scrollAreaOf', () => {
  it('finds the area beside the draft that scrolls on its own', () => {
    document.body.innerHTML = '<aside data-side-scroll><div><button id="b"></button></div></aside>'
    expect(scrollAreaOf(document.getElementById('b')!)?.tagName).toBe('ASIDE')
    document.body.innerHTML = ''
  })
})
