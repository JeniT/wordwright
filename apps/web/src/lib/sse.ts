export interface SseMessage {
  event: string
  data: string
}

/**
 * Reads a server-sent event stream from a `fetch` response body. (The browser's `EventSource` can only
 * GET and can't be cancelled the way a request can, so the brainstorm reply is read by hand.)
 * Messages are separated by a blank line; a chunk may end part-way through one.
 */
export async function* readSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  // Stopping must end a read that is waiting for the next piece, whatever the browser does with the request.
  const onAbort = () => void reader.cancel().catch(() => undefined)
  signal?.addEventListener('abort', onAbort)
  // `stream: true` holds back a character whose bytes are split across two chunks.
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      for (;;) {
        const end = /\r?\n\r?\n/.exec(buffer)
        if (!end) break
        const message = parse(buffer.slice(0, end.index))
        buffer = buffer.slice(end.index + end[0].length)
        if (message) yield message
      }
    }
    buffer += decoder.decode()
    const last = parse(buffer)
    if (last) yield last
  } finally {
    signal?.removeEventListener('abort', onAbort)
    await reader.cancel().catch(() => undefined)
  }
}

function parse(chunk: string): SseMessage | undefined {
  let event = 'message'
  const data: string[] = []
  for (const line of chunk.split(/\r?\n/)) {
    if (line.startsWith(':')) continue // a comment (often a keep-alive)
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'event') event = value
    else if (field === 'data') data.push(value)
  }
  return data.length ? { event, data: data.join('\n') } : undefined
}
