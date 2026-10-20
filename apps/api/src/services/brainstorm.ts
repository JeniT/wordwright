import {
  CreateIdeaToolInputSchema,
  linkKey,
  LLMAuthError,
  LLMProviderError,
  LLMRateLimitError,
  llmTool,
  NameConversationToolInputSchema,
  MAX_CONVERSATIONS_PER_IDEA,
  MAX_IDEA_LINKS,
  MAX_IDEA_NOTES,
  MAX_NOTES_PER_REPLY,
  MAX_PROPOSALS_PER_REPLY,
  MAX_READING_SUGGESTIONS_PER_REPLY,
  noteKey,
  SuggestNoteToolInputSchema,
  SuggestReadingToolInputSchema,
  UpdateIdeaToolInputSchema,
  type BrainstormEvent,
  type Conversation,
  type ConversationList,
  type ConversationSummary,
  type ConversationMessage,
  type Idea,
  type LLMChatEvent,
  type LLMChatMessage,
  type LLMChatRequest,
  type LLMContentBlock,
  type LLMProvider,
  type PageInfoFetcher,
  type Proposal,
  type SendMessageInput,
} from '@wordwright/core'
import {
  NAME_CONVERSATION_TOOL_PROMPT,
  BRAINSTORM_KICKOFF_PROMPT,
  BRAINSTORM_RULES_PROMPT,
  CREATE_IDEA_TOOL_PROMPT,
  DEFAULT_BRAINSTORM_PROMPT,
  SUGGEST_NOTE_TOOL_PROMPT,
  SUGGEST_READING_TOOL_PROMPT,
  UPDATE_IDEA_TOOL_PROMPT,
} from '@wordwright/prompts'
import type { RateLimiter } from '../auth/rate-limit'
import type {
  ConversationRecord,
  MessageRecord,
  ProposalRecord,
  RecordedNoteRecord,
} from '../db/conversations'
import type { Store } from '../db/store'
import { ReadingChecker, type CheckedReading } from './reading-suggestions'
import { usablePublicationDescription, publicationDescriptionBlock } from './publication-context'
import { escape, notesText, snapshotNotes, type SnapshotNote } from './idea-notes'
import { fail, notFound } from '../errors'

/** A reply that takes longer than this is abandoned (and its lock freed). */
export const REPLY_TIMEOUT_MS = 180_000

/**
 * What the AI can do. `name_conversation` takes effect at once (it only ever labels the conversation, which a person
 * can rename); the others only ever become suggestions a person adds or ignores.
 */
export const BRAINSTORM_TOOLS = [
  llmTool({
    name: 'suggest_note',
    description: SUGGEST_NOTE_TOOL_PROMPT,
    schema: SuggestNoteToolInputSchema,
  }),
  llmTool({
    name: 'update_idea',
    description: UPDATE_IDEA_TOOL_PROMPT,
    schema: UpdateIdeaToolInputSchema,
  }),
  llmTool({
    name: 'create_idea',
    description: CREATE_IDEA_TOOL_PROMPT,
    schema: CreateIdeaToolInputSchema,
  }),
  llmTool({
    name: 'suggest_reading',
    description: SUGGEST_READING_TOOL_PROMPT,
    schema: SuggestReadingToolInputSchema,
  }),
  llmTool({
    name: 'name_conversation',
    description: NAME_CONVERSATION_TOOL_PROMPT,
    schema: NameConversationToolInputSchema,
  }),
]

export interface BrainstormDeps {
  store: Store
  /** The person's own LLM (their key and model), and what to record about it. Throws `LlmError` if none. */
  resolveLlm: (userId: string) => { llm: LLMProvider; provider: string; model: string }
  /** Looks at suggested addresses (the SSRF-safe fetcher), so the writer sees what is really there. */
  pages: PageInfoFetcher
  /** Per person: each message spends their money and our server time. */
  limiter: RateLimiter
  logger?: Pick<Console, 'error'>
  now?: () => number
  /** How long a reply may take before it is abandoned. Defaults to `REPLY_TIMEOUT_MS`; tests shorten it. */
  replyTimeoutMs?: number
}

export interface BrainstormUser {
  id: string
  name: string
}

/** Everything one reply needs to know, fixed when it begins. */
interface ReplyContext {
  idea: Idea
  conversationId: string
  user: BrainstormUser
  llm: LLMProvider
  provider: string
  model: string
  system: string
  /** The person's message stored for this reply; absent when retrying one that was already stored. */
  sent: MessageRecord | undefined
  signal: AbortSignal
}

const summary = ({
  id,
  createdAt,
  startedByName,
  title,
  titleSource,
}: ConversationRecord): ConversationSummary => ({
  id,
  createdAt,
  startedByName,
  title,
  titleByAi: title !== null && titleSource === 'ai',
})

/** A reply that has been accepted for processing; `run` does the work and streams events. */
export interface Turn {
  run(signal: AbortSignal): AsyncIterable<BrainstormEvent>
}

