import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { TUTORIAL_SEEN_MAX, type TutorialState } from '@wordwright/core'
import { nowIso } from './database'

const SeenList = z.array(z.string())

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

  /** Tutorial mode (#198): off when there is no row, as for accounts that predate it. */
  getTutorial(userId: string): TutorialState {
    const row = this.db
      .prepare(
        'SELECT tutorial_mode, tutorial_seen, tutorial_answered FROM user_settings WHERE user_id = ?',
      )
      .get(userId) as
      | {
          tutorial_mode: number | null
          tutorial_seen: string | null
          tutorial_answered: number | null
        }
      | undefined
    return {
      on: row?.tutorial_mode === 1,
      seen: row?.tutorial_seen ? SeenList.parse(JSON.parse(row.tutorial_seen)) : [],
      answered: row?.tutorial_answered === 1,
    }
  }

  setTutorialMode(userId: string, on: boolean) {
    this.upsert(userId, 'tutorial_mode', on ? 1 : 0)
  }

  setTutorialAnswered(userId: string, answered: boolean) {
    this.upsert(userId, 'tutorial_answered', answered ? 1 : 0)
  }

  /** Records a kind of page once; past the cap new kinds are ignored rather than refused. */
  addTutorialSeen(userId: string, kind: string) {
    const seen = this.getTutorial(userId).seen
    if (seen.includes(kind) || seen.length >= TUTORIAL_SEEN_MAX) return
    this.upsert(userId, 'tutorial_seen', JSON.stringify([...seen, kind]))
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
