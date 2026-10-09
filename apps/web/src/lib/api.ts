import { CritiqueSchema, DraftSchema, type DraftInput } from '@lfwa/core'
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
  getToken?: () => string
  fetch?: typeof fetch
}

/** Thin typed client; responses are validated with the schemas shared from @lfwa/core. */
export function createApi({
  getToken = () => '',
  fetch: fetchImpl = (...a) => fetch(...a),
}: ApiOptions = {}) {
  async function request<T>(schema: z.ZodType<T>, method: string, path: string, body?: unknown) {
    const token = getToken()
    const res = await fetchImpl(`/api${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`)
    return schema.parse(await res.json())
  }
  const DraftList = DraftSchema.array()

  return {
    listDrafts: () => request(DraftList, 'GET', '/drafts'),
    getDraft: (id: string) => request(DraftSchema, 'GET', `/drafts/${id}`),
    createDraft: (input: Partial<DraftInput> = {}) =>
      request(DraftSchema, 'POST', '/drafts', input),
    updateDraft: (id: string, input: DraftInput) =>
      request(DraftSchema, 'PUT', `/drafts/${id}`, input),
    critique: (draftId: string) => request(CritiqueSchema, 'POST', '/assist/critique', { draftId }),
  }
}

export type Api = ReturnType<typeof createApi>
