import type { DatabaseSync } from 'node:sqlite'
import { CredentialStore } from './credentials'
import { openDatabase, transaction } from './database'
import { DraftStore } from './drafts'
import { IdeaStore } from './ideas'
import { InvitationStore } from './invitations'
import { ProfileStore } from './profiles'
import { SourceStore } from './sources'
import { TokenStore } from './tokens'
import { UserStore } from './users'

export interface Store {
  users: UserStore
  tokens: TokenStore
  profiles: ProfileStore
  drafts: DraftStore
  ideas: IdeaStore
  sources: SourceStore
  invitations: InvitationStore
  credentials: CredentialStore
  /** Run several writes atomically. */
  transaction<T>(fn: () => T): T
}

export function createStore(db: DatabaseSync): Store {
  return {
    users: new UserStore(db),
    tokens: new TokenStore(db),
    profiles: new ProfileStore(db),
    drafts: new DraftStore(db),
    ideas: new IdeaStore(db),
    sources: new SourceStore(db),
    invitations: new InvitationStore(db),
    credentials: new CredentialStore(db),
    transaction: (fn) => transaction(db, fn),
  }
}

export const openStore = (path: string) => createStore(openDatabase(path))
