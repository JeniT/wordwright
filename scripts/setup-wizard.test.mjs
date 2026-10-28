import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// deploy/setup-wizard.sh promises it can be stopped and run again (#422). Its first run on a new server switches root
// login off, so a second run must not need root for what is already done, and a server with no SMTP settings must not
// be offered "Enter keeps what the server has". These run the real wizard against a fake server: ssh, scp and the
// other commands it calls are fakes on the PATH, and the server's state is a few marker files.

const script = new URL('../deploy/setup-wizard.sh', import.meta.url).pathname

/** A fake server in `state`: `base` (the app account and Docker exist), `hardened` (no root login), `ghcr` (logged in
 *  to the registry), and `env` (its .env). */
function world({ base = false, hardened = false, ghcr = false, env = '' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'setup-wizard-'))
  const bin = join(dir, 'bin')
  const state = join(dir, 'state')
  const log = join(dir, 'calls.log')
  for (const d of [bin, state]) mkdirSync(d)
  if (base) writeFileSync(join(state, 'base'), '')
  if (hardened) writeFileSync(join(state, 'hardened'), '')
  if (ghcr) writeFileSync(join(state, 'ghcr'), '')
  writeFileSync(join(state, 'remote-env'), env)
  writeFileSync(join(dir, 'key'), 'not a real key\n')
  const envFile = join(dir, 'answers.env')
  writeFileSync(
    envFile,
    [
      "SERVER_IP='203.0.113.7'",
      `SSH_KEY='${join(dir, 'key')}'`,
      "IMAGE_TAG='abc123'",
      "GITHUB_USER='jenit'",
      "SCW_SMTP_HOST='smtp.tem.scaleway.com'",
      "SCW_SMTP_PORT='465'",
      "SCW_SMTP_USER='project-id'",
      '',
    ].join('\n'),
  )
  const fake = (name, body) => {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\nlog='${log}'; state='${state}'\n${body}\n`)
    chmodSync(join(bin, name), 0o755)
  }
  fake(
    'ssh',
    `target=""
while [ $# -gt 0 ]; do a=$1; shift; case "$a" in *@*) target=$a; break ;; esac; done
cmd="$*"
echo "ssh $target $cmd" >> "$log"
case "$target" in
  root@*)
    if [ -e "$state/hardened" ]; then echo "$target: Permission denied (publickey)." >&2; exit 255; fi
    case "$cmd" in *"server-setup.sh base"*) touch "$state/base" ;; esac
    exit 0 ;;
  "") exit 0 ;;
esac
[ -e "$state/base" ] || { echo "$target: Permission denied (publickey)." >&2; exit 255; }
case "$cmd" in
  *"bash -s harden"*) cat > /dev/null; touch "$state/hardened" ;;
  *"grep -qx 'permitrootlogin no'"*) [ -e "$state/hardened" ] ;;
  *"sshd -T"*)
    if [ -e "$state/hardened" ]; then printf 'permitrootlogin no\\npasswordauthentication no\\n'
    else printf 'permitrootlogin yes\\npasswordauthentication yes\\n'; fi ;;
  *"docker login"*) cat > /dev/null; touch "$state/ghcr" ;;
  *"grep -q ghcr.io"*) [ -e "$state/ghcr" ] ;;
  *"umask 077"*) cat >> "$state/remote-env" ;;
  *"grep -q '^"*) key=$(printf '%s' "$cmd" | sed -n "s/.*'^\\([A-Z_]*\\)=\\..*/\\1/p"); grep -q "^$key=." "$state/remote-env" ;;
  *) exit 0 ;;
esac`,
  )
  fake(
    'scp',
    `echo "scp $*" >> "$log"
case "$*" in *root@*) [ -e "$state/hardened" ] && { echo "root: Permission denied (publickey)." >&2; exit 255; } ;; esac
exit 0`,
  )
  fake('git', 'case "$*" in *rev-parse*) echo abc123 ;; esac; exit 0')
  fake('dig', 'echo 203.0.113.7')
  for (const name of [
    'ssh-keyscan',
    'ssh-keygen',
    'rsync',
    'curl',
    'gh',
    'openssl',
    'xdg-open',
    'open',
  ])
    fake(name, 'exit 0')
  /** Runs the wizard once, typing `answers` (one per line); it stops where they run out. */
  const run = (answers) =>
    spawnSync('bash', [script], {
      encoding: 'utf8',
      input: answers.map((a) => `${a}\n`).join(''),
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: dir, ENV_FILE: envFile },
    })
  const calls = () => (existsSync(log) ? readFileSync(log, 'utf8') : '')
  const remoteEnv = () => readFileSync(join(state, 'remote-env'), 'utf8')
  return { run, calls, remoteEnv }
}

test('on a new server it runs the base setup as root, then switches root login off', () => {
  const { run, calls } = world()
  // Banner, server address, key; base setup yes, pause; harden yes, pause; files pause; keep the images.
  run(['', '', '', 'y', '', 'y', '', '', 'n'])
  assert.match(
    calls(),
    /ssh root@203\.0\.113\.7 APP_USER=wordwright bash \/root\/server-setup\.sh base/,
  )
  assert.match(calls(), /bash -s harden/)
})

test('run again after root login was switched off, it skips what is done and asks for a missing SMTP password', () => {
  const { run, calls, remoteEnv } = world({
    base: true,
    hardened: true,
    ghcr: true,
    env: 'SESSION_SECRET=s\nKEY_ENCRYPTION_SECRET=k\n',
  })
  const result = run([
    '', // banner
    '', // server address
    '', // key
    '', // files copied: pause
    'n', // keep the images
    'n', // keep the registry login
    '', // pause
    '', // secrets kept: pause
    '', // SMTP host
    '', // SMTP port
    '', // SMTP username
    '', // SMTP password: Enter, which cannot keep anything here
    'a-secret', // asked again
  ])
  assert.doesNotMatch(calls(), /root@/, 'nothing tries to log in as root')
  assert.doesNotMatch(calls(), /bash -s harden/, 'the lock-down is not repeated')
  assert.doesNotMatch(result.stdout, /Enter keeps what the server has/)
  assert.match(result.stdout, /already done/)
  assert.match(
    remoteEnv(),
    /^SMTP_URL=smtps:\/\/project-id:a-secret@smtp\.tem\.scaleway\.com:465$/m,
  )
})
