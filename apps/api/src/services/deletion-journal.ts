import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'

/**
 * One account deletion: when, which account (a random id, never a name or an address) and whether their display name
 * was kept. This is all that is needed to repeat the deletion after a restore (#410).
 */
export interface DeletionEntry {
  at: string
  userId: string
  keepName: boolean
}

/**
 * A list of account deletions that lives outside the database. A rollback or restore puts back an older database, and
 * with it the people who deleted their accounts since; this list says who to delete again (`replay-deletions-cli.ts`).
 * It holds ids only, and is trimmed to the time backups are kept.
 */
export interface DeletionJournal {
  /** Called after the deletion has committed. */
  record(entry: DeletionEntry): void
  /** Entries at or after `since`, oldest first. */
  since(since: Date): DeletionEntry[]
  /** Forgets entries before `before`: no backup is old enough to bring those people back. */
  prune(before: Date): number
}

/**
 * Notes a deletion that has already happened. If the note cannot be written the deletion still stands, so the failure is
 * logged (the error's name only, which never carries a path or an id) and not thrown at the person who deleted.
 */
export function noteDeletion(
  journal: DeletionJournal | undefined,
  entry: DeletionEntry,
  logger: Pick<Console, 'error'> = console,
) {
  try {
    journal?.record(entry)
  } catch (err) {
    logger.error(
      `Deletion journal: could not note a deletion (${err instanceof Error ? err.name : 'unknown error'})`,
    )
  }
}

const EntrySchema = z.object({ at: z.string(), userId: z.string(), keepName: z.boolean() })

/** Appends one JSON line per deletion to a file in the data volume, which a rollback leaves alone. */
export class FileDeletionJournal implements DeletionJournal {
  constructor(private readonly path: string) {}

  record(entry: DeletionEntry) {
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 })
  }

  since(since: Date): DeletionEntry[] {
    return this.all().filter((e) => new Date(e.at) >= since)
  }

  prune(before: Date): number {
    const all = this.all()
    const kept = all.filter((e) => new Date(e.at) >= before)
    if (kept.length === all.length) return 0
    writeFileSync(this.path, kept.map((e) => `${JSON.stringify(e)}\n`).join(''), { mode: 0o600 })
    return all.length - kept.length
  }

  /** A line that does not parse is skipped, not fatal: one bad line must not hide the others. */
  private all(): DeletionEntry[] {
    if (!existsSync(this.path)) return []
    const entries: DeletionEntry[] = []
    for (const line of readFileSync(this.path, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const parsed = EntrySchema.safeParse(JSON.parse(line))
        if (parsed.success) entries.push(parsed.data)
      } catch {
        // skipped, as above
      }
    }
    return entries
  }
}

/** For tests, and for a server that has no journal. */
export class MemoryDeletionJournal implements DeletionJournal {
  entries: DeletionEntry[] = []
  record(entry: DeletionEntry) {
    this.entries.push(entry)
  }
  since(since: Date) {
    return this.entries.filter((e) => new Date(e.at) >= since)
  }
  prune(before: Date) {
    const kept = this.entries.filter((e) => new Date(e.at) >= before)
    const removed = this.entries.length - kept.length
    this.entries = kept
    return removed
  }
}
