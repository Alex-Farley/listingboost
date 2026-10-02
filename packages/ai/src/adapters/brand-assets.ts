import { Resvg } from "@resvg/resvg-wasm";
import satori from "satori/standalone";
import { BrandAssetRejectedError, type BrandAssetProcessor, type ImageOutput } from "../ports";
import { createWoff2Module, type Woff2Module } from "../../vendor/woff2/woff2-decompress.js";
import { ensureRenderRuntime, type RendererAssets } from "./template-renderer";

/** Longer side, in pixels, of the PNG an SVG logo is converted to (DECISIONS D-020). */
export const SVG_LOGO_RASTER_EDGE = 2048;

// The decoder is process-global, like the other wasm runtimes.
let woff2: Promise<Woff2Module> | null = null;

export class RenderBrandAssetProcessor implements BrandAssetProcessor {
  constructor(private readonly assets: Pick<RendererAssets, "resvgWasm" | "yogaWasm" | "woff2Wasm">) {}

  async decodeWoff2(bytes: Uint8Array): Promise<Uint8Array> {
    woff2 ??= createWoff2Module(this.assets.woff2Wasm);
    const decoded = (await woff2).decompress(bytes);
    if (!decoded || decoded.length === 0) throw new BrandAssetRejectedError("corrupt_font", "The font file appears to be damaged or incomplete.");
    return Uint8Array.from(decoded);
  }

  async probeFont(font: Uint8Array): Promise<void> {
    await ensureRenderRuntime(this.assets);
    const unusable = () => new BrandAssetRejectedError("font_unusable", "This font can't be used for graphics. Try a different font file.");
    let svg: string;
    try {
      const data = font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer;
      svg = await satori({ type: "div", props: { style: { display: "flex", fontFamily: "Probe", fontSize: 48 }, children: "Agency 0123" } } as never, {
        width: 400,
        height: 80,
        fonts: [{ name: "Probe", data, weight: 400, style: "normal" }],
      });
    } catch {
      throw unusable();
    }
    // Text is drawn as outlines; a font with no usable glyphs draws nothing.
    if (!/<path[^>]*\sd="[^"]{20,}"/.test(svg)) throw unusable();
  }

  async rasteriseSvg(svg: Uint8Array): Promise<ImageOutput> {
    await ensureRenderRuntime(this.assets);
    const unusable = () => new BrandAssetRejectedError("svg_unrenderable", "This SVG couldn't be converted. Export it as a plain SVG, or upload a PNG instead.");
    try {
      // No fonts are loaded: live text is refused by the safety check before this runs.
      const options = { font: { loadSystemFonts: false } };
      const natural = new Resvg(svg, options);
      const { width, height } = natural;
      natural.free();
      if (!(width > 0) || !(height > 0)) throw unusable();
      const resvg = new Resvg(svg, { ...options, fitTo: width >= height ? { mode: "width", value: SVG_LOGO_RASTER_EDGE } : { mode: "height", value: SVG_LOGO_RASTER_EDGE } });
      const image = resvg.render();
      const output: ImageOutput = { bytes: image.asPng(), contentType: "image/png", width: image.width, height: image.height };
      image.free();
      resvg.free();
      return output;
    } catch (error) {
      if (error instanceof BrandAssetRejectedError) throw error;
      throw unusable();
    }
  }
}
