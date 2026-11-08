import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// deploy/ship.sh builds the images and deploys them in one go, from your own computer. These run the real script:
// the fake ssh runs the remote commands in a folder standing in for the server's home, with a fake docker; the fake
// gh stands in for GitHub and the fake git for the fetch (the commit itself is this repository's own HEAD).

const script = new URL('../deploy/ship.sh', import.meta.url).pathname
const repo = new URL('..', import.meta.url).pathname
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim()
const other = 'a'.repeat(40)

function world({ ci = 'completed success', built = '', started = '2' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ship-sh-'))
  const bin = join(dir, 'bin')
  const server = join(dir, 'server')
  const log = join(dir, 'calls.log')
  for (const d of [bin, join(server, 'wordwright')]) mkdirSync(d, { recursive: true })
  const env = join(server, 'wordwright', '.env')
  writeFileSync(env, 'NODE_ENV=production\nSESSION_SECRET=keep-me\nWORDWRIGHT_TAG=oldbuild\n')
  writeFileSync(
    join(server, 'wordwright', 'deploy.sh'),
    '#!/usr/bin/env bash\necho "stub deploy"\n',
    { mode: 0o755 },
  ) // what the wizard put there
  const answers = join(dir, 'answers.env')
  writeFileSync(answers, `SERVER_IP='203.0.113.7'\nSSH_KEY='${join(dir, 'key')}'\n`)
  const fake = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  fake(
    'ssh',
    `case " $* " in *" -O exit "*) exit 0;; esac
cmd="\${@: -1}"; echo "ssh \${*:1:$#-1}" >> '${log}'
cd '${server}' && HOME='${server}' exec bash -c "$cmd"`, // a real login starts in the home folder
  )
  fake(
    'docker',
    `echo "docker $*" >> '${log}'
case "$1" in inspect) echo healthy;; esac`,
  )
  fake('curl', `echo "curl $*" >> '${log}'`)
  // Only the fetch is faked; the rest of git (rev-parse, archive, cat-file) is the real thing, on this repository.
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim()
  fake(
    'git',
    `if [ "$1" = fetch ]; then echo "git $*" >> '${log}'; exit 0; fi
if [ "$1" = rev-parse ] && [ "$2" = "origin/main" ]; then echo ${head}; exit 0; fi
exec '${realGit}' "$@"`,
  )
  // run ids: the newest run before the dispatch is 1, afterwards it is \`started\`.
  fake(
    'gh',
    `echo "gh $*" >> '${log}'
case "$*" in
  "auth status") exit 0;;
  *"workflow run"*) touch '${join(dir, 'dispatched')}';;
  *"run list --workflow ci.yml"*) [ -n '${ci}' ] && echo '${ci}';;
  *"run list --workflow image.yml --commit"*) echo '${built}';;
  *"run list --workflow image.yml"*) if [ -f '${join(dir, 'dispatched')}' ]; then echo ${started}; else echo 1; fi;;
  *"run view"*) echo ${head};;
  *"run watch"*) exit 0;;
esac`,
  )
  const run = (args = [], input = 'deploy\n') =>
    spawnSync('bash', [script, ...args], {
      encoding: 'utf8',
      input,
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ENV_FILE: answers },
    })
  return {
    run,
    env: () => readFileSync(env, 'utf8'),
    calls: () => readFileSync(log, 'utf8'),
    onServer: (f) => readFileSync(join(server, 'wordwright', f), 'utf8'),
  }
}

test('builds the newest main, then points the server at it and deploys', () => {
  const { run, env, calls } = world()
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(calls(), /gh workflow run image\.yml --ref main/)
  assert.match(calls(), /gh run watch 2 --exit-status/)
  assert.match(result.stdout, /Live now:\s+oldbuild/)
  assert.match(env(), new RegExp(`^WORDWRIGHT_TAG=${head}$`, 'm'))
  assert.doesNotMatch(env(), /oldbuild/)
  assert.match(env(), /^SESSION_SECRET=keep-me$/m, 'the rest of .env is kept')
  assert.match(calls(), /docker compose pull/)
  assert.match(calls(), /docker compose up -d --remove-orphans/)
  assert.match(calls(), /^ssh .* wordwright@203\.0\.113\.7$/m)
  assert.match(calls(), /curl .*app\.wordwright\.io\/health/)
})

test('copies the deploy files from that commit onto the server', () => {
  const { run, onServer } = world()
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(onServer('deploy.sh'), /Updates the running app/)
  assert.match(onServer('compose.yaml'), /services:/)
})

test('images already built for the commit are not built again', () => {
  const { run, calls } = world({ built: '77' })
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /already built/)
  assert.doesNotMatch(calls(), /workflow run/)
})

test('--tag skips the build and the lookup and deploys exactly that build', () => {
  const { run, env, calls } = world()
  const result = run(['--tag', head])
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(calls(), /^gh /m)
  assert.match(env(), new RegExp(`^WORDWRIGHT_TAG=${head}$`, 'm'))
})

test('--tag wants the whole commit hash', () => {
  const { run, env } = world()
  const result = run(['--tag', 'abc123'])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /40-character/)
  assert.match(env(), /^WORDWRIGHT_TAG=oldbuild$/m)
})

test('anything but "deploy" at the prompt changes nothing on the server', () => {
  const { run, env, calls } = world()
  const result = run(['--tag', head], 'yes\n')
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /Cancelled/)
  assert.match(env(), /^WORDWRIGHT_TAG=oldbuild$/m)
  assert.doesNotMatch(calls(), /docker/)
})

test('-y deploys without asking', () => {
  const { run, env } = world()
  const result = run(['--tag', head, '-y'], '')
  assert.equal(result.status, 0, result.stderr)
  assert.match(env(), new RegExp(`^WORDWRIGHT_TAG=${head}$`, 'm'))
})

test('a commit whose CI did not pass needs a "deploy" for that too, and cancelling builds nothing', () => {
  const { run, calls, env } = world({ ci: 'completed failure' })
  const result = run([], '\n')
  assert.notEqual(result.status, 0)
  assert.match(result.stdout, /CI: not passed on this commit \(completed failure\)/)
  assert.doesNotMatch(calls(), /workflow run/)
  assert.match(env(), /^WORDWRIGHT_TAG=oldbuild$/m)
})

test('a commit that is not in this repository is deployed, but the deploy files on the server are left alone', () => {
  const { run, env, onServer } = world()
  const result = run(['--tag', other])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /isn't in this repository/)
  assert.match(env(), new RegExp(`^WORDWRIGHT_TAG=${other}$`, 'm'))
  assert.throws(() => onServer('compose.yaml'), 'nothing was copied')
})

test('an ssh destination on the command line is used as it is, so your ssh config supplies the rest', () => {
  const { run, calls } = world()
  const result = run(['--tag', head, 'wordwright'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(calls(), /^ssh .* wordwright$/m)
})
