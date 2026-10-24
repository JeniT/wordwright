import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findBroken, linksOf, slugsOf } from './check-doc-links.mjs'

test('slugs follow GitHub: punctuation dropped, repeats numbered, code and links unwrapped', () => {
  const md = '# Design system: Ember\n## `Foo` (#12)\n## Foo\n## Foo\n## [Link](x.md) text'
  assert.deepEqual([...slugsOf(md)], ['design-system-ember', 'foo-12', 'foo', 'foo-1', 'link-text'])
})

test('headings and links inside code fences are ignored', () => {
  const md = '```\n# not a heading\n[x](nope.md)\n```\n[real](a.md)'
  assert.equal(slugsOf(md).size, 0)
  assert.deepEqual(linksOf(md), [{ target: 'a.md', line: 5 }])
})

const docs = {
  'README.md': '# Top\n[ok](docs/a.md#there) [web](https://x.test/y) [self](#top)',
  'docs/a.md': '# A\n## There\n[up](../README.md#top)',
}
const read = (f) => docs[f]
const exists = (f) => f in docs || f === 'docs'

test('links that resolve are fine', () => {
  assert.deepEqual(findBroken(Object.keys(docs), read, exists), [])
})

test('a missing file and a missing heading are both reported with file:line', () => {
  const bad = {
    ...docs,
    'b.md': '[gone](docs/gone.md)\n[nohead](docs/a.md#nowhere)',
  }
  assert.deepEqual(
    findBroken(
      ['b.md'],
      (f) => bad[f],
      (f) => f in bad,
    ),
    ['b.md:1: docs/gone.md (no such file)', 'b.md:2: docs/a.md#nowhere (no such heading)'],
  )
})
