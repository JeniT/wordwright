import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disagreements, nodePins } from './check-node-pins.mjs'

const dockerfile = (a, b) =>
  `FROM node:${a}-slim AS base\nRUN x\nFROM node:${b}-slim AS api\nFROM caddy:2-alpine AS web\n`
const doc = (v) => `| What | Version |\n| Node    | ${v}    (the 24 line) | .nvmrc |\n`

test('reads the version from each file, ignoring other base images', () => {
  assert.deepEqual(
    nodePins({
      nvmrc: '24.22.1\n',
      dockerfile: dockerfile('24.22.1', '24.22.2'),
      doc: doc('24.22.1'),
    }),
    {
      '.nvmrc': ['24.22.1'],
      Dockerfile: ['24.22.1', '24.22.2'],
      'docs/dependencies.md': ['24.22.1'],
    },
  )
})

test('agreeing pins give no disagreements', () => {
  const pins = nodePins({
    nvmrc: '24.22.1',
    dockerfile: dockerfile('24.22.1', '24.22.1'),
    doc: doc('24.22.1'),
  })
  assert.deepEqual(disagreements(pins), [])
})

test('a Dockerfile bumped alone is reported with what each file says', () => {
  const pins = nodePins({
    nvmrc: '24.22.1',
    dockerfile: dockerfile('24.23.0', '24.23.0'),
    doc: doc('24.22.1'),
  })
  assert.deepEqual(disagreements(pins), [
    '.nvmrc: 24.22.1',
    'Dockerfile: 24.23.0, 24.23.0',
    'docs/dependencies.md: 24.22.1',
  ])
})

test('one FROM line left behind is a disagreement', () => {
  const pins = nodePins({
    nvmrc: '24.22.1',
    dockerfile: dockerfile('24.22.1', '24.23.0'),
    doc: doc('24.22.1'),
  })
  assert.notEqual(disagreements(pins).length, 0)
})

test('a file that names no Node version is a disagreement', () => {
  const pins = nodePins({ nvmrc: '24.22.1', dockerfile: 'FROM caddy:2\n', doc: doc('24.22.1') })
  assert.ok(disagreements(pins).includes('Dockerfile: no Node version found'))
})
