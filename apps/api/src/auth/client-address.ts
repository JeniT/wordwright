import type { Context } from 'hono'

/**
 * Where a request came from, as Caddy saw it (#390): the last entry of X-Forwarded-For. Caddy replaces any header the
 * client sent, so there is normally just one; the last is still right if something in front of Caddy appended to it.
 * Only call this when the API is reached through Caddy alone (`TRUST_PROXY`): otherwise anyone could write the header.
 */
export function forwardedClient(c: Context): string | undefined {
  const last = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()
  return last ? throttleKey(last) : undefined
}

/**
 * IPv6 addresses are counted by their /64, since one connection is usually given a whole /64 and could take a new
 * address for every request. IPv4 (including IPv4 written as IPv6) is counted as it is.
 */
function throttleKey(address: string): string {
  const plain = address.replace(/%.*$/, '') // a zone id such as %eth0
  if (!plain.includes(':')) return plain
  const mapped = plain.match(/:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return mapped[1]!
  const [head = '', tail] = plain.split('::')
  const front = head ? head.split(':') : []
  const back = tail ? tail.split(':') : []
  const groups = [...front, ...Array(8 - front.length - back.length).fill('0'), ...back]
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')}::/64`
}
