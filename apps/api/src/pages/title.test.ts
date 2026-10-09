import { describe, expect, it } from 'vitest'
import { extractTitle } from './title'

describe('extractTitle', () => {
  it('reads the title, tidying whitespace', () => {
    expect(extractTitle('<html><head><title>\n  Why rivers\n  meander </title></head>')).toBe(
      'Why rivers meander',
    )
  })

  it('is not fooled by case or attributes', () => {
    expect(extractTitle('<TITLE data-x="1">Loud</TITLE >')).toBe('Loud')
  })

  it('decodes entities into plain text', () => {
    expect(
      extractTitle('<title>Tom &amp; Jerry &#8211; &quot;ok&quot; &#x2764; &unknown;</title>'),
    ).toBe('Tom & Jerry – "ok" ❤ &unknown;')
  })

  it('keeps markup as inert text, never as HTML to render', () => {
    expect(extractTitle('<title>&lt;script&gt;alert(1)&lt;/script&gt;</title>')).toBe(
      '<script>alert(1)</script>',
    )
    expect(extractTitle('<title>Hi <b>there</b></title>')).toBe('Hi there')
  })

  it('drops control characters and caps the length', () => {
    expect(extractTitle('<title>a\u0000b\u0007c</title>')).toBe('a b c')
    const long = extractTitle(`<title>${'x'.repeat(500)}</title>`)!
    expect(long).toHaveLength(200)
    expect(long.endsWith('…')).toBe(true)
  })

  it('falls back to og:title when the title is empty or missing', () => {
    expect(extractTitle('<title> </title><meta property="og:title" content="Social title">')).toBe(
      'Social title',
    )
    expect(extractTitle('<meta content=\'Reversed &amp; fine\' name="og:title">')).toBe(
      'Reversed & fine',
    )
  })

  it('returns null when there is nothing usable', () => {
    expect(extractTitle('')).toBeNull()
    expect(extractTitle('<html><body>No title</body></html>')).toBeNull()
    expect(extractTitle('<title></title>')).toBeNull()
  })
})
