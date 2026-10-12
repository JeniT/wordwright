import { describe, expect, it } from 'vitest'
import { extractReadableText } from './readable-text'

const read = (html: string, max = 8000) => extractReadableText(html, max)
const filler = (n: number) =>
  `${'A sentence about gardens and the people who tend them. '.repeat(n)}`

describe('extractReadableText', () => {
  it('takes the article, not the menus, footer or scripts around it', () => {
    const { text } = read(`<html><head><title>T</title><style>p{color:red}</style></head><body>
      <nav><a href="/">Home</a> <a href="/about">About</a></nav>
      <script>var tracking = "do not read me"</script>
      <article><h1>On pruning</h1><p>${filler(5)}</p><p>Second paragraph.</p></article>
      <footer>Subscribe to our newsletter</footer></body></html>`)
    expect(text).toContain('On pruning')
    expect(text).toContain('Second paragraph.')
    for (const noise of ['Home', 'About', 'tracking', 'color:red', 'Subscribe', 'T\n']) {
      expect(text).not.toContain(noise)
    }
  })

  it('keeps paragraphs apart and decodes entities', () => {
    const { text } = read(`<body><main><p>Tom &amp; Jerry&nbsp;&mdash; &#8220;cats&#8221;</p>
      <p>${filler(5)}</p><ul><li>one</li><li>two</li></ul></main></body>`)
    expect(text).toContain('Tom & Jerry — “cats”')
    expect(text).toMatch(/cats”\n\nA sentence/)
    expect(text).toMatch(/one\ntwo/)
  })

  it('falls back to the whole body when the article is only a teaser', () => {
    const { text } = read(
      `<body><article>Short teaser</article><div><p>${filler(6)}</p></div></body>`,
    )
    expect(text).toContain('A sentence about gardens')
  })

  it('prefers the longest article on a page that lists several', () => {
    const { text } = read(
      `<body><article>Teaser one</article><article><p>${filler(6)}</p></article></body>`,
    )
    expect(text).toContain('A sentence about gardens')
    expect(text).not.toContain('Teaser one')
  })

  it('leaves no code behind when the page is cut off inside a script', () => {
    const { text } = read(`<body><p>Words before.</p><script>function leak(){ "secret`)
    expect(text).toBe('Words before.')
  })

  it('returns text, never markup, even from markup written as words', () => {
    const { text } = read(
      '<body><p>Use &lt;b&gt;bold&lt;/b&gt; sparingly <b onclick="x()">really</b></p></body>',
    )
    expect(text).toBe('Use <b>bold</b> sparingly really')
  })

  it('cuts at a word when over the limit, and says so', () => {
    const result = read(`<body><p>${filler(50)}</p></body>`, 120)
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThanOrEqual(121)
    expect(result.text).toMatch(/\w…$/)
    expect(read('<body><p>Short.</p></body>')).toEqual({ text: 'Short.', truncated: false })
  })

  it('gives nothing for a page without words', () => {
    expect(read('<html><body><script>render()</script></body></html>').text).toBe('')
  })
})
