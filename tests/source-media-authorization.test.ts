import { describe, expect, test } from "bun:test";
import { assertAuthorizedSourceImage } from "../src/lib/source-media-authorization";

describe("source media authorization", () => {
  test("accepts only the requested authenticated image reference", () => {
    expect(assertAuthorizedSourceImage("media-123", { id: "media-123", type: "image" })).toEqual({
      id: "media-123",
      type: "image",
    });
  });

  test("rejects a foreign media id", () => {
    expect(() =>
      assertAuthorizedSourceImage("media-123", { id: "media-foreign", type: "image" }),
    ).toThrow("Source image not found.");
  });

  test("rejects forged media type metadata", () => {
    expect(() =>
      assertAuthorizedSourceImage("media-123", { id: "media-123", type: "video" }),
    ).toThrow("Source image not found.");
  });

  test("rejects missing media returned by the authenticated scope", () => {
    expect(() => assertAuthorizedSourceImage("media-123", null)).toThrow("Source image not found.");
  });
});
