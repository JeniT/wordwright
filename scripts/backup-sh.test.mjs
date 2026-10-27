import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// deploy/backup.sh is what the nightly timer runs, and its heartbeat is how the owner hears that something is wrong
// (docs/runbook.md): a monitor alerts when a night passes without one. So it must ping only when the backup worked, and
// fail (no ping) when the disk is nearly full. These run the real script with fake docker, df and curl on the PATH.

const script = new URL('../deploy/backup.sh', import.meta.url).pathname

/** A folder holding a copy of backup.sh and fakes for the commands it runs; `used` is the disk's percent used. */
function world({ used = 40, dockerFails = false, heartbeat = 'https://hc.example/abc' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'backup-sh-'))
  const bin = join(dir, 'bin')
  const app = join(dir, 'wordwright')
  const out = join(dir, 'backups')
  const log = join(dir, 'calls.log')
  for (const d of [bin, app]) spawnSync('mkdir', ['-p', d])
  copyFileSync(script, join(app, 'backup.sh'))
  if (heartbeat) writeFileSync(join(app, 'monitor.env'), `HEARTBEAT_URL=${heartbeat}\n`)
  const fake = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\necho "${name} $*" >> "${log}"\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  fake(
    'docker',
    `case "$2" in
  exec) ${dockerFails ? 'exit 1' : 'echo /data/backups/wordwright-20261027-023000.sqlite'} ;;
  cp) case "$3" in api:/data/deletions.jsonl) exit 1 ;; *) touch "$4/$(basename "$3")" ;; esac ;;
esac`,
  )
  fake(
    'df',
    `echo 'Filesystem 1024-blocks Used Available Capacity Mounted on'
echo '/dev/vda1 25000000 1 1 ${used}% /'`,
  )
  fake('curl', '')
  const run = () =>
    spawnSync('bash', [join(app, 'backup.sh')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_DIR: out },
    })
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '')
  return { run, calls, out }
}

test('a backup that works sends the heartbeat, after the copy is made', () => {
  const { run, calls, out } = world()
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.ok(existsSync(join(out, 'wordwright-20261027-023000.sqlite')))
  assert.match(calls(), /^curl .*https:\/\/hc\.example\/abc/m)
  assert.ok(calls().indexOf('docker compose cp') < calls().indexOf('curl'))
})

test('a backup that fails sends no heartbeat, so the monitor alerts', () => {
  const { run, calls } = world({ dockerFails: true })
  assert.notEqual(run().status, 0)
  assert.doesNotMatch(calls(), /^curl/m)
})

test('a nearly full disk fails before backing up, says so, and sends no heartbeat', () => {
  const { run, calls } = world({ used: 91 })
  const result = run()
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /disk is 91% full/)
  assert.doesNotMatch(calls(), /docker compose exec/)
  assert.doesNotMatch(calls(), /^curl/m)
})

test('without monitor.env it backs up as before and pings nothing', () => {
  const { run, calls } = world({ heartbeat: '' })
  assert.equal(run().status, 0)
  assert.doesNotMatch(calls(), /^curl/m)
})