/**
 * One turn of the AI's, with the step that makes a reply of tool calls alone into a reply in words. The model ends
 * its turn after calling tools (stop reason `tool_use`) and, when it has said nothing, waits for the results before it
 * writes its message (#305; prompts alone did not change that). So when a reply has calls and no words, the calls go
 * back, answered, with a note to write the message in words, and what it then says is the reply. One extra request,
 * only then; further calls in it are ignored. The calls and the usage are the first request's and the second's
 * together. The evals run this same function, so they test what the app does.
 */
export async function* brainstormTurn(
  llm: LLMProvider,
  request: LLMChatRequest,
): AsyncGenerator<LLMChatEvent> {
  let text = ''
  const calls: Extract<LLMChatEvent, { type: 'tool_call' }>[] = []
  let done: Extract<LLMChatEvent, { type: 'done' }> | undefined
  for await (const event of llm.chat(request)) {
    if (event.type === 'text') {
      text += event.text
      yield event
    } else if (event.type === 'tool_call') calls.push(event)
    else done = event
  }
  if (done && !text.trim() && calls.length > 0 && done.stopReason === 'tool_use') {
    const asked: LLMChatMessage[] = [
      {
        role: 'assistant',
        content: calls.map((c) => ({
          type: 'tool_call' as const,
          id: c.id,
          name: c.name,
          input: c.input,
        })),
      },
      {
        role: 'user',
        content: [
          ...calls.map((c) => ({
            type: 'tool_result' as const,
            toolCallId: c.id,
            content: 'Received: the writer will see it beside your message.',
            isError: false,
          })),
          { type: 'text' as const, text: 'Now write your message to the writer, in words.' },
        ],
      },
    ]
    let follow: Extract<LLMChatEvent, { type: 'done' }> | undefined
    for await (const event of llm.chat({ ...request, messages: [...request.messages, ...asked] })) {
      if (event.type === 'text') yield event
      else if (event.type === 'done') follow = event
    }
    if (follow) {
      done = {
        ...follow,
        usage: {
          inputTokens: (done.usage?.inputTokens ?? 0) + (follow.usage?.inputTokens ?? 0),
          outputTokens: (done.usage?.outputTokens ?? 0) + (follow.usage?.outputTokens ?? 0),
        },
      }
    }
  }
  for (const call of calls) yield call
  if (done) yield done
}

/** What is sent as the system prompt: the default prompt, then the app's own rules. The evals use this too. */
export const brainstormSystem = () => `${DEFAULT_BRAINSTORM_PROMPT}\n\n${BRAINSTORM_RULES_PROMPT}`

interface Publication {
  name: string
  siteUrl: string | null
  /** The writer's own description of the publication; null when there is none the AI may be told (see `usablePublicationDescription`). */
  description: string | null
}

/**
 * What the AI is shown of the idea. Everything in it is the writer's own words or text from other
 * websites, i.e. untrusted: it is escaped, and `prompts/brainstorm-rules.md` tells the AI to treat it as
 * material to discuss, never as instructions. Only the titles of drafts are included, never their text.
 */
export function formatSnapshot(input: {
  idea: Idea
  publication: Publication
  /** The idea's notes, one by one, so a quotation can be told from the writer's own point (else `idea.notes` is used). */
  notes?: SnapshotNote[]
}): string {
  const { idea, publication } = input
  const description = publicationDescriptionBlock(publication.description)
  const list = (items: string[]) => (items.length ? items : ['(none yet)'])
  return [
    '<idea_snapshot>',
    `Idea title: ${escape(idea.name)}`,
    'Notes:',
    notesText(input.notes) ?? (idea.notes.trim() ? escape(idea.notes) : '(none yet)'),
    '',
    'Related links the writer has saved:',
    ...list(idea.links.map((l) => `- ${l.title ? `${escape(l.title)}: ` : ''}${escape(l.url)}`)),
    '',
    `Publication: ${escape(publication.name)}${publication.siteUrl ? ` (${escape(publication.siteUrl)})` : ''}`,
    'The writer’s own description of the publication (what it is, who reads it, what kinds of writing go there):',
    description ?? '(not described yet)',
    '',
    'Drafts that already exist (titles only):',
    ...list(idea.drafts.map((d) => `- ${escape(d.title || 'Untitled')}`)),
    '</idea_snapshot>',
  ].join('\n')
}

/**
 * The Refine conversations about an idea (up to `MAX_CONVERSATIONS_PER_IDEA`): each a thread shared by everyone in the publication, in
 * which each person's own AI (key, model and prompt) draws out the writer's points and records them as
 * notes. Anything bigger (a new title, a new idea) it can only propose; accepting is a separate, human step. Design: docs/brainstorming.md.
 */
export class BrainstormService {
  /** One reply at a time per conversation. In memory, which is right while the API is a single process. */
  private readonly replying = new Map<string, { name: string; since: number }>()
  private readonly now: () => number
  private readonly replyTimeoutMs: number
  private readonly checker: ReadingChecker

