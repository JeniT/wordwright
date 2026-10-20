import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  LLMContentBlock,
  LLMStopReason,
  ProposalStatus,
  ProposalTool,
  ReadingCheck,
  RecordedNote,
} from '@wordwright/core'
import { nowIso } from './database'

export interface MessageRecord {
  id: string
  seq: number
  role: 'user' | 'assistant'
  kind: 'kickoff' | 'message'
  authorId: string | null
  /** The author's name now (null if the account is gone). */
  authorName: string | null
  provider: string | null
  model: string | null
  content: LLMContentBlock[]
  displayText: string
  snapshot: string | null
  status: 'complete' | 'stopped'
  stopReason: LLMStopReason | null
  createdAt: string
}

export interface NewMessage {
  role: 'user' | 'assistant'
  kind: 'kickoff' | 'message'
  authorId: string
  provider?: string
  model?: string
  content: LLMContentBlock[]
  displayText: string
  snapshot?: string
  status?: 'complete' | 'stopped'
  stopReason?: LLMStopReason
  usage?: { inputTokens: number; outputTokens: number; cachedInputTokens?: number }
}

export interface ProposalRecord {
  id: string
  messageId: string
  toolCallId: string
  tool: ProposalTool
  input: { name?: string; notes?: string; url?: string; title?: string; why?: string }
  /** The title when suggested (legacy threads also hold the notes). */
  base: { name: string; notes?: string } | null
  /** `suggest_reading` only: where it came from and what looking at the address found. */
  reading: {
    check: ReadingCheck
    fetchedTitle: string | null
    fetchedAuthors: string[]
  } | null
  status: ProposalStatus
  decidedByName: string | null
  decidedAt: string | null
  createdIdeaId: string | null
}

/** A point the AI recorded (or tried to record) as a note in one of its replies. */
export interface RecordedNoteRecord extends RecordedNote {
  messageId: string
  toolCallId: string
}

/** A Refine conversation as stored: when it began, and who began it (the author of its first message). */
export interface ConversationRecord {
  id: string
  ideaId: string
  createdAt: string
  startedByName: string | null
  title: string | null
  /** Who gave the title: the AI, or a person (after which the AI never changes it). */
  titleSource: 'ai' | 'writer' | null
}

/**
 * The Refine conversations of each idea, shared by everyone in its publication. Messages are always read and written
 * through their conversation, so one conversation never sees another's. Callers check that the person belongs to the
 * idea's publication first.
 */
export class ConversationStore {
  constructor(private readonly db: DatabaseSync) {}

  /** An idea's conversations, oldest first. */
  list(ideaId: string): ConversationRecord[] {
    return this.db
      .prepare(`${this.conversationSql('WHERE c.idea_id = ?')} ORDER BY c.created_at, c.rowid`)
      .all(ideaId)
      .map(toConversation)
  }

  /** A conversation, only if it belongs to this idea. */
  get(ideaId: string, id: string): ConversationRecord | undefined {
    const row = this.db
      .prepare(this.conversationSql('WHERE c.idea_id = ? AND c.id = ?'))
      .get(ideaId, id)
    return row ? toConversation(row) : undefined
  }

  /** The conversation nobody has written in yet, if there is one. */
  emptyOne(ideaId: string): ConversationRecord | undefined {
    return this.list(ideaId).find((c) => this.messages(c.id).length === 0)
  }

  titleOf(id: string): string | null {
    const row = this.db.prepare('SELECT title FROM idea_conversations WHERE id = ?').get(id) as
      { title: string | null } | undefined
    return row?.title ?? null
  }

  /** Gives a conversation its title. The AI's only counts if there is none yet; a person's always does. */
  setTitle(id: string, title: string, source: 'ai' | 'writer'): boolean {
    return (
      this.db
        .prepare(
          `UPDATE idea_conversations SET title = ?, title_source = ?
           WHERE id = ? ${source === 'ai' ? 'AND title IS NULL' : ''}`,
        )
        .run(title, source, id).changes > 0
    )
  }

