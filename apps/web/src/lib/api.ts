import {
  AcceptInvitationResultSchema,
  AuthConfigSchema,
  CritiqueSchema,
  DraftSchema,
  HandleAvailabilitySchema,
  IdeaSchema,
  IdeaSummarySchema,
  InvitationBlocksSchema,
  InvitationPreviewSchema,
  InvitationSchema,
  LlmSettingsSchema,
  ProfileSchema,
  SourceListSchema,
  SourceSchema,
  UserSchema,
  type DraftInput,
  type IdeaInput,
  type IdeaUpdate,
  type LlmSettingsInput,
  type LoginInput,
  type ProfileInput,
  type ProfileUpdate,
  type RegisterInput,
} from '@lfwa/core'
import type { z } from 'zod'

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
      input: { url: string; title: string },
    ) => get(IdeaSchema, 'PATCH', `${ideas(profileId)}/${id}/links/${linkId}`, input),
    removeIdeaLink: (profileId: string, id: string, linkId: string) =>
      act('DELETE', `${ideas(profileId)}/${id}/links/${linkId}`),
    createIdeaDraft: (profileId: string, id: string, input: Partial<DraftInput> = {}) =>
      get(DraftSchema, 'POST', `${ideas(profileId)}/${id}/drafts`, input),
    // idea sources (the list is in priority order, highest first)
    listSources: (profileId: string) =>
      get(SourceListSchema, 'GET', `/profiles/${profileId}/sources`),
    addSource: (profileId: string, url: string) =>
      get(SourceSchema, 'POST', `/profiles/${profileId}/sources`, { url }),
    removeSource: (profileId: string, id: string) =>
      act('DELETE', `/profiles/${profileId}/sources/${id}`),
    /** `ids` is every source, in the new order. Answers with the list as saved. */
    reorderSources: (profileId: string, ids: string[]) =>
      get(SourceListSchema, 'PUT', `/profiles/${profileId}/sources/order`, { ids }),

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
