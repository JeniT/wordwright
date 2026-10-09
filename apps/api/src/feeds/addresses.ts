import { BlockList, isIP } from 'node:net'

/**
 * Ranges a feed address must never lead to: this machine, private networks, link-local addresses
 * (including cloud metadata services) and other non-public space. People type the addresses we
 * fetch, so without this they could make the server read pages only the server can reach.
 */
const blocked = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, e.g. cloud metadata
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and broadcast
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
  ['64:ff9b::', 96], // NAT64: can reach IPv4 space
  ['2001:db8::', 32], // documentation
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6')
}

/** True if `ip` (a literal address) is on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  if (family === 0) return false
  // An IPv4 address written the IPv6 way (::ffff:10.0.0.1) is the IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapped) return isPublicAddress(mapped[1]!)
  return !blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6')
}
