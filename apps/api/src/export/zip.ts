import { crc32, deflateRawSync } from 'node:zlib'

export interface ZipFile {
  /** Forward slashes, no leading slash, no `..`: it is unpacked into whatever folder the person chooses. */
  path: string
  content: string
}

/**
 * Packs text files into a zip, in memory. Hand-written (about sixty lines) rather than a dependency because we only
 * ever need small UTF-8 text files, with no encryption, no streaming and no files over 4 GB.
 */
export function zip(files: ZipFile[], now = new Date()): Uint8Array {
  if (files.length >= 0xffff) throw new Error('Too many files for one zip')
  const time =
    ((now.getUTCHours() << 11) | (now.getUTCMinutes() << 5) | (now.getUTCSeconds() >> 1)) & 0xffff
  const date =
    ((Math.max(0, now.getUTCFullYear() - 1980) << 9) |
      ((now.getUTCMonth() + 1) << 5) |
      now.getUTCDate()) &
    0xffff

  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const segments = file.path.split('/')
    if (!file.path || file.path.includes('\\') || segments.some((s) => s === '' || s === '..')) {
      throw new Error(`Unsafe path in zip: ${JSON.stringify(file.path)}`)
    }
    const name = Buffer.from(file.path, 'utf8')
    const raw = Buffer.from(file.content, 'utf8')
    const packed = deflateRawSync(raw)
    const checksum = crc32(raw)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // names are UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    parts.push(local, name, packed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4) // version made by
    entry.writeUInt16LE(20, 6) // version needed
    entry.writeUInt16LE(0x0800, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt16LE(time, 12)
    entry.writeUInt16LE(date, 14)
    entry.writeUInt32LE(checksum, 16)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(raw.length, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += local.length + name.length + packed.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, directory, end])
}
