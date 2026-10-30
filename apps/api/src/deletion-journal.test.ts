import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileDeletionJournal, noteDeletion } from './services/deletion-journal'
import { MaintenanceService } from './services/maintenance'
import { replayDeletions } from './services/replay-deletions'
import { PASSWORD, register, setup, verifyAccounts } from './test-helpers'

const entry = (at: string, userId: string, keepName = false) => ({ at, userId, keepName })

describe('the file deletion journal', () => {
  const path = () => join(mkdtempSync(join(tmpdir(), 'journal-')), 'deletions.jsonl')

  it('reads back what was recorded, from a given time, oldest first', () => {
    const journal = new FileDeletionJournal(path())
    expect(journal.since(new Date(0))).toEqual([])
    journal.record(entry('2026-10-01T00:00:00.000Z', 'a'))
    journal.record(entry('2026-10-05T00:00:00.000Z', 'b', true))
    expect(journal.since(new Date('2026-10-02T00:00:00Z'))).toEqual([
      entry('2026-10-05T00:00:00.000Z', 'b', true),
    ])
  })

  it('skips a damaged line instead of failing', () => {
    const file = path()
    const journal = new FileDeletionJournal(file)
    journal.record(entry('2026-10-01T00:00:00.000Z', 'a'))
    writeFileSync(file, `not json\n{"at":1}\n${readFileSync(file, 'utf8')}`)
    expect(journal.since(new Date(0)).map((e) => e.userId)).toEqual(['a'])
  })

  it('prunes entries older than the cut-off and keeps the rest', () => {
    const journal = new FileDeletionJournal(path())
    journal.record(entry('2026-09-01T00:00:00.000Z', 'old'))
    journal.record(entry('2026-10-20T00:00:00.000Z', 'new'))
    expect(journal.prune(new Date('2026-10-01T00:00:00Z'))).toBe(1)
    expect(journal.since(new Date(0)).map((e) => e.userId)).toEqual(['new'])
    expect(journal.prune(new Date('2026-10-01T00:00:00Z'))).toBe(0)
  })
})

describe('noting deletions', () => {
  it('logs, and does not throw, when the note cannot be written', () => {
    const errors: string[] = []
    const broken = new FileDeletionJournal('/nonexistent-folder/deletions.jsonl')
    expect(() =>
      noteDeletion(broken, entry('2026-10-01T00:00:00.000Z', 'a'), {
        error: (m) => errors.push(String(m)),
      }),
    ).not.toThrow()
    expect(errors).toHaveLength(1)
    expect(errors[0]).not.toContain('nonexistent')
  })

  it('notes a deleted account by id, with the time and the name choice, and nothing personal', async () => {
    const ctx = setup()
    const c = ctx.client()
    const user = await register(c, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    await c.delete('/api/account', { password: PASSWORD, keepName: false })
    expect(ctx.deletionJournal.entries).toEqual([
      { at: ctx.clock.now.toISOString(), userId: user.id, keepName: false },
    ])
    expect(JSON.stringify(ctx.deletionJournal.entries)).not.toMatch(/ada/i)
  })

  it('does not note a deletion that was refused', async () => {
    const ctx = setup()
    const c = ctx.client()
    await register(c, 'ada@example.com', 'Ada')
    verifyAccounts(ctx, 'ada@example.com')
    expect((await c.delete('/api/account', { password: 'wrong password' })).status).toBe(403)
    expect(ctx.deletionJournal.entries).toEqual([])
  })

  it('notes abandoned accounts that maintenance removes, and prunes old entries', async () => {
    const ctx = setup()
    const user = await register(ctx.client(), 'typo@example.com', 'Typo')
    ctx.deletionJournal.record(entry('2025-01-01T00:00:00.000Z', 'ancient'))
    ctx.clock.now = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
    new MaintenanceService({
      store: ctx.store,
      deletionJournal: ctx.deletionJournal,
      now: () => ctx.clock.now,
      logger: { log: () => {}, error: () => {} },
    }).run()
    expect(ctx.deletionJournal.entries.map((e) => e.userId)).toEqual([user.id])
  })
})

describe('repeating deletions after a restore', () => {
  it('deletes again the people who left after the backup, and only them', async () => {
    const ctx = setup()
    const leaver = await register(ctx.client(), 'leaver@example.com', 'Leaver')
    const stayer = await register(ctx.client(), 'stayer@example.com', 'Stayer')
    // The restored database still holds both. The journal remembers one leaving, and one id that was never here.
    const entries = [
      entry('2026-10-24T00:00:00.000Z', leaver.id),
      entry('2026-10-24T00:00:00.000Z', 'new-after-backup'),
    ]

    expect(replayDeletions(ctx.store, entries, { dryRun: true })).toEqual({ deleted: 1, absent: 1 })
    expect(ctx.store.users.findById(leaver.id)).toBeDefined()

    expect(replayDeletions(ctx.store, entries)).toEqual({ deleted: 1, absent: 1 })
    expect(ctx.store.users.findById(leaver.id)).toBeUndefined()
    expect(ctx.store.users.findById(stayer.id)).toBeDefined()
    // A second run changes nothing.
    expect(replayDeletions(ctx.store, entries)).toEqual({ deleted: 0, absent: 2 })
  })
})