  constructor(private readonly d: BrainstormDeps) {
    this.now = d.now ?? Date.now
    this.replyTimeoutMs = d.replyTimeoutMs ?? REPLY_TIMEOUT_MS
    this.checker = new ReadingChecker(d.pages)
  }

  // ---- reading --------------------------------------------------------

  list(idea: Idea): ConversationList {
    return {
      conversations: this.d.store.conversations.list(idea.id).map(summary),
    }
  }

  conversation(idea: Idea, conversationId: string): Conversation {
    const record = this.find(idea, conversationId)
    const messages = this.d.store.conversations.messages(record.id)
    return {
      ...summary(record),
      messages: messages.map((m) => this.view(m, idea)),
      replyingNow: this.busy(record.id),
    }
  }

  /** Starts an empty conversation, or hands back the empty one already waiting, so none are made for nothing. */
  create(idea: Idea): ConversationSummary {
    const { conversations } = this.d.store
    const waiting = conversations.emptyOne(idea.id)
    if (waiting) return summary(waiting)
    if (conversations.list(idea.id).length >= MAX_CONVERSATIONS_PER_IDEA) {
      throw fail(
        409,
        `This idea has ${MAX_CONVERSATIONS_PER_IDEA} conversations, the most it can hold. Delete one to start another.`,
      )
    }
    return summary(conversations.get(idea.id, conversations.create(idea.id))!)
  }

  private find(idea: Idea, conversationId: string): ConversationRecord {
    const record = this.d.store.conversations.get(idea.id, conversationId)
    if (!record) throw notFound()
    return record
  }

  // ---- starting a reply -----------------------------------------------

  /**
   * Checks that this reply can go ahead, takes the idea's one reply slot, and stores the person's
   * message. Throws a `DomainError` (or `LlmError`, if they have no key) while an error can still be
   * a normal response. After this returns, the caller must iterate `run` so the slot is released.
   */
  begin(idea: Idea, conversationId: string, user: BrainstormUser, input: SendMessageInput): Turn {
    const { store, limiter } = this.d
    const conversation = this.find(idea, conversationId)
    this.assertNotReplying(conversation.id)

    const existing = store.conversations.messages(conversation.id)
    if (input.start && existing.length > 0) {
      throw fail(409, 'This conversation has already started. Reload the page to see it.')
    }
    if (input.retry && existing.at(-1)?.role !== 'user') {
      throw fail(409, 'There is nothing to try again: the last message already has a reply.')
    }
    if (!limiter.allow(user.id)) {
      throw fail(429, "You're sending messages very quickly. Wait a few minutes and try again.")
    }
    const { llm, provider, model } = this.d.resolveLlm(user.id)
    const system = brainstormSystem()

    this.replying.set(conversation.id, { name: user.name, since: this.now() })
    try {
      const sent = input.retry
        ? undefined
        : this.storeUserTurn(idea, conversation.id, user, input, existing)
      return {
        run: (signal) =>
          this.reply({
            idea,
            conversationId: conversation.id,
            user,
            llm,
            provider,
            model,
            system,
            sent,
            signal,
          }),
      }
    } catch (err) {
      this.replying.delete(conversation.id)
      throw err
    }
  }

  /** One reply at a time per conversation: say who we are waiting for, as an ordinary 409 response. */
  private assertNotReplying(conversationId: string) {
    const busy = this.busy(conversationId)
    if (busy) throw fail(409, `${busy.name} is waiting for a reply. Try again in a moment.`)
  }

  private busy(conversationId: string): { name: string } | null {
    const lock = this.replying.get(conversationId)
    if (!lock) return null
    // A slot nobody released (a reply that never ran) frees itself once the reply could no longer be alive.
    if (this.now() - lock.since > this.replyTimeoutMs + 30_000) {
      this.replying.delete(conversationId)
      return null
    }
    return { name: lock.name }
  }

  /** The turn the person takes: answers to the last suggestions, the idea if it changed, then what they said. */
  private storeUserTurn(
    idea: Idea,
    conversationId: string,
    user: BrainstormUser,
    input: SendMessageInput,
    existing: MessageRecord[],
  ): MessageRecord {
    const { store } = this.d
    const blocks: LLMContentBlock[] = []
    const last = existing.at(-1)
    if (last?.role === 'assistant') blocks.push(...this.toolResults(last, conversationId))

    // Sent only when the idea differs from what the AI last saw, so the thread stays small and cacheable.
    const snapshot = this.snapshot(idea, user.id)
    const changed = snapshot !== store.conversations.lastSnapshot(conversationId)
    if (changed) blocks.push({ type: 'text', text: snapshot })
    blocks.push({ type: 'text', text: input.start ? BRAINSTORM_KICKOFF_PROMPT : input.text! })

    const id = store.conversations.append(idea.id, conversationId, {
      role: 'user',
      kind: input.start ? 'kickoff' : 'message',
      authorId: user.id,
      content: blocks,
      displayText: input.start ? '' : input.text!,
      snapshot: changed ? snapshot : undefined,
    })
    return store.conversations.message(conversationId, id)!
  }

