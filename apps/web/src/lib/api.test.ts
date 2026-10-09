import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiError, createApi } from './api'

const user = {
  id: 'u1',
  name: 'Ada',
  email: 'ada@example.com',
  emailVerified: false,
  hasPassword: true,
  linkedProviders: [],
}

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const api = createApi({
  fetch: (url, init) => fetch(new URL(String(url), 'http://localhost'), init),
})

describe('api client', () => {
  it('sends JSON and parses validated responses', async () => {
    let body: unknown
    server.use(
      http.post('http://localhost/api/auth/login', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(user)
      }),
    )
    expect(await api.login({ email: 'ada@example.com', password: 'pw' })).toEqual(user)
    expect(body).toEqual({ email: 'ada@example.com', password: 'pw' })
  })

  it('surfaces the server error message in an ApiError', async () => {
    server.use(
      http.post('http://localhost/api/auth/login', () =>
        HttpResponse.json({ error: 'Invalid email or password' }, { status: 401 }),
      ),
    )
    const err = await api.login({ email: 'a@b.co', password: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 401, message: 'Invalid email or password' })
  })

  it('rejects responses that do not match the schema', async () => {
    server.use(http.get('http://localhost/api/auth/me', () => HttpResponse.json({ nope: true })))
    await expect(api.me()).rejects.toThrow()
  })

  it('handles empty (204) responses for actions', async () => {
    server.use(
      http.delete('http://localhost/api/account', () => new HttpResponse(null, { status: 204 })),
    )
    await expect(api.deleteAccount('ada@example.com', 'pw')).resolves.toBeUndefined()
  })
})
