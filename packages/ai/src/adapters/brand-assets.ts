import decodeWebp, { init as initWebp } from "@jsquash/webp/decode";
import { Resvg } from "@resvg/resvg-wasm";
import { zlibSync } from "fflate";
import satori from "satori/standalone";
import { BrandAssetRejectedError, type BrandAssetProcessor, type ImageInput, type ImageOutput } from "../ports";
import { createWoff2Module, type Woff2Module } from "../../vendor/woff2/woff2-decompress.js";
import { ensureRenderRuntime, toBase64, type RendererAssets } from "./template-renderer";

/** Longer side, in pixels, of the PNG an SVG logo is converted to (DECISIONS D-020). */
export const SVG_LOGO_RASTER_EDGE = 2048;

// The decoders are process-global, like the other wasm runtimes.
let woff2: Promise<Woff2Module> | null = null;
let webp: Promise<void> | null = null;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < 8 + data.length; i++) crc = CRC_TABLE[(crc ^ out[i]!) & 0xff]! ^ (crc >>> 8);
  view.setUint32(8 + data.length, (crc ^ 0xffffffff) >>> 0);
  return out;
}

/** Encodes 8-bit RGBA pixels as a PNG (no filtering, zlib-compressed). */
function encodePng(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", header), pngChunk("IDAT", zlibSync(raw, { level: 6 })), pngChunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export class RenderBrandAssetProcessor implements BrandAssetProcessor {
  constructor(private readonly assets: Pick<RendererAssets, "resvgWasm" | "yogaWasm" | "woff2Wasm" | "webpWasm">) {}

  async webpToPng(bytes: Uint8Array): Promise<ImageOutput> {
    const damaged = () => new BrandAssetRejectedError("corrupt_image", "The logo file appears to be damaged or incomplete.");
    const wasm = this.assets.webpWasm;
    webp ??= initWebp(wasm instanceof WebAssembly.Module ? wasm : new WebAssembly.Module(wasm));
    await webp;
    let image: ImageData;
    try {
      image = await decodeWebp(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    } catch {
      throw damaged();
    }
    if (!image || !(image.width > 0) || !(image.height > 0) || image.data.length !== image.width * image.height * 4) throw damaged();
    return { bytes: encodePng(image.data, image.width, image.height), contentType: "image/png", width: image.width, height: image.height };
  }

  async decodeWoff2(bytes: Uint8Array): Promise<Uint8Array> {
    woff2 ??= createWoff2Module(this.assets.woff2Wasm);
    const decoded = (await woff2).decompress(bytes);
    if (!decoded || decoded.length === 0) throw new BrandAssetRejectedError("corrupt_font", "The font file appears to be damaged or incomplete.");
    return Uint8Array.from(decoded);
  }

  /**
   * Upload checks are structural (DECISIONS D-009), so a file can be well
   * formed and still undecodable. The renderer skips such an image silently,
   * which would leave graphics without their logo; this draws it once to find out.
   */
  async probeImage(image: ImageInput): Promise<void> {
    await ensureRenderRuntime(this.assets);
    const unusable = () => new BrandAssetRejectedError("corrupt_image", "The logo file appears to be damaged, or has nothing visible in it.");
    const width = 64;
    const height = Math.max(1, Math.round((width * (image.height ?? width)) / (image.width ?? width)));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<image href="data:${image.contentType};base64,${toBase64(image.bytes)}" width="${width}" height="${height}" preserveAspectRatio="none"/></svg>`;
    let pixels: Uint8Array;
    try {
      const resvg = new Resvg(svg, { font: { loadSystemFonts: false } });
      const rendered = resvg.render();
      pixels = rendered.pixels.slice();
      rendered.free();
      resvg.free();
    } catch {
      throw unusable();
    }
    // RGBA: an image that could not be decoded leaves every pixel fully transparent.
    for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 0) return;
    throw unusable();
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
