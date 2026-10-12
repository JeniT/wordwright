import { decodeEntities } from './title'

/** Parts of a page that are never its words, or are the site's furniture rather than the post. */
const DROPPED = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'head',
  'form',
  'button',
]
const FURNITURE = ['nav', 'header', 'footer', 'aside']

/** Less than this and an `<article>` or `<main>` is probably a teaser, not the post. */
const MIN_MAIN_CHARS = 200

const stripPaired = (html: string, tags: string[]) =>
  tags.reduce(
    (text, tag) => text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}\\s*>`, 'gi'), ' '),
    html,
  )

/** The longest `<tag>...</tag>` in the page, or null. */
function longest(html: string, tag: string): string | null {
  let best: string | null = null
  for (const match of html.matchAll(
    new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}\\s*>`, 'gi'),
  )) {
    if (!best || match[1]!.length > best.length) best = match[1]!
  }
  return best
}

function toText(html: string): string {
  return (
    decodeEntities(
      html
        .replace(/<\/(?:h[1-6]|p|div|section|article|blockquote|pre|ul|ol|table)\s*>/gi, '\n\n')
        .replace(/<(?:br|hr)\b[^>]*>|<\/(?:li|tr)\s*>/gi, '\n')
        .replace(/<[^>]*>/g, ' '),
    )
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/**
 * The words of a page's main content, as plain text. It is not a browser: it takes the page's `<article>` (else its
 * `<main>`, else its body), drops scripts, styles, menus, headers and footers, turns paragraph breaks into blank
 * lines, and decodes entities. It only reads text and runs nothing, and what it returns is never HTML. At most
 * `max` characters are kept, cut at a word.
 */
export function extractReadableText(
  html: string,
  max: number,
): { text: string; truncated: boolean } {
  const cleaned = stripPaired(html.replace(/<!--[\s\S]*?-->/g, ' '), DROPPED)
    // An unfinished script or style (the page was cut off) would otherwise leave its code behind.
    .replace(/<(?:script|style)\b[\s\S]*$/i, ' ')
  const body = /<body\b[^>]*>([\s\S]*)/i.exec(cleaned)?.[1] ?? cleaned
  const candidates = [longest(body, 'article'), longest(body, 'main')]
  const main = candidates.find(
    (c) => c && toText(stripPaired(c, FURNITURE)).length >= MIN_MAIN_CHARS,
  )
  const text = toText(stripPaired(main ?? body, FURNITURE))
  if (text.length <= max) return { text, truncated: false }
  const cut = text.slice(0, max)
  const atWord = cut.replace(/\s+\S*$/, '')
  return { text: `${atWord || cut}…`, truncated: true }
}
