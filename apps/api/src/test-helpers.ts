import {
  FakeLLMProvider,
  FakeResearchProvider,
  type FakeChatResponder,
  type LLMChatRequest,
  type FeedFetcher,
  FakePageInfoFetcher,
  LLMAuthError,
  suggestHandle,
  type LLMConfig,
  type LLMRequest,
  type ResearchFinding,
  type ResearchRequest,
} from '@lfwa/core'
import { createApp } from './app'
import { exampleFeeds } from './feeds/factory'
import type { IdentityProvider } from './auth/identity'
import { createScryptHasher } from './auth/password'
import { openStore } from './db/store'
import { MemoryMailer, type Mailer } from './mail/mailer'

export const PUBLIC_URL = 'http://localhost:5173'

export interface TestOptions {
  mailer?: Mailer
  unconfirmedAccountTtlDays?: number
  pageFetcher?: FakePageInfoFetcher
  logger?: Pick<Console, 'error'>
  /** Defaults to a fake that treats every `*.example` address as a feed. */
  feeds?: FeedFetcher

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
    const raw = body instanceof Uint8Array
    const payload = body === undefined ? undefined : raw ? body : JSON.stringify(body)
    const cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await this.app.request(path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body === undefined || raw ? {} : { 'content-type': 'application/json' }),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: payload as NonNullable<ConstructorParameters<typeof Request>[1]>['body'],
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
      /** The whole body as text; for a streamed response this waits for the end. */
      text: () => res.text(),
      bytes: async () => new Uint8Array(await res.arrayBuffer()),
    }
  }

  get = (path: string, headers?: Record<string, string>) =>
    this.request('GET', path, undefined, headers)
  post = (path: string, body?: unknown) => this.request('POST', path, body ?? {})
  put = (path: string, body: unknown) => this.request('PUT', path, body)
  patch = (path: string, body: unknown) => this.request('PATCH', path, body)
  delete = (path: string, body?: unknown) => this.request('DELETE', path, body)
  /** Sends `bytes` as the whole request body, as a browser does when uploading a file. */
  putBytes = (path: string, bytes: Uint8Array, contentType = 'application/octet-stream') =>
    this.request('PUT', path, bytes, { 'content-type': contentType })
}

