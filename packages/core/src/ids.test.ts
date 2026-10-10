import { describe, expect, it } from 'vitest'
import { ProfileInputSchema, ProfileUpdateSchema, SiteUrlSchema } from './domain'
import { firstAvailable, profileIdFor, slugify, suggestHandle } from './ids'
import { detectImageType } from './images'

describe('slugify', () => {
  it('makes readable, URL-safe slugs', () => {
    expect(slugify('Substack')).toBe('substack')
    expect(slugify("Jeni's Weekly  Newsletter!")).toBe('jenis-weekly-newsletter')
    expect(slugify('Café Müller')).toBe('cafe-muller')
    expect(slugify('  --a--b--  ')).toBe('a-b')
  })

  it('is empty when nothing usable remains, and trims cleanly when shortened', () => {
    expect(slugify('日本語')).toBe('')
    expect(slugify('abc def ghi', 7)).toBe('abc-def')
    expect(slugify('abc def ghi', 8)).toBe('abc-def')
  })
})

describe('suggestHandle', () => {
  it('uses letters and digits from the name', () => {
    expect(suggestHandle('Jeni T.', 'x@example.com')).toBe('jenit')
    expect(suggestHandle('Zoë Ünal', 'x@example.com')).toBe('zoeunal')
  })

  it('falls back to the email, then to a default, and always meets the minimum length', () => {
    expect(suggestHandle('日本語', 'sam.smith@example.com')).toBe('samsmith')
    expect(suggestHandle('日本語', '!!@example.com')).toBe('writer')
    expect(suggestHandle('Al', 'al@example.com')).toBe('alwriter')
  })

  it('never contains a hyphen, so ids split unambiguously', () => {
    expect(suggestHandle('Mary-Jane O’Neil', 'x@example.com')).toBe('maryjaneoneil')
  })
})

describe('profile ids', () => {
  it('join handle and slug', () => {
    expect(profileIdFor('jenit', 'Substack')).toBe('jenit-substack')
    expect(profileIdFor('jenit', '日本語')).toBe('jenit-profile')
  })

  it('cannot collide across different (handle, slug) pairs', () => {
    // "jen" + "it-substack" would clash with "jenit" + "substack" if handles could hold "-"
    expect(profileIdFor('jen', 'it substack')).toBe('jen-it-substack')
    expect(profileIdFor('jenit', 'substack')).toBe('jenit-substack')
    expect(profileIdFor('jen', 'it substack')).not.toBe(profileIdFor('jenit', 'substack'))
  })
})

describe('firstAvailable', () => {
  it('returns the base when free, else the first free numbered variant', () => {
    expect(firstAvailable('a', () => false)).toBe('a')
    expect(firstAvailable('a', (c) => ['a', 'a2'].includes(c))).toBe('a3')
    expect(firstAvailable('a-b', (c) => c === 'a-b', '-')).toBe('a-b-2')
  })
})

describe('SiteUrlSchema', () => {
  it('accepts web addresses and assumes https when the scheme is missing', () => {
    expect(SiteUrlSchema.parse(' https://jeni.substack.com ')).toBe('https://jeni.substack.com')
    expect(SiteUrlSchema.parse('jeni.substack.com')).toBe('https://jeni.substack.com')
    expect(SiteUrlSchema.parse('http://example.com/blog')).toBe('http://example.com/blog')
  })

  it('refuses anything that is not http(s), including script URLs', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://example.com',
      '',
      'http://',
      'https://rubbish',
      'rubbish',
    ]) {
      expect(SiteUrlSchema.safeParse(bad).success, bad).toBe(false)
    }
  })

  it('refuses an address longer than 300 characters', () => {
    expect(SiteUrlSchema.safeParse(`https://example.com/${'a'.repeat(300)}`).success).toBe(false)
  })

  it('is optional on create and clearable on update', () => {
    expect(ProfileInputSchema.parse({ name: 'A' })).toEqual({ name: 'A' })
    expect(ProfileUpdateSchema.parse({ siteUrl: null })).toEqual({ siteUrl: null })
    expect(ProfileUpdateSchema.parse({})).toEqual({})
  })
})

describe('detectImageType', () => {
  it('recognises images by content, not by what the sender claims', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')
    expect(detectImageType(png)).toBe('image/png')
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(detectImageType(new TextEncoder().encode('GIF89a'))).toBe('image/gif')
    expect(detectImageType(webp)).toBe('image/webp')
  })

  it('rejects SVG, HTML and empty input', () => {
    expect(detectImageType(new TextEncoder().encode('<svg xmlns="..."></svg>'))).toBeUndefined()
    expect(detectImageType(new TextEncoder().encode('<html>'))).toBeUndefined()
    expect(detectImageType(new Uint8Array())).toBeUndefined()
  })
})
