import { Resvg } from "@resvg/resvg-wasm";
import { BrandAssetRejectedError, type BrandAssetProcessor, type ImageOutput } from "../ports";
import { ensureRenderRuntime, type RendererAssets } from "./template-renderer";

/** Longer side, in pixels, of the PNG an SVG logo is converted to (DECISIONS D-020). */
export const SVG_LOGO_RASTER_EDGE = 2048;

export class RenderBrandAssetProcessor implements BrandAssetProcessor {
  constructor(private readonly assets: Pick<RendererAssets, "resvgWasm" | "yogaWasm">) {}

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