  /** Every tool call in the AI's last message must be answered before it speaks again. */
  private toolResults(assistant: MessageRecord, conversationId: string): LLMContentBlock[] {
    const { conversations } = this.d.store
    const title = conversations.titleOf(conversationId)
    const proposals = new Map(conversations.proposals(assistant.id).map((p) => [p.toolCallId, p]))
    const notes = new Map(conversations.recordedNotes(assistant.id).map((n) => [n.toolCallId, n]))
    return assistant.content.flatMap((block): LLMContentBlock[] => {
      if (block.type !== 'tool_call') return []
      if (block.name === 'name_conversation') {
        const asked = NameConversationToolInputSchema.safeParse(block.input)
        if (!asked.success || title === null) {
          return [
            {
              type: 'tool_result',
              toolCallId: block.id,
              content: 'This could not be used, so nothing was changed.',
              isError: true,
            },
          ]
        }
        const content =
          asked.data.title === title
            ? `The conversation is titled “${title}”.`
            : 'The conversation already has a title, so nothing was changed.'
        return [{ type: 'tool_result', toolCallId: block.id, content, isError: false }]
      }
      const proposal = proposals.get(block.id)
      const note = notes.get(block.id)
      const content = proposal
        ? describeDecision(proposal)
        : note
          ? describeNote(note, block.name)
          : 'This could not be used, so nothing was changed.'
      return [{ type: 'tool_result', toolCallId: block.id, content, isError: !proposal && !note }]
    })
  }

  private snapshot(idea: Idea, userId: string): string {
    const publication = this.d.store.publications.get(idea.publicationId, userId)
    return formatSnapshot({
      idea,
      notes: snapshotNotes(this.d.store, idea),
      publication: {
        name: publication?.name ?? 'this publication',
        siteUrl: publication?.siteUrl ?? null,
        description: usablePublicationDescription(publication),
      },
    })
  }

  // ---- the reply itself -------------------------------------------------

  private async *reply(ctx: ReplyContext): AsyncGenerator<BrainstormEvent> {
    const { idea, conversationId, llm, system, sent } = ctx
    const { store } = this.d
    const deadline = AbortSignal.timeout(this.replyTimeoutMs)
    const signal = AbortSignal.any([ctx.signal, deadline])
    try {
      if (sent) yield { type: 'message', message: this.view(sent, idea) }

      let text = ''
      const calls: Extract<LLMChatEvent, { type: 'tool_call' }>[] = []
      let done: Extract<LLMChatEvent, { type: 'done' }> | undefined
      try {
        const request = {
          system,
          messages: this.replay(store.conversations.messages(conversationId)),
          tools: BRAINSTORM_TOOLS,
          effort: 'medium' as const,
          signal,
        }
        for await (const event of brainstormTurn(llm, request)) {
          if (event.type === 'text') {
            text += event.text
            yield { type: 'text', text: event.text }
          } else if (event.type === 'tool_call') calls.push(event)
          else done = event
        }
      } catch (err) {
        if (ctx.signal.aborted) {
          // The person pressed Stop (or left). Keep what was said, without any half-made suggestions.
          const stopped = text ? this.saveStopped(ctx, text) : undefined
          yield { type: 'done', message: stopped ? this.view(stopped, idea) : null }
          return
        }
        yield this.errorEvent(err, deadline.aborted)
        return
      }

      if (!done || (!text && calls.length === 0 && done.stopReason !== 'refusal')) {
        yield this.errorEvent(new LLMProviderError('The AI sent an empty reply'), false)
        return
      }

      // Look at the addresses the AI suggested before showing them, so the writer sees what is really there.
      const readings = await this.checkReadings(idea, ctx.conversationId, calls, signal)
      if (ctx.signal.aborted) {
        const stopped = text ? this.saveStopped(ctx, text) : undefined
        yield { type: 'done', message: stopped ? this.view(stopped, idea) : null }
        return
      }

      const message = this.saveReply(ctx, text, calls, done, readings)
      const view = this.view(message, idea)
      for (const note of view.notes) yield { type: 'note', note }
      for (const proposal of view.proposals) yield { type: 'proposal', proposal }
      yield { type: 'done', message: view }
    } finally {
      this.replying.delete(conversationId)
    }
  }

  private replay(records: MessageRecord[]): LLMChatMessage[] {
    return records
      .filter((r) => r.content.length > 0) // an empty reply (a refusal) has nothing to replay
      .map((r) => ({ role: r.role, content: r.content }))
  }