export function setup(options: TestOptions = {}) {
  const store = openStore(':memory:')
  const pageFetcher = options.pageFetcher ?? new FakePageInfoFetcher()
  const memoryMailer = new MemoryMailer()
  const mailer = options.mailer ?? memoryMailer
  /** Every LLM client the app builds, and every request made through it. */
  const llmCalls: { config: LLMConfig; request: LLMRequest }[] = []
  /** Every conversation turn (`chat()`), with the credentials it was made with. */
  const chats: { config: LLMConfig; request: LLMChatRequest }[] = []
  let chatResponder: FakeChatResponder = () => ({ text: 'A fake reply.' })
  /** Decides what a one-shot `complete()` answers; by default a critique, since that is what asks. */
  let completionResponder: ((request: LLMRequest) => string) | undefined
  const llmFactory = (config: LLMConfig) =>
    new FakeLLMProvider(
      (request) => {
        llmCalls.push({ config, request })
        if (config.apiKey.startsWith('bad-')) throw new LLMAuthError() // rejected by the provider
        if (config.apiKey.startsWith('down-')) throw new Error('provider outage')
        if (completionResponder) return completionResponder(request)
        return JSON.stringify({
          summary: `Critique from ${config.model}.`,
          ready: false,
          points: [
            {
              block: 'b1',
              point: 'Needs a stronger opening.',
              reason: 'It is the first thing read.',
            },
          ],
        })
      },
      // A new fake is built for every request, so count conversation turns here, across all of them.
      (request) => {
        chats.push({ config, request })
        if (config.apiKey.startsWith('bad-')) throw new LLMAuthError()
        return chatResponder(request, chats.length)
      },
    )
  /** Every research request made, with the credentials it was made with. */
  const searches: { config: LLMConfig; request: ResearchRequest }[] = []
  let researchResponder: (
    request: ResearchRequest,
  ) => ResearchFinding[] | Promise<ResearchFinding[]> = () => []
  const researchFactory = (config: LLMConfig) =>
    new FakeResearchProvider((request) => {
      searches.push({ config, request })
      if (config.apiKey.startsWith('bad-')) throw new LLMAuthError()
      return researchResponder(request)
    })
  const feeds = options.feeds ?? exampleFeeds()
  const clock = { now: new Date('2026-01-01T00:00:00Z') }
  const app = createApp({
    store,
    mailer,
    pageFetcher: pageFetcher,
    logger: options.logger,
    unconfirmedAccountTtlDays: options.unconfirmedAccountTtlDays,
    providers: { search: [] },
    feeds,
    llmFactory,
    researchFactory,
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
    /** Every brainstorming turn (`chat()`), with the credentials it was made with. */
    chats,
    /** Decides what the fake AI says next in a brainstorming conversation. */
    setChat: (responder: FakeChatResponder) => {
      chatResponder = responder
    },
    /** Decides what the fake AI answers to a one-shot request (`complete()`), until reset with `undefined`. */
    setCompletion: (responder?: (request: LLMRequest) => string) => {
      completionResponder = responder
    },
    /** Every Research search (`find()`), with the credentials it was made with. */
    searches,
    /** Decides what the fake web search turns up. */
    setResearch: (responder: typeof researchResponder) => {
      researchResponder = responder
    },
    feeds,
    pageFetcher,
    clock,
    /** A fresh "browser" with its own cookie jar. */
    client: () => new TestClient(app),
  }
}

export type TestContext = ReturnType<typeof setup>

export const PASSWORD = 'correct horse battery'

/** The smallest valid PNG header; enough for the server to recognise the type. */
export const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

/** Signs up exactly as the web form does: no profile is created. */
export async function signUp(
  client: TestClient,
  email = 'ada@example.com',
  name = 'Ada Lovelace',
  password = PASSWORD,
  handle = suggestHandle(name, email),
) {
  const res = await client.post('/api/auth/register', { name, email, password, handle })
  expectStatus(res.status, 201)
  return res.json()
}

/**
 * Signs up and creates a first profile ("<name>'s writing"), since most tests are about what
 * happens inside a profile. Use `signUp` for tests about the brand-new account.
 */
export async function register(
  client: TestClient,
  email = 'ada@example.com',
  name = 'Ada Lovelace',
  password = PASSWORD,
  handle = suggestHandle(name, email),
) {
  const user = await signUp(client, email, name, password, handle)
  const res = await client.post('/api/profiles', { name: `${name}'s writing` })
  expectStatus(res.status, 201)
  return user
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
export const lastInvitationToken = (mailer: MemoryMailer) => lastEmailToken(mailer, 'accept-invite')

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

/** Shares a profile the way people do: the owner invites an address, the invitee accepts from the email. */
export async function shareProfile(
  ctx: Pick<TestContext, 'mailer'>,
  owner: TestClient,
  profileId: string,
  invitee: TestClient,
  email: string,
) {
  expectStatus((await owner.post(`/api/profiles/${profileId}/invitations`, { email })).status, 202)
  expectStatus(
    (await invitee.post('/api/invitations/accept', { token: lastInvitationToken(ctx.mailer) }))
      .status,
    200,
  )
}
export const lastEmailChangeToken = (mailer: MemoryMailer) =>
  lastEmailToken(mailer, 'confirm-email-change')
export const lastUndoToken = (mailer: MemoryMailer) => lastEmailToken(mailer, 'undo-email-change')
export const lastDeclineToken = (mailer: MemoryMailer) => lastEmailToken(mailer, 'decline-invite')

/** Starts a draft the way the app does: every draft develops an idea, so this makes one first. */
export async function createDraft(
  client: TestClient,
  profileId: string,
  input: { title?: string; body?: string } = {},
) {
  const base = `/api/profiles/${profileId}/ideas`
  const idea = await (await client.post(base, { name: input.title || 'An idea' })).json()
  const res = await client.post(`${base}/${idea.id}/drafts`, input)
  expectStatus(res.status, 201)
  return res.json()
}
