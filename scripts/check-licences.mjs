// Checks that every package shipped to production (`pnpm licenses list --prod`) carries a licence we have
// agreed to. A new licence fails until someone reads it and adds it to ALLOWED here and in docs/dependencies.md.
// Exit 0: all licences allowed. Exit 1: the others are printed with the packages that carry them.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Permissive licences (and MPL-2.0, which only asks that changes to its own files be shared).
export const ALLOWED = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Unlicense',
  'PSF-2.0',
  'MPL-2.0',
])

// `licenses` is pnpm's JSON: { "<licence>": [{ name, versions }] }. Returns the disallowed ones, sorted.
export function disallowed(licenses) {
  return Object.entries(licenses)
    .filter(([licence]) => !ALLOWED.has(licence))
    .map(([licence, packages]) => ({ licence, packages: packages.map((p) => p.name).sort() }))
    .sort((a, b) => a.licence.localeCompare(b.licence))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json', '-r'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const bad = disallowed(JSON.parse(json))
  for (const { licence, packages } of bad) console.error(`${licence}: ${packages.join(', ')}`)
  if (bad.length > 0) {
    console.error(
      'Read the licence, then add it to ALLOWED in scripts/check-licences.mjs and docs/dependencies.md.',
    )
    process.exit(1)
  }
}
