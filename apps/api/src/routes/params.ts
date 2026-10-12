import { notFound } from '../errors'

/**
 * A path parameter the route is mounted with. A missing one can only mean the URL didn't match, so the answer
 * is a 404 rather than a crash.
 */
export function param(
  c: { req: { param(name: string): string | undefined } },
  name: string,
): string {
  const value = c.req.param(name)
  if (value === undefined) throw notFound()
  return value
}
