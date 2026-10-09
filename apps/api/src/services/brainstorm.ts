import { HTTPException } from 'hono/http-exception'
import {
  CreateIdeaToolInputSchema,
  LLMAuthError,
  LLMProviderError,
  LLMRateLimitError,
  llmTool,
  MAX_PROPOSALS_PER_REPLY,
  UpdateIdeaToolInputSchema,
  type BrainstormEvent,
  type Conversation,
  type ConversationMessage,
  type Idea,
  type LLMChatEvent,
  type LLMChatMessage,
  type LLMContentBlock,
  type LLMProvider,
  type Proposal,
  type SendMessageInput,
} from '@lfwa/core'
import {
  BRAINSTORM_KICKOFF_PROMPT,
  BRAINSTORM_RULES_PROMPT,
  CREATE_IDEA_TOOL_PROMPT,
  UPDATE_IDEA_TOOL_PROMPT,
} from '@lfwa/prompts'
import type { RateLimiter } from '../auth/rate-limit'
import type { MessageRecord, ProposalRecord } from '../db/conversations'
import type { Store } from '../db/store'
import type { BrainstormPromptService } from './brainstorm-prompt'

/** A reply that takes longer than this is abandoned (and its lock freed). */
export const REPLY_TIMEOUT_MS = 180_000

/** The two things the AI may suggest. Both only ever become proposals a person accepts. */
const TOOLS = [
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
]

export interface BrainstormDeps {
  store: Store
  prompts: BrainstormPromptService
  /** The person's own LLM (their key and model), and what to record about it. Throws `LlmError` if none. */
  resolveLlm: (userId: string) => { llm: LLMProvider; provider: string; model: string }
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
  user: BrainstormUser
  llm: LLMProvider
  provider: string
  model: string
  system: string
  /** The person's message stored for this reply; absent when retrying one that was already stored. */
  sent: MessageRecord | undefined
  signal: AbortSignal
}

/** A reply that has been accepted for processing; `run` does the work and streams events. */
export interface Turn {
  run(signal: AbortSignal): AsyncIterable<BrainstormEvent>
}

const fail = (status: 400 | 404 | 409 | 429, message: string) =>
  new HTTPException(status, { message })

/** Keeps text we insert from closing or imitating the snapshot's own tags. */
const escape = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface Venue {
  name: string
  siteUrl: string | null
}
interface Reader {
  name: string
  description: string
}

/**
 * What the AI is shown of the idea. Everything in it is the writer's own words or text from other
 * websites, i.e. untrusted: it is escaped, and `prompts/brainstorm-rules.md` tells the AI to treat it as
 * material to discuss, never as instructions. Only the titles of drafts are included, never their text.
 */
export function formatSnapshot(input: { idea: Idea; venue: Venue; readers: Reader[] }): string {
  const { idea, venue, readers } = input
  const list = (items: string[]) => (items.length ? items : ['(none yet)'])
  return [
    '<idea_snapshot>',
    `Idea title: ${escape(idea.name)}`,
    'Notes:',
    idea.notes.trim() ? escape(idea.notes) : '(none yet)',
    '',
    'Related links the writer has saved:',
    ...list(idea.links.map((l) => `- ${l.title ? `${escape(l.title)}: ` : ''}${escape(l.url)}`)),
    '',
    `Publication: ${escape(venue.name)}${venue.siteUrl ? ` (${escape(venue.siteUrl)})` : ''}`,
    'Readers of the publication:',
    ...(readers.length
      ? readers.map((r) => `- ${escape(r.name)}: ${escape(r.description)}`)
      : ['(not described yet)']),
    '',
    'Drafts that already exist (titles only):',
    ...list(idea.drafts.map((d) => `- ${escape(d.title || 'Untitled')}`)),
    '</idea_snapshot>',
  ].join('\n')
}

