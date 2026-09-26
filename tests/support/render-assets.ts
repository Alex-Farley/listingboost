import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RendererAssets } from "@listingboost/ai";

const root = join(import.meta.dir, "../../node_modules");
const bytes = (path: string) => {
  const b = readFileSync(join(root, path));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** The same wasm and font files the Worker bundles, loaded from disk for tests. */
export function renderAssetsFromDisk(): RendererAssets {
  return {
    resvgWasm: bytes("@resvg/resvg-wasm/index_bg.wasm"),
    yogaWasm: bytes("satori/yoga.wasm"),
    fonts: {
      serif: bytes("@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff"),
      serifBold: bytes("@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff"),
      sans: bytes("@fontsource/inter/files/inter-latin-400-normal.woff"),
      sansBold: bytes("@fontsource/inter/files/inter-latin-600-normal.woff"),
    },
  };
}
