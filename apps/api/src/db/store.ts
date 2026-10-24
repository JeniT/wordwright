import type { DatabaseSync } from 'node:sqlite'
import { ConversationStore } from './conversations'
import { CredentialStore } from './credentials'
import { CommentStore } from './comments'
import { CritiqueStore } from './critiques'
import { isReady, openDatabase, transaction } from './database'
import { DraftStore } from './drafts'
import { FeedDecisionStore } from './feed-decisions'
import { HandoverStore } from './handovers'
import { IdeaStore } from './ideas'
import { MoveStore } from './moves'
import { NoteStore } from './notes'
import { ArticleStore } from './articles'
import { InvitationStore } from './invitations'
import { PublicationStore } from './publications'
import { ResearchStore } from './research'
import { ReviewStore } from './reviews'
import { SourceStore } from './sources'
import { TokenStore } from './tokens'
import { UserSettingsStore } from './user-settings'
import { UserStore } from './users'
import { AdminAuditStore } from './admin-audit'

export interface Store {
  users: UserStore
  tokens: TokenStore
  publications: PublicationStore
  drafts: DraftStore
  handovers: HandoverStore
  critiques: CritiqueStore
  comments: CommentStore
  ideas: IdeaStore
  notes: NoteStore
  articles: ArticleStore
  moves: MoveStore
  feedDecisions: FeedDecisionStore
  conversations: ConversationStore
  research: ResearchStore
  sources: SourceStore
  invitations: InvitationStore
  reviews: ReviewStore
  credentials: CredentialStore
  userSettings: UserSettingsStore
  adminAudit: AdminAuditStore
  /** Run several writes atomically. */
  transaction<T>(fn: () => T): T
  /** Whether the database answers and is fully migrated (the readiness check). */
  ready(): boolean
}

export function createStore(db: DatabaseSync): Store {
  return {
    users: new UserStore(db),
    tokens: new TokenStore(db),
    publications: new PublicationStore(db),
    drafts: new DraftStore(db),
    handovers: new HandoverStore(db),
    critiques: new CritiqueStore(db),
    comments: new CommentStore(db),
    ideas: new IdeaStore(db),
    notes: new NoteStore(db),
    articles: new ArticleStore(db),
    moves: new MoveStore(db),
    feedDecisions: new FeedDecisionStore(db),
    conversations: new ConversationStore(db),
    research: new ResearchStore(db),
    sources: new SourceStore(db),
    invitations: new InvitationStore(db),
    reviews: new ReviewStore(db),
    credentials: new CredentialStore(db),
    userSettings: new UserSettingsStore(db),
    adminAudit: new AdminAuditStore(db),
    transaction: (fn) => transaction(db, fn),
    ready: () => isReady(db),
  }
}

export const openStore = (path: string) => createStore(openDatabase(path))
