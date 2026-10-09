import { describe, expect, it } from 'vitest'
import { linkKey, WebAddressSchema } from './web-address'

const parse = (text: string) => WebAddressSchema.safeParse(text)

describe('WebAddressSchema', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['example.org/meanders', 'https://example.org/meanders'],
    ['  http://sub.example.co.uk/a?b=1#c  ', 'http://sub.example.co.uk/a?b=1#c'],
    ['www.example.com', 'https://www.example.com'],
    ['https://192.168.1.1/', 'https://192.168.1.1/'], // plausible; fetching refuses it separately
    ['https://bücher.example/', 'https://bücher.example/'],
  ])('accepts %s', (input, expected) => {
    expect(parse(input)).toMatchObject({ success: true, data: expected })
  })

  it.each([
    'rubbish',
    'not a web address',
    '',
    '   ',
    'https://rubbish',
    'localhost',
    'http://localhost:3000',
    'example.',
    'example.123',
    'a..b.com',
    '-bad.example.com',
    'javascript:alert(1)',
    'ftp://example.org/file',
    'mailto:ada@example.com',
    'https://user:secret@example.com/',
    'https://',
    'x'.repeat(2001),
  ])('rejects %j with a readable message', (input) => {
    const result = parse(input)
    expect(result.success).toBe(false)
    expect(result.error!.issues[0]!.message).toMatch(/web address/)
  })
})

describe('linkKey', () => {
  it('treats the same page written differently as the same link', () => {
    const key = linkKey('https://example.com/a/b')
    for (const same of [
      'http://example.com/a/b',
      'https://www.example.com/a/b',
      'https://EXAMPLE.com/a/b/',
      'https://example.com/a/b#section',
      'example.com/a/b',
    ]) {
      expect(linkKey(same), same).toBe(key)
    }
  })

  it('keeps different pages apart', () => {
    const key = linkKey('https://example.com/a')
    for (const other of [
      'https://example.com/b',
      'https://example.com/a?x=1',
      'https://example.org/a',
      'https://example.com:8080/a',
    ]) {
      expect(linkKey(other), other).not.toBe(key)
    }
  })
})