  create(ideaId: string): string {
    const id = randomUUID()
    this.db
      .prepare('INSERT INTO idea_conversations (id, idea_id, created_at) VALUES (?, ?, ?)')
      .run(id, ideaId, nowIso())
    return id
  }

  /** Removes one conversation, its messages and the suggestions made in them. */
  delete(id: string) {
    this.db.prepare('DELETE FROM idea_conversations WHERE id = ?').run(id)
  }

  private conversationSql(rest: string) {
    // Who began it: the author of its first message (their name as kept, if the account has gone).
    return `SELECT c.*, (
              SELECT COALESCE(u.name, m.kept_name) FROM idea_messages m
              LEFT JOIN users u ON u.id = m.author_id
              WHERE m.conversation_id = c.id ORDER BY m.seq LIMIT 1
            ) AS started_by_name
            FROM idea_conversations c ${rest}`
  }

  messages(conversationId: string): MessageRecord[] {
    return this.db
      .prepare(
        `SELECT m.*, COALESCE(u.name, m.kept_name) AS author_name FROM idea_messages m
         LEFT JOIN users u ON u.id = m.author_id
         WHERE m.conversation_id = ? ORDER BY m.seq`,
      )
      .all(conversationId)
      .map(toMessage)
  }

  message(conversationId: string, id: string): MessageRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT m.*, COALESCE(u.name, m.kept_name) AS author_name FROM idea_messages m
         LEFT JOIN users u ON u.id = m.author_id WHERE m.conversation_id = ? AND m.id = ?`,
      )
      .get(conversationId, id)
    return row ? toMessage(row) : undefined
  }

  /** The snapshot carried by the most recent message that had one: what the model last saw of the idea. */
  lastSnapshot(conversationId: string): string | undefined {
    const row = this.db
      .prepare(
        'SELECT snapshot FROM idea_messages WHERE conversation_id = ? AND snapshot IS NOT NULL ORDER BY seq DESC LIMIT 1',
      )
      .get(conversationId) as { snapshot: string } | undefined
    return row?.snapshot
  }

  append(ideaId: string, conversationId: string, message: NewMessage): string {
    const id = randomUUID()
    // `seq` counts across the whole idea (it is unique per idea); order within a conversation is all that is read.
    this.db
      .prepare(
        `INSERT INTO idea_messages (id, idea_id, conversation_id, seq, role, kind, author_id, provider, model, content,
           display_text, snapshot, status, stop_reason, input_tokens, output_tokens, cached_tokens, created_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM idea_messages WHERE idea_id = ?),
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        ideaId,
        conversationId,
        ideaId,
        message.role,
        message.kind,
        message.authorId,
        message.provider ?? null,
        message.model ?? null,
        JSON.stringify(message.content),
        message.displayText,
        message.snapshot ?? null,
        message.status ?? 'complete',
        message.stopReason ?? null,
        message.usage?.inputTokens ?? null,
        message.usage?.outputTokens ?? null,
        message.usage?.cachedInputTokens ?? null,
        nowIso(),
      )
    return id
  }

  addProposal(
    messageId: string,
    p: Pick<ProposalRecord, 'toolCallId' | 'tool' | 'input' | 'base'> &
      Partial<Pick<ProposalRecord, 'reading'>>,
  ): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO idea_proposals (id, message_id, tool_call_id, tool, input, base, check_status, fetched_title, fetched_authors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        messageId,
        p.toolCallId,
        p.tool,
        JSON.stringify(p.input),
        p.base && JSON.stringify(p.base),
        p.reading?.check ?? null,
        p.reading?.fetchedTitle ?? null,
        JSON.stringify(p.reading?.fetchedAuthors ?? []),
      )
    return id
  }

  addRecordedNote(
    messageId: string,
    n: { toolCallId: string; text: string; outcome: RecordedNote['outcome']; noteId?: string },
  ): string {
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO idea_message_notes (id, message_id, tool_call_id, text, outcome, note_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, messageId, n.toolCallId, n.text, n.outcome, n.noteId ?? null)
    return id
  }

  /** The points recorded as notes in one message, in the order they were made. */
  recordedNotes(messageId: string): RecordedNoteRecord[] {
    return this.db
      .prepare('SELECT * FROM idea_message_notes WHERE message_id = ? ORDER BY rowid')
      .all(messageId)
      .map((r) => ({
        id: r.id as string,
        messageId: r.message_id as string,
        toolCallId: r.tool_call_id as string,
        text: r.text as string,
        outcome: r.outcome as RecordedNote['outcome'],
        removed: r.outcome === 'added' && r.note_id === null,
      }))
  }

  /** The suggestions made in one message, in the order they were made. */
  proposals(messageId: string): ProposalRecord[] {
    return this.db
      .prepare(this.proposalSql('WHERE p.message_id = ?') + ' ORDER BY p.rowid')
      .all(messageId)
      .map(toProposal)
  }

  /** A suggestion, only if it belongs to this conversation. */
  proposal(conversationId: string, id: string): ProposalRecord | undefined {
    const row = this.db
      .prepare(
        this.proposalSql(
          'JOIN idea_messages m ON m.id = p.message_id WHERE m.conversation_id = ? AND p.id = ?',
        ),
      )
      .get(conversationId, id)
    return row ? toProposal(row) : undefined
  }

  /**
   * Records a decision, but only if it is still pending, so two people can't both decide it.
   * Returns whether this call was the one that decided.
   */
  decide(
    id: string,
    status: 'accepted' | 'dismissed',
    userId: string,
    createdIdeaId?: string,
  ): boolean {
    return (
      this.db
        .prepare(
          `UPDATE idea_proposals SET status = ?, decided_by = ?, decided_at = ?, created_idea_id = ?
           WHERE id = ? AND status = 'pending'`,
        )
        .run(status, userId, nowIso(), createdIdeaId ?? null, id).changes > 0
    )
  }

  private proposalSql(rest: string) {
    return `SELECT p.*, u.name AS decided_by_name FROM idea_proposals p
            LEFT JOIN users u ON u.id = p.decided_by ${rest}`
  }
}

