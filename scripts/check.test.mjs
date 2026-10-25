import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSteps, firstFailure, nodeMismatch } from './check.mjs'

test('runs the steps in order and names the first that fails, without running the rest', () => {
  const ran = []
  const failed = firstFailure(['lint', 'typecheck', 'test'], (step) => {
    ran.push(step)
    return step === 'typecheck' ? 1 : 0
  })
  assert.equal(failed, 'typecheck')
  assert.deepEqual(ran, ['lint', 'typecheck'])
})

test('names nothing when every step passes', () => {
  assert.equal(
    firstFailure(['lint', 'test'], () => 0),
    undefined,
  )
})

test('formats the files on this machine, but only checks them in CI', () => {
  assert.equal(checkSteps({})[0], 'format')
  assert.equal(checkSteps({ CI: 'true' })[0], 'format:check')
  assert.deepEqual(checkSteps({}).slice(1), checkSteps({ CI: 'true' }).slice(1))
})

// CI and production run the Node in .nvmrc; a different major here can pass checks that fail there.
test('warns when this Node is a different major version from .nvmrc, and only then', () => {
  assert.match(nodeMismatch('v26.11.0', '24.22.1\n'), /Node 26 here.*24\.22\.1/)
  assert.equal(nodeMismatch('v24.3.0', '24.22.1\n'), undefined)
})