/**
 * The brainstorming conversation about an idea: one thread shared by everyone in the profile, in
 * which each person's own AI (key, model and prompt) acts as a commissioning editor. The AI can only
 * propose changes; accepting is a separate, human step. Design: docs/brainstorming.md.
 */
export class BrainstormService {
  /** One reply at a time per idea. In memory, which is right while the API is a single process. */
  private readonly replying = new Map<string, { name: string; since: number }>()
  private readonly now: () => number
  private readonly replyTimeoutMs: number

  constructor(private readonly d: BrainstormDeps) {
    this.now = d.now ?? Date.now
    this.replyTimeoutMs = d.replyTimeoutMs ?? REPLY_TIMEOUT_MS
  }

  // ---- reading --------------------------------------------------------

  conversation(idea: Idea): Conversation {
    const messages = this.d.store.conversations.messages(idea.id)
    return {
      messages: messages.map((m) => this.view(m, idea)),
      replyingNow: this.busy(idea.id),
    }
  }

  // ---- starting a reply -----------------------------------------------

  /**
   * Checks that this reply can go ahead, takes the idea's one reply slot, and stores the person's
   * message. Throws an `HTTPException` (or `LlmError`, if they have no key) while an error can still be
   * a normal response. After this returns, the caller must iterate `run` so the slot is released.
   */
  begin(idea: Idea, user: BrainstormUser, input: SendMessageInput): Turn {
    const { store, limiter } = this.d
    this.assertNotReplying(idea.id)

    const existing = store.conversations.messages(idea.id)
    if (input.start && existing.length > 0) {
      throw fail(409, 'This idea already has a conversation. Reload the page to see it.')
    }
    if (input.retry && existing.at(-1)?.role !== 'user') {
      throw fail(409, 'There is nothing to try again: the last message already has a reply.')
    }
    if (!limiter.allow(user.id)) {
      throw fail(429, "You're sending messages very quickly. Wait a few minutes and try again.")
    }
    const { llm, provider, model } = this.d.resolveLlm(user.id)
    const system = `${this.d.prompts.effective(user.id)}\n\n${BRAINSTORM_RULES_PROMPT}`

    this.replying.set(idea.id, { name: user.name, since: this.now() })
    try {
      const sent = input.retry ? undefined : this.storeUserTurn(idea, user, input, existing)
      return {
        run: (signal) => this.reply({ idea, user, llm, provider, model, system, sent, signal }),
      }
    } catch (err) {
      this.replying.delete(idea.id)
      throw err
    }
  }

  /** One reply at a time per idea: say who we are waiting for, as an ordinary 409 response. */
  private assertNotReplying(ideaId: string) {
    const busy = this.busy(ideaId)
    if (busy) throw fail(409, `${busy.name} is waiting for a reply. Try again in a moment.`)
  }

  private busy(ideaId: string): { name: string } | null {
    const lock = this.replying.get(ideaId)
    if (!lock) return null
    // A slot nobody released (a reply that never ran) frees itself once the reply could no longer be alive.
    if (this.now() - lock.since > this.replyTimeoutMs + 30_000) {
      this.replying.delete(ideaId)
      return null
    }
    return { name: lock.name }
  }

  /** The turn the person takes: answers to the last suggestions, the idea if it changed, then what they said. */
  private storeUserTurn(
    idea: Idea,
    user: BrainstormUser,
    input: SendMessageInput,
    existing: MessageRecord[],
  ): MessageRecord {
    const { store } = this.d
    const blocks: LLMContentBlock[] = []
    const last = existing.at(-1)
    if (last?.role === 'assistant') blocks.push(...this.toolResults(last))

    // Sent only when the idea differs from what the AI last saw, so the thread stays small and cacheable.
    const snapshot = this.snapshot(idea, user.id)
    const changed = snapshot !== store.conversations.lastSnapshot(idea.id)
    if (changed) blocks.push({ type: 'text', text: snapshot })
    blocks.push({ type: 'text', text: input.start ? BRAINSTORM_KICKOFF_PROMPT : input.text! })

    const id = store.conversations.append(idea.id, {
      role: 'user',
      kind: input.start ? 'kickoff' : 'message',
      authorId: user.id,
      content: blocks,
      displayText: input.start ? '' : input.text!,
      snapshot: changed ? snapshot : undefined,
    })
    return store.conversations.message(idea.id, id)!
  }

