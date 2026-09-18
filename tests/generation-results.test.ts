import { describe, expect, test } from "bun:test";
import type { Generation } from "@higgsfield/fnf/client";
import {
  generationToAssetItem,
  generationToGalleryItem,
  mediaRefToAssetItem,
} from "../src/lib/higgsfield-generation-results";

describe("generation result mapping", () => {
  test("keeps terminal failures visible in history", () => {
    const item = generationToGalleryItem({
      id: "failed-1",
      model: "nano_banana_2",
      type: "image",
      status: "failed",
      failReason: "Safety check failed",
      input: { model: "nano_banana_2", settings: { aspectRatio: "9:16" } },
      results: {},
    } satisfies Generation);
    expect(item).toMatchObject({
      id: "failed-1",
      status: "failed",
      failureLabel: "Safety check failed",
      width: 9,
      height: 16,
    });
  });

  test("maps persisted refs to Uploads without adding them to generation history", () => {
    expect(
      mediaRefToAssetItem({ id: "media-123456789", type: "image", url: "https://cdn/x.png" }),
    ).toMatchObject({
      name: "Upload media-12",
      kind: "upload",
      src: "https://cdn/x.png",
      ref: { id: "media-123456789", type: "media_input" },
    });
  });

  test("maps generated images to reusable job references", () => {
    const item = generationToAssetItem({
      id: "97cf1fec-77a9-4627-a3d4-23a09ea8aaa4",
      model: "nano_banana_2",
      type: "image",
      status: "completed",
      input: { model: "nano_banana_2", settings: {} },
      results: { rawUrl: "https://cdn.example/image.png" },
    } satisfies Generation);

    expect(item?.ref).toEqual({
      id: "97cf1fec-77a9-4627-a3d4-23a09ea8aaa4",
      type: "image_job",
      url: "https://cdn.example/image.png",
    });
  });

  test("maps generated videos to reusable job references", () => {
    const item = generationToAssetItem({
      id: "751af954-5e5b-4124-8b26-c569ddc29ffd",
      model: "seedance_2_0",
      type: "video",
      status: "completed",
      input: { model: "seedance_2_0", settings: {} },
      results: {
        rawUrl: "https://cdn.example/video.mp4",
        thumbnailUrl: "https://cdn.example/poster.webp",
      },
    } satisfies Generation);

    expect(item).toMatchObject({
      src: "https://cdn.example/poster.webp",
      kind: "video",
      ref: {
        id: "751af954-5e5b-4124-8b26-c569ddc29ffd",
        type: "video_job",
        url: "https://cdn.example/video.mp4",
      },
    });
  });
});
