/**
 * Profile images are raster only. SVG is deliberately excluded: it can carry script, and the file
 * is served from our own origin.
 */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
export type ImageType = (typeof IMAGE_TYPES)[number]

export const MAX_IMAGE_BYTES = 1024 * 1024

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((b, i) => bytes[offset + i] === b)

/**
 * Identifies an image from its first bytes. A declared Content-Type or file name is only a claim
 * made by the sender, so it is never trusted.
 */
export function detectImageType(bytes: Uint8Array): ImageType | undefined {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif' // "GIF8"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp' // "RIFF....WEBP"
  return undefined
}
