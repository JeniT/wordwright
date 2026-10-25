// Checks that CI (.nvmrc), the production images (the Dockerfile's `FROM node:` lines) and docs/dependencies.md
// name the same Node version. Dependabot raises the Dockerfile change on its own, so without this CI could test
// on one Node and production run another.
// Exit 0: all agree. Exit 1: what each file says is printed.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Every version the files name, keyed by where: the `.nvmrc` line, each `FROM node:<version>` and the doc's table. */
export function nodePins({ nvmrc, dockerfile, doc }) {
  const pins = { '.nvmrc': [nvmrc.trim()] }
  pins.Dockerfile = [...dockerfile.matchAll(/^FROM node:(\S+?)(?:-\S+)?(?:\s|$)/gm)].map(
    (m) => m[1],
  )
  pins['docs/dependencies.md'] = [...doc.matchAll(/^\| Node\s+\| ([\d.]+)/gm)].map((m) => m[1])
  return pins
}

/** The disagreements as readable lines; empty when every pin is the same single version, in every file. */
export function disagreements(pins) {
  const versions = new Set(Object.values(pins).flat())
  const empty = Object.entries(pins).filter(([, v]) => v.length === 0)
  if (versions.size === 1 && empty.length === 0) return []
  return Object.entries(pins).map(
    ([file, v]) => `${file}: ${v.join(', ') || 'no Node version found'}`,
  )
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
  const lines = disagreements(
    nodePins({
      nvmrc: read('.nvmrc'),
      dockerfile: read('Dockerfile'),
      doc: read('docs/dependencies.md'),
    }),
  )
  if (lines.length > 0) {
    console.error(lines.join('\n'))
    console.error(
      'Change .nvmrc, both FROM node: lines and the Node row of docs/dependencies.md together.',
    )
    process.exit(1)
  }
}
