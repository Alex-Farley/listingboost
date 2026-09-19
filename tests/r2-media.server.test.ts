import { describe, expect, test } from "bun:test";
import { createR2MediaStore } from "../src/lib/r2-media.server";

describe("R2 media store", () => {
  test("writes media with content type and returns owned record", async () => {
    let putArgs: unknown[] = [];
    const bucket = {
      async put(...args: unknown[]) { putArgs = args; },
      async get() { return null; },
      async list() { return { objects: [] }; },
    } as never;

    const store = createR2MediaStore(bucket);
    await expect(store.put({
      id: "media-1", objectKey: "campaign-media/image/media-1",
      kind: "image", body: new Uint8Array([1,2,3]), contentType: "image/jpeg", byteSize: 3,
    })).resolves.toEqual({
      id: "media-1", objectKey: "campaign-media/image/media-1",
      kind: "image", contentType: "image/jpeg", byteSize: 3,
    });
    expect(putArgs[0]).toBe("campaign-media/image/media-1");
  });

  test("returns ListingBoost download route, not provider URL", async () => {
    const bucket = {
      async put() {},
      async get() { return null; },
      async list() { return { objects: [{ key: "campaign-media/video/media-2", httpMetadata: { contentType: "video/mp4" } }] }; },
    } as never;
    await expect(createR2MediaStore(bucket).get("media-2", "video")).resolves.toEqual({
      id: "media-2", type: "video",
      downloadUrl: "/api/media/download?id=media-2&type=video",
      contentType: "video/mp4",
    });
  });
});
