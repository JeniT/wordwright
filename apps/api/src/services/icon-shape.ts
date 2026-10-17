import type { FetchedIcon } from '@wordwright/core'
import sharp from 'sharp'

/** Below this an icon would be blurry stretched to fill the box, so it stays on the plate. */
const MIN_SIDE = 64
/** A corner this opaque counts as solid; a little under full tolerates anti-aliasing. */
const OPAQUE = 250
const MAX_PIXELS = 2048 * 2048

/**
 * Whether an icon is square all the way to its corners (#226): as wide as it is tall, big enough, with all four corner
 * pixels opaque. Such an icon can fill its box; a rounded or irregular one has transparent corners and stays contained
 * on the plate. Wrong answers are safe ones (the plate), so anything unreadable is simply "not square". Never rejects.
 */
export async function isSquareIcon(data: Uint8Array, contentType: string): Promise<boolean> {
  try {
    const bytes = Buffer.from(data)
    if (contentType === 'image/x-icon') return await icoIsSquare(bytes)
    return await rasterIsSquare(bytes)
  } catch {
    return false
  }
}

/** PNG, JPEG, WebP, GIF. An animated one is judged by its first frame. */
async function rasterIsSquare(bytes: Buffer): Promise<boolean> {
  // A small file can claim to be enormous once decoded; icons never are.
  const { data, info } = await sharp(bytes, { pages: 1, limitInputPixels: MAX_PIXELS })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return cornersAreSolid(info.width, info.height, (x, y) => data[(y * info.width + x) * 4 + 3]!)
}

function cornersAreSolid(width: number, height: number, alphaAt: (x: number, y: number) => number) {
  if (width !== height || width < MIN_SIDE) return false
  const last = width - 1
  return [
    [0, 0],
    [last, 0],
    [0, last],
    [last, last],
  ].every(([x, y]) => alphaAt(x!, y!) >= OPAQUE)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

/** An .ico holds several sizes; the largest is the one that would be shown. */
async function icoIsSquare(bytes: Buffer): Promise<boolean> {
  const count = bytes.readUInt16LE(4)
  let best: { side: number; offset: number; size: number } | undefined
  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    const w = bytes[entry]! || 256
    const h = bytes[entry + 1]! || 256
    if (w !== h) continue
    if (!best || w > best.side)
      best = {
        side: w,
        offset: bytes.readUInt32LE(entry + 12),
        size: bytes.readUInt32LE(entry + 8),
      }
  }
  if (!best || best.side < MIN_SIDE) return false
  const image = bytes.subarray(best.offset, best.offset + best.size)
  if (PNG_SIGNATURE.every((b, i) => image[i] === b)) return rasterIsSquare(image)
  return bitmapIsSquare(image, best.side)
}

/** The bitmap form: a 32-bit one carries alpha itself; any other has a 1-bit mask after the pixels. */
function bitmapIsSquare(dib: Buffer, side: number): boolean {
  const headerSize = dib.readUInt32LE(0)
  const bpp = dib.readUInt16LE(14)
  const colours = bpp <= 8 ? (dib.readUInt32LE(32) || 1 << bpp) * 4 : 0
  const pixelsAt = headerSize + colours
  const rowBytes = Math.ceil((side * bpp) / 32) * 4
  const maskAt = pixelsAt + rowBytes * side
  const maskRow = Math.ceil(side / 32) * 4
  const alphaAt = (x: number, y: number) => {
    const row = side - 1 - y // stored bottom-up
    if (bpp === 32) return dib[pixelsAt + row * rowBytes + x * 4 + 3]!
    const masked = (dib[maskAt + row * maskRow + (x >> 3)]! >> (7 - (x & 7))) & 1
    return masked ? 0 : 255
  }
  return cornersAreSolid(side, side, alphaAt)
}

/** An icon with what we learned about its shape, ready to store. */
export type ShapedIcon = FetchedIcon & { square: boolean }

export async function withShape(icon: FetchedIcon | null): Promise<ShapedIcon | null> {
  return icon && { ...icon, square: await isSquareIcon(icon.data, icon.contentType) }
}
