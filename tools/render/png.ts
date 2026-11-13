import { deflateSync, inflateSync } from "node:zlib";

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

/** Straight RGBA bytes to an 8-bit RGBA PNG (lossless: the bytes come back as they went in). */
export function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`expected ${width * height * 4} bytes for ${width}x${height}, got ${rgba.length}`);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head.set([8, 6, 0, 0, 0], 8); // 8 bit, RGBA, deflate, no filter, no interlace
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array(0))]);
}

/** Reads back a PNG written by `encodePng` (filter 0 only); for tests. */
export function decodePng(png: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const b = Buffer.from(png.buffer, png.byteOffset, png.length);
  const width = b.readUInt32BE(16), height = b.readUInt32BE(20);
  const idat: Buffer[] = [];
  for (let p = 8; p < b.length; ) {
    const len = b.readUInt32BE(p), type = b.toString("latin1", p + 4, p + 8);
    if (type === "IDAT") idat.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) rgba.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4);
  return { width, height, rgba };
}
