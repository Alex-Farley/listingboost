import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const assetLibrarySource = readFileSync(
  new URL("../src/components/asset-library.tsx", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("../src/layouts/app-detail.tsx", import.meta.url),
  "utf8",
);

test("the image-only generator cannot select video references", () => {
  expect(layoutSource).toContain("<AssetLibraryModal");
  expect(layoutSource).toContain("imageOnly");
  expect(assetLibrarySource).toContain('candidate.value !== "video"');
  expect(assetLibrarySource).toContain("<Media.Video");
  expect(assetLibrarySource).toContain("src={videoSrc}");
  expect(layoutSource).not.toContain("VIDEO_LIBRARY_QUERY");
  expect(layoutSource).not.toContain("videoHistory");
});