  private saveStopped({ idea, conversationId, user, provider, model }: ReplyContext, text: string) {
    const { conversations } = this.d.store
    const id = conversations.append(idea.id, conversationId, {
      role: 'assistant',
      kind: 'message',
      authorId: user.id,
      provider,
      model,
      content: [{ type: 'text', text }],
      displayText: text,
      status: 'stopped',
    })
    return conversations.message(conversationId, id)!
  }

  /** Stores the AI's reply and turns each valid tool call into a proposal. */
  private saveReply(
    { idea, conversationId, user, provider, model }: ReplyContext,
    text: string,
    calls: { id: string; name: string; input: unknown }[],
    done: Extract<LLMChatEvent, { type: 'done' }>,
    readings: Map<string, CheckedReading>,
  ): MessageRecord {
    const { conversations } = this.d.store
    const content: LLMContentBlock[] = [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...calls.map((c) => ({ type: 'tool_call' as const, id: c.id, name: c.name, input: c.input })),
    ]
    const id = conversations.append(idea.id, conversationId, {
      role: 'assistant',
      kind: 'message',
      authorId: user.id,
      provider,
      model,
      content,
      displayText: text,
      stopReason: done.stopReason,
      usage: done.usage,
    })

    this.suggestNotes(id, idea, calls)
    this.nameConversation(conversationId, calls)

    // The AI's input is untrusted: anything that doesn't validate is kept in the history (the model
    // must see its call answered) but never becomes a proposal.
    let made = 0
    for (const call of calls) {
      if (made >= MAX_PROPOSALS_PER_REPLY) break
      const proposal = this.toProposal(call, idea, readings)
      if (!proposal) continue
      conversations.addProposal(id, proposal)
      made++
    }
    return conversations.message(conversationId, id)!
  }

  /**
   * The AI names the conversation on its first reply. The input is untrusted: only a valid title counts, only the
   * first valid call in a reply, and only if there is no title yet (so a person's rename is never overridden).
   */
  private nameConversation(
    conversationId: string,
    calls: { id: string; name: string; input: unknown }[],
  ) {
    for (const call of calls) {
      if (call.name !== 'name_conversation') continue
      const parsed = NameConversationToolInputSchema.safeParse(call.input)
      if (!parsed.success) continue
      this.d.store.conversations.setTitle(conversationId, parsed.data.title, 'ai')
      return
    }
  }

  /**
   * Turns the points the AI suggested as notes into suggestions, which a person adds or ignores (nothing is added
   * here). The input is untrusted: only valid text is used, at most `MAX_NOTES_PER_REPLY` per reply, and a point the
   * idea already has (ignoring case and closing punctuation), a repeat within the reply, or a full idea is recorded
   * as not suggested, so the AI can be told why.
   */
  private suggestNotes(
    messageId: string,
    idea: Idea,
    calls: { id: string; name: string; input: unknown }[],
  ) {
    const { conversations, notes } = this.d.store
    const have = new Set(notes.list(idea.id).map((n) => noteKey(n.text)))
    const full = notes.count(idea.id) >= MAX_IDEA_NOTES
    let handled = 0
    for (const call of calls) {
      if (call.name !== 'suggest_note' || handled >= MAX_NOTES_PER_REPLY) continue
      const parsed = SuggestNoteToolInputSchema.safeParse(call.input)
      if (!parsed.success) continue
      handled++
      const { text } = parsed.data
      const key = noteKey(text)
      if (have.has(key)) {
        conversations.addRecordedNote(messageId, {
          toolCallId: call.id,
          text,
          outcome: 'duplicate',
        })
      } else if (full) {
        conversations.addRecordedNote(messageId, { toolCallId: call.id, text, outcome: 'full' })
      } else {
        conversations.addProposal(messageId, {
          toolCallId: call.id,
          tool: 'suggest_note',
          input: { text },
          base: null,
        })
        have.add(key)
      }
    }
  }

  /**
   * Checks the pages the AI suggested (at most `MAX_READING_SUGGESTIONS_PER_REPLY`), keyed by the call that
   * suggested them. A call whose input is invalid, or whose page is already on the list, has no entry.
   */
  private async checkReadings(
    idea: Idea,
    conversationId: string,
    calls: { id: string; name: string; input: unknown }[],
    signal: AbortSignal,
  ): Promise<Map<string, CheckedReading>> {
    // The coach cannot search, so it may only pass on an address a person wrote in this conversation.
    const given = addressesWrittenBy(this.d.store.conversations.messages(conversationId))
    const candidates = calls
      .filter((c) => c.name === 'suggest_reading')
      .map((c) => {
        const parsed = SuggestReadingToolInputSchema.safeParse(c.input)
        return parsed.success && given.has(linkKey(parsed.data.url))
          ? { ref: c.id, ...parsed.data }
          : { ref: c.id, url: undefined, title: '', why: '' }
      })
    const checked = await this.checker.check(
      idea,
      candidates,
      MAX_READING_SUGGESTIONS_PER_REPLY,
      signal,
    )
    return new Map(checked.map((reading) => [reading.ref, reading]))
  }

