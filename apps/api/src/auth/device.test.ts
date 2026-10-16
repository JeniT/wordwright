import { describe, expect, it } from 'vitest'
import { describeDevice, UNKNOWN_DEVICE } from './device'

const UAS: Array<[string, string]> = [
  [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Safari on macOS',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Chrome on Windows',
  ],
  [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
    'Edge on Windows',
  ],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0', 'Firefox on Linux'],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Safari on iOS',
  ],
  [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1',
    'Chrome on iOS',
  ],
  [
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    'Chrome on Android',
  ],
]

describe('describeDevice', () => {
  it.each(UAS)('describes %s', (ua, label) => {
    expect(describeDevice(ua)).toBe(label)
  })

  it('says "Unknown device" for a missing or unrecognised user-agent', () => {
    expect(describeDevice(undefined)).toBe(UNKNOWN_DEVICE)
    expect(describeDevice('')).toBe(UNKNOWN_DEVICE)
    expect(describeDevice('curl/8.4.0')).toBe(UNKNOWN_DEVICE)
  })

  it('only ever returns words from its own list, never text from the header', () => {
    expect(describeDevice('<script>alert(1)</script> Firefox/1 (Windows NT 10.0)')).toBe(
      'Firefox on Windows',
    )
    expect(describeDevice('<script>alert(1)</script>')).toBe(UNKNOWN_DEVICE)
  })

  it('copes with a huge header quickly', () => {
    const started = Date.now()
    expect(describeDevice('(' + 'Windows NT '.repeat(200_000))).toBe('Windows')
    expect(Date.now() - started).toBeLessThan(200)
  })
})
