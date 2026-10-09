import type { DatabaseSync } from 'node:sqlite'
import { openDatabase, transaction } from './database'
import { DraftStore } from './drafts'
import { ProfileStore } from './profiles'
import { TokenStore } from './tokens'
import { UserStore } from './users'

export interface Store {
  users: UserStore
  tokens: TokenStore
  profiles: ProfileStore
  drafts: DraftStore
  /** Run several writes atomically. */
  transaction<T>(fn: () => T): T
}

export function createStore(db: DatabaseSync): Store {
  return {
    users: new UserStore(db),
    tokens: new TokenStore(db),
    profiles: new ProfileStore(db),
    drafts: new DraftStore(db),
    transaction: (fn) => transaction(db, fn),
  }
}

export const openStore = (path: string) => createStore(openDatabase(path))
