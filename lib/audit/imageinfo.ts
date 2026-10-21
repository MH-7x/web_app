/** Read an image's dimensions from its first bytes, without a library. PNG, JPEG, GIF and WebP. */
export function parseImageSize(buf: Uint8Array): { width: number; height: number; format: "png" | "jpeg" | "gif" | "webp" } | null {
  const b = Buffer.from(buf)
  if (b.length < 24) return null

  // PNG
  if (b.readUInt32BE(0) === 0x89504e47) return { format: "png", width: b.readUInt32BE(16), height: b.readUInt32BE(20) }

  // GIF
  if (b.toString("ascii", 0, 3) === "GIF") return { format: "gif", width: b.readUInt16LE(6), height: b.readUInt16LE(8) }

  // WebP
  if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
    const type = b.toString("ascii", 12, 16)
    if (type === "VP8X") return { format: "webp", width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
    if (type === "VP8 ") return { format: "webp", width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
    if (type === "VP8L") {
      const bits = b.readUInt32LE(21)
      return { format: "webp", width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
    }
    return null
  }

  // JPEG: walk the segments to the first start-of-frame marker
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      const len = b.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { format: "jpeg", height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }
      }
      i += 2 + len
    }
  }
  return null
}
