const MAX_TITLE = 200

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1]!.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return NAMED[body.toLowerCase()] ?? whole
  })
}

function tidy(raw: string): string | null {
  const text = decodeEntities(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1)}…` : text
}

/**
 * The title of an HTML document: its `<title>`, else its `og:title`. Returned as plain text (never
 * HTML), tidied and capped, or null when there isn't one. Only reads text; runs nothing.
 */
export function extractTitle(html: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)
  const fromTitle = title ? tidy(title[1]!.replace(/<[^>]*>/g, '')) : null
  if (fromTitle) return fromTitle

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/\b(?:property|name)\s*=\s*["']og:title["']/i.test(tag)) continue
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const fromMeta = content ? tidy(content[1] ?? content[2] ?? '') : null
    if (fromMeta) return fromMeta
  }
  return null
}
