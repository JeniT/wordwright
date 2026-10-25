export interface IdentityClaims {
  /** Stable, provider-scoped user id. Never use the email as the identity key. */
  subject: string
  email: string
  emailVerified: boolean
  name: string
}

export interface AuthorizationParams {
  state: string
  nonce: string
  codeChallenge: string
  redirectUri: string
}

export interface CodeExchange {
  code: string
  codeVerifier: string
  redirectUri: string
  nonce: string
}

/**
 * Port for "log in with X". Anything speaking OpenID Connect can be added with `OidcProvider` (in
 * `apps/api`, which needs `jose` and the network); others implement this interface directly.
 * `FakeIdentityProvider` is the fake.
 */
export interface IdentityProvider {
  readonly id: string
  readonly label: string
  authorizationUrl(params: AuthorizationParams): string
  exchangeCode(params: CodeExchange): Promise<IdentityClaims>
}

/** What the fake's pretend identity provider holds about a person, before it is turned into claims. */
export interface FakeIdentity {
  subject: string
  email: string
  /** Absent means the provider never said, which counts as unverified. */
  emailVerified?: boolean
  name?: string
}

/**
 * Test double: "authenticates" as whoever it was given when the code is `good-code`, checking only the
 * plumbing. It shapes the claims as `OidcProvider` does (lower-cased email, unverified unless said).
 */
export class FakeIdentityProvider implements IdentityProvider {
  readonly exchanged: { code: string; codeVerifier: string; nonce: string }[] = []

  constructor(
    public claims: FakeIdentity,
    readonly id = 'fake',
    readonly label = 'Fake',
  ) {}

  authorizationUrl(p: AuthorizationParams) {
    const url = new URL('https://idp.test/authorize')
    url.search = new URLSearchParams({
      redirect_uri: p.redirectUri,
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: 'S256',
    }).toString()
    return url.toString()
  }

  async exchangeCode(p: CodeExchange): Promise<IdentityClaims> {
    if (p.code !== 'good-code') throw new Error('Token exchange failed (400)')
    this.exchanged.push({ code: p.code, codeVerifier: p.codeVerifier, nonce: p.nonce })
    const { subject, email, emailVerified, name } = this.claims
    return {
      subject,
      email: email.toLowerCase(),
      emailVerified: emailVerified === true,
      name: name || email,
    }
  }
}