  /** The AI's suggestions in its last message must each be answered before it speaks again. */
  private toolResults(assistant: MessageRecord): LLMContentBlock[] {
    const byCall = new Map(
      this.d.store.conversations.proposals(assistant.id).map((p) => [p.toolCallId, p]),
    )
    return assistant.content.flatMap((block): LLMContentBlock[] => {
      if (block.type !== 'tool_call') return []
      const proposal = byCall.get(block.id)
      return [
        {
          type: 'tool_result',
          toolCallId: block.id,
          content: proposal
            ? describeDecision(proposal)
            : 'This suggestion could not be used, so nothing was changed.',
          isError: !proposal,
        },
      ]
    })
  }

  private snapshot(idea: Idea, userId: string): string {
    const profile = this.d.store.profiles.get(idea.profileId, userId)
    return formatSnapshot({
      idea,
      venue: { name: profile?.name ?? 'this publication', siteUrl: profile?.siteUrl ?? null },
      // Audience descriptions arrive with T16; until then the AI is told there are none and asks.
      readers: [],
    })
  }

  // ---- the reply itself -------------------------------------------------

  private async *reply(ctx: ReplyContext): AsyncGenerator<BrainstormEvent> {
    const { idea, llm, system, sent } = ctx
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
          messages: this.replay(store.conversations.messages(idea.id)),
          tools: TOOLS,
          effort: 'medium' as const,
          signal,
        }
        for await (const event of llm.chat(request)) {
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

      const message = this.saveReply(ctx, text, calls, done)
      const view = this.view(message, idea)
      for (const proposal of view.proposals) yield { type: 'proposal', proposal }
      yield { type: 'done', message: view }
    } finally {
      this.replying.delete(idea.id)
    }
  }

  private replay(records: MessageRecord[]): LLMChatMessage[] {
    return records
      .filter((r) => r.content.length > 0) // an empty reply (a refusal) has nothing to replay
      .map((r) => ({ role: r.role, content: r.content }))
  }

  private saveStopped({ idea, user, provider, model }: ReplyContext, text: string) {
    const { conversations } = this.d.store
    const id = conversations.append(idea.id, {
      role: 'assistant',
      kind: 'message',
      authorId: user.id,
      provider,
      model,
      content: [{ type: 'text', text }],
      displayText: text,
      status: 'stopped',
    })
    return conversations.message(idea.id, id)!
  }

  /** Stores the AI's reply and turns each valid tool call into a proposal. */
  private saveReply(
    { idea, user, provider, model }: ReplyContext,
    text: string,
    calls: { id: string; name: string; input: unknown }[],
    done: Extract<LLMChatEvent, { type: 'done' }>,
  ): MessageRecord {
    const { conversations } = this.d.store
    const content: LLMContentBlock[] = [
      ...(text ? [{ type: 'text' as const, text }] : []),
      ...calls.map((c) => ({ type: 'tool_call' as const, id: c.id, name: c.name, input: c.input })),
    ]
    const id = conversations.append(idea.id, {
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

    // The AI's input is untrusted: anything that doesn't validate is kept in the history (the model
    // must see its call answered) but never becomes a proposal.
    let made = 0
    for (const call of calls) {
      if (made >= MAX_PROPOSALS_PER_REPLY) break
      const proposal = this.toProposal(call, idea)
      if (!proposal) continue
      conversations.addProposal(id, proposal)
      made++
    }
    return conversations.message(idea.id, id)!
  }

  private toProposal(
    call: { id: string; name: string; input: unknown },
    idea: Idea,
  ): Pick<ProposalRecord, 'toolCallId' | 'tool' | 'input' | 'base'> | undefined {
    if (call.name === 'update_idea') {
      const parsed = UpdateIdeaToolInputSchema.safeParse(call.input)
      if (!parsed.success) return undefined
      const { name, notes } = parsed.data
      // Only what would actually change: a suggestion that repeats the idea back is not a suggestion.
      const input = {
        ...(name !== undefined && name !== idea.name && { name }),
        ...(notes !== undefined && notes !== idea.notes && { notes }),
      }
      if (Object.keys(input).length === 0) return undefined
      return {
        toolCallId: call.id,
        tool: 'update_idea',
        input,
        base: { name: idea.name, notes: idea.notes },
      }
    }
    if (call.name === 'create_idea') {
      const parsed = CreateIdeaToolInputSchema.safeParse(call.input)
      if (!parsed.success) return undefined
      return { toolCallId: call.id, tool: 'create_idea', input: parsed.data, base: null }
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

  /** Applies a suggestion. Anyone in the profile can; the first to decide wins. */
  accept(idea: Idea, proposalId: string, user: BrainstormUser, overwrite = false): Proposal {
    const { store } = this.d
    const proposal = store.conversations.proposal(idea.id, proposalId)
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
      if (proposal.tool === 'update_idea') {
        store.ideas.update(idea.profileId, idea.id, proposal.input)
      } else {
        const { name, notes } = CreateIdeaToolInputSchema.parse(proposal.input)
        createdIdeaId = store.ideas.create(idea.profileId, user.id, { name, notes }).id
      }
      if (!store.conversations.decide(proposal.id, 'accepted', user.id, createdIdeaId)) {
        throw fail(409, 'This suggestion was just decided by someone else.')
      }
    })
    return this.viewProposal(store.conversations.proposal(idea.id, proposalId)!, idea)
  }

  dismiss(idea: Idea, proposalId: string, user: BrainstormUser): Proposal {
    const { conversations } = this.d.store
    const proposal = conversations.proposal(idea.id, proposalId)
    if (!proposal) throw fail(404, 'Not found')
    if (!conversations.decide(proposal.id, 'dismissed', user.id)) {
      throw fail(409, `This suggestion was already ${proposal.status}.`)
    }
    return this.viewProposal(conversations.proposal(idea.id, proposalId)!, idea)
  }

  /** Throws the whole thread away, for everyone, so brainstorming can begin afresh. */
  restart(idea: Idea) {
    this.assertNotReplying(idea.id)
    this.d.store.conversations.deleteAll(idea.id)
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
      createdAt: m.createdAt,
    }
  }

  private viewProposal(p: ProposalRecord, idea: Idea): Proposal {
    return {
      id: p.id,
      tool: p.tool,
      input: p.input,
      status: p.status,
      stale: p.status === 'pending' && this.isStale(p, idea),
      createdIdeaId: p.createdIdeaId,
      decidedByName: p.decidedByName,
      decidedAt: p.decidedAt,
    }
  }

  /** Only the fields a suggestion would replace count: editing the title doesn't stale a notes suggestion. */
  private isStale(p: ProposalRecord, idea: Idea): boolean {
    if (p.tool !== 'update_idea' || !p.base) return false
    return (
      (p.input.name !== undefined && p.base.name !== idea.name) ||
      (p.input.notes !== undefined && p.base.notes !== idea.notes)
    )
  }
}

/** What the AI is told about a suggestion when it next speaks. */
function describeDecision(p: ProposalRecord): string {
  switch (p.status) {
    case 'accepted':
      return p.tool === 'create_idea'
        ? 'The writer accepted this suggestion, and the new idea was created.'
        : 'The writer accepted this suggestion, and the idea was updated.'
    case 'dismissed':
      return 'The writer dismissed this suggestion. Nothing was changed.'
    case 'pending':
      return 'The writer has not decided on this suggestion yet. Nothing has been changed.'
  }
}
