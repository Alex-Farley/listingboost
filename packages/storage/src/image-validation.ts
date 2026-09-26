/**
 * Server-side upload validation (spec §16). Runs in the Worker before any byte
 * reaches storage. It checks size, declared type, extension, magic bytes,
 * dimensions and container integrity (JPEG segment walk, PNG chunk CRCs, RIFF
 * sizes). Pixel decoding is not performed here; see DECISIONS D-009.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MIN_SHORT_EDGE = 400;
export const MAX_PIXELS = 40_000_000;

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedImageType = (typeof ACCEPTED_TYPES)[number];

export type ValidatedImage = { contentType: AcceptedImageType; width: number; height: number };

export type UploadRejectionCode =
  | "empty_file"
  | "file_too_large"
  | "unsupported_format"
  | "type_mismatch"
  | "extension_mismatch"
  | "corrupt_image"
  | "image_too_small"
  | "image_too_large";

const MESSAGES: Record<UploadRejectionCode, string> = {
  empty_file: "The file is empty.",
  file_too_large: "Photos must be 25 MB or smaller.",
  unsupported_format: "Upload JPEG, PNG or WebP photographs.",
  type_mismatch: "The file's contents don't match its type.",
  extension_mismatch: "The file name extension doesn't match its contents.",
  corrupt_image: "The image appears to be damaged or incomplete.",
  image_too_small: `Photos must be at least ${MIN_SHORT_EDGE} pixels on the shortest side.`,
  image_too_large: "The image has too many pixels (maximum 40 megapixels).",
};

export class UploadRejectedError extends Error {
  constructor(readonly code: UploadRejectionCode) {
    super(MESSAGES[code]);
    this.name = "UploadRejectedError";
  }
}

const EXTENSIONS: Record<string, AcceptedImageType> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const u16be = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32be = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const u32le = (b: Uint8Array, o: number) => b[o]! + (b[o + 1]! << 8) + (b[o + 2]! << 16) + ((b[o + 3]! << 24) >>> 0);
const u24le = (b: Uint8Array, o: number) => b[o]! + (b[o + 1]! << 8) + (b[o + 2]! << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));

function detect(bytes: Uint8Array): AcceptedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  return null;
}

const corrupt = () => new UploadRejectedError("corrupt_image");

// ── JPEG ────────────────────────────────────────────────────────────────
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const isRst = (m: number) => m >= 0xd0 && m <= 0xd7;

/** After EOI, allow only zero/0xFF padding or an embedded JPEG (MPF/depth images from phones). */
function acceptableJpegTrailer(bytes: Uint8Array, from: number): boolean {
  if (from >= bytes.length) return true;
  if (bytes[from] === 0xff && bytes[from + 1] === 0xd8 && bytes[from + 2] === 0xff) return true;
  for (let i = from; i < bytes.length; i++) if (bytes[i] !== 0x00 && bytes[i] !== 0xff) return false;
  return true;
}

function parseJpeg(b: Uint8Array): { width: number; height: number } {
  let offset = 2;
  let dims: { width: number; height: number } | null = null;
  let sawScan = false;
  while (offset < b.length) {
    if (b[offset] !== 0xff) throw corrupt();
    while (offset < b.length && b[offset] === 0xff) offset++;
    if (offset >= b.length) throw corrupt();
    const marker = b[offset++]!;
    if (marker === 0xd9) {
      if (!dims || !sawScan || !acceptableJpegTrailer(b, offset)) throw corrupt();
      return dims;
    }
    if (isRst(marker) || marker === 0x01) continue;
    if (offset + 2 > b.length) throw corrupt();
    const length = u16be(b, offset);
    if (length < 2 || offset + length > b.length) throw corrupt();
    if (SOF.has(marker)) {
      if (length < 8) throw corrupt();
      const height = u16be(b, offset + 3);
      const width = u16be(b, offset + 5);
      if (!width || !height) throw corrupt();
      dims = { width, height };
    }
    offset += length;
    if (marker === 0xda) {
      if (!dims) throw corrupt();
      sawScan = true;
      // Skip entropy-coded data up to the next real marker.
      while (offset + 1 < b.length) {
        if (b[offset] === 0xff && b[offset + 1] !== 0x00 && !isRst(b[offset + 1]!)) break;
        offset++;
      }
      if (offset + 1 >= b.length) throw corrupt();
    }
  }
  throw corrupt();
}

