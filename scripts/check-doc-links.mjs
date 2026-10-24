// Checks that every relative link and #anchor in the tracked Markdown files points at something that exists.
// Docs are moved and split often, and a broken pointer silently hides material from an agent.
// Exit 0: all links resolve. Exit 1: the broken ones are printed as file:line.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

// Archives that point at files which no longer exist, by design.
const SKIPPED = [/^docs\/design-concepts\//]

// GitHub's heading slug: lower-case, drop punctuation, spaces to hyphens; repeats get -1, -2 ...
export function slugsOf(markdown) {
  const seen = new Map()
  const slugs = new Set()
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const heading = !fenced && /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (!heading) continue
    const base = heading[1]
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[`*_~]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .trim()
      .replace(/\s/g, '-')
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    slugs.add(n === 0 ? base : `${base}-${n}`)
  }
  return slugs
}

export function linksOf(markdown) {
  const links = []
  let fenced = false
  markdown.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    if (fenced) return
    const prose = line.replace(/`[^`]*`/g, '')
    for (const m of prose.matchAll(/\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      links.push({ target: m[1], line: i + 1 })
    }
  })
  return links
}

export function findBroken(files, read = (f) => readFileSync(f, 'utf8'), exists = existsSync) {
  const slugCache = new Map()
  const slugsFor = (file) => {
    if (!slugCache.has(file)) slugCache.set(file, slugsOf(read(file)))
    return slugCache.get(file)
  }
  const broken = []
  for (const file of files) {
    for (const { target, line } of linksOf(read(file))) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
      const [path, rawAnchor] = target.split('#')
      const dest = path === '' ? file : normalize(join(dirname(file), decodeURI(path)))
      if (!exists(dest)) {
        broken.push(`${file}:${line}: ${target} (no such file)`)
      } else if (rawAnchor && dest.endsWith('.md')) {
        if (!slugsFor(dest).has(decodeURI(rawAnchor).toLowerCase())) {
          broken.push(`${file}:${line}: ${target} (no such heading)`)
        }
      }
    }
  }
  return broken
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f && existsSync(f) && !SKIPPED.some((re) => re.test(f)))
  const broken = findBroken(files)
  if (broken.length > 0) {
    console.error(`${broken.length} broken Markdown link(s):\n${broken.join('\n')}`)
    process.exitCode = 1
  }
}