function toConversation(row: Record<string, unknown>): ConversationRecord {
  return {
    id: row.id as string,
    ideaId: row.idea_id as string,
    createdAt: row.created_at as string,
    startedByName: (row.started_by_name as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    titleSource: (row.title_source as 'ai' | 'writer' | null) ?? null,
  }
}

function toMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: row.id as string,
    seq: row.seq as number,
    role: row.role as 'user' | 'assistant',
    kind: row.kind as 'kickoff' | 'message',
    authorId: (row.author_id as string | null) ?? null,
    authorName: (row.author_name as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    content: JSON.parse(row.content as string) as LLMContentBlock[],
    displayText: row.display_text as string,
    snapshot: (row.snapshot as string | null) ?? null,
    status: row.status as 'complete' | 'stopped',
    stopReason: (row.stop_reason as LLMStopReason | null) ?? null,
    createdAt: row.created_at as string,
  }
}

function toProposal(row: Record<string, unknown>): ProposalRecord {
  return {
    id: row.id as string,
    messageId: row.message_id as string,
    toolCallId: row.tool_call_id as string,
    tool: row.tool as ProposalTool,
    input: JSON.parse(row.input as string),
    base: row.base ? JSON.parse(row.base as string) : null,
    reading: row.check_status
      ? {
          check: row.check_status as ReadingCheck,
          fetchedTitle: (row.fetched_title as string | null) ?? null,
          fetchedAuthors: JSON.parse((row.fetched_authors as string | null) ?? '[]') as string[],
        }
      : null,
    status: row.status as ProposalStatus,
    decidedByName: (row.decided_by_name as string | null) ?? null,
    decidedAt: (row.decided_at as string | null) ?? null,
    createdIdeaId: (row.created_idea_id as string | null) ?? null,
  }
}
