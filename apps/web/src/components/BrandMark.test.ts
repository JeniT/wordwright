import { render } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import BrandMark from './BrandMark.vue'

describe('BrandMark', () => {
  it('is decoration: hidden from assistive technology and never focusable', () => {
    const { container } = render(BrandMark)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
  })

  it('is coloured by the accent role, not a raw colour', () => {
    const { container } = render(BrandMark)
    expect(container.querySelector('svg')).toHaveClass('text-accent')
    expect(container.querySelector('path')).toHaveAttribute('fill', 'currentColor')
  })

  it('keeps its proportions at whatever height it is given', () => {
    const { container } = render(BrandMark, { props: { height: 48 } })
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('height', '48')
    expect(Number(svg.getAttribute('width'))).toBeCloseTo((48 * 74.6) / 109.2, 2)
  })
})
