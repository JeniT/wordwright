import { fireEvent, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_IMAGE_BYTES } from '@wordwright/core'
import ImageField from './ImageField.vue'

/**
 * jsdom decodes and draws no pictures, so the two browser calls the field relies on are stood in for: decoding
 * (`createImageBitmap`) says what size the chosen picture is, and the canvas hands back a small file of the size asked.
 */
let drawn: { width: number; height: number; type: string; quality: unknown }[]
const decodeAs = (width: number, height: number) =>
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close: vi.fn() }))

beforeEach(() => {
  drawn = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback,
    type,
    quality,
  ) {
    drawn.push({ width: this.width, height: this.height, type: type ?? '', quality })
    callback(new Blob(['x'.repeat(2000)], { type: type ?? '' }))
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const file = (name: string, type: string, bytes = 1000) =>
  new File(['x'.repeat(bytes)], name, { type })

async function choose(chosen: File) {
  const { emitted } = render(ImageField, { props: { label: 'Picture' } })
  await fireEvent.change(screen.getByLabelText('Picture'), { target: { files: [chosen] } })
  return emitted
}

describe('ImageField', () => {
  it('passes a small picture on exactly as it was chosen', async () => {
    decodeAs(300, 200)
    const original = file('small.png', 'image/png')
    const emitted = await choose(original)
    await waitFor(() => expect(emitted().select).toHaveLength(1))
    expect((emitted().select as File[][])[0]![0]).toBe(original)
    expect(drawn).toEqual([])
  })

  it('shrinks a picture whose longest side is over 512px, keeping its shape, name and kind', async () => {
    decodeAs(4000, 3000)
    const emitted = await choose(file('holiday.jpg', 'image/jpeg', 3000))
    await waitFor(() => expect(emitted().select).toHaveLength(1))
    const sent = (emitted().select as File[][])[0]![0]!
    expect(drawn).toEqual([{ width: 512, height: 384, type: 'image/jpeg', quality: 0.9 }])
    expect(sent.name).toBe('holiday.jpg')
    expect(sent.type).toBe('image/jpeg')
    expect(sent.size).toBe(2000)
  })

  it('shrinks a picture that is over the size limit instead of refusing it', async () => {
    decodeAs(2000, 2000)
    const emitted = await choose(file('big.webp', 'image/webp', MAX_IMAGE_BYTES + 1))
    await waitFor(() => expect(emitted().select).toHaveLength(1))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(drawn[0]).toMatchObject({ width: 512, height: 512, type: 'image/webp' })
  })

  it('leaves a GIF alone, because redrawing would lose its animation, and still refuses a huge one', async () => {
    decodeAs(4000, 3000)
    const gif = file('loop.gif', 'image/gif', 5000)
    const emitted = await choose(gif)
    await waitFor(() => expect(emitted().select).toHaveLength(1))
    expect((emitted().select as File[][])[0]![0]).toBe(gif)
    expect(drawn).toEqual([])

    await fireEvent.change(screen.getByLabelText('Picture'), {
      target: { files: [file('huge.gif', 'image/gif', MAX_IMAGE_BYTES + 1)] },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('That image is too large')
    expect(emitted().select).toHaveLength(1)
  })

  it('still refuses what is not a picture the app accepts', async () => {
    const emitted = await choose(file('notes.pdf', 'application/pdf'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a PNG, JPEG, WebP or GIF')
    expect(emitted().select).toBeUndefined()
  })

  it('says so, and sends nothing, when the picture cannot be read', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')))
    const emitted = await choose(file('broken.png', 'image/png'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file could not be read as a picture. Choose a different one.',
    )
    expect(emitted().select).toBeUndefined()
  })

  it('says it is working while a picture is being read, and stops when it is done', async () => {
    let finish!: (bitmap: { width: number; height: number; close: () => void }) => void
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(() => new Promise((resolve) => (finish = resolve))),
    )
    const emitted = await choose(file('slow.png', 'image/png'))
    expect(await screen.findByRole('status')).toHaveTextContent('Making the picture smaller')
    finish({ width: 100, height: 100, close: vi.fn() })
    await waitFor(() => expect(emitted().select).toHaveLength(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses the last picture chosen when an earlier one is still being read', async () => {
    let finishFirst!: (bitmap: { width: number; height: number; close: () => void }) => void
    const decode = vi
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
      .mockResolvedValue({ width: 100, height: 100, close: vi.fn() })
    vi.stubGlobal('createImageBitmap', decode)
    const first = file('first.png', 'image/png')
    const second = file('second.png', 'image/png')
    const emitted = await choose(first)
    await fireEvent.change(screen.getByLabelText('Picture'), { target: { files: [second] } })
    await waitFor(() => expect(emitted().select).toHaveLength(1))
    finishFirst({ width: 100, height: 100, close: vi.fn() })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(emitted().select).toHaveLength(1)
    expect((emitted().select as File[][])[0]![0]).toBe(second)
  })

  it('still says it is too large when even the shrunk picture is over the limit', async () => {
    decodeAs(4000, 3000)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) =>
      callback(new Blob(['x'.repeat(MAX_IMAGE_BYTES + 1)], { type: type ?? '' })),
    )
    const emitted = await choose(file('noise.png', 'image/png', MAX_IMAGE_BYTES + 5))
    expect(await screen.findByRole('alert')).toHaveTextContent('That image is too large')
    expect(emitted().select).toBeUndefined()
  })
})
