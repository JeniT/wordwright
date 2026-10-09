import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiError, createApi } from './api'

const draft = {
  id: '1',
  title: 'T',
  body: 'B',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('api client', () => {
  it('parses responses and sends the bearer token', async () => {
    let auth: string | null = null
    server.use(
      http.get('http://localhost/api/drafts', ({ request }) => {
        auth = request.headers.get('authorization')
        return HttpResponse.json([draft])
      }),
    )
    const api = createApi({
      getToken: () => 'tok',
      fetch: (url, init) => fetch(new URL(String(url), 'http://localhost'), init),
    })
    expect(await api.listDrafts()).toEqual([draft])
    expect(auth).toBe('Bearer tok')
  })

  it('throws ApiError on failure', async () => {
    server.use(
      http.get('http://localhost/api/drafts/x', () => new HttpResponse(null, { status: 404 })),
    )
    const api = createApi({
      fetch: (url, init) => fetch(new URL(String(url), 'http://localhost'), init),
    })
    await expect(api.getDraft('x')).rejects.toBeInstanceOf(ApiError)
  })
})
