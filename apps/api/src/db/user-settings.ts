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
}
