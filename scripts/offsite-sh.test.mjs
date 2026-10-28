import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// deploy/offsite.sh fetch is how a lost server's backups and list of deletions come back (docs/deploy.md). rclone's
// copy succeeds when the bucket has nothing by that name, so the script must check, not just say it fetched (#423).
// These run the real script with a fake docker on the PATH that stands in for rclone and the bucket.

const script = new URL('../deploy/offsite.sh', import.meta.url).pathname

/** A folder with offsite.sh, offsite.env, and a bucket holding the names in `bucket`. */
function world(bucket) {
  const dir = mkdtempSync(join(tmpdir(), 'offsite-sh-'))
  const bin = join(dir, 'bin')
  const app = join(dir, 'wordwright')
  const restored = join(dir, 'restored')
  for (const d of [bin, app]) mkdirSync(d)
  copyFileSync(script, join(app, 'offsite.sh'))
  writeFileSync(join(app, 'offsite.env'), 'RCLONE_CONFIG_OFFSITE_TYPE=crypt\n')
  // `docker run … -v <dest>:/restore <image> copy OFFSITE:<name> /restore` copies <name> into <dest> if the bucket has it.
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
dest=""; name=""
while [ $# -gt 0 ]; do
  case "$1" in
    -v) case "$2" in *:/restore) dest=\${2%:/restore} ;; esac; shift ;;
    OFFSITE:*) name=\${1#OFFSITE:} ;;
  esac
  shift
done
case " ${bucket.join(' ')} " in *" $name "*) touch "$dest/$name" ;; esac
exit 0
`,
  )
  chmodSync(join(bin, 'docker'), 0o755)
  const fetch = (name) =>
    spawnSync('bash', [join(app, 'offsite.sh'), 'fetch', name, restored], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
  return { fetch, restored }
}

test('fetching a file the bucket holds brings it back', () => {
  const { fetch } = world(['deletions.jsonl'])
  const result = fetch('deletions.jsonl')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Fetched to .*restored\/deletions\.jsonl/)
})

test('fetching a name the bucket does not hold fails and says how to see what is there', () => {
  const { fetch, restored } = world([])
  // Left from an earlier fetch: it must not pass for this one.
  mkdirSync(restored)
  writeFileSync(join(restored, 'deletions.jsonl'), '')
  const result = fetch('deletions.jsonl')
  assert.notEqual(result.status, 0)
  assert.doesNotMatch(result.stdout, /Fetched/)
  assert.match(
    result.stderr,
    /The bucket has nothing called deletions\.jsonl.*\.\/offsite\.sh list/,
  )
})
