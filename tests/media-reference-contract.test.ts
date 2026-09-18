import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const assetLibrarySource = readFileSync(
  new URL("../src/components/asset-library.tsx", import.meta.url),
  "utf8",
);

test("the asset library distinguishes image and video references", () => {
  expect(assetLibrarySource).toContain('candidate.value !== "video"');
  expect(assetLibrarySource).toContain("<Media.Video");
  expect(assetLibrarySource).toContain("src={videoSrc}");
});
