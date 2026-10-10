import type { DatabaseSync } from 'node:sqlite'
import { ConversationStore } from './conversations'
import { CredentialStore } from './credentials'
import { openDatabase, transaction } from './database'
import { DraftStore } from './drafts'
import { IdeaStore } from './ideas'
import { NoteStore } from './notes'
import { InvitationStore } from './invitations'
import { ProfileStore } from './profiles'
import { ResearchStore } from './research'
import { SourceStore } from './sources'
import { TokenStore } from './tokens'
import { UserPromptStore } from './user-prompts'
import { UserStore } from './users'

export interface Store {
  users: UserStore
  tokens: TokenStore
  profiles: ProfileStore
  drafts: DraftStore
  ideas: IdeaStore
  notes: NoteStore
  conversations: ConversationStore
  research: ResearchStore
  sources: SourceStore
  invitations: InvitationStore
  credentials: CredentialStore
  userPrompts: UserPromptStore
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
    notes: new NoteStore(db),
    conversations: new ConversationStore(db),
    research: new ResearchStore(db),
    sources: new SourceStore(db),
    invitations: new InvitationStore(db),
    credentials: new CredentialStore(db),
    userPrompts: new UserPromptStore(db),
    transaction: (fn) => transaction(db, fn),
  }
}

export const openStore = (path: string) => createStore(openDatabase(path))
