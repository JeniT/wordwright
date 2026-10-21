import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from './database'

/** A person's own settings. A missing value means "use the default". */
export class UserSettingsStore {
  constructor(private readonly db: DatabaseSync) {}

  getCritiqueRounds(userId: string): number | undefined {
    const row = this.db
      .prepare('SELECT critique_rounds FROM user_settings WHERE user_id = ?')
      .get(userId) as { critique_rounds: number | null } | undefined
    return row?.critique_rounds ?? undefined
  }

  setCritiqueRounds(userId: string, rounds: number) {
    this.db
      .prepare(
        `INSERT INTO user_settings (user_id, critique_rounds, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET critique_rounds = excluded.critique_rounds, updated_at = excluded.updated_at`,
      )
      .run(userId, rounds, nowIso())
  }

  /** Tutorial mode (#198): off when there is no row, as for accounts that predate it. Read with the user (`users.ts`). */
  setTutorialMode(userId: string, on: boolean) {
    this.upsert(userId, 'tutorial_mode', on ? 1 : 0)
  }

  /** `column` is always one of our own column names, never input. */
  private upsert(userId: string, column: string, value: number | string) {
    this.db
      .prepare(
        `INSERT INTO user_settings (user_id, ${column}, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = excluded.updated_at`,
      )
      .run(userId, value, nowIso())
  }
}
