import type { AuthorizationParams, CodeExchange, IdentityProvider } from '@wordwright/core'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export interface OidcProviderOptions {
  id: string
  label: string
  issuer: string | string[]
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksUri: string
  clientId: string
  clientSecret: string
  scopes?: string[]
  /** Overridable for tests. */
  fetch?: typeof fetch
  jwks?: JWTVerifyGetKey
}

/** Authorization-code flow with PKCE; verifies the ID token's signature, issuer, audience and nonce. */
export class OidcProvider implements IdentityProvider {
  readonly id: string
  readonly label: string
  private readonly jwks: JWTVerifyGetKey
  private readonly fetch: typeof fetch

  constructor(private readonly o: OidcProviderOptions) {
    this.id = o.id
    this.label = o.label
    this.fetch = o.fetch ?? ((...a) => fetch(...a))
    this.jwks = o.jwks ?? createRemoteJWKSet(new URL(o.jwksUri))
  }

  authorizationUrl(p: AuthorizationParams) {
    const url = new URL(this.o.authorizationEndpoint)
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.o.clientId,
      redirect_uri: p.redirectUri,
      scope: (this.o.scopes ?? ['openid', 'email', 'profile']).join(' '),
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: 'S256',
    }).toString()
    return url.toString()
  }

  async exchangeCode(p: CodeExchange) {
    const res = await this.fetch(this.o.tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: p.code,
        redirect_uri: p.redirectUri,
        client_id: this.o.clientId,
        client_secret: this.o.clientSecret,
        code_verifier: p.codeVerifier,
      }),
    })
    if (!res.ok) throw new Error(`Token exchange failed (${res.status})`)
    const { id_token: idToken } = (await res.json()) as { id_token?: string }
    if (!idToken) throw new Error('No ID token returned')

    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: this.o.issuer,
      audience: this.o.clientId,
    })
    if (payload.nonce !== p.nonce) throw new Error('Nonce mismatch')
    if (!payload.sub || typeof payload.email !== 'string') throw new Error('Missing claims')

    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' && payload.name ? payload.name : payload.email,
    }
  }
}

export function googleProvider(clientId: string, clientSecret: string): OidcProvider {
  return new OidcProvider({
    id: 'google',
    label: 'Google',
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    clientId,
    clientSecret,
  })
}