  private toProposal(
    call: { id: string; name: string; input: unknown },
    idea: Idea,
    readings: Map<string, CheckedReading>,
  ): Pick<ProposalRecord, 'toolCallId' | 'tool' | 'input' | 'base' | 'reading'> | undefined {
    if (call.name === 'suggest_reading') {
      const r = readings.get(call.id)
      if (!r) return undefined
      return {
        toolCallId: call.id,
        tool: 'suggest_reading',
        input: { url: r.url, title: r.title, why: r.why },
        base: null,
        reading: {
          check: r.check,
          fetchedTitle: r.fetchedTitle,
          fetchedAuthors: r.fetchedAuthors,
        },
      }
    }
    if (call.name === 'update_idea') {
      const parsed = UpdateIdeaToolInputSchema.safeParse(call.input)
      if (!parsed.success) return undefined
      const { name } = parsed.data
      // A suggestion that repeats the title back is not a suggestion.
      if (name === idea.name) return undefined
      return {
        toolCallId: call.id,
        tool: 'update_idea',
        input: { name },
        base: { name: idea.name },
        reading: null,
      }
    }
    if (call.name === 'create_idea') {
      const parsed = CreateIdeaToolInputSchema.safeParse(call.input)
      if (!parsed.success) return undefined
      return {
        toolCallId: call.id,
        tool: 'create_idea',
        input: parsed.data,
        base: null,
        reading: null,
      }
    }
    return undefined
  }

  /** Says what went wrong in terms a person can act on, and logs only the kind of failure. */
  private errorEvent(err: unknown, timedOut: boolean): BrainstormEvent {
    if (timedOut) {
      return {
        type: 'error',
        code: 'timeout',
        message: 'The AI took too long to reply. Try again.',
      }
    }
    if (err instanceof LLMAuthError) {
      return {
        type: 'error',
        code: 'auth',
        message:
          'Your AI provider rejected your API key. Update it in your account settings, then try again.',
      }
    }
    if (err instanceof LLMRateLimitError) {
      const wait = err.retryAfterSeconds
      return {
        type: 'error',
        code: 'rate_limit',
        message: `Your AI provider is limiting requests for your key right now. Try again ${wait ? `in about ${wait} seconds` : 'in a minute'}.`,
        ...(wait && { retryAfterSeconds: wait }),
      }
    }
    if (err instanceof LLMProviderError) {
      return {
        type: 'error',
        code: 'provider',
        message: 'The AI provider had a problem. Try again in a moment.',
      }
    }
    // Never log the error's message or the request: they may hold the person's writing.
    this.d.logger?.error('brainstorm reply failed:', err instanceof Error ? err.name : typeof err)
    return {
      type: 'error',
      code: 'unknown',
      message: 'Something went wrong while the AI was replying. Try again.',
    }
  }

  // ---- deciding on suggestions -------------------------------------------

  /** Applies a suggestion. Anyone in the publication can; the first to decide wins. */
  accept(
    idea: Idea,
    conversationId: string,
    proposalId: string,
    user: BrainstormUser,
    overwrite = false,
  ): Proposal {
    const { store } = this.d
    const proposal = store.conversations.proposal(this.find(idea, conversationId).id, proposalId)
    if (!proposal) throw fail(404, 'Not found')
    if (proposal.status !== 'pending') {
      throw fail(409, `This suggestion was already ${proposal.status}.`)
    }
    if (this.isStale(proposal, idea) && !overwrite) {
      throw fail(
        409,
        'The idea has changed since this was suggested. Check what would be replaced, then apply it anyway if you still want it.',
      )
    }

    store.transaction(() => {
      let createdIdeaId: string | undefined
      if (proposal.tool === 'suggest_note') {
        this.addSuggestedNote(idea, proposal, user)
      } else if (proposal.tool === 'suggest_reading') {
        this.addSuggestedReading(idea, proposal)
      } else if (proposal.tool === 'update_idea') {
        // Threads from before notes were recorded directly may carry notes; they are no longer applied.
        store.ideas.update(idea.publicationId, idea.id, { name: proposal.input.name })
      } else {
        const { name, notes } = CreateIdeaToolInputSchema.parse(proposal.input)
        createdIdeaId = store.ideas.create(
          idea.publicationId,
          user.id,
          { name, notes },
          'brainstorm',
        ).id
      }
      if (!store.conversations.decide(proposal.id, 'accepted', user.id, createdIdeaId)) {
        throw fail(409, 'This suggestion was just decided by someone else.')
      }
    })
    return this.viewProposal(store.conversations.proposal(conversationId, proposalId)!, idea)
  }

