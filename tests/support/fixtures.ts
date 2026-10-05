import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, deflateSync } from "node:zlib";

const DIR = join(import.meta.dir, "fixtures", "images");

export function fixture(name: string): Uint8Array<ArrayBuffer> {
  const buffer = readFileSync(join(DIR, name));
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

export function videoFixture(name: string): Uint8Array<ArrayBuffer> {
  const buffer = readFileSync(join(import.meta.dir, "fixtures", "videos", name));
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A valid solid-colour RGB PNG of the given size, built in memory (synthetic test data). */
export function solidPng(width: number, height: number, rgb: [number, number, number] = [29, 36, 51]): Uint8Array<ArrayBuffer> {
  return buildPng(width, height, rgb, (raw) => new Uint8Array(deflateSync(raw)));
}

/**
 * A PNG whose chunks and checksums are all correct but whose pixel data is not
 * a zlib stream, so no decoder can draw it. Structural checks alone accept it.
 */
export function undecodablePng(width: number, height: number): Uint8Array<ArrayBuffer> {
  return buildPng(width, height, [29, 36, 51], (raw) => new Uint8Array(deflateRawSync(raw)));
}

function buildPng(width: number, height: number, rgb: [number, number, number], compress: (raw: Uint8Array) => Uint8Array): Uint8Array<ArrayBuffer> {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) raw.set(row, y * row.length);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compress(raw)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((n, p) => n + p.length, 0)));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const FONT_DIR = join(import.meta.dir, "fixtures", "fonts");
const FONTSOURCE = join(import.meta.dir, "../../node_modules/@fontsource");

function fileBytes(path: string): Uint8Array<ArrayBuffer> {
  const buffer = readFileSync(path);
  const bytes = new Uint8Array(new ArrayBuffer(buffer.byteLength));
  bytes.set(buffer);
  return bytes;
}

/**
 * Real, openly licensed fonts in each accepted format. Inter comes from the
 * installed @fontsource package; Source Sans 3 (OTF outlines) is committed
 * under tests/support/fixtures/fonts with its SIL OFL licence.
 */
export const fontFixtures = {
  woff: () => fileBytes(join(FONTSOURCE, "inter/files/inter-latin-400-normal.woff")),
  woff2: () => fileBytes(join(FONTSOURCE, "inter/files/inter-latin-400-normal.woff2")),
  ttf: () => woffToSfnt(fileBytes(join(FONTSOURCE, "inter/files/inter-latin-400-normal.woff"))),
  otfWoff: () => fileBytes(join(FONT_DIR, "SourceSans3-Regular.otf.woff")),
  otfWoff2: () => fileBytes(join(FONT_DIR, "SourceSans3-Regular.otf.woff2")),
  otf: () => woffToSfnt(fileBytes(join(FONT_DIR, "SourceSans3-Regular.otf.woff"))),
};

/** Unpacks a WOFF 1 file into the TTF or OTF it wraps (each table is zlib-compressed or stored). */
export function woffToSfnt(woff: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const view = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  const numTables = view.getUint16(12);
  const tables = Array.from({ length: numTables }, (_, i) => {
    const o = 44 + i * 20;
    const [offset, compLength, origLength] = [view.getUint32(o + 4), view.getUint32(o + 8), view.getUint32(o + 12)];
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? new Uint8Array(Bun.inflateSync(raw, { windowBits: 15 } as never)) : raw;
    return { tag: woff.subarray(o, o + 4), checksum: view.getUint32(o + 16), data };
  });
  const headerLength = 12 + numTables * 16;
  const total = tables.reduce((n, t) => n + ((t.data.length + 3) & ~3), headerLength);
  const out = new Uint8Array(new ArrayBuffer(total));
  const outView = new DataView(out.buffer);
  outView.setUint32(0, view.getUint32(4));
  outView.setUint16(4, numTables);
  const maxPow = 2 ** Math.floor(Math.log2(numTables));
  outView.setUint16(6, maxPow * 16);
  outView.setUint16(8, Math.log2(maxPow));
  outView.setUint16(10, numTables * 16 - maxPow * 16);
  let offset = headerLength;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.set(t.tag, o);
    outView.setUint32(o + 4, t.checksum);
    outView.setUint32(o + 8, offset);
    outView.setUint32(o + 12, t.data.length);
    out.set(t.data, offset);
    offset += (t.data.length + 3) & ~3;
  });
  return out;
}

/** Renames one table to `fvar` so a static font looks variable to a directory check (synthetic). */
export function asVariableFont(font: Uint8Array<ArrayBuffer>, replaceTag = "gasp"): Uint8Array<ArrayBuffer> {
  const out = font.slice();
  const target = new TextEncoder().encode(replaceTag);
  for (let i = 0; i + 4 <= Math.min(out.length, 2048); i++) {
    if (target.every((b, k) => out[i + k] === b)) {
      out.set(new TextEncoder().encode("fvar"), i);
      return out;
    }
  }
  throw new Error(`table ${replaceTag} not found in font fixture`);
}

/** Rewrites the dimensions a WebP file declares, leaving its image data alone (synthetic oversize input). */
export function webpWithDimensions(webp: Uint8Array<ArrayBuffer>, width: number, height: number): Uint8Array<ArrayBuffer> {
  const out = webp.slice();
  const type = String.fromCharCode(...out.subarray(12, 16));
  if (type !== "VP8 ") throw new Error(`webpWithDimensions expects a simple lossy WebP, got ${type}`);
  const data = 20;
  out[data + 6] = width & 0xff;
  out[data + 7] = (out[data + 7]! & 0xc0) | ((width >> 8) & 0x3f);
  out[data + 8] = height & 0xff;
  out[data + 9] = (out[data + 9]! & 0xc0) | ((height >> 8) & 0x3f);
  return out;
}
