import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { devPrivateEnv, freePort } from './dev-private.mjs'

test('the API trusts the web port it is paired with, and the web proxies to the API port', () => {
  const env = devPrivateEnv(5300, 8800)
  assert.equal(env.api.PUBLIC_URL, 'http://localhost:5300')
  assert.equal(env.api.PORT, '8800')
  assert.equal(env.web.API_URL, 'http://localhost:8800')
})

test('sign-up is open and the LLM is fake, so nothing waits on approval or costs money', () => {
  const { api } = devPrivateEnv(1, 2)
  assert.equal(api.ACCOUNT_APPROVAL, 'open')
  assert.equal(api.FAKE_LLM, 'true')
})

test('freePort answers a port that can be listened on', async () => {
  const port = await freePort()
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(port, () => server.close(resolve))
  })
})
