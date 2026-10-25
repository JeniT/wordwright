import { BlockList, isIP } from 'node:net'

// Everything that isn't a public internet address: private networks, loopback, link-local (which
// includes cloud metadata services at 169.254.169.254), carrier-grade NAT, documentation ranges,
// multicast and reserved space. The server must never be made to contact any of these.
const blocked = new BlockList()
for (const [net, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blocked.addSubnet(net, bits, 'ipv4')
}
for (const [net, bits] of [
  ['::', 96], // the unspecified address, loopback (::1) and the deprecated IPv4-compatible form (::10.0.0.1)
  ['64:ff9b::', 96], // NAT64: embeds an IPv4 address we'd have to vet
  ['64:ff9b:1::', 48], // local-use NAT64, the same
  ['100::', 64],
  ['2001::', 32], // Teredo
  ['2001:db8::', 32],
  ['2002::', 16], // 6to4: embeds an IPv4 address
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10], // deprecated site-local
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, bits, 'ipv6')
}

/** Whether `address` (an IP literal, not a host name) is somewhere on the public internet. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (!family) return false
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged by its IPv4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return isPublicAddress(mapped[1]!)
  if (/^::ffff:/i.test(address)) return false // the hex spelling of the same thing: refuse rather than parse
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6')
}
