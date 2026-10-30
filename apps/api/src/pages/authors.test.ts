import { describe, expect, it } from 'vitest'
import { MAX_AUTHORS } from '@wordwright/core'
import { extractAuthors } from './authors'

const head = (inner: string) => `<html><head>${inner}</head><body></body></html>`
const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`

describe('extractAuthors', () => {
  it('reads meta author tags, one name each, in order', () => {
    expect(
      extractAuthors(
        head('<meta name="author" content="Ada Lovelace"><meta name="author" content="Bo Writer">'),
      ),
    ).toEqual(['Ada Lovelace', 'Bo Writer'])
  })

  it('accepts property= and single quotes, and any case', () => {
    expect(extractAuthors(head("<META PROPERTY='Article:Author' CONTENT='Cy Young'>"))).toEqual([
      'Cy Young',
    ])
  })

  it('skips an article:author that is an address, not a name', () => {
    expect(
      extractAuthors(head('<meta property="article:author" content="https://example.org/ada">')),
    ).toEqual([])
    expect(extractAuthors(head('<meta name="author" content="@ada">'))).toEqual([])
  })

  it('reads scholarly citation_author tags', () => {
    expect(
      extractAuthors(
        head(
          '<meta name="citation_author" content="Lovelace, Ada"><meta name="citation_author" content="Babbage, Charles">',
        ),
      ),
    ).toEqual(['Lovelace, Ada', 'Babbage, Charles'])
  })

  it('reads schema.org JSON-LD: a person, a list, a string, and inside @graph', () => {
    expect(extractAuthors(head(ld({ '@type': 'Article', author: { name: 'Dee One' } })))).toEqual([
      'Dee One',
    ])
    expect(
      extractAuthors(head(ld({ author: [{ name: 'Eve Two' }, 'Fay Three', { name: 'Eve Two' }] }))),
    ).toEqual(['Eve Two', 'Fay Three'])
    expect(
      extractAuthors(head(ld({ '@graph': [{ '@type': 'WebSite' }, { author: { name: 'Gus' } }] }))),
    ).toEqual(['Gus'])
  })

  it('prefers the meta tags, and does not add the JSON-LD names on top', () => {
    expect(
      extractAuthors(head(`<meta name="author" content="Ada">${ld({ author: { name: 'Bo' } })}`)),
    ).toEqual(['Ada'])
  })

  it('decodes entities, tidies spacing, drops repeats and empties', () => {
    expect(
      extractAuthors(
        head(
          '<meta name="author" content="  Zo&eacute;   O&#39;Neil ">' +
            '<meta name="author" content="zo&eacute; o&#39;neil"><meta name="author" content="">',
        ),
      ),
    ).toEqual(["Zo&eacute; O'Neil"]) // unknown named entities are left as they came, never turned into markup
  })

  it('decodes the typographic entities a page title does', () => {
    expect(
      extractAuthors(head('<meta name="author" content="Siobh&aacute;n O&rsquo;Brien">')),
    ).toEqual(['Siobh&aacute;n O’Brien']) // the same named entities as titles, still no more
  })

  it('ignores broken JSON-LD and gives plain text, never HTML', () => {
    expect(extractAuthors(head('<script type="application/ld+json">{nope</script>'))).toEqual([])
    expect(extractAuthors(head('<meta name="author" content="&lt;b&gt;Bold&lt;/b&gt;">'))).toEqual([
      '<b>Bold</b>',
    ])
  })

  it('caps how many it returns, and skips absurdly long "names"', () => {
    const many = Array.from({ length: 30 }, (_, i) => `<meta name="author" content="Person ${i}">`)
    expect(extractAuthors(head(many.join('')))).toHaveLength(MAX_AUTHORS)
    expect(extractAuthors(head(`<meta name="author" content="${'x'.repeat(500)}">`))).toEqual([])
  })

  it('finds nothing on a page that names no one', () => {
    expect(extractAuthors(head('<title>Hi</title>'))).toEqual([])
  })
})
