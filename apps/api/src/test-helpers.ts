import { FakeLLMProvider } from '@lfwa/core'
import { createApp } from './app'
import type { IdentityProvider } from './auth/identity'
import { createScryptHasher } from './auth/password'
import { openStore } from './db/store'
import { MemoryMailer } from './mail/mailer'

export const PUBLIC_URL = 'http://localhost:5173'

export interface TestOptions {
  identityProviders?: IdentityProvider[]
}

/** A tiny cookie-keeping HTTP client over `app.request`, standing in for a browser. */
export class TestClient {
  readonly cookies = new Map<string, string>()

  constructor(private readonly app: ReturnType<typeof createApp>) {}

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await this.app.request(path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split('; ')
      const [name, value = ''] = pair!.split('=')
      const expired = attrs.some((a) => a.toLowerCase() === 'max-age=0')
      if (expired || value === '') this.cookies.delete(name!)
      else this.cookies.set(name!, value)
    }
    return {
      status: res.status,
      headers: res.headers,
      setCookies: res.headers.getSetCookie(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: () => res.json() as Promise<any>,
    }
  }

  get = (path: string, headers?: Record<string, string>) =>
    this.request('GET', path, undefined, headers)
  post = (path: string, body?: unknown) => this.request('POST', path, body ?? {})
  put = (path: string, body: unknown) => this.request('PUT', path, body)
  patch = (path: string, body: unknown) => this.request('PATCH', path, body)
  delete = (path: string, body?: unknown) => this.request('DELETE', path, body)
}

export function setup(options: TestOptions = {}) {
  const store = openStore(':memory:')
  const mailer = new MemoryMailer()
  const llm = new FakeLLMProvider(() => 'Needs a stronger opening.')
  const clock = { now: new Date('2026-01-01T00:00:00Z') }
  const app = createApp({
    store,
    mailer,
    providers: { llm, search: [] },
    identityProviders: options.identityProviders,
    publicUrl: PUBLIC_URL,
    sessionSecret: 'test-secret-test-secret-test-secret',
    hasher: createScryptHasher({ cost: 16 }), // fast; production uses the default cost
    now: () => clock.now,
  })
  return {
    app,
    store,
    mailer,
    llm,
    clock,
    /** A fresh "browser" with its own cookie jar. */
    client: () => new TestClient(app),
  }
}

export type TestContext = ReturnType<typeof setup>

export const PASSWORD = 'correct horse battery'

export async function register(
  client: TestClient,
  email = 'ada@example.com',
  name = 'Ada Lovelace',
  password = PASSWORD,
) {
  const res = await client.post('/api/auth/register', { name, email, password })
  expectStatus(res.status, 201)
  return res.json()
}

function expectStatus(actual: number, expected: number) {
  if (actual !== expected) throw new Error(`Expected status ${expected} but got ${actual}`)
}

/** Pulls the reset token out of the most recent email. */
export function lastResetToken(mailer: MemoryMailer): string {
  const text = mailer.outbox.at(-1)?.text ?? ''
  const token = text.match(/reset-password\?token=([\w-]+)/)?.[1]
  if (!token) throw new Error('No reset link in last email')
  return token
}
