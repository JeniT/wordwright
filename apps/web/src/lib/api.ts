import {
  AcceptInvitationResultSchema,
  AuthConfigSchema,
  BrainstormEventSchema,
  CommentSchema,
  ConversationSchema,
  CritiqueSettingsSchema,
  TutorialStateSchema,
  type TutorialUpdate,
  SignedInDevicesSchema,
  SignedOutOthersSchema,
  CritiqueStateSchema,
  DraftInsertionSchema,
  DraftSchema,
  HandoverStateSchema,
  DraftReviewersSchema,
  PublicationAttentionSchema,
  ReviewAcceptedSchema,
  ReviewDetailSchema,
  ReviewInvitationPreviewSchema,
  ReviewSummarySchema,
  type ReviewerRegisterInput,
  type SendForReviewInput,
  HandleAvailabilitySchema,
  IdeaLinkSchema,
  IdeaNoteSchema,
  IdeaSchema,
  IdeaSummarySchema,
  InvitationBlocksSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  LlmModelsSchema,
  LlmSettingsSchema,
  PublicationSchema,
  ProposalSchema,
  RephraseResultSchema,
  ResearchRunSchema,
  ResearchRunsSchema,
  SourceChoicesSchema,
  MoveIdeasPreviewSchema,
  MoveIdeasResultSchema,
  MoveResultSchema,
  type MoveTarget,
  PostDecisionSchema,
  RecentPostsSchema,
  SourceItemsSchema,
  SourceListSchema,
  SourceSchema,
  UserSchema,
  type BrainstormEvent,
  type CommentInput,
  type DraftInput,
  type DraftSave,
  type DraftInsertionInput,
  type IdeaInput,
  type IdeaUpdate,
  type LlmSettingsInput,
  type LoginInput,
  type OptionUseInput,
  type PublicationInput,
  type PublicationRole,
  type PublicationDescriptionInput,
  type PublicationUpdate,
  type RegisterInput,
  type RephraseRequest,
  type SendMessageInput,
} from '@wordwright/core'
import type { z } from 'zod'
import { readSse } from './sse'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface ApiOptions {
  fetch?: typeof fetch
}

/**
 * Thin typed client. Authentication is an HttpOnly session cookie managed by the browser, so
 * there are no tokens in JS. Responses are validated with the schemas shared from @wordwright/core.
 */
