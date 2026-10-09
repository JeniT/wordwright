import {
  AuthConfigSchema,
  CritiqueSchema,
  DraftSchema,
  ProfileSchema,
  UserSchema,
  type DraftInput,
  type LoginInput,
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
  const DraftList = DraftSchema.array()
  const drafts = (profileId: string) => `/profiles/${profileId}/drafts`

  return {
    // auth
    authConfig: () => get(AuthConfigSchema, 'GET', '/auth/config'),
    me: () => get(UserSchema, 'GET', '/auth/me'),
    register: (input: RegisterInput) => get(UserSchema, 'POST', '/auth/register', input),
    login: (input: LoginInput) => get(UserSchema, 'POST', '/auth/login', input),
    logout: () => act('POST', '/auth/logout', {}),
    forgotPassword: (email: string) => act('POST', '/auth/forgot-password', { email }),
    resetPassword: (token: string, password: string) =>
      act('POST', '/auth/reset-password', { token, password }),
    deleteAccount: (confirmEmail: string, password?: string) =>
      act('DELETE', '/account', { confirmEmail, password }),

    // profiles
    listProfiles: () => get(ProfileList, 'GET', '/profiles'),
    createProfile: (name: string) => get(ProfileSchema, 'POST', '/profiles', { name }),
    renameProfile: (id: string, name: string) =>
      get(ProfileSchema, 'PATCH', `/profiles/${id}`, { name }),
    deleteProfile: (id: string) => act('DELETE', `/profiles/${id}`),
    addMember: (id: string, email: string) =>
      get(ProfileSchema, 'POST', `/profiles/${id}/members`, { email }),
    removeMember: (id: string, userId: string) =>
      act('DELETE', `/profiles/${id}/members/${userId}`),

    // drafts
    listDrafts: (profileId: string) => get(DraftList, 'GET', drafts(profileId)),
    getDraft: (profileId: string, id: string) =>
      get(DraftSchema, 'GET', `${drafts(profileId)}/${id}`),
    createDraft: (profileId: string, input: Partial<DraftInput> = {}) =>
      get(DraftSchema, 'POST', drafts(profileId), input),
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
