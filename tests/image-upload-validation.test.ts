import { describe, expect, test } from "bun:test";
import { MAX_IMAGE_PIXELS, validateImageBytes } from "../src/lib/image-upload-validation";

function pngBytes(width: number, height: number) {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes[16] = (width >>> 24) & 0xff;
  bytes[17] = (width >>> 16) & 0xff;
  bytes[18] = (width >>> 8) & 0xff;
  bytes[19] = width & 0xff;
  bytes[20] = (height >>> 24) & 0xff;
  bytes[21] = (height >>> 16) & 0xff;
  bytes[22] = (height >>> 8) & 0xff;
  bytes[23] = height & 0xff;
  return bytes;
}

describe("image upload validation", () => {
  test("accepts a structurally valid PNG and reads its dimensions from bytes", () => {
    expect(validateImageBytes(pngBytes(1200, 800))).toEqual({
      contentType: "image/png",
      width: 1200,
      height: 800,
    });
  });

  test("rejects a spoofed image whose bytes do not contain a supported signature", () => {
    expect(() => validateImageBytes(new TextEncoder().encode("not actually an image"))).toThrow(
      "not a supported image",
    );
  });

  test("rejects dimensions above the decompression-bomb guard", () => {
    expect(() => validateImageBytes(pngBytes(MAX_IMAGE_PIXELS, 2))).toThrow(
      "dimensions are too large",
    );
  });

  test("rejects a zero-dimension PNG", () => {
    expect(() => validateImageBytes(pngBytes(0, 100))).toThrow("invalid image signature");
  });
});
