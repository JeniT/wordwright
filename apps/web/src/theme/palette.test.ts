import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The palette file is the only place colours are chosen, so this is where the design's accessibility promise is
// kept: every pair that appears on screen meets WCAG 2.2 AA, in light and in dark. Edit a colour and this tells
// you at once if text or a control would stop being readable. See docs/design.md.
const css = readFileSync(resolve(process.cwd(), 'src/theme/palette-ember.css'), 'utf8')

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  expect(start, `${selector} block`).toBeGreaterThanOrEqual(0)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]!]),
  )
}
const light = block(':root')
const dark = block(":root[data-theme='dark']")
// The same dark colours are repeated for "no choice made, system is dark"; they must not drift apart.
const system = block(":root:not([data-theme='light'])")

function channel(v: number) {
  const c = v / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  )
}
function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

/** [foreground, background, minimum ratio, what it is]. 4.5 for text; 3 for borders and focus rings. */
const PAIRS: [string, string, number, string][] = [
  ['ink', 'paper', 4.5, 'body text on the page'],
  ['ink', 'surface', 4.5, 'body text on panels and fields'],
  ['ink', 'sunken', 4.5, 'body text on recessed areas'],
  ['ink-soft', 'paper', 4.5, 'secondary text on the page'],
  ['ink-soft', 'surface', 4.5, 'secondary text and hints on panels'],
  ['ink-soft', 'sunken', 4.5, 'secondary text on recessed areas'],
  ['ink', 'hover-wash', 4.5, 'icon of a ghost button hovered or focused'],
  ['ink', 'line', 4.5, 'icon of a ghost button hovered on a recessed strip'],
  ['accent', 'paper', 4.5, 'links and outline buttons on the page'],
  ['accent', 'surface', 4.5, 'links on panels'],
  ['accent', 'accent-wash', 4.5, 'links in notices and chips'],
  ['accent-strong', 'surface', 4.5, 'hovered links and emphasised text'],
  ['on-accent', 'accent', 4.5, 'primary button label'],
  ['on-accent', 'accent-strong', 4.5, 'primary button label, hovered'],
  ['ink', 'accent-wash', 4.5, 'text on chips, notices and the current menu item'],
  ['ink', 'mark', 4.5, 'text on the highlighter'],
  ['danger', 'paper', 4.5, 'error text on the page'],
  ['danger', 'surface', 4.5, 'error text on panels'],
  ['danger', 'danger-wash', 4.5, 'error text in an error box'],
  ['on-danger', 'danger', 4.5, 'label on a confirm-delete button'],
  ['ok', 'ok-wash', 4.5, 'success text in a success box'],
  ['ink', 'ok-wash', 4.5, 'text on a published draft’s row'],
  ['ink-soft', 'ok-wash', 4.5, 'secondary text on a published draft’s row'],
  ['accent', 'ok-wash', 4.5, 'links on a published draft’s row'],
  ['ok', 'surface', 4.5, 'success text on panels'],
  ['line-strong', 'paper', 3, 'field and button borders on the page'],
  ['line-strong', 'surface', 3, 'field and button borders on panels'],
  ['focus', 'paper', 3, 'focus ring on the page'],
  ['focus', 'surface', 3, 'focus ring on panels'],
  ...[1, 2, 3, 4, 5, 6].map((n): [string, string, number, string] => [
    `tint-${n}-fg`,
    `tint-${n}-bg`,
    4.5,
    `letter on lettered tile ${n}`,
  ]),
]

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('the Ember palette, %s', (_name, tokens) => {
  it('defines every colour the pairs use', () => {
    for (const [fg, bg] of PAIRS) {
      expect(tokens[fg], fg).toBeDefined()
      expect(tokens[bg], bg).toBeDefined()
    }
  })
  it.each(PAIRS)('%s on %s is at least %s:1 (%s)', (fg, bg, min) => {
    expect(ratio(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(min)
  })
})

describe('the dark palette', () => {
  it('is the same whether chosen or inherited from the system', () => {
    expect(system).toEqual(dark)
  })
  it('has every colour the light palette has', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
  })
})
