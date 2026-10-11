import {
  AcceptInvitationResultSchema,
  AuthConfigSchema,
  BrainstormEventSchema,
  BrainstormPromptSchema,
  ConversationSchema,
  CritiqueSchema,
  DraftInsertionSchema,
  DraftSchema,
  HandleAvailabilitySchema,
  IdeaLinkSchema,
  IdeaNoteSchema,
  IdeaSchema,
  IdeaSummarySchema,
  InvitationBlocksSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  LlmSettingsSchema,
  ProfileSchema,
  ProposalSchema,
  ResearchRunSchema,
  ResearchRunsSchema,
  SourceChoicesSchema,
  PostDecisionSchema,
  RecentPostsSchema,
  SourceItemsSchema,
  SourceListSchema,
  SourceSchema,
  UserSchema,
  type BrainstormEvent,
  type DraftInput,
  type DraftInsertionInput,
  type IdeaInput,
  type IdeaUpdate,
  type LlmSettingsInput,
  type LoginInput,
  type ProfileInput,
  type ProfileUpdate,
  type RegisterInput,
  type SendMessageInput,
} from '@lfwa/core'
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
 * there are no tokens in JS. Responses are validated with the schemas shared from @lfwa/core.
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
  /** Sends a file as the whole request body (not multipart), as the profile image endpoint expects. */
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

  const ProfileList = ProfileSchema.array()
  const drafts = (profileId: string) => `/profiles/${profileId}/drafts`
  const ideas = (profileId: string) => `/profiles/${profileId}/ideas`
  /** An idea's notes, or (no idea) the profile's own. */
  const notesPath = (profileId: string, ideaId: string | null) =>
    ideaId ? `${ideas(profileId)}/${ideaId}/notes` : `/profiles/${profileId}/notes`
  const research = (profileId: string, ideaId: string) => `${ideas(profileId)}/${ideaId}/research`
  const conversation = (profileId: string, ideaId: string) =>
    `${ideas(profileId)}/${ideaId}/conversation`

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
    deleteAccount: (confirmEmail: string, password?: string) =>
      act('DELETE', '/account', { confirmEmail, password }),

    // bring-your-own LLM key (write-only: the key is never returned)
    getLlmSettings: () => get(LlmSettingsSchema, 'GET', '/llm'),
    saveLlmSettings: (input: LlmSettingsInput) => get(LlmSettingsSchema, 'PUT', '/llm', input),
    removeLlmKey: () => act('DELETE', '/llm'),

    // the person's own brainstorming prompt (the default until they change it)
    getBrainstormPrompt: () => get(BrainstormPromptSchema, 'GET', '/account/brainstorm-prompt'),
    saveBrainstormPrompt: (prompt: string) =>
      get(BrainstormPromptSchema, 'PUT', '/account/brainstorm-prompt', { prompt }),
    resetBrainstormPrompt: () =>
      get(BrainstormPromptSchema, 'DELETE', '/account/brainstorm-prompt'),

    // profiles
    listProfiles: () => get(ProfileList, 'GET', '/profiles'),
    /** Follows the server's redirect for a renamed profile, so the result carries its current id. */
    getProfile: (id: string) => get(ProfileSchema, 'GET', `/profiles/${id}`),
    createProfile: (input: ProfileInput) => get(ProfileSchema, 'POST', '/profiles', input),
    updateProfile: (id: string, changes: ProfileUpdate) =>
      get(ProfileSchema, 'PATCH', `/profiles/${id}`, changes),
    setProfileImage: async (id: string, file: File) =>
      ProfileSchema.parse(await (await sendFile('PUT', `/profiles/${id}/image`, file)).json()),
    removeProfileImage: (id: string) => act('DELETE', `/profiles/${id}/image`),
    deleteProfile: (id: string) => act('DELETE', `/profiles/${id}`),
    invite: (profileId: string, email: string) =>
      act('POST', `/profiles/${profileId}/invitations`, { email }),
    listInvitations: (profileId: string) =>
      get(InvitationSchema.array(), 'GET', `/profiles/${profileId}/invitations`),
    revokeInvitation: (profileId: string, invitationId: string) =>
      act('DELETE', `/profiles/${profileId}/invitations/${invitationId}`),
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
    removeMember: (id: string, userId: string) =>
      act('DELETE', `/profiles/${id}/members/${userId}`),

    // ideas
    listIdeas: (profileId: string) => get(IdeaSummarySchema.array(), 'GET', ideas(profileId)),
    getIdea: (profileId: string, id: string) => get(IdeaSchema, 'GET', `${ideas(profileId)}/${id}`),
    createIdea: (profileId: string, input: Pick<IdeaInput, 'name'> & Partial<IdeaInput>) =>
      get(IdeaSchema, 'POST', ideas(profileId), input),
    updateIdea: (profileId: string, id: string, changes: IdeaUpdate) =>
      get(IdeaSchema, 'PATCH', `${ideas(profileId)}/${id}`, changes),
    deleteIdea: (profileId: string, id: string) => act('DELETE', `${ideas(profileId)}/${id}`),
    /**
     * Answers with the whole idea, so the list of links is up to date. The server looks up the page's
     * title unless one is given, and refuses addresses that can't be a real website.
     */
    addIdeaLink: (profileId: string, id: string, input: { url: string; title?: string }) =>
      get(IdeaSchema, 'POST', `${ideas(profileId)}/${id}/links`, input),
    /** An empty title asks the server to look the page's title up again. */
    updateIdeaLink: (
      profileId: string,
      id: string,
      linkId: string,
      input: { url: string; title: string; authors?: string[] },
    ) => get(IdeaSchema, 'PATCH', `${ideas(profileId)}/${id}/links/${linkId}`, input),
    removeIdeaLink: (profileId: string, id: string, linkId: string) =>
      act('DELETE', `${ideas(profileId)}/${id}/links/${linkId}`),
    // the profile's own reading list (items gathered before there is an idea); each answers with the list
    listProfileReading: (profileId: string) =>
      get(IdeaLinkSchema.array(), 'GET', `/profiles/${profileId}/reading`),
    addProfileLink: (profileId: string, input: { url: string; title?: string }) =>
      get(IdeaLinkSchema.array(), 'POST', `/profiles/${profileId}/reading`, input),
    updateProfileLink: (
      profileId: string,
      linkId: string,
      input: { url: string; title: string; authors?: string[] },
    ) => get(IdeaLinkSchema.array(), 'PATCH', `/profiles/${profileId}/reading/${linkId}`, input),
    setProfileLinkRead: (profileId: string, linkId: string, read: boolean) =>
      get(IdeaLinkSchema.array(), 'PUT', `/profiles/${profileId}/reading/${linkId}/read`, { read }),
    removeProfileLink: (profileId: string, linkId: string) =>
      act('DELETE', `/profiles/${profileId}/reading/${linkId}`),
    createIdeaDraft: (profileId: string, id: string, input: Partial<DraftInput> = {}) =>
      get(DraftSchema, 'POST', `${ideas(profileId)}/${id}/drafts`, input),
    /** Joins notes into the first of them. Answers with all the idea's notes. */
    mergeIdeaNotes: (profileId: string, id: string | null, ids: string[]) =>
      get(IdeaNoteSchema.array(), 'POST', `${notesPath(profileId, id)}/merge`, { ids }),
    /** Cuts a note in two (the second follows the first). Answers with all the idea's notes. */
    splitIdeaNote: (
      profileId: string,
      id: string | null,
      noteId: string,
      before: string,
      after: string,
    ) =>
      get(IdeaNoteSchema.array(), 'POST', `${notesPath(profileId, id)}/${noteId}/split`, {
        before,
        after,
      }),
    /** Gives a note exactly these tags. Answers with the note as saved. */
    setIdeaNoteTags: (profileId: string, id: string | null, noteId: string, tags: string[]) =>
      get(IdeaNoteSchema, 'PUT', `${notesPath(profileId, id)}/${noteId}/tags`, { tags }),
    /** Marks a reading-list item read (or unread again). Answers with the whole idea. */
    setReadingItemRead: (profileId: string, id: string, linkId: string, read: boolean) =>
      get(IdeaSchema, 'PUT', `${ideas(profileId)}/${id}/links/${linkId}/read`, { read }),
    /** `ids` is every draft of the idea, in the new order. Answers with the idea as saved. */
    reorderIdeaDrafts: (profileId: string, id: string, ids: string[]) =>
      get(IdeaSchema, 'PUT', `${ideas(profileId)}/${id}/drafts/order`, { ids }),
    // what was pulled into a draft from the idea's notes, and where it came from
    listDraftInsertions: (profileId: string, draftId: string) =>
      get(
        DraftInsertionSchema.array(),
        'GET',
        `/profiles/${profileId}/drafts/${draftId}/insertions`,
      ),
    /** Says the note's text went into the draft; the server sets the note aside and records its origin. */
    addDraftInsertion: (profileId: string, draftId: string, input: DraftInsertionInput) =>
      get(
        DraftInsertionSchema,
        'POST',
        `/profiles/${profileId}/drafts/${draftId}/insertions`,
        input,
      ),
    /** Puts a note back among those that can be pulled into a draft (`added: false`). */
    setNoteAdded: (profileId: string, id: string, noteId: string, added: boolean) =>
      get(IdeaNoteSchema, 'PUT', `${ideas(profileId)}/${id}/notes/${noteId}/added`, { added }),
    // notes: index cards for an idea, in the order the person arranged them
    listIdeaNotes: (profileId: string, id: string | null) =>
      get(IdeaNoteSchema.array(), 'GET', notesPath(profileId, id)),
    /**
     * With `readingItemId` the note is taken from that item of the reading list (its origin is then `reading`);
     * with `quote` too, it is a direct quotation, kept word for word.
     */
    addIdeaNote: (
      profileId: string,
      id: string | null,
      text: string,
      source: { readingItemId?: string; quote?: boolean } = {},
    ) => get(IdeaNoteSchema, 'POST', notesPath(profileId, id), { text, ...source }),
    updateIdeaNote: (profileId: string, id: string | null, noteId: string, text: string) =>
      get(IdeaNoteSchema, 'PATCH', `${notesPath(profileId, id)}/${noteId}`, { text }),
    removeIdeaNote: (profileId: string, id: string | null, noteId: string) =>
      act('DELETE', `${notesPath(profileId, id)}/${noteId}`),
    /** `ids` is every note of the idea, in the new order. Answers with the notes as saved. */
    reorderIdeaNotes: (profileId: string, id: string | null, ids: string[]) =>
      get(IdeaNoteSchema.array(), 'PUT', `${notesPath(profileId, id)}/order`, { ids }),
    // idea sources (the list is in priority order, highest first)
    listSources: (profileId: string) =>
      get(SourceListSchema, 'GET', `/profiles/${profileId}/sources`),
    /** Adds the feed at `url`, or, if it is a website offering several feeds, answers with the choices. */
    addSource: (profileId: string, url: string) =>
      get(SourceSchema.or(SourceChoicesSchema), 'POST', `/profiles/${profileId}/sources`, { url }),
    /** The newest posts across all the profile's feeds, from the last `days` days. */
    recentPosts: (profileId: string, days: number, refresh = false) =>
      get(
        RecentPostsSchema,
        'GET',
        `/profiles/${profileId}/sources/recent?days=${days}${refresh ? '&refresh=true' : ''}`,
      ),
    /**
     * Puts posts of the combined list on the profile's reading list (`add`), ignores them, or takes either back
     * (`reconsider`). Each post is named by its feed and its id in it. Answers with what each has become.
     */
    decideFeedPosts: (
      profileId: string,
      what: 'add' | 'ignore' | 'reconsider',
      posts: { sourceId: string; postId: string }[],
    ) =>
      get(PostDecisionSchema, 'POST', `/profiles/${profileId}/sources/recent/${what}`, { posts }),
    /** The feed's recent posts: the server's kept copy, or a fresh read if that is old. */
    sourceItems: (profileId: string, id: string) =>
      get(SourceItemsSchema, 'GET', `/profiles/${profileId}/sources/${id}/items`),
    removeSource: (profileId: string, id: string) =>
      act('DELETE', `/profiles/${profileId}/sources/${id}`),
    /** `ids` is every source, in the new order. Answers with the list as saved. */
    reorderSources: (profileId: string, ids: string[]) =>
      get(SourceListSchema, 'PUT', `/profiles/${profileId}/sources/order`, { ids }),

    // brainstorming: one conversation per idea, shared by the profile's members
    getConversation: (profileId: string, ideaId: string) =>
      get(ConversationSchema, 'GET', conversation(profileId, ideaId)),
    /**
     * Sends a message (or `{start: true}` / `{retry: true}`) and reads the AI's reply as it is written,
     * calling `onEvent` for each event. Resolves when the reply ends; rejects with an `ApiError` if it
     * couldn't begin (no key, someone else's reply in progress, too many messages...), and with an
     * `AbortError` if `signal` is aborted. Failures during the reply arrive as an `error` event.
     */
    streamReply: async (
      profileId: string,
      ideaId: string,
      body: SendMessageInput,
      onEvent: (event: BrainstormEvent) => void,
      signal?: AbortSignal,
    ) => {
      const res = await fetchImpl(`/api${conversation(profileId, ideaId)}/messages`, {
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
    acceptProposal: (profileId: string, ideaId: string, proposalId: string, overwrite = false) =>
      get(
        ProposalSchema,
        'POST',
        `${conversation(profileId, ideaId)}/proposals/${proposalId}/accept`,
        overwrite ? { overwrite: true } : {},
      ),
    dismissProposal: (profileId: string, ideaId: string, proposalId: string) =>
      get(
        ProposalSchema,
        'POST',
        `${conversation(profileId, ideaId)}/proposals/${proposalId}/dismiss`,
        {},
      ),
    /** Deletes the whole conversation, for everyone in the profile. */
    restartConversation: (profileId: string, ideaId: string) =>
      act('DELETE', conversation(profileId, ideaId)),

    // research: searches for reading, apart from the conversation
    getResearch: (profileId: string, ideaId: string) =>
      get(ResearchRunsSchema, 'GET', research(profileId, ideaId)),
    /** Asks the person's AI to search the web for these areas. Can take up to a minute. */
    runResearch: (profileId: string, ideaId: string, areas: string) =>
      get(ResearchRunSchema, 'POST', research(profileId, ideaId), { areas }),
    /** Adds the ticked pages of a run to the idea's reading list. */
    addResearchItem: (profileId: string, ideaId: string, runId: string, itemId: string) =>
      get(ResearchRunSchema, 'POST', `${research(profileId, ideaId)}/${runId}/add`, {
        itemIds: [itemId],
      }),
    ignoreResearchItem: (profileId: string, ideaId: string, runId: string, itemId: string) =>
      get(ResearchRunSchema, 'POST', `${research(profileId, ideaId)}/${runId}/dismiss`, {
        itemIds: [itemId],
      }),
    /** Takes a decision back: an ignored page is waiting again; an added one also leaves the reading list. */
    reconsiderResearchItem: (profileId: string, ideaId: string, runId: string, itemId: string) =>
      get(ResearchRunSchema, 'POST', `${research(profileId, ideaId)}/${runId}/reconsider`, {
        itemIds: [itemId],
      }),
    deleteResearch: (profileId: string, ideaId: string, runId: string) =>
      act('DELETE', `${research(profileId, ideaId)}/${runId}`),

    // drafts
    getDraft: (profileId: string, id: string) =>
      get(DraftSchema, 'GET', `${drafts(profileId)}/${id}`),
    updateDraft: (profileId: string, id: string, input: DraftInput) =>
      get(DraftSchema, 'PUT', `${drafts(profileId)}/${id}`, input),
    critique: (profileId: string, draftId: string) =>
      get(CritiqueSchema, 'POST', `/profiles/${profileId}/assist/critique`, { draftId }),
  }
}

export type Api = ReturnType<typeof createApi>

/** Shared instance; tests can build their own with `createApi({ fetch })`. */
export const api = createApi()

export const errorMessage = (err: unknown) =>
  err instanceof Error ? err.message : 'Something went wrong'
