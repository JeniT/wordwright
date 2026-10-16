export const UNKNOWN_DEVICE = 'Unknown device'

/** The user-agent is client-controlled, so only the first part is read. */
const MAX_LENGTH = 512

// Order matters: Edge, Opera and Chrome on iOS also say "Chrome" or "Safari".
const BROWSERS: Array<[string, RegExp]> = [
  ['Edge', /\b(?:Edg|EdgA|EdgiOS|Edge)\//],
  ['Opera', /\b(?:OPR|OPiOS)\//],
  ['Firefox', /\b(?:Firefox|FxiOS)\//],
  ['Chrome', /\b(?:Chrome|CriOS)\//],
  ['Safari', /\bSafari\//],
]

// iPhone and iPad say "like Mac OS X", and Android says "Linux", so those go first.
const SYSTEMS: Array<[string, RegExp]> = [
  ['iOS', /\b(?:iPhone|iPad|iPod)\b/],
  ['Android', /\bAndroid\b/],
  ['ChromeOS', /\bCrOS\b/],
  ['Windows', /\bWindows\b/],
  ['macOS', /\bMac OS X\b|\bMacintosh\b/],
  ['Linux', /\bLinux\b|\bX11\b/],
]

/**
 * A coarse, human label for a signed-in device ("Safari on macOS"), taken from the User-Agent header. This is all we
 * keep of it (no IP address, no location), and the result always comes from the fixed words above, so nothing the
 * client sends is stored or shown back. The patterns are anchored on literal words, so they cannot backtrack badly.
 */
export function describeDevice(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').slice(0, MAX_LENGTH)
  const browser = BROWSERS.find(([, re]) => re.test(ua))?.[0]
  const system = SYSTEMS.find(([, re]) => re.test(ua))?.[0]
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? UNKNOWN_DEVICE
}