  /**
   * Adds a suggested note, in the name of the person it is credited to. The notes are looked at again now: the writer may
   * have written the same point meanwhile, or the idea may have filled up. A refusal leaves the suggestion waiting.
   */
  private addSuggestedNote(idea: Idea, proposal: ProposalRecord, user: BrainstormUser) {
    const { notes, ideas } = this.d.store
    const text = proposal.input.text
    if (!text) throw fail(404, 'Not found')
    if (notes.list(idea.id).some((n) => noteKey(n.text) === noteKey(text))) {
      throw fail(409, 'That point is already in your notes. Ignore this suggestion.')
    }
    if (notes.count(idea.id) >= MAX_IDEA_NOTES) {
      throw fail(
        409,
        `An idea can have up to ${MAX_IDEA_NOTES} notes. Delete or merge some to make room.`,
      )
    }
    // Credited to whoever prompted or last edited it, not whoever adds it (older suggestions have no one).
    notes.append(idea.publicationId, idea.id, proposal.authorId ?? user.id, text, 'brainstorm')
    ideas.touch(idea.id)
  }

  /**
   * Puts a suggested page on the idea's reading list, marked with where it came from. The checks made when it
   * was suggested stand (a page that doesn't exist, or isn't public, can only be dismissed), and the list is
   * looked at again now: it may have filled up, or the writer may have added the page themselves meanwhile.
   * The page's own title is used when it had one; otherwise the AI's, which the writer saw labelled as such.
   */
  private addSuggestedReading(idea: Idea, proposal: ProposalRecord) {
    const { store } = this.d
    const reading = proposal.reading
    const { url, title } = proposal.input
    if (!reading || !url) throw fail(404, 'Not found')
    if (reading.check === 'not-found') {
      throw fail(
        409,
        "We couldn't find a website at that address, so it can't be added. Dismiss this suggestion.",
      )
    }
    if (reading.check === 'not-public') {
      throw fail(
        409,
        "That address isn't a public website, so it can't be added. Dismiss this suggestion.",
      )
    }
    const current = store.ideas.get(idea.publicationId, idea.id) ?? idea
    if (current.links.some((l) => linkKey(l.url) === linkKey(url))) {
      throw fail(409, 'That link is already in this idea. Dismiss this suggestion.')
    }
    if (current.links.length >= MAX_IDEA_LINKS) {
      throw fail(
        409,
        `An idea can have up to ${MAX_IDEA_LINKS} links. Remove one you no longer need to make room.`,
      )
    }
    store.ideas.addLink(
      idea.id,
      {
        url,
        title: reading.fetchedTitle ?? title ?? '',
        authors: reading.fetchedAuthors,
        why: proposal.input.why,
      },
      'brainstorm',
    )
  }

  dismiss(idea: Idea, conversationId: string, proposalId: string, user: BrainstormUser): Proposal {
    const { conversations } = this.d.store
    const proposal = conversations.proposal(this.find(idea, conversationId).id, proposalId)
    if (!proposal) throw fail(404, 'Not found')
    if (!conversations.decide(proposal.id, 'dismissed', user.id)) {
      throw fail(409, `This suggestion was already ${proposal.status}.`)
    }
    return this.viewProposal(conversations.proposal(conversationId, proposalId)!, idea)
  }

  /**
   * Changes what a suggestion says while it is still waiting, so the edit is what gets added (and what other
   * members see). A note's text, or an idea's name and starting notes; a suggested page cannot be edited.
   */
  edit(
    idea: Idea,
    conversationId: string,
    proposalId: string,
    changes: { text?: string; name?: string; notes?: string },
    user: BrainstormUser,
  ): Proposal {
    const { conversations } = this.d.store
    const proposal = conversations.proposal(this.find(idea, conversationId).id, proposalId)
    if (!proposal) throw notFound()
    if (proposal.status !== 'pending') {
      throw fail(409, `This suggestion was already ${proposal.status}, so it can't be changed.`)
    }
    const input = { ...proposal.input }
    if (proposal.tool === 'suggest_note') {
      if (changes.text === undefined) throw fail(400, 'Write something in the note')
      input.text = changes.text
    } else if (proposal.tool === 'create_idea') {
      if (changes.name === undefined && changes.notes === undefined) {
        throw fail(400, 'Change the name or the notes')
      }
      if (changes.name !== undefined) input.name = changes.name
      if (changes.notes !== undefined) input.notes = changes.notes
    } else if (proposal.tool === 'update_idea') {
      if (changes.name === undefined) throw fail(400, 'Write the new title')
      input.name = changes.name
    } else {
      throw fail(409, "A suggested page can't be changed. Ignore it, or add it as it is.")
    }
    if (!conversations.updateInput(proposal.id, input, user.id)) {
      throw fail(409, 'This suggestion was just decided by someone else.')
    }
    return this.viewProposal(conversations.proposal(conversationId, proposalId)!, idea)
  }

  /** Brings back a suggestion that was ignored, so it can be decided again. */
  reconsider(idea: Idea, conversationId: string, proposalId: string): Proposal {
    const { conversations } = this.d.store
    const proposal = conversations.proposal(this.find(idea, conversationId).id, proposalId)
    if (!proposal) throw notFound()
    if (!conversations.reopen(proposal.id)) {
      throw fail(409, 'Only a suggestion that was ignored can be brought back.')
    }
    return this.viewProposal(conversations.proposal(conversationId, proposalId)!, idea)
  }

