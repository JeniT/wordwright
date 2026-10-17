import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findOverlap } from './rebase-overlap.mjs'

test('no overlap when the two sides touch different files', () => {
  assert.deepEqual(findOverlap(['apps/web/a.ts'], ['apps/api/b.ts']), [])
})

test('a file changed on both sides is an overlap', () => {
  assert.deepEqual(findOverlap(['apps/web/a.ts', 'x.md'], ['x.md', 'y.md']), ['x.md'])
})

test('incoming changes to a shared spot are an overlap even if the branch never touched it', () => {
  assert.deepEqual(findOverlap(['apps/web/a.ts'], ['packages/core/src/domain.ts']), [
    'packages/core/src/domain.ts',
  ])
  assert.deepEqual(findOverlap(['a.ts'], ['pnpm-lock.yaml', 'apps/api/src/db/database.ts']), [
    'apps/api/src/db/database.ts',
    'pnpm-lock.yaml',
  ])
})

test('the same file is not listed twice', () => {
  assert.deepEqual(findOverlap(['package.json'], ['package.json']), ['package.json'])
})

// The CLI, against a throwaway repo with an `origin/main` ref.
function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}
function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'overlap-'))
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 't@example.com')
  git(dir, 'config', 'user.name', 't')
  git(dir, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(dir, 'base.txt'), 'base\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'base')
  git(dir, 'checkout', '-q', '-b', 'work')
  return dir
}
function commit(dir, file, message) {
  mkdirSync(join(dir, file, '..'), { recursive: true })
  writeFileSync(join(dir, file), `${message}\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', message)
}
function run(dir) {
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'main')
  try {
    const out = execFileSync('node', [join(import.meta.dirname, 'rebase-overlap.mjs')], {
      cwd: dir,
      encoding: 'utf8',
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status, out: e.stdout }
  }
}

test('CLI: no overlap exits 0', () => {
  const dir = repo()
  commit(dir, 'mine.txt', 'mine')
  git(dir, 'checkout', '-q', 'main')
  commit(dir, 'theirs.txt', 'theirs')
  git(dir, 'checkout', '-q', 'work')
  const { code, out } = run(dir)
  assert.equal(code, 0)
  assert.match(out, /^no overlap/)
})

test('CLI: the same file on both sides exits 1 and names it', () => {
  const dir = repo()
  commit(dir, 'both.txt', 'mine')
  git(dir, 'checkout', '-q', 'main')
  commit(dir, 'both.txt', 'theirs')
  git(dir, 'checkout', '-q', 'work')
  const { code, out } = run(dir)
  assert.equal(code, 1)
  assert.match(out, /^overlap: both\.txt/)
})

test('CLI: a shared-spot file on main exits 1', () => {
  const dir = repo()
  commit(dir, 'mine.txt', 'mine')
  git(dir, 'checkout', '-q', 'main')
  commit(dir, 'package.json', 'theirs')
  git(dir, 'checkout', '-q', 'work')
  const { code, out } = run(dir)
  assert.equal(code, 1)
  assert.match(out, /overlap: package\.json/)
})
