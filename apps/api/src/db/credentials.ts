import type { DatabaseSync } from 'node:sqlite'
import type { LLMProviderId } from '@lfwa/core'
import { nowIso } from './database'

export interface StoredLlmCredential {
  provider: LLMProviderId
  /** Encrypted; see SecretBox. */
  encryptedKey: string
  keyHint: string
  model: string
}

export class CredentialStore {
  constructor(private readonly db: DatabaseSync) {}

  get(userId: string): StoredLlmCredential | undefined {
    const row = this.db.prepare('SELECT * FROM llm_credentials WHERE user_id = ?').get(userId) as
      Record<string, string> | undefined
    return (
      row && {
        provider: row.provider as LLMProviderId,
        encryptedKey: row.encrypted_key!,
        keyHint: row.key_hint!,
        model: row.model!,
      }
    )
  }

  save(userId: string, c: StoredLlmCredential) {
    this.db
      .prepare(
        `INSERT INTO llm_credentials (user_id, provider, encrypted_key, key_hint, model, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider,
           encrypted_key = excluded.encrypted_key, key_hint = excluded.key_hint,
           model = excluded.model, updated_at = excluded.updated_at`,
      )
      .run(userId, c.provider, c.encryptedKey, c.keyHint, c.model, nowIso())
  }

  setModel(userId: string, model: string) {
    this.db
      .prepare('UPDATE llm_credentials SET model = ?, updated_at = ? WHERE user_id = ?')
      .run(model, nowIso(), userId)
  }

  delete(userId: string) {
    this.db.prepare('DELETE FROM llm_credentials WHERE user_id = ?').run(userId)
  }
}
