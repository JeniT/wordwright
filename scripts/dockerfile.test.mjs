import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// CI does not build the images, so a Dockerfile that cannot build is found only when deploying (#416). These catch the
// one way it has broken so far.
const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')

test('the images get pnpm without corepack, which Node 25 and later no longer bundle', () => {
  assert.doesNotMatch(dockerfile, /^RUN .*corepack/m)
})

test('the pnpm version comes from packageManager in package.json, not a second copy', () => {
  assert.match(dockerfile, /npm install -g .*require\("\.\/package\.json"\)\.packageManager/)
  assert.doesNotMatch(dockerfile, /pnpm@\d/)
})
