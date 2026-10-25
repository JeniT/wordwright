import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALLOWED, disallowed } from './check-licences.mjs'

test('allowed licences pass, whatever the package', () => {
  assert.deepEqual(disallowed({ MIT: [{ name: 'a' }], ISC: [{ name: 'b' }] }), [])
})

test('an unlisted licence is reported with its packages, sorted', () => {
  const found = disallowed({
    MIT: [{ name: 'a' }],
    'GPL-3.0': [{ name: 'z' }, { name: 'y' }],
    'AGPL-3.0': [{ name: 'x' }],
  })
  assert.deepEqual(found, [
    { licence: 'AGPL-3.0', packages: ['x'] },
    { licence: 'GPL-3.0', packages: ['y', 'z'] },
  ])
})

test('a dual licence expression is not allowed until someone has read it', () => {
  assert.equal(disallowed({ '(MIT OR GPL-3.0)': [{ name: 'a' }] }).length, 1)
})

test('docs/dependencies.md lists every allowed licence, and only those', () => {
  const doc = readFileSync(new URL('../docs/dependencies.md', import.meta.url), 'utf8')
  const table = doc.slice(doc.indexOf('## Licences'), doc.indexOf('## Update automation'))
  const listed = [...table.matchAll(/^\| ([A-Za-z0-9.-]+)\s+\| \d*\s*[^|]*\|/gm)]
    .map((m) => m[1])
    .filter((name) => name !== 'Licence' && !name.startsWith('--'))
  assert.deepEqual([...listed].sort(), [...ALLOWED].sort())
})
