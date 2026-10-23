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

/**
 * What to write in the log about an unexpected error: its type, its code if it has one, and where it came from. Never
 * its message. Library messages can quote what the request held (a JSON parse error shows the start of the text; an HTTP
 * client error can show a request's headers, which carry a writer's AI key), and the log must hold no request bodies,
 * keys, tokens or links. The stack's frames are enough to find the cause.
 */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return `non-error thrown (${typeof err})`
  const code = (err as { code?: unknown }).code
  const frames = (err.stack ?? '')
    .split('\n')
    .filter((line) => line.trim().startsWith('at '))
    .slice(0, 8)
    .join('\n')
  return [err.name, typeof code === 'string' ? `code ${code}` : '', frames && `\n${frames}`]
    .filter(Boolean)
    .join(' ')
}
