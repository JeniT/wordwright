import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from './database'

/** Posts from a profile's feeds that someone ignored, by the post's address key (see `linkKey`). */
export class FeedDecisionStore {
  constructor(private readonly db: DatabaseSync) {}

  ignored(profileId: string): Set<string> {
    return new Set(
      this.db
        .prepare('SELECT post_key FROM feed_post_ignores WHERE profile_id = ?')
        .all(profileId)
        .map((r) => r.post_key as string),
    )
  }

  ignore(profileId: string, postKey: string, userId: string) {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO feed_post_ignores (profile_id, post_key, ignored_by, ignored_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(profileId, postKey, userId, nowIso())
  }

  unignore(profileId: string, postKey: string) {
    this.db
      .prepare('DELETE FROM feed_post_ignores WHERE profile_id = ? AND post_key = ?')
      .run(profileId, postKey)
  }
}
