import { MAX_IMAGE_BYTES } from '@wordwright/core'

/** The longest side of a stored picture. Pictures are shown small (a card, a menu header), so more is wasted bytes. */
const MAX_PICTURE_EDGE = 512

/** Thrown when the browser cannot read the file as a picture. */
export class UnreadablePicture extends Error {}

/**
 * Shrinks a picture in the browser so a phone photo can be used without the writer resizing it first: when it is over
 * the size limit or longer than `MAX_PICTURE_EDGE` on its longest side, it is redrawn smaller in the same format.
 * Anything already small, and every GIF (redrawing would drop the animation), comes back untouched. The server still
 * checks size and type; this only saves the writer the trouble. Rejects with `UnreadablePicture` if it cannot be decoded.
 */
export async function downscalePicture(file: File): Promise<File> {
  if (file.type === 'image/gif') return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new UnreadablePicture()
  }
  try {
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= MAX_PICTURE_EDGE && file.size <= MAX_IMAGE_BYTES) return file
    const scale = Math.min(1, MAX_PICTURE_EDGE / longest)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new UnreadablePicture()
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.9))
    if (!blob) throw new UnreadablePicture()
    return new File([blob], file.name, { type: blob.type || file.type })
  } finally {
    bitmap.close()
  }
}
