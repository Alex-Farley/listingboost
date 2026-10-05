import { describe, expect, test } from "bun:test";
import { MAX_LOGO_BYTES, UploadRejectedError, validateImageUpload, validateLogoUpload } from "@listingboost/storage";
import { fixture, solidPng } from "../support/fixtures";

const rejection = (fn: () => unknown): UploadRejectedError => {
  try {
    fn();
  } catch (error) {
    if (error instanceof UploadRejectedError) return error;
    throw error;
  }
  throw new Error("expected the upload to be rejected");
};

describe("AT-22 logo upload validation", () => {
  test("accepts a small PNG that the photo policy would refuse", () => {
    const bytes = solidPng(64, 64);
    expect(validateLogoUpload({ bytes, filename: "logo.png", declaredType: "image/png" })).toEqual({ contentType: "image/png", width: 64, height: 64 });
    expect(rejection(() => validateImageUpload({ bytes, filename: "logo.png", declaredType: "image/png" })).code).toBe("image_too_small");
  });

  test("accepts JPEG and WebP", () => {
    expect(validateLogoUpload({ bytes: fixture("photo-800x600.jpg"), filename: "logo.jpg", declaredType: "image/jpeg" }).contentType).toBe("image/jpeg");
    expect(validateLogoUpload({ bytes: fixture("photo-800x600.webp"), filename: "logo.webp", declaredType: "image/webp" }).contentType).toBe("image/webp");
  });

  test("rejects a file over 2 MiB and says the limit", () => {
    const bytes = new Uint8Array(MAX_LOGO_BYTES + 1);
    bytes.set(solidPng(64, 64));
    const error = rejection(() => validateLogoUpload({ bytes, filename: "logo.png", declaredType: "image/png" }));
    expect(error.code).toBe("file_too_large");
    expect(error.message).toMatch(/2 MB/);
    expect(MAX_LOGO_BYTES).toBe(2 * 1024 * 1024);
  });

  test("rejects other types, with a message naming what is accepted", () => {
    const gif = rejection(() => validateLogoUpload({ bytes: fixture("photo.gif"), filename: "logo.gif", declaredType: "image/gif" }));
    expect(gif.code).toBe("unsupported_format");
    expect(gif.message).toMatch(/PNG, JPEG, WebP or SVG/);
    expect(rejection(() => validateLogoUpload({ bytes: new TextEncoder().encode("%PDF-1.7"), filename: "logo.pdf", declaredType: "application/pdf" })).code).toBe("unsupported_format");
  });

  test("rejects contents that do not match the declared type or the extension", () => {
    const png = solidPng(64, 64);
    expect(rejection(() => validateLogoUpload({ bytes: png, filename: "logo.jpg", declaredType: "image/jpeg" })).code).toBe("type_mismatch");
    expect(rejection(() => validateLogoUpload({ bytes: png, filename: "logo.jpg", declaredType: "image/png" })).code).toBe("extension_mismatch");
  });

  test("rejects a corrupt or truncated image and an empty file", () => {
    const png = solidPng(64, 64);
    expect(rejection(() => validateLogoUpload({ bytes: png.slice(0, png.length - 20), filename: "logo.png", declaredType: "image/png" })).code).toBe("corrupt_image");
    const flipped = png.slice();
    flipped[40] = flipped[40]! ^ 0xff;
    expect(rejection(() => validateLogoUpload({ bytes: flipped, filename: "logo.png", declaredType: "image/png" })).code).toBe("corrupt_image");
    expect(rejection(() => validateLogoUpload({ bytes: new Uint8Array(0), filename: "logo.png", declaredType: "image/png" })).code).toBe("empty_file");
  });

  test("rejects an image too large to draw safely, and says the limit", () => {
    const error = rejection(() => validateLogoUpload({ bytes: solidPng(4097, 10), filename: "logo.png", declaredType: "image/png" }));
    expect(error.code).toBe("image_too_large");
    expect(error.message).toMatch(/4096/);
    expect(validateLogoUpload({ bytes: solidPng(4096, 10), filename: "logo.png", declaredType: "image/png" }).width).toBe(4096);
  });

  test("a truncated WebP logo is rejected as damaged", () => {
    const webp = fixture("photo-800x600.webp");
    expect(rejection(() => validateLogoUpload({ bytes: webp.slice(0, webp.length - 10), filename: "logo.webp", declaredType: "image/webp" })).code).toBe("corrupt_image");
  });

  test("photo validation is unchanged", () => {
    expect(validateImageUpload({ bytes: fixture("photo-800x600.jpg"), filename: "a.jpg", declaredType: "image/jpeg" })).toEqual({ contentType: "image/jpeg", width: 800, height: 600 });
    const small = rejection(() => validateImageUpload({ bytes: fixture("too-small-300x200.jpg"), filename: "a.jpg", declaredType: "image/jpeg" }));
    expect(small.message).toBe("Photos must be at least 400 pixels on the shortest side.");
  });
});
