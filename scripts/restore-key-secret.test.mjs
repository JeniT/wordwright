import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// deploy/restore-key-secret.sh puts the KEY_ENCRYPTION_SECRET saved in the password manager onto a rebuilt server, so the
// AI keys in a restored backup can be read (#423). Typing it into nano on the server is where the rehearsal went wrong,
// so it is pasted at a hidden prompt on your own computer. These run the real script: the fake ssh runs the remote
// commands in a folder standing in for the server's home, with a fake docker.

const script = new URL('../deploy/restore-key-secret.sh', import.meta.url).pathname
const saved = 'q7Vx3Lr0Zp9N2fWmC8yTbK4sHd6Ej1Ua5Gi+oRt/Xw0='

function world() {
  const dir = mkdtempSync(join(tmpdir(), 'restore-key-secret-'))
  const bin = join(dir, 'bin')
  const server = join(dir, 'server')
  const log = join(dir, 'calls.log')
  for (const d of [bin, join(server, 'wordwright')]) mkdirSync(d, { recursive: true })
  const env = join(server, 'wordwright', '.env')
  writeFileSync(
    env,
    'NODE_ENV=production\nSESSION_SECRET=keep-me\nKEY_ENCRYPTION_SECRET=made-by-the-wizard\nWORDWRIGHT_TAG=abc\n',
  )
  const answers = join(dir, 'answers.env')
  writeFileSync(answers, `SERVER_IP='203.0.113.7'\nSSH_KEY='${join(dir, 'key')}'\n`)
  const fake = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  fake(
    'ssh',
    `cmd="\${@: -1}"; echo "ssh \${*:1:$#-1}" >> '${log}'
HOME='${server}' exec bash -c "$cmd"`,
  )
  fake('docker', `echo "docker $*" >> '${log}'`)
  const run = (input, args = []) =>
    spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      input,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ENV_FILE: answers },
    })
  return { run, env: () => readFileSync(env, 'utf8'), calls: () => readFileSync(log, 'utf8') }
}

test('the pasted secret replaces the one on the server, and the app restarts with it', () => {
  const { run, env, calls } = world()
  const result = run(`  ${saved}  \n`)
  assert.equal(result.status, 0, result.stderr)
  assert.match(env(), new RegExp(`^KEY_ENCRYPTION_SECRET=${saved.replace(/[+/]/g, '\\$&')}$`, 'm'))
  assert.doesNotMatch(env(), /made-by-the-wizard/)
  assert.match(env(), /^SESSION_SECRET=keep-me$/m, 'the rest of .env is kept')
  assert.match(calls(), /^ssh .* wordwright@203\.0\.113\.7$/m)
  assert.match(calls(), /docker compose up -d --force-recreate api/)
  assert.doesNotMatch(
    result.stdout + result.stderr,
    new RegExp(saved.slice(0, 12)),
    'the secret is never shown',
  )
})

test('something too short to be the secret is asked for again, and nothing is sent until then', () => {
  const { run, env } = world()
  const result = run('typo\n')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /4 characters/)
  assert.match(env(), /^KEY_ENCRYPTION_SECRET=made-by-the-wizard$/m)
})

test('an ssh destination on the command line is used as it is, so your ssh config supplies the rest', () => {
  const { run, env, calls } = world()
  const result = run(`${saved}\n`, ['wordwright'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(calls(), /^ssh wordwright$/m)
  assert.match(env(), /^KEY_ENCRYPTION_SECRET=q7Vx/m)
})
