import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disallowed } from './check-licences.mjs'

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
