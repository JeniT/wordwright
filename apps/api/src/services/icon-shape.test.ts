import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { isSquareIcon } from './icon-shape'

/** An RGBA picture of `size` pixels square, every pixel `pixel(x, y)`. */
function raw(
  w: number,
  h: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) {
  const data = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) Buffer.from(pixel(x, y)).copy(data, (y * w + x) * 4)
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
}
const solid = (): [number, number, number, number] => [20, 120, 80, 255]
/** Transparent corners, like a rounded icon (a quarter circle of a fifth of the side cut from each corner). */
const rounded =
  (size: number) =>
  (x: number, y: number): [number, number, number, number] => {
    const r = size / 5
    const dx = Math.max(r - 0.5 - Math.min(x, size - 1 - x), 0)
    const dy = Math.max(r - 0.5 - Math.min(y, size - 1 - y), 0)
    return dx * dx + dy * dy > r * r ? [0, 0, 0, 0] : solid()
  }

/** A .ico with one entry holding `image` (a PNG), as many sites serve. */
function icoWithPng(png: Buffer, w: number, h: number) {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(1, 4) // one image
  header[6] = w === 256 ? 0 : w
  header[7] = h === 256 ? 0 : h
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, png])
}

/** A .ico whose one image is an uncompressed 32-bit bitmap (what older tools write). */
function icoWithBmp(
  size: number,
  pixel: (x: number, y: number) => [number, number, number, number],
) {
  const dib = Buffer.alloc(40 + size * size * 4 + size * Math.ceil(size / 32) * 4)
  dib.writeUInt32LE(40, 0)
  dib.writeInt32LE(size, 4)
  dib.writeInt32LE(size * 2, 8) // height counts the mask too
  dib.writeUInt16LE(1, 12)
  dib.writeUInt16LE(32, 14)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, size - 1 - y) // rows are stored bottom-up
      dib.set([b, g, r, a], 40 + (y * size + x) * 4)
    }
  const header = Buffer.alloc(22)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header[6] = size
  header[7] = size
  header.writeUInt32LE(dib.length, 14)
  header.writeUInt32LE(22, 18)
  return Buffer.concat([header, dib])
}

describe('isSquareIcon', () => {
  it('is true for a big, square picture whose corners are solid', async () => {
    const png = await raw(64, 64, solid).png().toBuffer()
    expect(await isSquareIcon(png, 'image/png')).toBe(true)
  })

  it('is false when a corner is transparent, as in a rounded icon', async () => {
    const png = await raw(64, 64, rounded(64)).png().toBuffer()
    expect(await isSquareIcon(png, 'image/png')).toBe(false)
  })

  it('accepts corners that are nearly opaque, but not faint ones', async () => {
    const corner = (alpha: number) => (x: number, y: number) =>
      x < 8 && y < 8 ? ([20, 120, 80, alpha] as [number, number, number, number]) : solid()
    const nearly = await raw(64, 64, corner(250)).png().toBuffer()
    const faint = await raw(64, 64, corner(249)).png().toBuffer()
    expect(await isSquareIcon(nearly, 'image/png')).toBe(true)
    expect(await isSquareIcon(faint, 'image/png')).toBe(false)
  })

  it('looks past a one-pixel translucent edge, which a square logo can have', async () => {
    const edge = await raw(64, 64, (x, y) =>
      x === 0 || y === 0 || x === 63 || y === 63 ? [20, 120, 80, 100] : solid(),
    )
      .png()
      .toBuffer()
    expect(await isSquareIcon(edge, 'image/png')).toBe(true)
  })

  it("is true for a real square logo whose edge is a translucent line (a site's favicon.ico)", () => {
    const logo = readFileSync(join(__dirname, 'fixtures/square-logo-translucent-edge.ico'))
    return expect(isSquareIcon(logo, 'image/x-icon')).resolves.toBe(true)
  })

  it('is false when it is not as wide as it is tall', async () => {
    const png = await raw(96, 64, solid).png().toBuffer()
    expect(await isSquareIcon(png, 'image/png')).toBe(false)
  })

  it('is false below 64 pixels, where scaling up would blur it', async () => {
    const png = await raw(63, 63, solid).png().toBuffer()
    expect(await isSquareIcon(png, 'image/png')).toBe(false)
  })

  it('treats a picture with no transparency (JPEG) as square when its sides match', async () => {
    const jpeg = await raw(64, 64, solid).jpeg().toBuffer()
    expect(await isSquareIcon(jpeg, 'image/jpeg')).toBe(true)
  })

  it('reads WebP and GIF too', async () => {
    const webp = await raw(64, 64, rounded(64)).webp({ lossless: true }).toBuffer()
    expect(await isSquareIcon(webp, 'image/webp')).toBe(false)
    const gif = await raw(64, 64, solid).gif().toBuffer()
    expect(await isSquareIcon(gif, 'image/gif')).toBe(true)
  })

  it('judges an animated picture by its first frame', async () => {
    const first = await raw(64, 64, solid).raw().toBuffer()
    const second = await raw(64, 64, rounded(64)).raw().toBuffer()
    const animated = await sharp(Buffer.concat([first, second]), {
      raw: { width: 64, height: 128, channels: 4, pageHeight: 64 },
    })
      .gif({ delay: [100, 100], loop: 0 })
      .toBuffer()
    expect(await isSquareIcon(animated, 'image/gif')).toBe(true)
  })

  it('reads a .ico that holds a PNG, using its largest image', async () => {
    const png = await raw(64, 64, solid).png().toBuffer()
    expect(await isSquareIcon(icoWithPng(png, 64, 64), 'image/x-icon')).toBe(true)
    const roundedPng = await raw(64, 64, rounded(64)).png().toBuffer()
    expect(await isSquareIcon(icoWithPng(roundedPng, 64, 64), 'image/x-icon')).toBe(false)
  })

  it('reads a .ico that holds a bitmap', async () => {
    expect(await isSquareIcon(icoWithBmp(64, solid), 'image/x-icon')).toBe(true)
    expect(await isSquareIcon(icoWithBmp(64, rounded(64)), 'image/x-icon')).toBe(false)
    expect(await isSquareIcon(icoWithBmp(16, solid), 'image/x-icon')).toBe(false)
  })

  it('is false, never an error, for bytes that are not a picture', async () => {
    expect(await isSquareIcon(Buffer.from('nope'), 'image/png')).toBe(false)
    expect(await isSquareIcon(Buffer.from([0, 0, 1, 0, 1, 0]), 'image/x-icon')).toBe(false)
  })
})
