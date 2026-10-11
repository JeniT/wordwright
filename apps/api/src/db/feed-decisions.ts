import type { DatabaseSync } from 'node:sqlite'
import { nowIso } from './database'

/** Posts from a profile's feeds that someone ignored, by the post's address key (see `linkKey`). */
export class FeedDecisionStore {
  constructor(private readonly db: DatabaseSync) {}

  /** The address key of each ignored post, with when it was ignored. */
  ignored(profileId: string): Map<string, string> {
    return new Map(
      this.db
        .prepare('SELECT post_key, ignored_at FROM feed_post_ignores WHERE profile_id = ?')
        .all(profileId)
        .map((r) => [r.post_key as string, r.ignored_at as string] as const),
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
