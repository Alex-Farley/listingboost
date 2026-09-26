import type { RendererAssets } from "@listingboost/ai";
// Wrangler bundles .wasm as precompiled modules (Workers cannot compile wasm
// from bytes at runtime) and .woff as ArrayBuffer data modules (wrangler rules).
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import yogaWasm from "satori/yoga.wasm";
import serif from "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff";
import serifBold from "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff";
import sans from "@fontsource/inter/files/inter-latin-400-normal.woff";
import sansBold from "@fontsource/inter/files/inter-latin-600-normal.woff";

export const RENDER_ASSETS: RendererAssets = { resvgWasm, yogaWasm, fonts: { serif, serifBold, sans, sansBold } };
