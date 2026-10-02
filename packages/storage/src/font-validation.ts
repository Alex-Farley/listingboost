/**
 * Validation for custom font uploads (DECISIONS D-022). Checks size, format
 * and structure before a font reaches the renderer. A font is only stored
 * after the renderer has also drawn with it once (see BrandAssetProcessor).
 */
export const MAX_FONT_BYTES = 2 * 1024 * 1024;
/** WOFF and WOFF2 are compressed; the decoded font is what the renderer holds in memory. */
export const MAX_DECODED_FONT_BYTES = 8 * 1024 * 1024;

export type UploadedFontFormat = "ttf" | "otf" | "woff" | "woff2";
export type StoredFontFormat = "ttf" | "otf" | "woff";

export type FontRejectionCode = "empty_file" | "file_too_large" | "unsupported_format" | "extension_mismatch" | "corrupt_font" | "font_too_large" | "variable_font";

const MESSAGES: Record<FontRejectionCode, string> = {
  empty_file: "The file is empty.",
  file_too_large: "Fonts must be 2 MB or smaller.",
  unsupported_format: "Upload a font in WOFF, WOFF2, TTF or OTF format.",
  extension_mismatch: "The file name extension doesn't match the font's format.",
  corrupt_font: "The font file appears to be damaged or incomplete.",
  font_too_large: "This font is too large once unpacked (maximum 8 MB). Try a version with fewer characters.",
  variable_font: "Variable fonts are not supported. Upload a static font file, one per weight.",
};

export class FontRejectedError extends Error {
  constructor(readonly code: FontRejectionCode) {
    super(MESSAGES[code]);
    this.name = "FontRejectedError";
  }
}

const reject = (code: FontRejectionCode): never => {
  throw new FontRejectedError(code);
};

const u16 = (b: Uint8Array, o: number) => (b[o]! << 8) | b[o + 1]!;
const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
const tag = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

function sfntFlavour(signature: string, value: number): "ttf" | "otf" | null {
  if (value === 0x00010000 || signature === "true") return "ttf";
  if (signature === "OTTO") return "otf";
  return null;
}

/** Reads an SFNT table directory, checking every table lies inside the file. */
function sfntTables(bytes: Uint8Array): string[] {
  if (bytes.length < 12) reject("corrupt_font");
  const count = u16(bytes, 4);
  if (count === 0 || bytes.length < 12 + count * 16) reject("corrupt_font");
  const tags: string[] = [];
  for (let i = 0; i < count; i++) {
    const o = 12 + i * 16;
    if (u32(bytes, o + 8) + u32(bytes, o + 12) > bytes.length) reject("corrupt_font");
    tags.push(tag(bytes, o));
  }
  return tags;
}

function woffTables(bytes: Uint8Array): string[] {
  if (bytes.length < 44) reject("corrupt_font");
  const count = u16(bytes, 12);
  if (count === 0 || bytes.length < 44 + count * 20) reject("corrupt_font");
  const tags: string[] = [];
  for (let i = 0; i < count; i++) {
    const o = 44 + i * 20;
    if (u32(bytes, o + 4) + u32(bytes, o + 8) > bytes.length) reject("corrupt_font");
    tags.push(tag(bytes, o));
  }
  return tags;
}

/** A variable font carries an `fvar` table; the renderer cannot draw one. */
const rejectVariable = (tags: string[]) => {
  if (tags.includes("fvar")) reject("variable_font");
};

/** Checks a decoded TTF or OTF (uploaded directly, or the result of decoding WOFF2). */
export function inspectSfnt(bytes: Uint8Array): { format: "ttf" | "otf" } {
  if (bytes.length > MAX_DECODED_FONT_BYTES) reject("font_too_large");
  if (bytes.length < 12) reject("corrupt_font");
  const format = sfntFlavour(tag(bytes, 0), u32(bytes, 0)) ?? reject("corrupt_font");
  rejectVariable(sfntTables(bytes));
  return { format };
}

const EXTENSION_FORMATS: Record<string, UploadedFontFormat> = { ttf: "ttf", otf: "otf", woff: "woff", woff2: "woff2" };

/**
 * First check of an uploaded font. WOFF2 cannot be read by the renderer, so
 * the caller decodes it and passes the result to inspectSfnt.
 */
export function inspectFontUpload(input: { bytes: Uint8Array; filename: string }): { format: UploadedFontFormat; needsDecoding: boolean } {
  const { bytes } = input;
  if (bytes.length === 0) reject("empty_file");
  if (bytes.length > MAX_FONT_BYTES) reject("file_too_large");
  const extension = input.filename.includes(".") ? input.filename.split(".").pop()!.toLowerCase() : "";
  const named = EXTENSION_FORMATS[extension] ?? reject("unsupported_format");
  if (bytes.length < 12) reject("corrupt_font");

  const signature = tag(bytes, 0);
  if (signature === "wOF2") {
    if (named !== "woff2") reject("extension_mismatch");
    if (bytes.length < 48) reject("corrupt_font");
    if (u32(bytes, 8) > MAX_DECODED_FONT_BYTES) reject("font_too_large");
    return { format: "woff2", needsDecoding: true };
  }
  if (signature === "wOFF") {
    if (named !== "woff") reject("extension_mismatch");
    if (bytes.length < 44) reject("corrupt_font");
    if (!sfntFlavour(tag(bytes, 4), u32(bytes, 4))) reject("unsupported_format");
    if (u32(bytes, 16) > MAX_DECODED_FONT_BYTES) reject("font_too_large");
    rejectVariable(woffTables(bytes));
    return { format: "woff", needsDecoding: false };
  }
  // TTF and OTF share one container, so either extension may hold either kind of outline.
  if (!sfntFlavour(signature, u32(bytes, 0))) reject("unsupported_format");
  if (named !== "ttf" && named !== "otf") reject("extension_mismatch");
  return { ...inspectSfnt(bytes), needsDecoding: false };
}
