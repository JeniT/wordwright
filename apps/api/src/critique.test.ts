import { describe, expect, it } from 'vitest'
import { MAX_CRITIQUE_POINTS, splitBlocks } from '@lfwa/core'
import { formatDraftForCritique, parseCritique } from './services/critique'

const blocks = splitBlocks('Opening paragraph.\n\nMiddle paragraph.\n\nEnd.')
const point = (block: string) => ({ block, point: `About ${block}`, reason: 'Because.' })
const reply = (points: unknown[], extra: object = {}) =>
  JSON.stringify({ summary: 'Fine.', ready: false, points, ...extra })

describe('formatDraftForCritique', () => {
  it('sends the title, then each block under the id the model must use', () => {
    const { message } = formatDraftForCritique({ title: 'T', body: 'One.\n\nTwo.' })
    expect(message).toBe('# T\n\n[b1] One.\n\n[b2] Two.')
  })
})

describe('parseCritique', () => {
  it('reads points, adding the start of the block each is about', () => {
    expect(parseCritique(reply([point('b2'), point('whole')]), blocks)).toEqual({
      summary: 'Fine.',
      ready: false,
      points: [
        { block: 'b2', excerpt: 'Middle paragraph.', point: 'About b2', reason: 'Because.' },
        { block: 'whole', excerpt: '', point: 'About whole', reason: 'Because.' },
      ],
    })
  })

  it('reads a reply wrapped in a code fence', () => {
    const fenced = '```json\n' + reply([point('b1')]) + '\n```'
    expect(parseCritique(fenced, blocks)?.points).toHaveLength(1)
  })

  it('never lets a point name a block it was not shown', () => {
    const result = parseCritique(reply([point('b9'), point('b1'), point('__proto__')]), blocks)
    expect(result?.points.map((p) => p.block)).toEqual(['b1'])
  })

  it('is not a critique when every point was about something unseen', () => {
    expect(parseCritique(reply([point('b9')]), blocks)).toBeNull()
  })

  it('keeps only the most important points, in the order given', () => {
    const many = Array.from({ length: 9 }, (_, i) => point(i % 2 ? 'b1' : 'b2'))
    many[0] = { ...many[0]!, point: 'The first and most important' }
    const result = parseCritique(reply(many), blocks)
    expect(result?.points).toHaveLength(MAX_CRITIQUE_POINTS)
    expect(result?.points[0]?.point).toBe('The first and most important')
  })

  it('says ready with no points when there is nothing important left', () => {
    expect(parseCritique(reply([], { ready: true, summary: 'Ready.' }), blocks)).toEqual({
      summary: 'Ready.',
      ready: true,
      points: [],
    })
  })

  it('refuses anything else', () => {
    expect(parseCritique('Tighten the opening.', blocks)).toBeNull()
    expect(parseCritique('{"summary": 1}', blocks)).toBeNull()
    expect(parseCritique('{not json}', blocks)).toBeNull()
  })
})
