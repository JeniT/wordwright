import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// The Content-Security-Policy that Caddy sends with every page (#317). It lives in deploy/Caddyfile, far from the
// page it describes, so these tests notice when the two drift apart.
const caddyfile = readFileSync(new URL('../deploy/Caddyfile', import.meta.url), 'utf8')
const page = readFileSync(new URL('../apps/web/index.html', import.meta.url), 'utf8')

const policy = () => {
  const line = caddyfile.match(/Content-Security-Policy "([^"]+)"/)
  assert.ok(line, 'deploy/Caddyfile sets a Content-Security-Policy')
  return Object.fromEntries(
    line[1].split(';').map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/)
      return [name, sources]
    }),
  )
}

test('allows the one inline script in index.html by its hash, and no other', () => {
  const inline = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.equal(inline.length, 1, 'index.html has one inline script (the theme, before first paint)')
  const hash = `'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'`
  assert.deepEqual(
    policy()['script-src'],
    ["'self'", hash],
    'After changing the inline script in apps/web/index.html, put its new hash in deploy/Caddyfile',
  )
})

test('loads nothing from other sites, and cannot be framed or have its base changed', () => {
  const p = policy()
  for (const [directive, sources] of Object.entries(p)) {
    for (const source of sources) {
      assert.ok(!/^(https?:|\*|'unsafe-eval')/.test(source), `${directive} allows ${source}`)
    }
  }
  assert.deepEqual(p['default-src'], ["'self'"])
  assert.deepEqual(p['object-src'], ["'none'"])
  assert.deepEqual(p['base-uri'], ["'none'"])
  assert.deepEqual(p['frame-ancestors'], ["'none'"])
})

test('leaves an API response its own, stricter policy (a stored picture is sandboxed)', () => {
  // `?` sets the header only when the response has none, so the API's own policy wins.
  assert.match(caddyfile, /\?Content-Security-Policy "/)
})