// ── PNG ─────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(b: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function parsePng(b: Uint8Array): { width: number; height: number } {
  let offset = 8;
  let dims: { width: number; height: number } | null = null;
  let sawData = false;
  while (offset + 12 <= b.length) {
    const length = u32be(b, offset);
    const type = ascii(b, offset + 4, 4);
    const dataEnd = offset + 8 + length;
    if (length > 0x7fffffff || dataEnd + 4 > b.length) throw corrupt();
    if (crc32(b, offset + 4, dataEnd) !== u32be(b, dataEnd)) throw corrupt();
    if (!dims && type !== "IHDR") throw corrupt();
    if (type === "IHDR") {
      if (dims || length !== 13) throw corrupt();
      dims = { width: u32be(b, offset + 8), height: u32be(b, offset + 12) };
      if (!dims.width || !dims.height) throw corrupt();
    }
    if (type === "acTL") throw new UploadRejectedError("unsupported_format"); // animated PNG
    if (type === "IDAT") sawData = true;
    offset = dataEnd + 4;
    if (type === "IEND") {
      if (!dims || !sawData || offset !== b.length) throw corrupt();
      return dims;
    }
  }
  throw corrupt();
}

// ── WebP ────────────────────────────────────────────────────────────────
function parseWebp(b: Uint8Array): { width: number; height: number } {
  if (b.length < 20 || u32le(b, 4) + 8 !== b.length) throw corrupt();
  let offset = 12;
  let dims: { width: number; height: number } | null = null;
  let sawImage = false;
  while (offset < b.length) {
    if (offset + 8 > b.length) throw corrupt();
    const type = ascii(b, offset, 4);
    const size = u32le(b, offset + 4);
    const data = offset + 8;
    const next = data + size + (size % 2);
    if (data + size > b.length) throw corrupt();
    if (type === "VP8X") {
      if (size < 10) throw corrupt();
      if (b[data]! & 0x02) throw new UploadRejectedError("unsupported_format"); // animation flag
      dims = { width: 1 + u24le(b, data + 4), height: 1 + u24le(b, data + 7) };
    } else if (type === "VP8 ") {
      if (size < 10 || b[data + 3] !== 0x9d || b[data + 4] !== 0x01 || b[data + 5] !== 0x2a) throw corrupt();
      const frame = { width: (b[data + 6]! | (b[data + 7]! << 8)) & 0x3fff, height: (b[data + 8]! | (b[data + 9]! << 8)) & 0x3fff };
      dims ??= frame;
      sawImage = true;
    } else if (type === "VP8L") {
      if (size < 5 || b[data] !== 0x2f) throw corrupt();
      const bits = u32le(b, data + 1);
      const frame = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      dims ??= frame;
      sawImage = true;
    } else if (type === "ANIM" || type === "ANMF") {
      throw new UploadRejectedError("unsupported_format");
    }
    offset = next;
  }
  if (!dims || !sawImage || !dims.width || !dims.height) throw corrupt();
  return dims;
}

export function validateImageUpload(input: { bytes: Uint8Array; filename: string; declaredType: string }): ValidatedImage {
  const { bytes } = input;
  if (bytes.length === 0) throw new UploadRejectedError("empty_file");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new UploadRejectedError("file_too_large");

  const declared = input.declaredType.split(";")[0]!.trim().toLowerCase();
  if (!(ACCEPTED_TYPES as readonly string[]).includes(declared)) throw new UploadRejectedError("unsupported_format");
  const detected = detect(bytes);
  if (!detected) throw new UploadRejectedError("unsupported_format");
  if (detected !== declared) throw new UploadRejectedError("type_mismatch");

  const extension = input.filename.includes(".") ? input.filename.split(".").pop()!.toLowerCase() : "";
  if (EXTENSIONS[extension] !== detected) throw new UploadRejectedError("extension_mismatch");

  const dims = detected === "image/jpeg" ? parseJpeg(bytes) : detected === "image/png" ? parsePng(bytes) : parseWebp(bytes);
  if (dims.width * dims.height > MAX_PIXELS) throw new UploadRejectedError("image_too_large");
  if (Math.min(dims.width, dims.height) < MIN_SHORT_EDGE) throw new UploadRejectedError("image_too_small");
  return { contentType: detected, ...dims };
}
