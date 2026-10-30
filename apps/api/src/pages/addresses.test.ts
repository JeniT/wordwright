import { describe, expect, it } from 'vitest'
import { isPublicAddress } from './addresses'

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2a00:1450:4009:81f::200e',
  ])('allows the public address %s', (address) => expect(isPublicAddress(address)).toBe(true))

  it.each([
    '127.0.0.1',
    '127.255.255.254',
    '10.0.0.1',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254', // cloud metadata
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '192.0.2.1',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    'fc00::1',
    'ff02::1',
    '2001:db8::1',
    '::ffff:127.0.0.1', // IPv4 loopback written as IPv6
    '::ffff:10.1.2.3',
    '::ffff:7f00:1',
    '64:ff9b::7f00:1',
    '2002:7f00:1::',
    '2002:a00:1::', // 6to4 wrapping 10.0.0.1
    '64:ff9b:1::a00:1', // local-use NAT64
    'fec0::1', // deprecated site-local
    '::10.0.0.1', // deprecated IPv4-compatible form
    '198.51.100.7',
    '203.0.113.9',
  ])('refuses %s', (address) => expect(isPublicAddress(address)).toBe(false))

  it('allows a public IPv4 address written as IPv6', () => {
    expect(isPublicAddress('::ffff:8.8.8.8')).toBe(true)
  })

  it('refuses anything that is not an IP address', () => {
    for (const text of ['localhost', 'example.com', '', '999.1.1.1', '1.2.3']) {
      expect(isPublicAddress(text), text).toBe(false)
    }
  })

  it('does not treat the edges of a private range as public', () => {
    expect(isPublicAddress('172.15.255.255')).toBe(true)
    expect(isPublicAddress('172.32.0.0')).toBe(true)
    expect(isPublicAddress('11.0.0.0')).toBe(true)
  })
})
