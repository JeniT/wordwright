/**
 * Errors the person can act on, thrown by services and routes alike. The status says how the API answers;
 * `app.ts` turns every one into `{ error: message }`. Services use this rather than anything from Hono, so the
 * business rules stay free of HTTP machinery.
 */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 502 | 504

export class DomainError extends Error {
  constructor(
    readonly status: ErrorStatus,
    message: string,
  ) {
    super(message)
  }
}

export const fail = (status: ErrorStatus, message: string) => new DomainError(status, message)

/** Also used when the thing exists but belongs to someone else, so nothing is given away. */
export const notFound = () => fail(404, 'Not found')
