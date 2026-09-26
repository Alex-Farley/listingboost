import { describe, expect, test } from "bun:test";
import { MAX_UPLOAD_BYTES, UploadRejectedError, validateImageUpload, type UploadRejectionCode } from "@listingboost/storage";
import { fixture } from "../support/fixtures";

function rejects(code: UploadRejectionCode, input: { bytes: Uint8Array; filename: string; declaredType: string }) {
  try {
    validateImageUpload(input);
  } catch (error) {
    expect(error).toBeInstanceOf(UploadRejectedError);
    expect((error as UploadRejectedError).code).toBe(code);
    return;
  }
  throw new Error(`expected rejection ${code}`);
}

describe("AT-05 accepts real JPEG, PNG and WebP photographs", () => {
  const cases: Array<[string, string, string]> = [
    ["photo-800x600.jpg", "image/jpeg", "jpg"],
    ["photo-800x600-progressive.jpg", "image/jpeg", "jpg"],
    ["photo-800x600.png", "image/png", "png"],
    ["photo-800x600.webp", "image/webp", "webp"],
    ["photo-800x600-lossless.webp", "image/webp", "webp"],
  ];
  for (const [file, type, ext] of cases) {
    test(file, () => {
      const result = validateImageUpload({ bytes: fixture(file), filename: `Living Room.${ext}`, declaredType: type });
      expect(result).toEqual({ contentType: type as never, width: 800, height: 600 });
    });
  }

  test("accepts .jpeg extension and portrait images", () => {
    expect(validateImageUpload({ bytes: fixture("photo-1080x1350.jpg"), filename: "a.JPEG", declaredType: "image/jpeg" })).toEqual({
      contentType: "image/jpeg",
      width: 1080,
      height: 1350,
    });
  });
});

describe("AT-04 rejects invalid uploads", () => {
  const jpg = () => fixture("photo-800x600.jpg");
  const png = () => fixture("photo-800x600.png");
  const webp = () => fixture("photo-800x600.webp");

  test("empty file", () => rejects("empty_file", { bytes: new Uint8Array(), filename: "a.jpg", declaredType: "image/jpeg" }));
  test("over 25 MB", () => rejects("file_too_large", { bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1), filename: "a.jpg", declaredType: "image/jpeg" }));
  test("GIF is unsupported", () => rejects("unsupported_format", { bytes: fixture("photo.gif"), filename: "a.gif", declaredType: "image/gif" }));
  test("SVG is unsupported", () => rejects("unsupported_format", { bytes: fixture("drawing.svg"), filename: "a.svg", declaredType: "image/svg+xml" }));
  test("HEIC declared type is unsupported", () => rejects("unsupported_format", { bytes: jpg(), filename: "a.heic", declaredType: "image/heic" }));
  test("arbitrary bytes", () => rejects("unsupported_format", { bytes: new TextEncoder().encode("MZ executable".repeat(20)), filename: "a.jpg", declaredType: "image/jpeg" }));
  test("declared MIME differs from content", () => rejects("type_mismatch", { bytes: png(), filename: "a.png", declaredType: "image/jpeg" }));
  test("extension differs from content", () => rejects("extension_mismatch", { bytes: png(), filename: "a.jpg", declaredType: "image/png" }));
  test("missing extension", () => rejects("extension_mismatch", { bytes: jpg(), filename: "photo", declaredType: "image/jpeg" }));
  test("double extension trick", () => rejects("extension_mismatch", { bytes: jpg(), filename: "photo.jpg.exe", declaredType: "image/jpeg" }));
  test("truncated JPEG", () => rejects("corrupt_image", { bytes: jpg().slice(0, 4000), filename: "a.jpg", declaredType: "image/jpeg" }));
  test("JPEG header only", () => rejects("corrupt_image", { bytes: jpg().slice(0, 600), filename: "a.jpg", declaredType: "image/jpeg" }));
  test("truncated PNG", () => rejects("corrupt_image", { bytes: png().slice(0, png().length - 20), filename: "a.png", declaredType: "image/png" }));
  test("PNG with corrupted header CRC", () => {
    const bytes = png();
    bytes[20] = bytes[20]! ^ 0xff; // inside IHDR width/height
    rejects("corrupt_image", { bytes, filename: "a.png", declaredType: "image/png" });
  });
  test("truncated WebP", () => rejects("corrupt_image", { bytes: webp().slice(0, webp().length - 10), filename: "a.webp", declaredType: "image/webp" }));
  test("JPEG with trailing payload appended", () => {
    const bytes = new Uint8Array([...jpg(), ...new TextEncoder().encode("<?php system($_GET['c']); ?>")]);
    rejects("corrupt_image", { bytes, filename: "a.jpg", declaredType: "image/jpeg" });
  });
  test("short edge under 400px", () => rejects("image_too_small", { bytes: fixture("too-small-300x200.jpg"), filename: "a.jpg", declaredType: "image/jpeg" }));
  test("over 40 megapixels", () =>
    rejects("image_too_large", { bytes: fixture("too-many-pixels-8200x5000.png"), filename: "a.png", declaredType: "image/png" }));
});