  /** A person gives a conversation a title of their own; the AI never changes it after that. */
  rename(idea: Idea, conversationId: string, title: string): ConversationSummary {
    const { conversations } = this.d.store
    const record = this.find(idea, conversationId)
    conversations.setTitle(record.id, title, 'writer')
    return summary(conversations.get(idea.id, record.id)!)
  }

  /** Deletes one conversation, for everyone, with the suggestions made in it. The others are untouched. */
  delete(idea: Idea, conversationId: string) {
    const record = this.find(idea, conversationId)
    this.assertNotReplying(record.id)
    this.d.store.conversations.delete(record.id)
  }

  // ---- presenting ----------------------------------------------------------

  private view(m: MessageRecord, idea: Idea): ConversationMessage {
    const proposals = this.d.store.conversations
      .proposals(m.id)
      .map((p) => this.viewProposal(p, idea))
    return {
      id: m.id,
      role: m.role,
      kind: m.kind,
      text: m.kind === 'kickoff' ? '' : m.displayText,
      authorName: m.role === 'user' ? m.authorName : null,
      model: m.role === 'assistant' ? m.model : null,
      status: m.status,
      stopReason: m.stopReason,
      proposals,
      notes: this.d.store.conversations
        .recordedNotes(m.id)
        .map(({ messageId: _m, toolCallId: _t, ...note }) => note),
      createdAt: m.createdAt,
    }
  }

  private viewProposal(p: ProposalRecord, idea: Idea): Proposal {
    return {
      id: p.id,
      tool: p.tool,
      input: p.input,
      reading: p.reading,
      status: p.status,
      stale: p.status === 'pending' && this.isStale(p, idea),
      createdIdeaId: p.createdIdeaId,
      decidedByName: p.decidedByName,
      decidedAt: p.decidedAt,
      edited: p.edited,
    }
  }

  /** A title suggestion made against a title that has since been changed. */
  private isStale(p: ProposalRecord, idea: Idea): boolean {
    if (p.tool !== 'update_idea' || !p.base) return false
    return p.input.name !== undefined && p.base.name !== idea.name
  }
}

/**
 * The web addresses people wrote in the thread, as `linkKey`s. The coach may suggest a page for the reading list
 * only if its address is one of these: it has no way to look anything up, so any other address is its memory.
 */
export function addressesWrittenBy(messages: MessageRecord[]): Set<string> {
  const keys = new Set<string>()
  for (const m of messages) {
    if (m.role !== 'user') continue
    for (const found of m.displayText.match(/(?:https?:\/\/|www\.)[^\s<>"'`)\]]+/gi) ?? []) {
      try {
        keys.add(linkKey(found.replace(/[.,;:!?]+$/, '')))
      } catch {
        // not an address after all
      }
    }
  }
  return keys
}

/** What the AI is told about a point it recorded when it next speaks. */
function describeNote(n: RecordedNoteRecord, tool: string): string {
  // `add_note` is how notes were recorded before they were suggested (#295): old threads still hold such calls.
  const verb = tool === 'suggest_note' ? 'suggested' : 'recorded'
  switch (n.outcome) {
    case 'added':
      return 'Recorded as a note.'
    case 'duplicate':
      return `Not ${verb}: the idea already has this point in its notes.`
    case 'full':
      return `Not ${verb}: the idea already has as many notes as it can hold.`
  }
}

/** What the AI is told about a suggestion when it next speaks. */
function describeDecision(p: ProposalRecord): string {
  if (p.tool === 'suggest_note') {
    switch (p.status) {
      case 'accepted':
        return `The writer added this to the notes: “${p.input.text ?? ''}”`
      case 'dismissed':
        return 'The writer ignored this suggestion. Nothing was added.'
      case 'pending':
        return 'The writer has not decided on this suggestion yet. Nothing has been added to the notes.'
    }
  }
  switch (p.status) {
    case 'accepted':
      return p.tool === 'create_idea'
        ? 'The writer accepted this suggestion, and the new idea was created.'
        : p.tool === 'suggest_reading'
          ? 'The writer accepted this suggestion, and the page was added to their reading list.'
          : 'The writer accepted this suggestion, and the title was changed.'
    case 'dismissed':
      return 'The writer dismissed this suggestion. Nothing was changed.'
    case 'pending':
      return `The writer has not decided on this suggestion yet. Nothing has been changed.${describeCheck(p)}`
  }
}

/** Tells the AI when the app could not find what it suggested, so it stops offering addresses it cannot vouch for. */
function describeCheck(p: ProposalRecord): string {
  if (p.reading?.check === 'not-found') {
    return ' The app could not find a website at that address, so it probably does not exist.'
  }
  if (p.reading?.check === 'not-public') return ' That address is not a public website.'
  return ''
}
