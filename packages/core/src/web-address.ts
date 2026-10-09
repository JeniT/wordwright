import { z } from 'zod'

const MESSAGE = 'Enter a web address, like https://example.com'

/** People type "example.org/page"; assume https. */
export const withScheme = (text: string) =>
  /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/
// A real top-level domain: letters (at least two) or an internationalised `xn--` one.
const TLD = /^([a-z]{2,}|xn--[a-z0-9-]{2,})$/

/**
 * Whether the host looks like somewhere on the internet. `new URL("https://rubbish")` is valid, so
 * the URL parser alone lets nonsense through: a public site needs a dot and a real-looking ending.
 */
function plausibleHost(url: URL): boolean {
  if (url.username || url.password) return false // never store credentials someone pasted by mistake
  const host = url.hostname
  if (host.startsWith('[')) return true // an IPv6 address, which the parser has already validated
  if (IPV4.test(host)) return true
  const labels = host.replace(/\.$/, '').split('.')
  if (labels.length < 2) return false
  const tld = labels[labels.length - 1]!
  return TLD.test(tld) && labels.every((l) => /^[a-z0-9-]{1,63}$/.test(l) && !l.startsWith('-'))
}

/**
 * A web page address typed by a person: scheme optional, http(s) only, and a host that looks real.
 * (The server may also check that the site exists when it fetches the page's title.)
 */
export const WebAddressSchema = z
  .string()
  .trim()
  .min(1, MESSAGE)
  .max(2000, 'That web address is too long')
  .transform(withScheme)
  .pipe(z.url({ protocol: /^https?$/, message: MESSAGE }))
  .refine((text) => {
    // Zod runs this even when the URL check above failed, so it must cope with text that isn't one.
    try {
      return plausibleHost(new URL(text))
    } catch {
      return false
    }
  }, MESSAGE)

/**
 * Two addresses with the same key are the same link for our purposes: the scheme (http/https), a
 * leading `www.`, the fragment and a trailing slash don't make a page different.
 */
export function linkKey(address: string): string {
  const url = new URL(withScheme(address.trim()))
  const host = url.hostname.replace(/^www\./, '')
  const port = url.port ? `:${url.port}` : ''
  const path = url.pathname.replace(/\/+$/, '')
  return `${host}${port}${path}${url.search}`
}