export function createApi({ fetch: fetchImpl = (...a) => fetch(...a) }: ApiOptions = {}) {
  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const res = await fetchImpl(`/api${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    return checked(res)
  }
  /** Sends a file as the whole request body (not multipart), as the publication image endpoint expects. */
  async function sendFile(method: string, path: string, file: File): Promise<Response> {
    const res = await fetchImpl(`/api${path}`, {
      method,
      headers: { 'content-type': file.type || 'application/octet-stream' },
      body: file,
    })
    return checked(res)
  }
  async function checked(res: Response): Promise<Response> {
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { error?: string } | null
      throw new ApiError(res.status, detail?.error ?? `Request failed (${res.status})`)
    }
    return res
  }
  const get = async <T>(schema: z.ZodType<T>, method: string, path: string, body?: unknown) =>
    schema.parse(await (await send(method, path, body)).json())
  const act = async (method: string, path: string, body?: unknown) => {
    await send(method, path, body)
  }

  /** An export is a file: its name comes from the server, which makes it from ids and a date. */
  const download = async (path: string) => {
    const res = await send('GET', path)
    const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1]
    return { filename: filename ?? 'wordwright-export.zip', blob: await res.blob() }
  }

  const PublicationList = PublicationSchema.array()
  const drafts = (publicationId: string) => `/publications/${publicationId}/drafts`
  const ideas = (publicationId: string) => `/publications/${publicationId}/ideas`
  /** An idea's notes, or (no idea) the publication's own. */
  const notesPath = (publicationId: string, ideaId: string | null) =>
    ideaId ? `${ideas(publicationId)}/${ideaId}/notes` : `/publications/${publicationId}/notes`
  const research = (publicationId: string, ideaId: string) =>
    `${ideas(publicationId)}/${ideaId}/research`
  const conversation = (publicationId: string, ideaId: string) =>
    `${ideas(publicationId)}/${ideaId}/conversation`

  return {
    // auth
    authConfig: () => get(AuthConfigSchema, 'GET', '/auth/config'),
    me: () => get(UserSchema, 'GET', '/auth/me'),
    register: (input: RegisterInput) => get(UserSchema, 'POST', '/auth/register', input),
    /** Whether a username is free (the server also checks again when the account is created). */
    handleAvailable: (handle: string) =>
      get(
        HandleAvailabilitySchema,
        'GET',
        `/auth/handle-available?handle=${encodeURIComponent(handle)}`,
      ),
    login: (input: LoginInput) => get(UserSchema, 'POST', '/auth/login', input),
    logout: () => act('POST', '/auth/logout', {}),
    verifyEmail: (token: string) => act('POST', '/auth/verify-email', { token }),
    resendVerification: () => act('POST', '/auth/resend-verification', {}),
    forgotPassword: (email: string) => act('POST', '/auth/forgot-password', { email }),
    resetPassword: (token: string, password: string) =>
      act('POST', '/auth/reset-password', { token, password }),
    changePassword: (currentPassword: string, newPassword: string) =>
      act('POST', '/account/password', { currentPassword, newPassword }),
    /** Sets the name other people see. Answers with the updated user. */
    changeName: (name: string) => get(UserSchema, 'PUT', '/account/name', { name }),
    /** Sets the username (or confirms the current one). Answers with the updated user. */
    changeHandle: (handle: string) => get(UserSchema, 'PUT', '/account/handle', { handle }),
    changeEmail: (newEmail: string, password: string) =>
      act('POST', '/account/email', { newEmail, password }),
    confirmEmailChange: (token: string) => act('POST', '/auth/confirm-email-change', { token }),
    undoEmailChange: (token: string) => act('POST', '/auth/undo-email-change', { token }),
    requestPasswordSetup: () => act('POST', '/account/password/setup-email', {}),
    /** Where they are signed in; the entry for the device asking has `current: true`. */
    getDevices: () => get(SignedInDevicesSchema, 'GET', '/account/sessions'),
    signOutDevice: (id: string) => act('DELETE', `/account/sessions/${encodeURIComponent(id)}`),
    /** Ends every session but this one; answers with how many there were. */
    signOutOtherDevices: () => get(SignedOutOthersSchema, 'DELETE', '/account/sessions'),
    deleteAccount: (confirmEmail: string, password: string | undefined, keepName: boolean) =>
      act('DELETE', '/account', { confirmEmail, password, keepName }),

    // bring-your-own LLM key (write-only: the key is never returned)
    getLlmSettings: () => get(LlmSettingsSchema, 'GET', '/llm'),
    saveLlmSettings: (input: LlmSettingsInput) => get(LlmSettingsSchema, 'PUT', '/llm', input),
    listLlmModels: () => get(LlmModelsSchema, 'GET', '/llm/models'),
    removeLlmKey: () => act('DELETE', '/llm'),

    getCritiqueSettings: () => get(CritiqueSettingsSchema, 'GET', '/account/critique-settings'),
    saveCritiqueSettings: (rounds: number) =>
      get(CritiqueSettingsSchema, 'PUT', '/account/critique-settings', { rounds }),
    // tutorial mode (#198): the switch, which kinds of page have been seen, and whether the offer to turn it off was answered
    getTutorial: () => get(TutorialStateSchema, 'GET', '/account/tutorial'),
    updateTutorial: (update: TutorialUpdate) =>
      get(TutorialStateSchema, 'PUT', '/account/tutorial', update),
    markTutorialSeen: (kind: string) =>
      get(TutorialStateSchema, 'POST', '/account/tutorial/seen', { kind }),

    // publications
    listPublications: () => get(PublicationList, 'GET', '/publications'),
    /** Follows the server's redirect for a renamed publication, so the result carries its current id. */
    getPublication: (id: string) => get(PublicationSchema, 'GET', `/publications/${id}`),
    createPublication: (input: PublicationInput) =>
      get(PublicationSchema, 'POST', '/publications', input),
    updatePublication: (id: string, changes: PublicationUpdate) =>
      get(PublicationSchema, 'PATCH', `/publications/${id}`, changes),
    setPublicationDescription: (id: string, input: PublicationDescriptionInput) =>
      get(PublicationSchema, 'PUT', `/publications/${id}/description`, input),
    setPublicationImage: async (id: string, file: File) =>
      PublicationSchema.parse(
        await (await sendFile('PUT', `/publications/${id}/image`, file)).json(),
      ),
    removePublicationImage: (id: string) => act('DELETE', `/publications/${id}/image`),
    deletePublication: (id: string) => act('DELETE', `/publications/${id}`),
    invite: (publicationId: string, email: string) =>
      act('POST', `/publications/${publicationId}/invitations`, { email }),
    listInvitations: (publicationId: string) =>
      get(InvitationSchema.array(), 'GET', `/publications/${publicationId}/invitations`),
    revokeInvitation: (publicationId: string, invitationId: string) =>
      act('DELETE', `/publications/${publicationId}/invitations/${invitationId}`),
    previewInvitation: (token: string) =>
      get(InvitationPreviewSchema, 'POST', '/invitations/preview', { token }),
    declineInvitation: (token: string, block: 'none' | 'sender' | 'all') =>
      act('POST', '/invitations/decline', { token, block }),
    getInvitationBlocks: () => get(InvitationBlocksSchema, 'GET', '/invitations/blocks'),
    setBlockAllInvitations: (blocked: boolean) =>
      act('PUT', '/invitations/blocks/all', { blocked }),
    unblockInviter: (senderId: string) => act('DELETE', `/invitations/blocks/senders/${senderId}`),
    acceptInvitation: (token: string) =>
      get(AcceptInvitationResultSchema, 'POST', '/invitations/accept', { token }),
    /** What is waiting on this person in the publication: offers, and the reviews of drafts they edit. */
    getPublicationAttention: (publicationId: string) =>
      get(PublicationAttentionSchema, 'GET', `/publications/${publicationId}/attention`),
    // reviewers: people outside the publication asked to read one draft and comment on it
    listReviewers: (publicationId: string, draftId: string) =>
      get(DraftReviewersSchema, 'GET', `${drafts(publicationId)}/${draftId}/reviewers`),
    /** Freezes the draft as a snapshot and asks people (by email, or members) to review it. */
    sendForReview: (publicationId: string, draftId: string, input: SendForReviewInput) =>
      act('POST', `${drafts(publicationId)}/${draftId}/send-for-review`, input),
    /** Stops accepting one review: it becomes read-only, and the comments stay. */
    closeReview: (publicationId: string, draftId: string, reviewId: string) =>
      act('DELETE', `${drafts(publicationId)}/${draftId}/reviewers/${reviewId}`),
    closeAllReviews: (publicationId: string, draftId: string) =>
      act('POST', `${drafts(publicationId)}/${draftId}/reviewers/close`),
    withdrawReviewInvitation: (publicationId: string, draftId: string, invitationId: string) =>
      act('DELETE', `${drafts(publicationId)}/${draftId}/reviewers/invitations/${invitationId}`),
    previewReviewInvitation: (token: string) =>
      get(ReviewInvitationPreviewSchema, 'POST', '/review-invitations/preview', { token }),
    declineReviewInvitation: (token: string, block: 'none' | 'sender' | 'all') =>
      act('POST', '/review-invitations/decline', { token, block }),
    acceptReviewInvitation: (token: string) =>
      get(ReviewAcceptedSchema, 'POST', '/review-invitations/accept', { token }),
    /** A new person's reviewer-only account, made and signed in by following the link. */
    registerReviewer: (input: ReviewerRegisterInput) =>
      get(UserSchema, 'POST', '/auth/register-reviewer', input),
    // a reviewer's own reviews
    listReviews: () => get(ReviewSummarySchema.array(), 'GET', '/reviews'),
    getReview: (id: string) => get(ReviewDetailSchema, 'GET', `/reviews/${id}`),
    commentOnReview: (id: string, input: CommentInput) =>
      get(CommentSchema, 'POST', `/reviews/${id}/comments`, input),
    endReview: (id: string) => act('POST', `/reviews/${id}/end`),
    /** Chooses a username and becomes a full account. */
    startWriting: (handle: string) => get(UserSchema, 'POST', '/reviews/start-writing', { handle }),
    setMemberRole: (id: string, userId: string, role: PublicationRole) =>
      get(PublicationSchema, 'PUT', `/publications/${id}/members/${userId}/role`, { role }),
    exportAccount: () => download('/account/export'),
    exportPublication: (id: string) => download(`/publications/${id}/export`),
    removeMember: (id: string, userId: string) =>
      act('DELETE', `/publications/${id}/members/${userId}`),

    // ideas
    listIdeas: (publicationId: string) =>
      get(IdeaSummarySchema.array(), 'GET', ideas(publicationId)),
    getIdea: (publicationId: string, id: string) =>
      get(IdeaSchema, 'GET', `${ideas(publicationId)}/${id}`),
    createIdea: (publicationId: string, input: Pick<IdeaInput, 'name'> & Partial<IdeaInput>) =>
      get(IdeaSchema, 'POST', ideas(publicationId), input),
    updateIdea: (publicationId: string, id: string, changes: IdeaUpdate) =>
      get(IdeaSchema, 'PATCH', `${ideas(publicationId)}/${id}`, changes),
    deleteIdea: (publicationId: string, id: string) =>
      act('DELETE', `${ideas(publicationId)}/${id}`),
    /**
     * Answers with the whole idea, so the list of links is up to date. The server looks up the page's
     * title unless one is given, and refuses addresses that can't be a real website.
     */
    addIdeaLink: (publicationId: string, id: string, input: { url: string; title?: string }) =>
      get(IdeaSchema, 'POST', `${ideas(publicationId)}/${id}/links`, input),
    /** An empty title asks the server to look the page's title up again. */
    updateIdeaLink: (
      publicationId: string,
      id: string,
      linkId: string,
      input: { url: string; title: string; authors?: string[] },
    ) => get(IdeaSchema, 'PATCH', `${ideas(publicationId)}/${id}/links/${linkId}`, input),
    removeIdeaLink: (publicationId: string, id: string, linkId: string) =>
      act('DELETE', `${ideas(publicationId)}/${id}/links/${linkId}`),
    // the publication's own reading list (items gathered before there is an idea); each answers with the list
    listPublicationReading: (publicationId: string) =>
      get(IdeaLinkSchema.array(), 'GET', `/publications/${publicationId}/reading`),
    addPublicationLink: (publicationId: string, input: { url: string; title?: string }) =>
      get(IdeaLinkSchema.array(), 'POST', `/publications/${publicationId}/reading`, input),
    updatePublicationLink: (
      publicationId: string,
      linkId: string,
      input: { url: string; title: string; authors?: string[] },
    ) =>
      get(
        IdeaLinkSchema.array(),
        'PATCH',
        `/publications/${publicationId}/reading/${linkId}`,
        input,
      ),
    setPublicationLinkRead: (publicationId: string, linkId: string, read: boolean) =>
      get(IdeaLinkSchema.array(), 'PUT', `/publications/${publicationId}/reading/${linkId}/read`, {
        read,
      }),
    /** Gives an item of the publication's own list exactly these tags. Answers with the whole list. */
    setPublicationLinkTags: (publicationId: string, linkId: string, tags: string[]) =>
      get(IdeaLinkSchema.array(), 'PUT', `/publications/${publicationId}/reading/${linkId}/tags`, {
        tags,
      }),
    /** Adds and removes tags on several items of the publication's own list at once. Answers with the whole list. */
    tagPublicationLinks: (
      publicationId: string,
      change: { ids: string[]; add: string[]; remove: string[] },
    ) => get(IdeaLinkSchema.array(), 'POST', `/publications/${publicationId}/reading/tags`, change),
    /** Asks for an item of the publication's own list to be kept (the others drop off after a month). */
    setPublicationLinkKept: (publicationId: string, linkId: string, kept: boolean) =>
      get(IdeaLinkSchema.array(), 'PUT', `/publications/${publicationId}/reading/${linkId}/kept`, {
        kept,
      }),
    removePublicationLink: (publicationId: string, linkId: string) =>
      act('DELETE', `/publications/${publicationId}/reading/${linkId}`),
    createIdeaDraft: (publicationId: string, id: string, input: Partial<DraftInput> = {}) =>
      get(DraftSchema, 'POST', `${ideas(publicationId)}/${id}/drafts`, input),
    /** Joins notes into the first of them. Answers with all the idea's notes. */
    mergeIdeaNotes: (publicationId: string, id: string | null, ids: string[]) =>
      get(IdeaNoteSchema.array(), 'POST', `${notesPath(publicationId, id)}/merge`, { ids }),
    /** Cuts a note in two (the second follows the first). Answers with all the idea's notes. */
    splitIdeaNote: (
      publicationId: string,
      id: string | null,
      noteId: string,
      before: string,
      after: string,
    ) =>
      get(IdeaNoteSchema.array(), 'POST', `${notesPath(publicationId, id)}/${noteId}/split`, {
        before,
        after,
      }),
    /** Gives a note exactly these tags. Answers with the note as saved. */
    setIdeaNoteTags: (publicationId: string, id: string | null, noteId: string, tags: string[]) =>
      get(IdeaNoteSchema, 'PUT', `${notesPath(publicationId, id)}/${noteId}/tags`, { tags }),
    /** Adds and removes tags on several notes at once. Answers with all the notes. */
    tagIdeaNotes: (
      publicationId: string,
      id: string | null,
      change: { ids: string[]; add: string[]; remove: string[] },
    ) => get(IdeaNoteSchema.array(), 'POST', `${notesPath(publicationId, id)}/tags`, change),
    /** Adds and removes tags on several reading-list items at once. Answers with the whole idea. */
    tagIdeaLinks: (
      publicationId: string,
      id: string,
      change: { ids: string[]; add: string[]; remove: string[] },
    ) => get(IdeaSchema, 'POST', `${ideas(publicationId)}/${id}/links/tags`, change),
    /** Gives a reading-list item exactly these tags. Answers with the whole idea. */
    setReadingItemTags: (publicationId: string, id: string, linkId: string, tags: string[]) =>
      get(IdeaSchema, 'PUT', `${ideas(publicationId)}/${id}/links/${linkId}/tags`, { tags }),
    /** Marks a reading-list item read (or unread again). Answers with the whole idea. */
    setReadingItemRead: (publicationId: string, id: string, linkId: string, read: boolean) =>
      get(IdeaSchema, 'PUT', `${ideas(publicationId)}/${id}/links/${linkId}/read`, { read }),
    /** `ids` is every draft of the idea, in the new order. Answers with the idea as saved. */
    reorderIdeaDrafts: (publicationId: string, id: string, ids: string[]) =>
      get(IdeaSchema, 'PUT', `${ideas(publicationId)}/${id}/drafts/order`, { ids }),
    // what was pulled into a draft from the idea's notes, and where it came from
    listDraftInsertions: (publicationId: string, draftId: string) =>
      get(
        DraftInsertionSchema.array(),
        'GET',
        `/publications/${publicationId}/drafts/${draftId}/insertions`,
      ),
    /** Says the note's text went into the draft; the server sets the note aside and records its origin. */
    addDraftInsertion: (publicationId: string, draftId: string, input: DraftInsertionInput) =>
      get(
        DraftInsertionSchema,
        'POST',
        `/publications/${publicationId}/drafts/${draftId}/insertions`,
        input,
      ),
    /** Puts a note back among those that can be pulled into a draft (`added: false`). */
    setNoteAdded: (publicationId: string, id: string, noteId: string, added: boolean) =>
      get(IdeaNoteSchema, 'PUT', `${ideas(publicationId)}/${id}/notes/${noteId}/added`, { added }),
    // notes: index cards for an idea, in the order the person arranged them
    listIdeaNotes: (publicationId: string, id: string | null) =>
      get(IdeaNoteSchema.array(), 'GET', notesPath(publicationId, id)),
    /**
     * With `readingItemId` the note is taken from that item of the reading list (its origin is then `reading`);
     * with `quote` too, it is a direct quotation, kept word for word.
     */
    addIdeaNote: (
      publicationId: string,
      id: string | null,
      text: string,
      source: { readingItemId?: string; quote?: boolean } = {},
    ) => get(IdeaNoteSchema, 'POST', notesPath(publicationId, id), { text, ...source }),
    updateIdeaNote: (publicationId: string, id: string | null, noteId: string, text: string) =>
      get(IdeaNoteSchema, 'PATCH', `${notesPath(publicationId, id)}/${noteId}`, { text }),
    removeIdeaNote: (publicationId: string, id: string | null, noteId: string) =>
      act('DELETE', `${notesPath(publicationId, id)}/${noteId}`),
    /** `ids` is every note of the idea, in the new order. Answers with the notes as saved. */
    reorderIdeaNotes: (publicationId: string, id: string | null, ids: string[]) =>
      get(IdeaNoteSchema.array(), 'PUT', `${notesPath(publicationId, id)}/order`, { ids }),
    // idea sources (the list is in priority order, highest first)
    listSources: (publicationId: string) =>
      get(SourceListSchema, 'GET', `/publications/${publicationId}/sources`),
    /** Adds the feed at `url`, or, if it is a website offering several feeds, answers with the choices. */
    addSource: (publicationId: string, url: string) =>
      get(SourceSchema.or(SourceChoicesSchema), 'POST', `/publications/${publicationId}/sources`, {
        url,
      }),
    /** The newest posts across all the publication's feeds, from the last `days` days. */
    recentPosts: (publicationId: string, days: number, refresh = false) =>
      get(
        RecentPostsSchema,
        'GET',
        `/publications/${publicationId}/sources/recent?days=${days}${refresh ? '&refresh=true' : ''}`,
      ),
    /**
     * Moves reading items between the publication's own list (`ideaId` null) and its ideas, or into another
     * publication the person belongs to (`publicationId`), with the notes taken from them. All or nothing. Answers
     * with what moved.
     */
    moveReadingItems: (publicationId: string, ids: string[], to: MoveTarget) =>
      get(MoveResultSchema, 'POST', `/publications/${publicationId}/move/reading`, { ids, to }),
    /** What moving these ideas to another publication would do, and what would stop it, without doing it. */
    previewMoveIdeas: (publicationId: string, ids: string[], toPublicationId: string) =>
      get(MoveIdeasPreviewSchema, 'POST', `/publications/${publicationId}/move/ideas/preview`, {
        ids,
        to: { publicationId: toPublicationId },
      }),
    /** Moves whole ideas (with their drafts, notes, links and brainstorm thread) to another publication. */
    moveIdeas: (publicationId: string, ids: string[], toPublicationId: string) =>
      get(MoveIdeasResultSchema, 'POST', `/publications/${publicationId}/move/ideas`, {
        ids,
        to: { publicationId: toPublicationId },
      }),
    /** Moves notes the same way (each keeps its source, copied to where it goes). */
    moveNotes: (publicationId: string, ids: string[], to: MoveTarget) =>
      get(MoveResultSchema, 'POST', `/publications/${publicationId}/move/notes`, { ids, to }),
    /**
     * Puts posts of the combined list on the publication's reading list (`add`), ignores them, or takes either back
     * (`reconsider`). Each post is named by its feed and its id in it. Answers with what each has become.
     */
    decideFeedPosts: (
      publicationId: string,
      what: 'add' | 'ignore' | 'reconsider',
      posts: { sourceId: string; postId: string }[],
    ) =>
      get(PostDecisionSchema, 'POST', `/publications/${publicationId}/sources/recent/${what}`, {
        posts,
      }),
    /** The feed's recent posts: the server's kept copy, or a fresh read if that is old. */
    sourceItems: (publicationId: string, id: string) =>
      get(SourceItemsSchema, 'GET', `/publications/${publicationId}/sources/${id}/items`),
    removeSource: (publicationId: string, id: string) =>
      act('DELETE', `/publications/${publicationId}/sources/${id}`),
    /** `ids` is every source, in the new order. Answers with the list as saved. */
    reorderSources: (publicationId: string, ids: string[]) =>
      get(SourceListSchema, 'PUT', `/publications/${publicationId}/sources/order`, { ids }),

    // brainstorming: one conversation per idea, shared by the publication's members
    getConversation: (publicationId: string, ideaId: string) =>
      get(ConversationSchema, 'GET', conversation(publicationId, ideaId)),
    /**
     * Sends a message (or `{start: true}` / `{retry: true}`) and reads the AI's reply as it is written,
     * calling `onEvent` for each event. Resolves when the reply ends; rejects with an `ApiError` if it
     * couldn't begin (no key, someone else's reply in progress, too many messages...), and with an
     * `AbortError` if `signal` is aborted. Failures during the reply arrive as an `error` event.
     * @ai
     */
    streamReply: async (
      publicationId: string,
      ideaId: string,
      body: SendMessageInput,
      onEvent: (event: BrainstormEvent) => void,
      signal?: AbortSignal,
    ) => {
      const res = await fetchImpl(`/api${conversation(publicationId, ideaId)}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
      await checked(res)
      if (!res.body)
        throw new ApiError(res.status, 'The reply could not be read. Please try again.')
      for await (const message of readSse(res.body, signal)) {
        let json: unknown
        try {
          json = JSON.parse(message.data)
        } catch {
          continue
        }
        const event = BrainstormEventSchema.safeParse(json)
        if (event.success) onEvent(event.data)
      }
      signal?.throwIfAborted() // a stopped reply ends quietly inside readSse; report it as the abort it was
    },
    /** `overwrite` applies a suggestion made against text that has since changed. */
    acceptProposal: (
      publicationId: string,
      ideaId: string,
      proposalId: string,
      overwrite = false,
    ) =>
      get(
        ProposalSchema,
        'POST',
        `${conversation(publicationId, ideaId)}/proposals/${proposalId}/accept`,
        overwrite ? { overwrite: true } : {},
      ),
    dismissProposal: (publicationId: string, ideaId: string, proposalId: string) =>
      get(
        ProposalSchema,
        'POST',
        `${conversation(publicationId, ideaId)}/proposals/${proposalId}/dismiss`,
        {},
      ),
    /** Deletes the whole conversation, for everyone in the publication. */
    restartConversation: (publicationId: string, ideaId: string) =>
      act('DELETE', conversation(publicationId, ideaId)),

    // research: searches for reading, apart from the conversation
    getResearch: (publicationId: string, ideaId: string) =>
      get(ResearchRunsSchema, 'GET', research(publicationId, ideaId)),
    /**
     * Asks the person's AI to search the web for these areas. Can take up to a minute.
     * @ai
     */
    runResearch: (publicationId: string, ideaId: string, areas: string) =>
      get(ResearchRunSchema, 'POST', research(publicationId, ideaId), { areas }),
    /** Adds the ticked pages of a run to the idea's reading list. */
    addResearchItem: (publicationId: string, ideaId: string, runId: string, itemId: string) =>
      get(ResearchRunSchema, 'POST', `${research(publicationId, ideaId)}/${runId}/add`, {
        itemIds: [itemId],
      }),
    ignoreResearchItem: (publicationId: string, ideaId: string, runId: string, itemId: string) =>
      get(ResearchRunSchema, 'POST', `${research(publicationId, ideaId)}/${runId}/dismiss`, {
        itemIds: [itemId],
      }),
    /** Takes a decision back: an ignored page is waiting again; an added one also leaves the reading list. */
    reconsiderResearchItem: (
      publicationId: string,
      ideaId: string,
      runId: string,
      itemId: string,
    ) =>
      get(ResearchRunSchema, 'POST', `${research(publicationId, ideaId)}/${runId}/reconsider`, {
        itemIds: [itemId],
      }),
    deleteResearch: (publicationId: string, ideaId: string, runId: string) =>
      act('DELETE', `${research(publicationId, ideaId)}/${runId}`),

    // drafts
    getDraft: (publicationId: string, id: string) =>
      get(DraftSchema, 'GET', `${drafts(publicationId)}/${id}`),
    updateDraft: (publicationId: string, id: string, input: DraftSave) =>
      get(DraftSchema, 'PUT', `${drafts(publicationId)}/${id}`, input),
    // handing over a draft's editor role: each answers with the handover as it now stands
    getHandover: (publicationId: string, draftId: string) =>
      get(HandoverStateSchema, 'GET', `${drafts(publicationId)}/${draftId}/handover`),
    offerDraft: (publicationId: string, draftId: string, userId: string) =>
      get(HandoverStateSchema, 'POST', `${drafts(publicationId)}/${draftId}/handover/offer`, {
        userId,
      }),
    withdrawOffer: (publicationId: string, draftId: string) =>
      get(HandoverStateSchema, 'DELETE', `${drafts(publicationId)}/${draftId}/handover/offer`),
    acceptOffer: (publicationId: string, draftId: string) =>
      get(
        HandoverStateSchema,
        'POST',
        `${drafts(publicationId)}/${draftId}/handover/offer/accept`,
        {},
      ),
    declineOffer: (publicationId: string, draftId: string) =>
      get(
        HandoverStateSchema,
        'POST',
        `${drafts(publicationId)}/${draftId}/handover/offer/decline`,
        {},
      ),
    askForDraft: (publicationId: string, draftId: string) =>
      get(HandoverStateSchema, 'POST', `${drafts(publicationId)}/${draftId}/handover/asks`, {}),
    closeAsk: (publicationId: string, draftId: string, askId: string) =>
      get(
        HandoverStateSchema,
        'DELETE',
        `${drafts(publicationId)}/${draftId}/handover/asks/${askId}`,
      ),
    reassignDraft: (publicationId: string, draftId: string, userId: string) =>
      get(HandoverStateSchema, 'POST', `${drafts(publicationId)}/${draftId}/handover/reassign`, {
        userId,
      }),
    /**
     * Asks for a critique of the saved draft; it is kept with the draft.
     * @ai
     */
    critique: (publicationId: string, draftId: string) =>
      get(CritiqueStateSchema, 'POST', `/publications/${publicationId}/assist/critique`, {
        draftId,
      }),
    /**
     * Options for a selected passage (or the title) of the saved draft. Nothing is kept: the Rephrase window holds
     * the rounds and sends the earlier ones back.
     * @ai
     */
    rephrase: (publicationId: string, input: RephraseRequest) =>
      get(RephraseResultSchema, 'POST', `/publications/${publicationId}/assist/rephrase`, input),
    /** Records that words in the draft began as an AI option; the writer's report of what was offered. */
    addOptionInsertion: (publicationId: string, draftId: string, input: OptionUseInput) =>
      get(
        DraftInsertionSchema,
        'POST',
        `/publications/${publicationId}/drafts/${draftId}/option-insertions`,
        input,
      ),
    /** The latest critique of the draft (null if none), and how many of its looks are used. */
    latestCritique: (publicationId: string, draftId: string) =>
      get(CritiqueStateSchema, 'GET', `${drafts(publicationId)}/${draftId}/critique`),
    /** The comments on the draft that this person may see: all of them for its editor, only their own for others. */
    listComments: (publicationId: string, draftId: string) =>
      get(CommentSchema.array(), 'GET', `${drafts(publicationId)}/${draftId}/comments`),
    addComment: (publicationId: string, draftId: string, input: CommentInput) =>
      get(CommentSchema, 'POST', `${drafts(publicationId)}/${draftId}/comments`, input),
    /** The editor sets a comment aside (or, with `resolved: false`, brings it back). Answers with the comments as they now are. */
    setCommentResolved: (
      publicationId: string,
      draftId: string,
      commentId: string,
      resolved: boolean,
    ) =>
      get(
        CommentSchema.array(),
        'PUT',
        `${drafts(publicationId)}/${draftId}/comments/${commentId}`,
        {
          resolved,
        },
      ),
  }
}

export type Api = ReturnType<typeof createApi>

/** Shared instance; tests can build their own with `createApi({ fetch })`. */
export const api = createApi()

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong'
