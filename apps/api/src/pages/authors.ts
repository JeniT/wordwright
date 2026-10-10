import { AUTHOR_NAME_MAX, MAX_AUTHORS } from '@lfwa/core'

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1]!.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    return NAMED[body.toLowerCase()] ?? whole
  })
}

/** A name, tidied; null if it is empty or isn't a name (a profile address, which `article:author` often holds). */
function tidyName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = decode(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!name || /^(https?:)?\/\//i.test(name) || /^@/.test(name)) return null
  return name.length > AUTHOR_NAME_MAX ? null : name
}

/** The `content` of every `<meta>` whose name or property is one of `names` (case-insensitive). */
function metaContents(html: string, names: readonly string[]): string[] {
  const found: string[] = []
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const wanted = (key?.[1] ?? key?.[2] ?? '').toLowerCase()
    if (!names.includes(wanted)) continue
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    found.push(content?.[1] ?? content?.[2] ?? '')
  }
  return found
}

/** Names in a schema.org `author` value: a string, a Person/Organization, or a list of either. */
function ldNames(value: unknown, out: string[]) {
  if (Array.isArray(value)) return value.forEach((v) => ldNames(v, out))
  if (typeof value === 'string') return void out.push(value)
  if (value && typeof value === 'object' && 'name' in value)
    out.push((value as { name: unknown }).name as string)
}

function fromJsonLd(html: string): string[] {
  const out: string[] = []
  const scripts = html.matchAll(
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )
  for (const [, body] of scripts) {
    let data: unknown
    try {
      data = JSON.parse(body!)
    } catch {
      continue
    }
    const nodes = Array.isArray(data) ? data : [data]
    for (const node of nodes) {
      const graph = (node as { '@graph'?: unknown })?.['@graph']
      for (const item of Array.isArray(graph) ? graph : [node]) {
        ldNames((item as { author?: unknown } | null)?.author, out)
      }
    }
  }
  return out
}

/**
 * Who a page says wrote it, as plain text: `<meta name="author">`, `article:author` (when it holds a name rather than
 * an address), Dublin Core and scholarly `citation_author` tags, then schema.org JSON-LD. The first source that names
 * anyone wins, so a page isn't credited twice over; repeats are dropped and the list is capped. Only reads text.
 */
export function extractAuthors(html: string): string[] {
  const sources = [
    () => metaContents(html, ['author', 'article:author', 'dc.creator', 'citation_author']),
    () => fromJsonLd(html),
  ]
  for (const source of sources) {
    const seen = new Set<string>()
    const names: string[] = []
    for (const raw of source()) {
      const name = tidyName(raw)
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      names.push(name)
      if (names.length >= MAX_AUTHORS) break
    }
    if (names.length) return names
  }
  return []
}
