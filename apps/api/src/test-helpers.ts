import { FakeLLMProvider, LLMAuthError, type LLMConfig, type LLMRequest } from '@lfwa/core'
import { createApp } from './app'
import type { IdentityProvider } from './auth/identity'
import { createScryptHasher } from './auth/password'
import { openStore } from './db/store'
import { MemoryMailer, type Mailer } from './mail/mailer'

export const PUBLIC_URL = 'http://localhost:5173'

export interface TestOptions {
  mailer?: Mailer
  logger?: Pick<Console, 'error'>

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
  const memoryMailer = new MemoryMailer()
  const mailer = options.mailer ?? memoryMailer
  /** Every LLM client the app builds, and every request made through it. */
  const llmCalls: { config: LLMConfig; request: LLMRequest }[] = []
  const llmFactory = (config: LLMConfig) =>
    new FakeLLMProvider((request) => {
      llmCalls.push({ config, request })
      if (config.apiKey.startsWith('bad-')) throw new LLMAuthError() // rejected by the provider
      if (config.apiKey.startsWith('down-')) throw new Error('provider outage')
      return `Critique from ${config.model}: needs a stronger opening.`
    })
  const clock = { now: new Date('2026-01-01T00:00:00Z') }
  const app = createApp({
    store,
    mailer,
    logger: options.logger,
    providers: { search: [] },
    llmFactory,
    keyEncryptionSecret: 'test-key-secret-test-key-secret!!',
    identityProviders: options.identityProviders,
    publicUrl: PUBLIC_URL,
    sessionSecret: 'test-secret-test-secret-test-secret',
    hasher: createScryptHasher({ cost: 16 }), // fast; production uses the default cost
    now: () => clock.now,
  })
  return {
    app,
    store,
    mailer: memoryMailer,
    llmCalls,
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

/** Pulls the token out of the most recent email's link, e.g. `/reset-password?token=...`. */
function lastEmailToken(mailer: MemoryMailer, page: string): string {
  const text = mailer.outbox.at(-1)?.text ?? ''
  const token = text.match(new RegExp(`${page}\\?token=([\\w-]+)`))?.[1]
  if (!token) throw new Error(`No ${page} link in last email`)
  return token
}
export const lastResetToken = (mailer: MemoryMailer) => lastEmailToken(mailer, 'reset-password')
export const lastVerificationToken = (mailer: MemoryMailer) =>
  lastEmailToken(mailer, 'verify-email')

/** Marks accounts as email-verified directly, for tests about something other than verification. */
export function verifyAccounts(ctx: Pick<TestContext, 'store'>, ...emails: string[]) {
  for (const email of emails)
    ctx.store.users.markEmailVerified(ctx.store.users.findByEmail(email)!.id)
}

export const GOOD_KEY = 'sk-ant-good-key-1234567890'

/** Saves an API key for the signed-in user. */
export async function saveKey(client: TestClient, apiKey = GOOD_KEY, model = 'claude-sonnet-5-5') {
  const res = await client.put('/api/llm', { provider: 'anthropic', model, apiKey })
  expectStatus(res.status, 200)
  return res.json()
}
