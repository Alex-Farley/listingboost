export const MAX_IMAGE_PIXELS = 40_000_000;

export type ValidatedImage = {
  contentType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  width: number;
  height: number;
};

const JPEG_MARKERS_WITHOUT_LENGTH = new Set([0xd8, 0xd9, 0x01]);
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readU16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function isJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function parseJpeg(bytes: Uint8Array): ValidatedImage | null {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return null;
    if (JPEG_MARKERS_WITHOUT_LENGTH.has(marker)) continue;
    if (offset + 1 >= bytes.length) return null;
    const length = readU16(bytes, offset);
    if (length < 2 || offset + length > bytes.length) return null;
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 7) return null;
      const height = readU16(bytes, offset + 3);
      const width = readU16(bytes, offset + 5);
      if (width === 0 || height === 0) return null;
      return { contentType: "image/jpeg", width, height };
    }
    offset += length;
  }
  return null;
}

function parsePng(bytes: Uint8Array): ValidatedImage | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  const width = (bytes[16] * 0x1000000) + (bytes[17] << 16) + (bytes[18] << 8) + bytes[19];
  const height = (bytes[20] * 0x1000000) + (bytes[21] << 16) + (bytes[22] << 8) + bytes[23];
  if (width <= 0 || height <= 0) return null;
  return { contentType: "image/png", width, height };
}

function parseGif(bytes: Uint8Array): ValidatedImage | null {
  if (bytes.length < 10) return null;
  const header = new TextDecoder().decode(bytes.subarray(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") return null;
  const width = readU16(bytes, 6);
  const height = readU16(bytes, 8);
  if (width === 0 || height === 0) return null;
  return { contentType: "image/gif", width, height };
}

function parseWebp(bytes: Uint8Array): ValidatedImage | null {
  if (bytes.length < 30) return null;
  const riff = new TextDecoder().decode(bytes.subarray(0, 4));
  const webp = new TextDecoder().decode(bytes.subarray(8, 12));
  if (riff !== "RIFF" || webp !== "WEBP") return null;
  const chunk = new TextDecoder().decode(bytes.subarray(12, 16));
  if (chunk === "VP8X") {
    const width = 1 + readU24LE(bytes, 24);
    const height = 1 + readU24LE(bytes, 27);
    if (width <= 0 || height <= 0) return null;
    return { contentType: "image/webp", width, height };
  }
  if (chunk === "VP8 ") {
    const signatureOffset = 23;
    if (bytes.length < signatureOffset + 3 || bytes[signatureOffset] !== 0x9d || bytes[signatureOffset + 1] !== 0x01 || bytes[signatureOffset + 2] !== 0x2a) return null;
    const width = readU16(bytes, 26) & 0x3fff;
    const height = readU16(bytes, 28) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { contentType: "image/webp", width, height };
  }
  if (chunk === "VP8L") {
    if (bytes[21] !== 0x2f) return null;
    const bits = bytes[22] | (bytes[23] << 8) | (bytes[24] << 16) | (bytes[25] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    if (width === 0 || height === 0) return null;
    return { contentType: "image/webp", width, height };
  }
  return null;
}

export function validateImageBytes(bytes: Uint8Array): ValidatedImage {
  const parsed = isJpeg(bytes) ? parseJpeg(bytes) : parsePng(bytes) ?? parseGif(bytes) ?? parseWebp(bytes);
  if (!parsed) {
    throw new Error("The uploaded file is not a supported image or has an invalid image signature.");
  }
  if (parsed.width * parsed.height > MAX_IMAGE_PIXELS) {
    throw new Error("The uploaded image dimensions are too large.");
  }
  return parsed;
}

export function validateImageUpload(file: File): Promise<ValidatedImage> {
  return file.arrayBuffer().then((buffer) => validateImageBytes(new Uint8Array(buffer)));
}
