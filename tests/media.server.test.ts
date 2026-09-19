import { describe, expect, test } from "bun:test";
import type { MediaStore } from "../src/lib/media.server";

describe("ListingBoost media boundary", () => {
  test("domain media shape contains no FNF generation object", async () => {
    const store: MediaStore = {
      async get(id, type) {
        return { id, type, downloadUrl: "https://example.test/media.mp4", contentType: "video/mp4" };
      },
    };
    await expect(store.get("media-1", "video")).resolves.toEqual({
      id: "media-1",
      type: "video",
      downloadUrl: "https://example.test/media.mp4",
      contentType: "video/mp4",
    });
  });

  test("missing media is represented as null", async () => {
    const store: MediaStore = { async get() { return null; } };
    await expect(store.get("missing", "image")).resolves.toBeNull();
  });
});
