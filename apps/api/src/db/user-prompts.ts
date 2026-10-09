import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from './database'

/** A person's own versions of the AI prompts. A missing prompt means "use the default". */
export class UserPromptStore {
  constructor(private readonly db: DatabaseSync) {}

  getBrainstorm(userId: string): string | undefined {
    const row = this.db
      .prepare('SELECT brainstorm FROM user_prompts WHERE user_id = ?')
      .get(userId) as { brainstorm: string | null } | undefined
    return row?.brainstorm ?? undefined
  }

  setBrainstorm(userId: string, prompt: string) {
    this.db
      .prepare(
        `INSERT INTO user_prompts (user_id, brainstorm, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET brainstorm = excluded.brainstorm, updated_at = excluded.updated_at`,
      )
      .run(userId, prompt, nowIso())
  }

  clearBrainstorm(userId: string) {
    this.db
      .prepare('UPDATE user_prompts SET brainstorm = NULL, updated_at = ? WHERE user_id = ?')
      .run(nowIso(), userId)
  }
}
