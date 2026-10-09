import { describe, expect, it } from 'vitest'
import { readSse, type SseMessage } from './sse'

/** A stream that delivers the given pieces, as a network might. */
const streamOf = (...pieces: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder()
      for (const piece of pieces) controller.enqueue(encoder.encode(piece))
      controller.close()
    },
  })
const read = async (...pieces: string[]) => {
  const out: SseMessage[] = []
  for await (const message of readSse(streamOf(...pieces))) out.push(message)
  return out
}

describe('readSse', () => {
  it('reads events with their names and data', async () => {
    expect(await read('event: text\ndata: {"a":1}\n\nevent: done\ndata: {"b":2}\n\n')).toEqual([
      { event: 'text', data: '{"a":1}' },
      { event: 'done', data: '{"b":2}' },
    ])
  })

  it('copes with a message split across chunks, even mid-word or mid-separator', async () => {
    expect(
      await read('event: te', 'xt\ndata: hel', 'lo\n', '\nevent: done\nda', 'ta: x\n\n'),
    ).toEqual([
      { event: 'text', data: 'hello' },
      { event: 'done', data: 'x' },
    ])
  })

  it('does not split multi-byte characters that arrive in separate chunks', async () => {
    const bytes = new TextEncoder().encode('data: café ☕\n\n')
    const cut = bytes.indexOf(0xe2) + 1 // inside the three-byte ☕
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut))
        controller.enqueue(bytes.slice(cut))
        controller.close()
      },
    })
    const out: SseMessage[] = []
    for await (const message of readSse(stream)) out.push(message)
    expect(out).toEqual([{ event: 'message', data: 'café ☕' }])
  })

  it('accepts Windows line endings, comments, several data lines, and a final message with no blank line', async () => {
    expect(
      await read(': keep-alive\r\n\r\nevent: a\r\ndata: one\r\ndata: two\r\n\r\ndata: last'),
    ).toEqual([
      { event: 'a', data: 'one\ntwo' },
      { event: 'message', data: 'last' },
    ])
  })

  it('yields nothing for an empty stream or one with only comments', async () => {
    expect(await read()).toEqual([])
    expect(await read(': hi\n\n')).toEqual([])
  })

  it('ends promptly, without error, when stopped while waiting for more', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: first\n\n'))
        // never closes: the server is still writing
      },
    })
    const stop = new AbortController()
    const out: SseMessage[] = []
    for await (const message of readSse(stream, stop.signal)) {
      out.push(message)
      stop.abort()
    }
    expect(out).toEqual([{ event: 'message', data: 'first' }])
  })
})
