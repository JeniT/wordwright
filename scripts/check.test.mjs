import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSteps, firstFailure } from './check.mjs'

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
