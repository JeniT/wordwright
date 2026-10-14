import type { DatabaseSync } from 'node:sqlite'
import { ConversationStore } from './conversations'
import { CredentialStore } from './credentials'
import { CommentStore } from './comments'
import { CritiqueStore } from './critiques'
import { openDatabase, transaction } from './database'
import { DraftStore } from './drafts'
import { FeedDecisionStore } from './feed-decisions'
import { HandoverStore } from './handovers'
import { IdeaStore } from './ideas'
import { MoveStore } from './moves'
import { NoteStore } from './notes'
import { ReadingStore } from './reading'
import { InvitationStore } from './invitations'
import { ProfileStore } from './profiles'
import { ResearchStore } from './research'
import { ReviewStore } from './reviews'
import { SourceStore } from './sources'
import { TokenStore } from './tokens'
import { UserPromptStore } from './user-prompts'
import { UserSettingsStore } from './user-settings'
import { UserStore } from './users'

export interface Store {
  users: UserStore
  tokens: TokenStore
  profiles: ProfileStore
  drafts: DraftStore
  handovers: HandoverStore
  critiques: CritiqueStore
  comments: CommentStore
  ideas: IdeaStore
  notes: NoteStore
  reading: ReadingStore
  moves: MoveStore
  feedDecisions: FeedDecisionStore
  conversations: ConversationStore
  research: ResearchStore
  sources: SourceStore
  invitations: InvitationStore
  reviews: ReviewStore
  credentials: CredentialStore
  userPrompts: UserPromptStore
  userSettings: UserSettingsStore
  /** Run several writes atomically. */
  transaction<T>(fn: () => T): T
}

export function createStore(db: DatabaseSync): Store {
  return {
    users: new UserStore(db),
    tokens: new TokenStore(db),
    profiles: new ProfileStore(db),
    drafts: new DraftStore(db),
    handovers: new HandoverStore(db),
    critiques: new CritiqueStore(db),
    comments: new CommentStore(db),
    ideas: new IdeaStore(db),
    notes: new NoteStore(db),
    reading: new ReadingStore(db),
    moves: new MoveStore(db),
    feedDecisions: new FeedDecisionStore(db),
    conversations: new ConversationStore(db),
    research: new ResearchStore(db),
    sources: new SourceStore(db),
    invitations: new InvitationStore(db),
    reviews: new ReviewStore(db),
    credentials: new CredentialStore(db),
    userPrompts: new UserPromptStore(db),
    userSettings: new UserSettingsStore(db),
    transaction: (fn) => transaction(db, fn),
  }
}

export const openStore = (path: string) => createStore(openDatabase(path))
