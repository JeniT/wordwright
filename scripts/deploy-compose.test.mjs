import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The api image trusts X-Forwarded-For (TRUST_PROXY, #390), which is safe only while Caddy is the one way in. These
// tests notice if deploy/compose.yaml opens another.
const compose = readFileSync(new URL('../deploy/compose.yaml', import.meta.url), 'utf8')

/** The lines of one service under `services:`, up to the next service or top-level key. */
function service(name) {
  const lines = compose.split('\n')
  const start = lines.indexOf(`  ${name}:`)
  assert.ok(start >= 0, `deploy/compose.yaml has a ${name} service`)
  const end = lines.findIndex((l, i) => i > start && /^( {2})?\S/.test(l))
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n')
}

test('the api publishes no port and shares no network with the host, so only Caddy reaches it', () => {
  const api = service('api')
  assert.doesNotMatch(
    api,
    /^\s+ports:/m,
    'Publishing an api port lets anyone forge X-Forwarded-For',
  )
  assert.doesNotMatch(api, /network_mode:\s*['"]?host/, 'Host networking exposes the api port')
})

test('Caddy is the service that takes the web traffic', () => {
  assert.match(service('web'), /^\s+ports:/m)
})
