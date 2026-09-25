/**
 * A minimal ZIP writer - enough to hand the browser an archive of locale files.
 *
 * Neither Node nor the browser ships an archive format, and pulling a
 * dependency into a mock backend for ~80 lines of header layout is a poor
 * trade. This writes deflated entries, a central directory and an
 * end-of-central-directory record: the subset of PKZIP that every unzip tool
 * reads.
 *
 * Nothing here is Node-specific. `CompressionStream` and `Uint8Array` are the
 * same in both runtimes, which is what lets the export work whether the mock
 * runs on the dev server or in the tab - see `browser_backend.ts`.
 *
 * No zip64, no encryption, no directory entries. A locale export is a handful
 * of files of a few hundred KB, which is comfortably inside the 32-bit fields.
 */

/**
 * Bytes backed by a plain `ArrayBuffer`. A bare `Uint8Array` allows a
 * `SharedArrayBuffer` behind it, which neither `Blob` nor `Response` accepts -
 * saying so once here keeps the casts out of everything below.
 */
export type Bytes = Uint8Array<ArrayBuffer>

export type ZipEntry = {
  /** Path inside the archive, forward slashes. */
  name: string
  data: string
}

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL = 0x06054b50
/** 2.0 - the version that introduced deflate. */
const VERSION = 20
/** Bit 11: names and comments are UTF-8. */
const UTF8_FLAG = 0x0800
const DEFLATE = 8

const utf8 = new TextEncoder()

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Bytes): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

/** The raw deflate stream a ZIP entry stores, via the platform's own codec. */
async function deflateRaw(bytes: Bytes): Promise<Bytes> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** ZIP stores MS-DOS time: 2-second resolution, years from 1980. */
function dosDateTime(date: Date) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f)
  const day =
    ((Math.max(date.getFullYear() - 1980, 0) & 0x7f) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  return { time, day }
}

function concat(parts: Bytes[]): Bytes {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A fixed-size record plus the little-endian writers its fields need. */
function record(size: number) {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  return {
    bytes,
    u16: (offset: number, value: number) => view.setUint16(offset, value, true),
    u32: (offset: number, value: number) => view.setUint32(offset, value, true),
  }
}

export async function createZip(
  entries: ZipEntry[],
  now = new Date()
): Promise<Bytes> {
  const { time, day } = dosDateTime(now)
  const locals: Bytes[] = []
  const centrals: Bytes[] = []
  let offset = 0

  for (const entry of entries) {
    const name = utf8.encode(entry.name)
    const content = utf8.encode(entry.data)
    const deflated = await deflateRaw(content)
    const crc = crc32(content)

    const local = record(30)
    local.u32(0, LOCAL_HEADER)
    local.u16(4, VERSION)
    local.u16(6, UTF8_FLAG)
    local.u16(8, DEFLATE)
    local.u16(10, time)
    local.u16(12, day)
    local.u32(14, crc)
    local.u32(18, deflated.length)
    local.u32(22, content.length)
    local.u16(26, name.length)
    local.u16(28, 0)
    locals.push(local.bytes, name, deflated)

    const central = record(46)
    central.u32(0, CENTRAL_HEADER)
    central.u16(4, VERSION)
    central.u16(6, VERSION)
    central.u16(8, UTF8_FLAG)
    central.u16(10, DEFLATE)
    central.u16(12, time)
    central.u16(14, day)
    central.u32(16, crc)
    central.u32(20, deflated.length)
    central.u32(24, content.length)
    central.u16(28, name.length)
    central.u16(30, 0)
    central.u16(32, 0)
    central.u16(34, 0)
    central.u16(36, 0)
    central.u32(38, 0)
    central.u32(42, offset)
    centrals.push(central.bytes, name)

    offset += local.bytes.length + name.length + deflated.length
  }

  const directory = concat(centrals)

  const end = record(22)
  end.u32(0, END_OF_CENTRAL)
  end.u16(4, 0)
  end.u16(6, 0)
  end.u16(8, entries.length)
  end.u16(10, entries.length)
  end.u32(12, directory.length)
  end.u32(16, offset)
  end.u16(20, 0)

  return concat([...locals, directory, end.bytes])
}
