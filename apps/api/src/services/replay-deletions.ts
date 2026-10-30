import type { Store } from '../db/store'
import type { DeletionEntry } from './deletion-journal'
import { removeUserAndOwnedData } from './remove-user'

export interface ReplayResult {
  /** Entries whose account is in this database, and so was (or would be) deleted again. */
  deleted: number
  /** Entries whose account is not here: it was made after the backup, or is already gone. */
  absent: number
}

/**
 * Deletes again the accounts that were deleted after the backup now in use was taken (#410). Safe to run twice. The
 * "only owner of a shared publication" refusal is not repeated: that was settled when the person first deleted, and
 * `removeUserAndOwnedData` hands the publication on if the older database still needs it. With `dryRun`, nothing changes.
 */
export function replayDeletions(
  store: Store,
  entries: DeletionEntry[],
  { dryRun = false }: { dryRun?: boolean } = {},
): ReplayResult {
  const result: ReplayResult = { deleted: 0, absent: 0 }
  for (const entry of entries) {
    const user = store.users.findById(entry.userId)
    if (!user) {
      result.absent++
      continue
    }
    if (!dryRun) {
      store.transaction(() => removeUserAndOwnedData(store, user, { keepName: entry.keepName }))
    }
    result.deleted++
  }
  return result
}
