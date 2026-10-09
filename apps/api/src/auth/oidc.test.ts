import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { googleProvider, OidcProvider } from './identity'

const ISSUER = 'https://idp.example'
const CLIENT_ID = 'client-123'

let signingKey: CryptoKey
let jwks: ReturnType<typeof createLocalJWKSet>
let otherKey: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  signingKey = pair.privateKey
  otherKey = (await generateKeyPair('RS256')).privateKey
  jwks = createLocalJWKSet({
    keys: [{ ...(await exportJWK(pair.publicKey)), alg: 'RS256', use: 'sig' }],
  })
})

function idToken(claims: Record<string, unknown> = {}, key = signingKey, aud = CLIENT_ID) {
  return new SignJWT({
    email: 'Ada@Example.com',
    email_verified: true,
    name: 'Ada',
    nonce: 'n-1',
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('sub-1')
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key)
}

function provider(respond: () => Promise<Response>) {
  const requests: { url: string; body: URLSearchParams }[] = []
  const p = new OidcProvider({
    id: 'test',
    label: 'Test',
    issuer: ISSUER,
    authorizationEndpoint: `${ISSUER}/authorize`,
    tokenEndpoint: `${ISSUER}/token`,
    jwksUri: `${ISSUER}/jwks`,
    clientId: CLIENT_ID,
    clientSecret: 'shh',
    jwks,
    fetch: async (url, init) => {
      requests.push({ url: String(url), body: init!.body as URLSearchParams })
      return respond()
    },
  })
  return { p, requests }
}

const exchange = { code: 'c', codeVerifier: 'v', redirectUri: 'https://app/cb', nonce: 'n-1' }
const tokenResponse = async (token: Promise<string>) => Response.json({ id_token: await token })

describe('OidcProvider', () => {
  it('builds an authorization URL with state, nonce and an S256 PKCE challenge', () => {
    const url = new URL(
      provider(async () => Response.json({})).p.authorizationUrl({
        state: 's',
        nonce: 'n',
        codeChallenge: 'cc',
        redirectUri: 'https://app/cb',
      }),
    )
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: CLIENT_ID,
      state: 's',
      nonce: 'n',
      code_challenge: 'cc',
      code_challenge_method: 'S256',
      redirect_uri: 'https://app/cb',
    })
    expect(url.searchParams.get('scope')).toContain('email')
  })

  it('exchanges the code and returns verified claims (email lower-cased)', async () => {
    const { p, requests } = provider(() => tokenResponse(idToken()))
    expect(await p.exchangeCode(exchange)).toEqual({
      subject: 'sub-1',
      email: 'ada@example.com',
      emailVerified: true,
      name: 'Ada',
    })
    expect(requests[0]!.body.get('code_verifier')).toBe('v')
    expect(requests[0]!.body.get('grant_type')).toBe('authorization_code')
  })

  it('treats a missing email_verified claim as unverified', async () => {
    const { p } = provider(() => tokenResponse(idToken({ email_verified: undefined })))
    expect((await p.exchangeCode(exchange)).emailVerified).toBe(false)
  })

  it.each([
    ['a nonce that does not match', () => idToken({ nonce: 'other' })],
    ['a token for another client', () => idToken({}, signingKey, 'someone-else')],
    ['a token signed by an unknown key', () => idToken({}, otherKey)],
  ])('rejects %s', async (_label, make) => {
    const { p } = provider(() => tokenResponse(make()))
    await expect(p.exchangeCode(exchange)).rejects.toThrow()
  })

  it('rejects token endpoint failures and responses without an ID token', async () => {
    await expect(
      provider(async () => new Response('no', { status: 400 })).p.exchangeCode(exchange),
    ).rejects.toThrow(/Token exchange failed/)
    await expect(provider(async () => Response.json({})).p.exchangeCode(exchange)).rejects.toThrow(
      /No ID token/,
    )
  })
})

describe('googleProvider', () => {
  it('is configured for Google', () => {
    const g = googleProvider('id', 'secret')
    expect(g.id).toBe('google')
    expect(
      g.authorizationUrl({
        state: 's',
        nonce: 'n',
        codeChallenge: 'c',
        redirectUri: 'https://app/cb',
      }),
    ).toContain('accounts.google.com')
  })
})
