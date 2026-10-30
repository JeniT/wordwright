import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EMAIL_COLOURS,
  handoverOfferEmail,
  reviewFinishedEmail,
  reviewInvitationEmail,
  reviewRequestEmail,
} from './templates'

const base = { draftTitle: 'Meanders', publicationName: 'River Notes', link: 'https://app.test/x' }

describe('review and handover emails', () => {
  it('quote a real title and name, and never quote the fallbacks', () => {
    for (const mail of [
      handoverOfferEmail({ ...base, fromName: 'Ada' }),
      reviewRequestEmail({ ...base, inviterName: 'Ada' }),
      reviewInvitationEmail({ ...base, inviterName: 'Ada', ttlDays: 14 }),
    ]) {
      expect(mail.text).toContain('“Meanders”')
      expect(mail.text).toContain('“River Notes”')
      expect(mail.text).not.toContain('"')
    }
    for (const mail of [
      handoverOfferEmail({ ...base, fromName: 'Ada', draftTitle: ' ', publicationName: '' }),
      reviewRequestEmail({ ...base, inviterName: 'Ada', draftTitle: ' ', publicationName: '' }),
      reviewInvitationEmail({
        ...base,
        inviterName: 'Ada',
        draftTitle: ' ',
        publicationName: '',
        ttlDays: 14,
      }),
    ]) {
      expect(mail.text).toContain('an untitled draft')
      expect(mail.text).toContain('a publication')
      expect(mail.text).not.toMatch(/[“”"]/)
      expect(mail.html).toContain('an untitled draft')
      expect(mail.html).toContain('a publication')
      expect(mail.html).not.toContain('<strong>an untitled')
    }
  })

  it('tells a member that only the editor sees what they write, in both versions', () => {
    const mail = reviewRequestEmail({ ...base, inviterName: 'Ada' })
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('Only the draft’s editor sees what you write.')
      expect(body).toContain('Sign in to open it')
    }
    expect(mail.html).toContain('Review the draft')
  })

  it('tells an outside reviewer how to decline', () => {
    const mail = reviewInvitationEmail({ ...base, inviterName: 'Ada', ttlDays: 14 })
    expect(mail.html).toContain('Review the draft')
    for (const body of [mail.text, mail.html]) expect(body).toContain('use the same link')
  })

  it('tells an outside reviewer what Wordwright is, in both versions', () => {
    const mail = reviewInvitationEmail({ ...base, inviterName: 'Ada', ttlDays: 14 })
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('Wordwright helps people who love writing to do more of it.')
      expect(body).toContain(
        'Wordwright helps spark ideas, research different perspectives, work out what to say, and improve your drafts, but it never writes your words for you.',
      )
    }
  })

  it('offers the handover without a promise about the offerer', () => {
    const mail = handoverOfferEmail({ ...base, fromName: 'Ada' })
    expect(mail.text).toContain('Nothing changes until you accept:')
    expect(mail.text).not.toContain('keep working')
    expect(mail.html).not.toContain('keep working')
  })

  describe('when a review is finished', () => {
    const finished = (commentCount: number) =>
      reviewFinishedEmail({ reviewerName: 'Rae', draftTitle: 'Meanders', commentCount, link: 'l' })

    it('says how many comments there are', () => {
      expect(finished(1).text).toContain('and left 1 comment.')
      expect(finished(2).html).toContain('Read the comments')
    })

    it('does not quote an untitled draft', () => {
      const mail = reviewFinishedEmail({
        reviewerName: 'Rae',
        draftTitle: '',
        commentCount: 1,
        link: 'l',
      })
      expect(mail.text).toContain('finished reviewing an untitled draft and left')
      expect(mail.html).not.toContain('<strong>an untitled')
    })

    it('says so plainly when there are none', () => {
      const mail = finished(0)
      expect(mail.text).toContain('finished reviewing “Meanders” without leaving comments.')
      expect(mail.text).not.toContain('0 comments')
      expect(mail.html).toContain('Open the draft')
      expect(mail.html).not.toContain('Read the comments')
    })
  })
})

describe('email colours', () => {
  const palette = readFileSync(
    new URL('../../../web/src/theme/palette-ember.css', import.meta.url),
    'utf8',
  )
  // The first definition of a role is the light palette.
  const light = (role: string) => palette.match(new RegExp(`--${role}:\\s*(#[0-9a-f]{6})`, 'i'))![1]

  it('match the Ember light palette, so they cannot drift', () => {
    expect(EMAIL_COLOURS.button).toBe(light('accent'))
    expect(EMAIL_COLOURS.onButton).toBe(light('on-accent'))
    expect(EMAIL_COLOURS.page).toBe(light('paper'))
    expect(EMAIL_COLOURS.text).toBe(light('ink'))
    expect(EMAIL_COLOURS.muted).toBe(light('ink-soft'))
  })

  it('are used by the buttons in a rendered email', () => {
    const { html } = reviewInvitationEmail({ ...base, inviterName: 'Ada', ttlDays: 14 })
    expect(html).toContain(`background:${EMAIL_COLOURS.button};color:${EMAIL_COLOURS.onButton}`)
  })

  it('are the only colours in the templates', () => {
    const source = readFileSync(new URL('./templates.ts', import.meta.url), 'utf8')
    const outside = source.replace(/export const EMAIL_COLOURS = \{[^}]*\}/, '')
    expect(outside.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}[;"' ]/gi)).toBeNull()
  })
})
