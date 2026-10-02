import { describe, expect, test } from "bun:test";
import { FontRejectedError, inspectFontUpload, inspectSfnt, MAX_DECODED_FONT_BYTES, MAX_FONT_BYTES } from "@listingboost/storage";
import { asVariableFont, fontFixtures } from "../support/fixtures";

const rejection = (fn: () => unknown): FontRejectedError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof FontRejectedError) return error;
    throw error;
  }
  throw new Error("expected the font to be rejected");
};

describe("AT-22 font upload validation", () => {
  test("limits are 2 MiB uploaded and 8 MiB decoded", () => {
    expect(MAX_FONT_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_DECODED_FONT_BYTES).toBe(8 * 1024 * 1024);
  });

  test("recognises each accepted format from its contents", () => {
    expect(inspectFontUpload({ bytes: fontFixtures.ttf(), filename: "Inter.ttf" })).toEqual({ format: "ttf", needsDecoding: false });
    expect(inspectFontUpload({ bytes: fontFixtures.otf(), filename: "SourceSans.otf" })).toEqual({ format: "otf", needsDecoding: false });
    expect(inspectFontUpload({ bytes: fontFixtures.woff(), filename: "Inter.woff" })).toEqual({ format: "woff", needsDecoding: false });
    expect(inspectFontUpload({ bytes: fontFixtures.woff2(), filename: "Inter.WOFF2" })).toEqual({ format: "woff2", needsDecoding: true });
  });

  test("a .ttf name on OpenType outlines is accepted as OTF, since both are the same container", () => {
    expect(inspectFontUpload({ bytes: fontFixtures.otf(), filename: "SourceSans.ttf" }).format).toBe("otf");
  });

  test("rejects a file over 2 MiB and says the limit", () => {
    const bytes = new Uint8Array(MAX_FONT_BYTES + 1);
    bytes.set(fontFixtures.ttf().subarray(0, 1024));
    const error = rejection(() => inspectFontUpload({ bytes, filename: "big.ttf" }));
    expect(error.code).toBe("file_too_large");
    expect(error.message).toMatch(/2 MB/);
  });

  test("rejects an empty file, other formats and a mismatched extension", () => {
    expect(rejection(() => inspectFontUpload({ bytes: new Uint8Array(0), filename: "a.ttf" })).code).toBe("empty_file");
    const other = rejection(() => inspectFontUpload({ bytes: new TextEncoder().encode("%PDF-1.7 not a font"), filename: "a.ttf" }));
    expect(other.code).toBe("unsupported_format");
    expect(other.message).toMatch(/WOFF, WOFF2, TTF or OTF/);
    expect(rejection(() => inspectFontUpload({ bytes: fontFixtures.ttf(), filename: "a.eot" })).code).toBe("unsupported_format");
    expect(rejection(() => inspectFontUpload({ bytes: fontFixtures.woff2(), filename: "a.woff" })).code).toBe("extension_mismatch");
    expect(rejection(() => inspectFontUpload({ bytes: fontFixtures.woff(), filename: "a.ttf" })).code).toBe("extension_mismatch");
  });

  test("rejects a font collection", () => {
    const ttc = fontFixtures.ttf();
    ttc.set(new TextEncoder().encode("ttcf"), 0);
    expect(rejection(() => inspectFontUpload({ bytes: ttc, filename: "a.ttf" })).code).toBe("unsupported_format");
  });

  test("rejects a WOFF or WOFF2 that declares a decoded size over 8 MiB, before any decoding", () => {
    const woff2 = fontFixtures.woff2();
    new DataView(woff2.buffer).setUint32(8, MAX_DECODED_FONT_BYTES + 1);
    const error = rejection(() => inspectFontUpload({ bytes: woff2, filename: "a.woff2" }));
    expect(error.code).toBe("font_too_large");
    expect(error.message).toMatch(/8 MB/);
    const woff = fontFixtures.woff();
    new DataView(woff.buffer).setUint32(16, MAX_DECODED_FONT_BYTES + 1);
    expect(rejection(() => inspectFontUpload({ bytes: woff, filename: "a.woff" })).code).toBe("font_too_large");
  });

  test("detects variable fonts in TTF, OTF and WOFF and says a static file is needed (AC14b)", () => {
    for (const [bytes, name] of [
      [asVariableFont(fontFixtures.ttf()), "a.ttf"],
      [asVariableFont(fontFixtures.otf(), "GDEF"), "a.otf"],
      [asVariableFont(fontFixtures.woff()), "a.woff"],
    ] as const) {
      const error = rejection(() => inspectFontUpload({ bytes, filename: name }));
      expect(error.code).toBe("variable_font");
      expect(error.message).toMatch(/variable fonts are not supported.*static/i);
    }
  });

  test("inspects a decoded font: flavour, size cap and variable detection", () => {
    expect(inspectSfnt(fontFixtures.ttf())).toEqual({ format: "ttf" });
    expect(inspectSfnt(fontFixtures.otf())).toEqual({ format: "otf" });
    expect(rejection(() => inspectSfnt(asVariableFont(fontFixtures.ttf()))).code).toBe("variable_font");
    expect(rejection(() => inspectSfnt(new Uint8Array(MAX_DECODED_FONT_BYTES + 1))).code).toBe("font_too_large");
    expect(rejection(() => inspectSfnt(fontFixtures.woff2())).code).toBe("corrupt_font");
  });

  test("rejects a truncated font whose table directory runs past the end of the file", () => {
    expect(rejection(() => inspectFontUpload({ bytes: fontFixtures.ttf().slice(0, 40), filename: "a.ttf" })).code).toBe("corrupt_font");
    expect(rejection(() => inspectFontUpload({ bytes: fontFixtures.ttf().slice(0, 5000), filename: "a.ttf" })).code).toBe("corrupt_font");
    expect(rejection(() => inspectFontUpload({ bytes: fontFixtures.woff().slice(0, 60), filename: "a.woff" })).code).toBe("corrupt_font");
  });
});
